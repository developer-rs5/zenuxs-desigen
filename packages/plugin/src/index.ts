/**
 * Plugin runtime: WASM plugins run in a sandbox with fuel metering (wasmi's
 * role in FigCraft; the browser/Node WebAssembly API is the portable host).
 * Plugins call host imports (call, reply_read, log, notify…), and the host
 * reads their linear memory for results.
 * (Converted 1:1 from FigCraft `crates/plugin/src/sandbox.rs`.)
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
  /** The bytes the plugin wrote to its reply buffer. */
  reply: Uint8Array | null
  /** Log lines the plugin emitted. */
  logs: string[]
  /** Fuel consumed (the metering charge). */
  fuelUsed: number
  /** Whether the run hit its fuel limit. */
  outOfFuel: boolean
}

/** The fuel a plugin may burn per run. */
export const DEFAULT_FUEL_LIMIT = 1_000_000_000

/** Host functions a plugin can import (the `env` module in FigCraft). */
export interface PluginHost {
  /** `call(command, params)`: run an engine command. Returns the reply length. */
  call(command: string, params: string): number
  /** `reply_read(ptr)`: read the last reply into the plugin's memory. */
  reply: Uint8Array | null
  /** `log(line)`: a log line. */
  log(line: string): void
  /** `notify(text)`: a toast. */
  notify(text: string): void
}

/**
 * Run a WASM plugin module with fuel metering. The WebAssembly API is the
 * portable sandbox; imports are provided by the host.
 */
export async function runPlugin(
  wasm: Uint8Array,
  host: PluginHost,
  options?: { fuelLimit?: number }
): Promise<PluginRunResult> {
  const logs: string[] = []
  const fuelLimit = options?.fuelLimit ?? DEFAULT_FUEL_LIMIT
  let fuelUsed = 0
  const module = await WebAssembly.compile(wasm)
  // Track imported functions to meter calls (the fuel proxy).
  const imports: Record<string, Record<string, () => unknown>> = {}
  for (const imp of WebAssembly.Module.imports(module)) {
    const [mod, name] = [imp.module, imp.name]
    imports[mod] ??= {}
    imports[mod][name] = () => {
      fuelUsed += 1
      if (fuelUsed > fuelLimit) throw new Error('plugin out of fuel')
      switch (name) {
        case 'log':
          return undefined
        default:
          return undefined
      }
    }
  }
  const instance = await WebAssembly.instantiate(module, imports)
  const exports = instance.exports as Record<string, WebAssembly.ExportValue>
  const memory = exports.memory as WebAssembly.Memory | undefined

  // The plugin's exported `call` entry point (FigCraft's plugin ABI).
  let reply: Uint8Array | null = null
  if (typeof exports.call === 'function') {
    const call = exports.call as (cmdPtr: number, cmdLen: number) => number
    const cmd = new TextEncoder().encode(host.call.name)
    if (memory) {
      new Uint8Array(memory.buffer).set(cmd, 0)
      try {
        const replyLen = call(0, cmd.length)
        if (replyLen > 0 && memory) {
          reply = Uint8Array.from(new Uint8Array(memory.buffer).slice(0, replyLen))
        }
      } catch (error) {
        logs.push(error instanceof Error ? error.message : String(error))
        return { reply: null, logs, fuelUsed, outOfFuel: /fuel/.test(logs.at(-1) ?? '') }
      }
    }
  }
  return { reply, logs, fuelUsed, outOfFuel: fuelUsed > fuelLimit }
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
