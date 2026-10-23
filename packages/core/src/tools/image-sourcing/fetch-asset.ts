/**
 * Bounded, SSRF-aware download of remote assets.
 *
 * The fetcher validates every URL before the request, follows redirects
 * manually where the runtime allows it, caps the response size, and only ever
 * returns bytes whose content type is an image.
 */

import {
  ALLOWED_IMAGE_CONTENT_TYPES,
  canonicalizeURL,
  isAllowedImageContentType,
  MAX_REDIRECTS,
  validateRemoteURL
} from './safety'

export interface AssetFetchResult {
  bytes: Uint8Array
  contentType: string
  /** The URL the bytes actually came from, after redirects. */
  finalUrl: string
}

export interface AssetFetchOptions {
  /** Hard cap on the downloaded size. */
  maxBytes: number
  /** Request timeout in milliseconds. */
  timeoutMs: number
  allowedHosts?: readonly string[]
  blockedHosts?: readonly string[]
  userAgent?: string
  accept?: string
}

export type FetchLike = (input: string, init?: RequestInit) => Promise<Response>

export interface AssetFetcher {
  fetch(url: string, options?: Partial<AssetFetchOptions>): Promise<AssetFetchResult>
}

/** Default limits for asset downloads. */
export const DEFAULT_MAX_ASSET_BYTES = 12 * 1024 * 1024
export const DEFAULT_ASSET_TIMEOUT_MS = 15_000

const MAGIC_NUMBERS: Array<{ type: string; bytes: number[] }> = [
  { type: 'image/jpeg', bytes: [0xff, 0xd8, 0xff] },
  { type: 'image/png', bytes: [0x89, 0x50, 0x4e, 0x47] },
  { type: 'image/gif', bytes: [0x47, 0x49, 0x46, 0x38] },
  { type: 'image/webp', bytes: [0x52, 0x49, 0x46, 0x46] },
  { type: 'image/bmp', bytes: [0x42, 0x4d] }
]

/** Detects the real content type from the leading bytes. */
export function sniffImageContentType(bytes: Uint8Array): string | null {
  for (const candidate of MAGIC_NUMBERS) {
    if (candidate.bytes.every((byte, index) => bytes[index] === byte)) return candidate.type
  }
  const head = new TextDecoder('utf-8', { fatal: false })
    .decode(bytes.subarray(0, 256))
    .trimStart()
    .toLowerCase()
  if (head.startsWith('<?xml') || head.startsWith('<svg') || head.includes('<svg')) {
    return 'image/svg+xml'
  }
  return null
}

async function readBounded(response: Response, maxBytes: number): Promise<Uint8Array> {
  const declared = Number(response.headers.get('content-length'))
  if (Number.isFinite(declared) && declared > maxBytes) {
    throw new Error(`Asset is larger than the ${maxBytes} byte limit`)
  }
  if (!response.body) {
    const bytes = new Uint8Array(await response.arrayBuffer())
    if (bytes.byteLength > maxBytes)
      throw new Error(`Asset is larger than the ${maxBytes} byte limit`)
    return bytes
  }
  const reader = response.body.getReader()
  const chunks: Uint8Array[] = []
  let total = 0
  try {
    let result = await reader.read()
    while (!result.done) {
      total += result.value.byteLength
      if (total > maxBytes) throw new Error(`Asset is larger than the ${maxBytes} byte limit`)
      chunks.push(result.value)
      result = await reader.read()
    }
  } catch (error) {
    await reader.cancel().catch(() => undefined)
    throw error
  }
  const merged = new Uint8Array(total)
  let offset = 0
  for (const chunk of chunks) {
    merged.set(chunk, offset)
    offset += chunk.byteLength
  }
  return merged
}

function resolveFetchOptions(overrides: Partial<AssetFetchOptions>): AssetFetchOptions {
  return {
    maxBytes: overrides.maxBytes ?? DEFAULT_MAX_ASSET_BYTES,
    timeoutMs: overrides.timeoutMs ?? DEFAULT_ASSET_TIMEOUT_MS,
    allowedHosts: overrides.allowedHosts,
    blockedHosts: overrides.blockedHosts,
    userAgent: overrides.userAgent,
    accept: overrides.accept ?? 'image/*,*/*;q=0.8'
  }
}

function requestHeaders(options: AssetFetchOptions): Record<string, string> {
  const headers: Record<string, string> = { Accept: options.accept ?? 'image/*,*/*;q=0.8' }
  if (options.userAgent) headers['User-Agent'] = options.userAgent
  return headers
}

async function requestOnce(
  fetchImpl: FetchLike,
  url: string,
  options: AssetFetchOptions,
  redirect: RequestRedirect
): Promise<Response> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), options.timeoutMs)
  try {
    return await fetchImpl(url, {
      redirect,
      signal: controller.signal,
      headers: requestHeaders(options)
    })
  } catch (error) {
    throw new Error(
      `Asset request failed: ${error instanceof Error ? error.message : String(error)}`
    )
  } finally {
    clearTimeout(timer)
  }
}

function isOpaqueRedirect(response: Response): boolean {
  return response.type === 'opaqueredirect' || response.status === 0
}

function resolveRedirectTarget(response: Response, currentURL: string): string | null {
  const isRedirect = response.status >= 300 && response.status < 400
  const location = response.headers.get('location')
  if (!isRedirect || !location) return null
  return new URL(location, currentURL).toString()
}

function resolveContentType(response: Response, bytes: Uint8Array): string {
  const declaredType = (response.headers.get('content-type') ?? '').split(';')[0]?.trim() ?? ''
  if (isAllowedImageContentType(declaredType)) return declaredType.toLowerCase()
  const sniffed = sniffImageContentType(bytes) ?? ''
  if (sniffed && (ALLOWED_IMAGE_CONTENT_TYPES as readonly string[]).includes(sniffed))
    return sniffed
  throw new Error(`Unsupported asset content type: ${declaredType || 'unknown'}`)
}

/**
 * Creates an {@link AssetFetcher} on top of a `fetch` implementation.
 *
 * Redirects are followed manually so every hop is validated. Browsers hide the
 * redirect target behind an opaque response, so there the final URL is
 * validated instead.
 */
export function createAssetFetcher(fetchImpl: FetchLike = globalThis.fetch): AssetFetcher {
  return {
    async fetch(rawURL, overrides = {}) {
      const options = resolveFetchOptions(overrides)
      if (typeof fetchImpl !== 'function') {
        throw new TypeError('No fetch implementation is available for asset downloads')
      }

      let currentURL = validateRemoteURL(rawURL, options).toString()
      let response = await requestOnce(fetchImpl, currentURL, options, 'manual')

      if (isOpaqueRedirect(response)) {
        // Browsers hide manual redirects, so the request is repeated with
        // automatic redirect handling and the final URL is validated instead.
        response = await requestOnce(fetchImpl, currentURL, options, 'follow')
      } else {
        for (let redirect = 0; redirect < MAX_REDIRECTS; redirect++) {
          const nextURL = resolveRedirectTarget(response, currentURL)
          if (!nextURL) break
          currentURL = validateRemoteURL(nextURL, options).toString()
          response = await requestOnce(fetchImpl, currentURL, options, 'manual')
          if (isOpaqueRedirect(response)) {
            response = await requestOnce(fetchImpl, currentURL, options, 'follow')
            break
          }
        }
        if (resolveRedirectTarget(response, currentURL)) {
          throw new Error('Too many redirects while downloading the asset')
        }
      }

      if (!response.ok) {
        throw new Error(`Asset request failed with status ${response.status}`)
      }

      // The browser hides the redirect chain, so the final URL is validated too.
      if (response.url) {
        validateRemoteURL(response.url, options)
      }

      const bytes = await readBounded(response, options.maxBytes)
      if (bytes.byteLength === 0) throw new Error('The asset response was empty')

      return {
        bytes,
        contentType: resolveContentType(response, bytes),
        finalUrl: canonicalizeURL(response.url || currentURL)
      }
    }
  }
}
