import { describe, expect, test } from 'bun:test'

import { createAssetFetcher, sniffImageContentType } from '@open-pencil/core/tools'

const PNG_HEADER = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])

function pngResponse(body: Uint8Array, init: ResponseInit = {}): Response {
  return new Response(body, {
    status: 200,
    headers: { 'content-type': 'image/png' },
    ...init
  })
}

describe('createAssetFetcher', () => {
  test('downloads an image and reports its content type', async () => {
    const fetcher = createAssetFetcher(async () => pngResponse(PNG_HEADER))
    const result = await fetcher.fetch('https://cdn.example.com/a.png')
    expect(result.contentType).toBe('image/png')
    expect(result.bytes.byteLength).toBe(PNG_HEADER.byteLength)
    expect(result.finalUrl).toBe('https://cdn.example.com/a.png')
  })

  test('refuses a private address before making a request', async () => {
    let called = false
    const fetcher = createAssetFetcher(async () => {
      called = true
      return pngResponse(PNG_HEADER)
    })
    await expect(fetcher.fetch('http://127.0.0.1/a.png')).rejects.toThrow(/private/i)
    expect(called).toBe(false)
  })

  test('rejects a redirect that points at a private address', async () => {
    const fetcher = createAssetFetcher(async (input) => {
      if (input === 'https://cdn.example.com/a.png') {
        return new Response(null, {
          status: 302,
          headers: { location: 'http://169.254.169.254/latest/meta-data' }
        })
      }
      return pngResponse(PNG_HEADER)
    })
    await expect(fetcher.fetch('https://cdn.example.com/a.png')).rejects.toThrow(/private/i)
  })

  test('follows a redirect to a public address', async () => {
    const fetcher = createAssetFetcher(async (input) => {
      if (input === 'https://cdn.example.com/a.png') {
        return new Response(null, {
          status: 302,
          headers: { location: 'https://images.example.com/b.png' }
        })
      }
      return pngResponse(PNG_HEADER)
    })
    const result = await fetcher.fetch('https://cdn.example.com/a.png')
    expect(result.finalUrl).toBe('https://images.example.com/b.png')
  })

  test('stops after too many redirects', async () => {
    const fetcher = createAssetFetcher(
      async () =>
        new Response(null, {
          status: 302,
          headers: { location: 'https://cdn.example.com/loop.png' }
        })
    )
    await expect(fetcher.fetch('https://cdn.example.com/a.png')).rejects.toThrow(/redirect/i)
  })

  test('rejects a response that is not an image', async () => {
    const fetcher = createAssetFetcher(
      async () =>
        new Response('<html></html>', { status: 200, headers: { 'content-type': 'text/html' } })
    )
    await expect(fetcher.fetch('https://cdn.example.com/a.png')).rejects.toThrow(/content type/i)
  })

  test('rejects a body that is larger than the limit', async () => {
    const fetcher = createAssetFetcher(async () =>
      pngResponse(new Uint8Array(64), {
        headers: { 'content-type': 'image/png', 'content-length': '64' }
      })
    )
    await expect(fetcher.fetch('https://cdn.example.com/a.png', { maxBytes: 8 })).rejects.toThrow(
      /larger/i
    )
  })

  test('reports a failed status', async () => {
    const fetcher = createAssetFetcher(
      async () => new Response('nope', { status: 404, headers: { 'content-type': 'text/plain' } })
    )
    await expect(fetcher.fetch('https://cdn.example.com/a.png')).rejects.toThrow(/404/)
  })
})

describe('sniffImageContentType', () => {
  test('detects common raster formats', () => {
    expect(sniffImageContentType(PNG_HEADER)).toBe('image/png')
    expect(sniffImageContentType(new Uint8Array([0xff, 0xd8, 0xff, 0x00]))).toBe('image/jpeg')
    expect(sniffImageContentType(new Uint8Array([0x47, 0x49, 0x46, 0x38]))).toBe('image/gif')
  })

  test('detects svg documents', () => {
    expect(sniffImageContentType(new TextEncoder().encode('<svg xmlns="x"></svg>'))).toBe(
      'image/svg+xml'
    )
  })

  test('returns null for unknown bytes', () => {
    expect(sniffImageContentType(new TextEncoder().encode('hello world'))).toBeNull()
  })
})
