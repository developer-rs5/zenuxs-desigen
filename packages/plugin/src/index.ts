/**
 * Plugin runtime: WASM plugins run in a sandbox whose only outside contact is
 * the host functions below. Host calls and every string copied across the
 * boundary are metered, so a plugin cannot flood the editor or the log.
 * (Converted 1:1 from FigCraft `crates/plugin/src/sandbox.rs`.)
 *
 * ABI: the module exports `memory` and `figcraft_run(input_len: i32) -> i32`.
 * Host functions are imported from the module `figcraft`; strings are UTF-8
 * `(ptr, len)` pairs in the plugin's memory. When `figcraft_run` starts, the
 * reply holds the input JSON (`input_len` bytes), fetched with `reply_len` and
 * `reply_read`.
 *
 * Limits: the meter counts host interaction, not raw instructions. FigCraft
 * uses wasmi, a metered interpreter that can also stop a tight loop; the
 * browser `WebAssembly` API cannot interrupt a running instance, so a module
 * that loops forever without calling the host is not stoppable here. Run
 * untrusted modules behind a worker watchdog before shipping them.
 */

/** A plugin manifest. */
export interface PluginManifest {
  id: string
  name: string
  version: string
  /** The permissions the plugin asks for. */
  permissions: string[]
}

/** The result of one plugin run. */
export interface PluginRunResult {
  /** What the plugin passed to `set_output` (JSON or text). */
  output: string
  /** Log lines the plugin emitted. */
  logs: string[]
  /** Command calls the plugin made through `host.call`. */
  calls: number
  /** Fuel consumed (host interactions plus bytes copied). */
  fuelUsed: number
  /** Whether the run used up its host-interaction budget. */
  outOfFuel: boolean
  /** The last reply the host produced (result JSON or an error message). */
  reply: Uint8Array | null
  /** The last `ui_show` panel JSON, if the plugin showed one. */
  ui: string | null
}

/** The host a plugin talks to. Every call is synchronous, like FigCraft's host. */
export interface PluginHost {
  /** Run `command` with JSON `params`; return the result JSON. Throw to refuse. */
  call(command: string, params: string): string
  /** The selected layer ids as a JSON array. */
  selection?(): string
  /** A short message for the user. */
  notify?(message: string): void
  /** An admitted line of the run's log. */
  log?(line: string): void
}

/** What a run may use. */
export interface PluginRunOptions {
  /** The JSON handed to `figcraft_run`. */
  input?: string
  /** Host-interaction budget (FigCraft's `fuel`). */
  fuelLimit?: number
  /** Log lines kept; extra lines fail the run. */
  maxLogs?: number
  /** Settings the plugin may read and write for this run. */
  settings?: Map<string, string>
}

/** The module host functions are imported from. */
export const IMPORT_MODULE = 'figcraft'
/** The exported entry point. */
export const ENTRY = 'figcraft_run'
/** The host-interaction fuel a plugin may burn per run. */
export const DEFAULT_FUEL_LIMIT = 1_000_000_000
/** What one host call costs, before the bytes copied in or out. */
const CALL_FUEL = 10_000
/** Largest string passed either way. */
const MAX_MESSAGE = 16 * 1024 * 1024
/** Largest module accepted. */
const MAX_MODULE_BYTES = 16 * 1024 * 1024
/** Linear memory cap. */
const MAX_MEMORY_BYTES = 64 * 1024 * 1024
/** Log lines kept when the caller sets no limit. */
const DEFAULT_MAX_LOGS = 1000

/** A run failure that a UI can show verbatim. */
export class PluginError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'PluginError'
  }
}

function decoderTextError(bytes: Uint8Array): string {
  try {
    return new TextDecoder('utf-8', { fatal: true }).decode(bytes)
  } catch {
    throw new PluginError('the plugin passed invalid UTF-8')
  }
}

/**
 * Run a WASM plugin module once with the host functions it imports.
 * Rejects invalid modules, budget overruns, memory overruns, and plugin traps.
 */
export async function runPlugin(
  wasm: Uint8Array<ArrayBuffer>,
  host: PluginHost,
  options: PluginRunOptions = {}
): Promise<PluginRunResult> {
  if (wasm.byteLength === 0) throw new PluginError('not a valid plugin module: it is empty')
  if (wasm.byteLength > MAX_MODULE_BYTES) throw new PluginError('the module is too large')

  let module: WebAssembly.Module
  try {
    module = await WebAssembly.compile(wasm)
  } catch (error) {
    throw new PluginError(
      `not a valid plugin module: ${error instanceof Error ? error.message : String(error)}`
    )
  }

  const exports = WebAssembly.Module.exports(module)
  const entry = exports.find((item) => item.name === ENTRY)
  if (!entry || entry.kind !== 'function') {
    throw new PluginError(`not a valid plugin module: it doesn't export \`${ENTRY}\``)
  }
  if (!exports.some((item) => item.name === 'memory' && item.kind === 'memory')) {
    throw new PluginError("not a valid plugin module: it doesn't export `memory`")
  }

  const input = options.input ?? '{}'
  if (input.length > MAX_MESSAGE) throw new PluginError('the input is too large')
  const fuelLimit = options.fuelLimit ?? DEFAULT_FUEL_LIMIT
  const maxLogs = options.maxLogs ?? DEFAULT_MAX_LOGS
  const settings = options.settings ?? new Map<string, string>()
  const logs: string[] = []
  const out = {
    reply: new TextEncoder().encode(input),
    output: '',
    ui: null as string | null
  }
  let calls = 0
  let fuelUsed = 0
  let outOfFuel = false
  let memory: WebAssembly.Memory | null = null

  function burn(amount: number): void {
    fuelUsed += amount
    if (fuelUsed > fuelLimit) {
      outOfFuel = true
      throw new PluginError('the plugin used up its host-interaction budget')
    }
  }

  function memoryBytes(): Uint8Array {
    if (!memory) throw new PluginError('the plugin called the host before it finished loading')
    if (memory.buffer.byteLength > MAX_MEMORY_BYTES) {
      throw new PluginError('the plugin used more than its memory limit')
    }
    return new Uint8Array(memory.buffer)
  }

  function readString(ptr: number, len: number): string {
    if (!Number.isInteger(ptr) || !Number.isInteger(len) || ptr < 0 || len < 0) {
      throw new PluginError('the plugin passed an invalid string range')
    }
    if (len > MAX_MESSAGE) throw new PluginError('the plugin passed a string that is too large')
    const bytes = memoryBytes()
    if (ptr + len > bytes.byteLength) throw new PluginError('the plugin read outside its memory')
    burn(len)
    return decoderTextError(bytes.subarray(ptr, ptr + len))
  }

  function writeReply(text: string): void {
    const encoded = new TextEncoder().encode(text)
    if (encoded.byteLength > MAX_MESSAGE) throw new PluginError('the reply is too large')
    out.reply = encoded
  }

  const imports: WebAssembly.Imports = {
    [IMPORT_MODULE]: {
      call: (cmdPtr: number, cmdLen: number, paramsPtr: number, paramsLen: number): number => {
        burn(CALL_FUEL)
        calls += 1
        const command = readString(cmdPtr, cmdLen)
        const params = readString(paramsPtr, paramsLen)
        try {
          writeReply(host.call(command, params))
          return 0
        } catch (error) {
          writeReply(error instanceof Error ? error.message : String(error))
          return 1
        }
      },
      selection: (): number => {
        burn(CALL_FUEL)
        writeReply(host.selection?.() ?? '[]')
        return out.reply.byteLength
      },
      reply_len: (): number => out.reply.byteLength,
      reply_read: (ptr: number, len: number): number => {
        const bytes = memoryBytes()
        const count = Math.min(Math.max(0, len), out.reply.byteLength)
        if (ptr < 0 || ptr + count > bytes.byteLength) {
          throw new PluginError('the plugin read the reply outside its memory')
        }
        bytes.set(out.reply.subarray(0, count), ptr)
        burn(count)
        return count
      },
      log: (ptr: number, len: number): void => {
        const line = readString(ptr, len)
        if (logs.length >= maxLogs) throw new PluginError('the plugin went over its log limit')
        logs.push(line)
        host.log?.(line)
      },
      notify: (ptr: number, len: number): void => {
        host.notify?.(readString(ptr, len))
      },
      set_output: (ptr: number, len: number): void => {
        out.output = readString(ptr, len)
      },
      ui_show: (ptr: number, len: number): number => {
        const panel = readString(ptr, len)
        try {
          JSON.parse(panel)
        } catch {
          writeReply('the panel is not valid JSON')
          return 1
        }
        out.ui = panel
        return 0
      },
      ui_close: (): void => {
        out.ui = null
      },
      setting_get: (keyPtr: number, keyLen: number): number => {
        const key = readString(keyPtr, keyLen)
        const value = settings.get(key)
        if (value === undefined) {
          writeReply('no such setting')
          return 1
        }
        writeReply(value)
        return 0
      },
      setting_set: (keyPtr: number, keyLen: number, valuePtr: number, valueLen: number): number => {
        const key = readString(keyPtr, keyLen)
        const value = readString(valuePtr, valueLen)
        try {
          JSON.parse(value)
        } catch {
          writeReply('the setting value is not valid JSON')
          return 1
        }
        settings.set(key, value)
        return 0
      },
      setting_delete: (keyPtr: number, keyLen: number): void => {
        settings.delete(readString(keyPtr, keyLen))
      },
      widget_render: (ptr: number, len: number): number => {
        const render = readString(ptr, len)
        try {
          JSON.parse(render)
        } catch {
          writeReply('the widget render is not valid JSON')
          return 1
        }
        return 0
      }
    }
  }

  let instance: WebAssembly.Instance
  try {
    instance = await WebAssembly.instantiate(module, imports)
  } catch (error) {
    throw new PluginError(
      `the plugin crashed while loading: ${error instanceof Error ? error.message : String(error)}`
    )
  }
  const memoryExport = instance.exports.memory
  if (!(memoryExport instanceof WebAssembly.Memory)) {
    throw new PluginError('not a valid plugin module: `memory` is not a memory')
  }
  memory = memoryExport
  if (memory.buffer.byteLength > MAX_MEMORY_BYTES) {
    throw new PluginError('the plugin used more than its memory limit')
  }

  const run = instance.exports[ENTRY]
  if (typeof run !== 'function') {
    throw new PluginError(`not a valid plugin module: \`${ENTRY}\` is not a function`)
  }

  let status: number
  try {
    status = (run as (inputLen: number) => number)(out.reply.byteLength)
  } catch (error) {
    if (error instanceof PluginError) throw error
    throw new PluginError(
      `the plugin crashed: ${error instanceof Error ? error.message : String(error)}`
    )
  }
  if (typeof status !== 'number' || status !== 0) {
    throw new PluginError(
      `the plugin failed${out.output ? `: ${out.output}` : ` with status ${String(status)}`}`
    )
  }

  return {
    output: out.output,
    logs,
    calls,
    fuelUsed,
    outOfFuel,
    reply: out.reply,
    ui: out.ui
  }
}

/** Parse a plugin manifest from JSON. */
export function parseManifest(json: unknown): PluginManifest | Error {
  const o = json as Record<string, unknown>
  if (!o || typeof o !== 'object') return new Error('not a manifest')
  if (typeof o.id !== 'string' || typeof o.name !== 'string' || typeof o.version !== 'string') {
    return new Error('manifest needs id, name and version')
  }
  return {
    id: o.id,
    name: o.name,
    version: o.version,
    permissions: Array.isArray(o.permissions) ? (o.permissions as string[]) : []
  }
}
