/**
 * Desktop & web window management.
 * Opens new editor windows in desktop (Tauri v2 multi-window) or browser.
 */

import { IS_TAURI } from '@/constants'

export async function openNewEditorWindow(url = '/editor', title = 'ZenuxsDesign'): Promise<void> {
  if (IS_TAURI) {
    try {
      const { invoke } = await import('@tauri-apps/api/core')
      const windowId = `win-${Date.now()}`
      await invoke('create_new_window', {
        label: windowId,
        title,
        url
      })
      return
    } catch (err) {
      console.warn('[Desktop] Native create_new_window failed, falling back:', err)
    }
  }

  // Web fallback
  window.open(url, '_blank', 'width=1280,height=800,menubar=no,toolbar=no')
}
