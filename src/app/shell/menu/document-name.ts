import { computed } from 'vue'

import { useInlineRename } from '@open-pencil/vue'

import type { EditorStore } from '@/app/editor/active-store'
import { persistTabsSession } from '@/app/tabs'

const DOCUMENT_NAME_ID = 'document-name'

export function useDocumentNameRename(store: EditorStore) {
  const rename = useInlineRename<'document-name'>((_id, name) => {
    const trimmed = name.trim()
    if (!trimmed) return
    store.state.documentName = trimmed
    store.state.sceneVersion++
    persistTabsSession()
    void store.saveFigFile?.()
  })
  const editingName = computed(() => rename.editingId.value === DOCUMENT_NAME_ID)

  function startRename() {
    rename.start(DOCUMENT_NAME_ID, store.state.documentName)
  }

  function commitRename(e: Event) {
    rename.commit(DOCUMENT_NAME_ID, e)
  }

  return { rename, editingName, startRename, commitRename }
}
