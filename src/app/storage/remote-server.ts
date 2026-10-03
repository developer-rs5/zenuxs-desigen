/**
 * Remote design-document storage.
 *
 * Ownership is resolved by the backend from the session cookie; the previous
 * version sent `ownerSub` in the query string, a header, and the body, and
 * listed *all* documents when no subject was available.
 */

import { apiRequest, SessionRequestError } from '@/app/auth/api'

export interface RemoteServerDocumentHeader {
  documentId: string
  ownerSub: string
  title: string
  version: number
  previewDataURL?: string
  updatedAt: string
}

function isUnauthorized(error: unknown): boolean {
  return error instanceof SessionRequestError && (error.status === 401 || error.status === 403)
}

/** Lists the signed-in user's documents. Throws when the session has ended. */
export async function listRemoteDocuments(): Promise<RemoteServerDocumentHeader[]> {
  try {
    const result = await apiRequest<{ documents: RemoteServerDocumentHeader[] }>('/api/documents')
    return result.documents ?? []
  } catch (error) {
    if (isUnauthorized(error)) return []
    throw error
  }
}

/** Fetches one of the signed-in user's documents. */
export async function fetchRemoteDocument(documentId: string): Promise<Record<string, unknown>> {
  const result = await apiRequest<{
    document: {
      documentId: string
      title?: string
      payload: Record<string, unknown>
      previewDataURL?: string
      previewDataUrl?: string
    }
  }>(`/api/documents/${encodeURIComponent(documentId)}`)
  const doc = result.document
  return {
    ...(doc?.payload ?? {}),
    title: doc?.title,
    previewDataURL: doc?.previewDataURL ?? doc?.previewDataUrl
  }
}

/** Saves a document owned by the signed-in user. */
export async function saveRemoteDocument(
  documentId: string,
  title: string,
  payload: Record<string, unknown>,
  previewDataURL?: string
): Promise<void> {
  const body: Record<string, unknown> = { documentId, title, payload }
  if (previewDataURL !== undefined) body.previewDataURL = previewDataURL

  await apiRequest('/api/documents', { method: 'POST', body })
}

/** Deletes a document owned by the signed-in user. */
export async function deleteRemoteDocument(documentId: string): Promise<void> {
  await apiRequest(`/api/documents/${encodeURIComponent(documentId)}`, { method: 'DELETE' })
}
