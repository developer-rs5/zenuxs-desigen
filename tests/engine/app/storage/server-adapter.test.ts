import { describe, expect, it, mock } from 'bun:test'

import { createServerStorageAdapter } from '@/app/integrations/storage/server/adapter'

describe('server-mongodb storage adapter', () => {
  it('connects and tests health', async () => {
    const adapter = createServerStorageAdapter()
    const globalFetch = globalThis.fetch
    globalThis.fetch = mock(() =>
      Promise.resolve(new Response(JSON.stringify({ status: 'ok' }), { status: 200 }))
    ) as unknown as typeof fetch

    try {
      const result = await adapter.testConnection()
      expect(result.ok).toBe(true)
      expect(result.message).toContain('MongoDB')
    } finally {
      globalThis.fetch = globalFetch
    }
  })

  it('lists documents from server via apiRequest', async () => {
    const adapter = createServerStorageAdapter()
    const globalFetch = globalThis.fetch
    globalThis.fetch = mock((url: string | URL | Request) => {
      const path = typeof url === 'string' ? url : url.toString()
      if (path.includes('/api/documents')) {
        return Promise.resolve(
          new Response(
            JSON.stringify({
              success: true,
              documents: [
                {
                  documentId: 'doc-1',
                  ownerSub: 'user-1',
                  title: 'Design Project Alpha',
                  version: 1,
                  previewDataURL: 'data:image/png;base64,QUJD',
                  updatedAt: '2026-03-30T00:00:00.000Z'
                }
              ]
            }),
            { status: 200 }
          )
        )
      }
      return Promise.resolve(new Response('{}', { status: 200 }))
    }) as unknown as typeof fetch

    try {
      const docs = await adapter.listDocuments()
      expect(docs.length).toBe(1)
      expect(docs[0].id).toBe('doc-1')
      expect(docs[0].name).toBe('Design Project Alpha')
      expect(docs[0].thumbnailURL).toBe('data:image/png;base64,QUJD')
    } finally {
      globalThis.fetch = globalFetch
    }
  })

  it('puts and gets document with base64 payload roundtrip', async () => {
    const adapter = createServerStorageAdapter()
    const globalFetch = globalThis.fetch
    let savedBody: Record<string, unknown> = {}

    globalThis.fetch = mock((url: string | URL | Request, init?: RequestInit) => {
      const path = typeof url === 'string' ? url : url.toString()
      const method = init?.method ?? 'GET'

      if (path.includes('/api/documents') && method === 'POST') {
        savedBody = JSON.parse(init?.body as string)
        return Promise.resolve(new Response(JSON.stringify({ success: true }), { status: 200 }))
      }

      if (path.includes('/api/documents/test-doc') && method === 'GET') {
        return Promise.resolve(
          new Response(
            JSON.stringify({
              success: true,
              document: {
                documentId: 'test-doc',
                title: savedBody.title,
                payload: savedBody.payload
              }
            }),
            { status: 200 }
          )
        )
      }

      return Promise.resolve(new Response('{}', { status: 200 }))
    }) as unknown as typeof fetch

    try {
      const testBytes = new Uint8Array([79, 112, 101, 110, 80, 101, 110, 99, 105, 108]) // "OpenPencil"
      await adapter.putDocument('test-doc', testBytes, {
        name: 'My Project',
        updatedAt: '2026-03-30T12:00:00.000Z'
      })

      expect(savedBody.documentId).toBe('test-doc')
      expect(savedBody.title).toBe('My Project')
      const payload = savedBody.payload as Record<string, unknown>
      expect(typeof payload.figBase64).toBe('string')

      const retrieved = await adapter.getDocument('test-doc')
      expect(retrieved).toEqual(testBytes)
    } finally {
      globalThis.fetch = globalFetch
    }
  })
})
