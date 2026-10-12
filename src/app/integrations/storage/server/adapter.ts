import { extractFigThumbnailFromReader } from '@open-pencil/fig'

import { apiRequest } from '@/app/auth/api'
import {
  deleteRemoteDocument,
  fetchRemoteDocument,
  listRemoteDocuments,
  saveRemoteDocument
} from '@/app/storage/remote-server'

import type {
  StorageAdapter,
  StorageConnectionResult,
  StorageDocument,
  StorageDocumentMetadata,
  StorageProviderRuntime,
  StorageTransferProgress,
  StorageUsage
} from '../types'

function bytesToBase64(bytes: Uint8Array): string {
  const CHUNK_SIZE = 0x8000
  const chunks: string[] = []
  for (let i = 0; i < bytes.length; i += CHUNK_SIZE) {
    chunks.push(String.fromCharCode(...bytes.subarray(i, i + CHUNK_SIZE)))
  }
  return btoa(chunks.join(''))
}

/** Picks the first payload value that is a non-null string. */
function firstString(payload: Record<string, unknown>, keys: readonly string[]): string | null {
  for (const key of keys) {
    const value = payload[key]
    if (typeof value === 'string') return value
  }
  return null
}

function base64ToBytes(base64: string): Uint8Array {
  const binaryString = atob(base64)
  const len = binaryString.length
  const bytes = new Uint8Array(len)
  for (let i = 0; i < len; i++) {
    bytes[i] = binaryString.charCodeAt(i)
  }
  return bytes
}

export function createServerStorageAdapter(_runtime?: StorageProviderRuntime): StorageAdapter {
  return {
    async testConnection(): Promise<StorageConnectionResult> {
      try {
        await apiRequest<{ status: string }>('/health')
        return { ok: true, message: 'Connected to MongoDB backend server' }
      } catch (error) {
        return {
          ok: false,
          message: error instanceof Error ? error.message : 'Backend connection failed'
        }
      }
    },

    async listDocuments(): Promise<StorageDocument[]> {
      const remoteDocs = await listRemoteDocuments()
      return remoteDocs.map((doc) => ({
        id: doc.documentId,
        name: doc.title,
        updatedAt: doc.updatedAt,
        thumbnailURL: doc.previewDataURL,
        metadataAuthoritative: true
      }))
    },

    async getDocument(
      id: string,
      onProgress?: (progress: StorageTransferProgress) => void,
      signal?: AbortSignal
    ): Promise<Uint8Array> {
      signal?.throwIfAborted()
      onProgress?.({ transferredBytes: 0, totalBytes: null })

      const payload = await fetchRemoteDocument(id)
      signal?.throwIfAborted()

      const base64Data = firstString(payload, ['figBase64', 'data'])

      if (!base64Data) {
        throw new Error(`Document payload for ${id} is empty or invalid`)
      }

      const bytes = base64ToBytes(base64Data)
      onProgress?.({ transferredBytes: bytes.byteLength, totalBytes: bytes.byteLength })
      return bytes
    },

    async putDocument(
      id: string,
      bytes: Uint8Array,
      metadata: StorageDocumentMetadata,
      onProgress?: (progress: StorageTransferProgress) => void
    ): Promise<void> {
      onProgress?.({ transferredBytes: 0, totalBytes: bytes.byteLength })
      const figBase64 = bytesToBase64(bytes)
      let previewDataURL: string | undefined
      try {
        const thumbBytes = await extractFigThumbnailFromReader({
          size: bytes.byteLength,
          async read(start, endExclusive) {
            return bytes.subarray(start, endExclusive)
          }
        })
        if (thumbBytes) {
          previewDataURL = `data:image/png;base64,${bytesToBase64(thumbBytes)}`
        }
      } catch (error) {
        console.debug('[storage] Fig thumbnail extraction skipped:', error)
      }
      await saveRemoteDocument(
        id,
        metadata.name,
        {
          figBase64,
          size: bytes.byteLength,
          updatedAt: metadata.updatedAt
        },
        previewDataURL
      )
      onProgress?.({ transferredBytes: bytes.byteLength, totalBytes: bytes.byteLength })
    },

    async deleteDocument(id: string): Promise<void> {
      await deleteRemoteDocument(id)
    },

    async getThumbnail(id: string): Promise<Uint8Array | null> {
      try {
        const payload = await fetchRemoteDocument(id)
        const previewURL = firstString(payload, ['previewDataURL', 'previewDataUrl'])
        if (!previewURL || !previewURL.startsWith('data:')) return null
        const commaIndex = previewURL.indexOf(',')
        if (commaIndex === -1) return null
        return base64ToBytes(previewURL.slice(commaIndex + 1))
      } catch {
        return null
      }
    },

    async putThumbnail(id: string, bytes: Uint8Array): Promise<void> {
      const dataURL = `data:image/png;base64,${bytesToBase64(bytes)}`
      const payload: Record<string, unknown> = await fetchRemoteDocument(id).catch(() => ({}))
      const title =
        'title' in payload && typeof payload.title === 'string' ? payload.title : 'Untitled'
      await saveRemoteDocument(id, title, payload, dataURL)
    },

    async getUsage(): Promise<StorageUsage> {
      const docs = await listRemoteDocuments().catch(() => [])
      return {
        bytesUsed: 0,
        objectCount: docs.length,
        documentCount: docs.length
      }
    }
  }
}
