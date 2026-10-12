import type { Page } from '@playwright/test'

type ClipboardWrite = {
  args: unknown
  cmd: string
}

export type TauriClipboardSnapshot = {
  html: string
  text: string
  writes: ClipboardWrite[]
}

export type TauriClipboardMock = {
  rejectHTMLWrites: () => void
  snapshot: () => TauriClipboardSnapshot
}

const IPC_BINDING = '__playwrightTauriIPC'

/** Simulated Tauri command router; split out of the binding to stay under the lint complexity cap. */
/** Commands that only ever answer null (boot-time fire-and-forget in the product). */
const FIRE_AND_FORGET_COMMANDS = new Set([
  'load_system_font',
  'plugin:event|listen',
  'plugin:event|unlisten',
  'plugin:process|exit',
  'plugin:process|restart',
  // Boot-time menu sync (native-menu.ts).
  'set_native_menu_checked'
])

function dispatchTauriCommand(
  state: TauriClipboardSnapshot,
  isHTMLWriteRejected: () => boolean,
  cmd: string,
  args?: Record<string, unknown>
): unknown {
  if (FIRE_AND_FORGET_COMMANDS.has(cmd)) return null
  switch (cmd) {
    case 'plugin:clipboard-manager|write_html': {
      if (isHTMLWriteRejected()) throw new Error('Clipboard write failed')
      state.html = String(args?.html ?? '')
      state.text = String(args?.altText ?? state.html)
      return null
    }
    case 'plugin:clipboard-manager|write_text': {
      state.text = String(args?.text ?? '')
      state.html = ''
      return null
    }
    case 'plugin:clipboard-manager|read_text':
      return state.html || state.text
    case 'list_system_fonts':
    case 'take_pending_open':
      return []
    // No native keychain exists in a browser mock; kebab-case per
    // desktop/src/credentials.rs serde. 'unavailable' also short-circuits
    // credential migration before it would issue read commands.
    case 'credential_store_availability':
      return 'unavailable'
    default:
      throw new Error(`Unexpected Tauri command: ${cmd}`)
  }
}

export async function installTauriClipboardMock(page: Page): Promise<TauriClipboardMock> {
  const state: TauriClipboardSnapshot = {
    text: '',
    html: '',
    writes: []
  }
  let rejectHTMLWrites = false

  await page.exposeBinding(IPC_BINDING, (_, cmd: string, args?: Record<string, unknown>) => {
    state.writes.push({ cmd, args })
    return dispatchTauriCommand(state, () => rejectHTMLWrites, cmd, args)
  })

  await page.addInitScript((bindingName) => {
    const binding: unknown = Reflect.get(globalThis, bindingName)
    if (typeof binding !== 'function')
      throw new Error(`Playwright binding not found: ${bindingName}`)
    const invoke = binding as (cmd: string, args?: Record<string, unknown>) => Promise<unknown>

    let callbackId = 1
    const callbacks = new Map<number, unknown>()
    Object.defineProperty(window, '__TAURI_INTERNALS__', {
      configurable: true,
      value: {
        callbacks,
        metadata: {
          currentWindow: { label: 'main' },
          currentWebview: { label: 'main' }
        },
        convertFileSrc: (filePath: string) => filePath,
        invoke,
        transformCallback: (callback: unknown) => {
          const id = callbackId++
          callbacks.set(id, callback)
          return id
        },
        unregisterCallback: (id: number) => {
          callbacks.delete(id)
        },
        runCallback: () => null
      }
    })
  }, IPC_BINDING)

  return {
    rejectHTMLWrites: () => {
      rejectHTMLWrites = true
    },
    snapshot: () => structuredClone(state)
  }
}
