import { currentUser } from '@/app/auth/zenuxs'

const BACKEND_URL = import.meta.env.VITE_BACKEND_URL || 'http://localhost:3000'

export interface RemoteServerDocumentHeader {
  documentId: string
  ownerSub: string
  title: string
  version: number
  previewDataUrl?: string
  updatedAt: string
}

export async function listRemoteDocuments(): Promise<RemoteServerDocumentHeader[]> {
  const sub = currentUser.value?.sub || ''
  const url = sub
    ? `${BACKEND_URL}/api/documents?ownerSub=${encodeURIComponent(sub)}`
    : `${BACKEND_URL}/api/documents`
  const res = await fetch(url)
  if (!res.ok) throw new Error(`HTTP ${res.status} listing documents`)
  const data = await res.json()
  return data.documents || []
}

export async function fetchRemoteDocument(documentId: string): Promise<Record<string, unknown>> {
  const res = await fetch(`${BACKEND_URL}/api/documents/${encodeURIComponent(documentId)}`)
  if (!res.ok) throw new Error(`HTTP ${res.status} fetching document`)
  const data = await res.json()
  return data.document?.payload || {}
}

export async function saveRemoteDocument(
  documentId: string,
  title: string,
  payload: Record<string, unknown>,
  previewDataUrl?: string
): Promise<void> {
  const sub = currentUser.value?.sub || 'anonymous'
  const res = await fetch(`${BACKEND_URL}/api/documents`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-user-sub': sub
    },
    body: JSON.stringify({
      documentId,
      title,
      payload,
      previewDataUrl,
      ownerSub: sub
    })
  })
  if (!res.ok) throw new Error(`HTTP ${res.status} saving document`)
}
