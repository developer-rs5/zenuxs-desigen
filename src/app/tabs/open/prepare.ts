import { findFigThumbnailPageId } from '@open-pencil/core/io/formats/fig'
import { populateLazyFigImportRoots } from '@open-pencil/core/kiwi'
import { computeAllLayouts } from '@open-pencil/core/layout'
import type { SceneGraph } from '@open-pencil/scene-graph'

import { describeDiagnosticError, recordStorageFailure } from '@/app/diagnostics'
import { readFigDocument } from '@/app/document/io/fig'
import { applyImportedDocument } from '@/app/document/io/imported-document'
import type { EditorPreparationHandle as DocumentLoadSession } from '@/app/editor/preparation/types'
import type { EditorStore } from '@/app/editor/session'
import { notificationMessages } from '@/app/i18n/notifications'
import {
  activeStorageProviderID,
  createActiveStorageAdapter,
  type StorageDocument
} from '@/app/integrations/storage'
import { rememberRecentStorageDocument } from '@/app/recent-files'
import { toast } from '@/app/shell/ui'
import { getLocalCanvasStore } from '@/app/storage/local-store'
import { seedStorageCanvasFromRemote } from '@/app/storage/sync/persist'

export function yieldToUI(): Promise<void> {
  return new Promise((resolve) => {
    requestAnimationFrame(() => resolve())
  })
}

export function isDOMImportFile(file: File): boolean {
  return /\.(html?|xhtml)$/i.test(file.name)
}

export async function readFigForTab(file: File, signal?: AbortSignal): Promise<SceneGraph> {
  const imported = await readFigDocument(file, signal)
  const firstPageId = imported.getPages()[0]?.id
  if (firstPageId) computeAllLayouts(imported, firstPageId)
  const coverPageId = findFigThumbnailPageId(imported.getPages())
  if (coverPageId && coverPageId !== firstPageId) {
    populateLazyFigImportRoots(imported, [coverPageId])
    computeAllLayouts(imported, coverPageId)
  }
  return imported
}

export async function showImportedGraph(
  store: EditorStore,
  graph: SceneGraph,
  prepare?: () => void | Promise<void>,
  load?: DocumentLoadSession
): Promise<void> {
  load?.update({ phase: 'materializing', detail: store.state.documentName })
  await applyImportedDocument(store, graph, load)
  load?.signal.throwIfAborted()
  await prepare?.()
  load?.signal.throwIfAborted()
  const pageId = store.graph.getPages()[0]?.id ?? store.graph.rootId
  load?.update({ phase: 'populating-page', detail: store.graph.getNode(pageId)?.name ?? null })
  await store.switchPage(pageId, { preparation: load })
  load?.signal.throwIfAborted()
  load?.update({ phase: 'preparing-render', detail: store.state.documentName })
  await store.fitCurrentPageToViewport()
}

export function failPreparation(
  load: DocumentLoadSession,
  code: 'read-failed' | 'decode-failed',
  error: unknown
): void {
  if (load.signal.aborted) return
  load.fail({
    code,
    message: error instanceof Error ? error.message : String(error),
    retryable: true
  })
}

export async function loadStorageDocumentIntoStore(
  store: EditorStore,
  document: StorageDocument,
  options?: { silent?: boolean }
): Promise<void> {
  const providerId = activeStorageProviderID.value
  store.state.documentName = document.name
  const load = store.preparationController.begin({
    kind: 'storage-open',
    subject: document.name
  })
  let succeeded = false
  try {
    load.update({ phase: 'reading', detail: document.name })
    const local = getLocalCanvasStore()
    const localMetadata = await local.getMeta(document.id)
    if (localMetadata?.name) {
      store.state.documentName = localMetadata.name
    }
    load.signal.throwIfAborted()
    const localBytes = localMetadata?.hasFig ? await local.readFig(document.id) : null
    load.signal.throwIfAborted()
    const localIsAuthoritative =
      localMetadata?.syncStatus !== 'synced' ||
      !document.metadataAuthoritative ||
      localMetadata.updatedAt >= document.updatedAt
    let bytes = localBytes && localIsAuthoritative ? localBytes : null

    if (!bytes) {
      bytes = await createActiveStorageAdapter(providerId).getDocument(
        document.id,
        (progress) =>
          load.update({
            phase: 'reading',
            detail: document.name,
            completed: progress.transferredBytes,
            total: progress.totalBytes,
            unit: 'bytes'
          }),
        load.signal
      )
      await seedStorageCanvasFromRemote({
        providerId,
        canvasId: document.id,
        name: document.name,
        updatedAt: document.updatedAt,
        figBytes: bytes
      })
      load.signal.throwIfAborted()
    }

    const fileBytes = new Uint8Array(bytes.byteLength)
    fileBytes.set(bytes)
    const file = new File([fileBytes.buffer], `${document.name}.fig`, {
      type: 'application/octet-stream'
    })
    load.update({ phase: 'decoding', detail: document.name })
    const imported = await readFigForTab(file, load.signal)
    await showImportedGraph(
      store,
      imported,
      () => store.setStorageDocumentSource({ providerId, documentId: document.id }, document.name),
      load
    )
    rememberRecentStorageDocument(providerId, document.id, document.name)
    succeeded = true
  } catch (error) {
    if (!load.signal.aborted) {
      const diagnostic = describeDiagnosticError(error)
      load.fail({
        code: 'read-failed',
        message: error instanceof Error ? error.message : String(error),
        retryable: diagnostic.retryable ?? true
      })
      recordStorageFailure({ operation: 'download', ...diagnostic })
      // Session restore stays silent; explicit opens keep the error toast.
      if (!options?.silent) {
        toast.error(
          notificationMessages.get().openFileFailed({
            name: document.name,
            error: error instanceof Error ? error.message : String(error)
          })
        )
      }
    }
    throw error
  } finally {
    if (succeeded) load.complete()
  }
}
