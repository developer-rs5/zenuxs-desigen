/**
 * The Zenuxs engine, wired into the running app (wire-in step 1).
 *
 * A headless @zenuxs/engine Session lives beside the OpenPencil editor
 * session: the same commands FigCraft runs are drivable from the browser
 * bridge, the automation runtime and future surfaces. At wire-in completion
 * this session takes over document ownership from the OpenPencil store.
 */

import {
  Session,
  registerRegistry,
  registryReady,
  allCoreSpecs,
  allAdvancedSpecs,
  type Session as ZenuxsSession
} from '@zenuxs/engine'

import { zenuxsBridge, type ZenuxsBridge } from '@/app/zenuxs-bridge'
import { IS_BROWSER } from '@/constants'

if (!registryReady()) registerRegistry([...allCoreSpecs(), ...allAdvancedSpecs()])

let engine: ZenuxsSession | null = null

/** The app-wide Zenuxs engine session (created lazily). */
export function getZenuxsEngine(): ZenuxsSession {
  engine ??= new Session()
  return engine
}

/** Reset the engine session (new document). */
export function resetZenuxsEngine(): void {
  engine = new Session()
}

/** Get the bidirectional bridge instance. */
export function getZenuxsBridge(): ZenuxsBridge {
  return zenuxsBridge
}

/** Expose the engine on the window bridge (call once at app mount). */
export function exposeZenuxsEngine(): void {
  if (IS_BROWSER) {
    window.openPencil ??= {}
    window.openPencil.getZenuxsEngine ??= getZenuxsEngine
    window.openPencil.resetZenuxsEngine ??= resetZenuxsEngine
    window.openPencil.getZenuxsBridge ??= getZenuxsBridge
  }
}
