/**
 * Content hashing for inspected assets.
 *
 * The hash binds a verification decision to the exact bytes that were
 * inspected. It must be stable across browser, Node and Bun, so the SHA-256
 * WebCrypto digest is preferred and a deterministic pure-JS fallback covers
 * environments without `crypto.subtle`.
 */

/** Prefix that identifies the fallback digest, so the two never collide. */
const FALLBACK_PREFIX = 'fnv1a64:'

function toHex(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer)
  let hex = ''
  for (const byte of bytes) hex += byte.toString(16).padStart(2, '0')
  return hex
}

/**
 * 64-bit fallback digest, used only when WebCrypto is unavailable.
 *
 * Two independent 32-bit FNV-1a lanes keep the result stable and fast enough
 * for large images.
 */
function fallbackHash(data: Uint8Array): string {
  let first = 0x811c9dc5 >>> 0
  let second = 0x01000193 >>> 0
  for (const byte of data) {
    first = Math.imul(first ^ byte, 0x01000193) >>> 0
    second = Math.imul(second + byte, 0x85ebca6b) >>> 0
  }
  return `${FALLBACK_PREFIX}${first.toString(16).padStart(8, '0')}${second
    .toString(16)
    .padStart(8, '0')}`
}

function getSubtleCrypto(): SubtleCrypto | null {
  // The digest is not available in insecure contexts, so the global is read
  // defensively instead of relying on the ambient type.
  const candidate = Reflect.get(globalThis, 'crypto') as Crypto | undefined
  if (!candidate?.subtle || typeof candidate.subtle.digest !== 'function') return null
  return candidate.subtle
}

/**
 * Hashes the exact bytes of an asset.
 *
 * The same bytes always produce the same hash, in any runtime, which is what
 * makes the verification cache safe to reuse.
 */
export async function contentHash(data: Uint8Array): Promise<string> {
  const subtle = getSubtleCrypto()
  if (!subtle) return fallbackHash(data)
  // Copy into a fresh buffer so a view over a larger pool hashes only its own
  // bytes and never the surrounding memory.
  const copy = new Uint8Array(data.byteLength)
  copy.set(data)
  const digest = await subtle.digest('SHA-256', copy.buffer)
  return `sha256:${toHex(digest)}`
}
