/**
 * Session token generation, hashing, and cookie encoding.
 *
 * Kept free of Express and Mongoose imports so it can be unit tested directly
 * and reused by any transport.
 */

import { createHash, randomBytes, timingSafeEqual } from 'node:crypto'

export const SESSION_TOKEN_BYTES = 32
export const CSRF_TOKEN_BYTES = 32

/** Generates a URL-safe, cryptographically random session token. */
export function generateSessionToken(): string {
  return randomBytes(SESSION_TOKEN_BYTES).toString('base64url')
}

/** Generates a CSRF token safe to expose to JavaScript (double-submit pattern). */
export function generateCsrfToken(): string {
  return randomBytes(CSRF_TOKEN_BYTES).toString('base64url')
}

/**
 * Hashes a token for storage/lookup. SHA-256 is appropriate here because the
 * token is already high-entropy random rather than a low-entropy password.
 */
export function hashToken(token: string): string {
  return createHash('sha256').update(token, 'utf8').digest('hex')
}

/** Constant-time comparison of two tokens, safe for unequal lengths. */
export function tokensMatch(a: string, b: string): boolean {
  const digestA = createHash('sha256').update(a, 'utf8').digest()
  const digestB = createHash('sha256').update(b, 'utf8').digest()
  return timingSafeEqual(digestA, digestB)
}

export interface CookieOptions {
  maxAgeMs?: number
  httpOnly?: boolean
  secure?: boolean
  sameSite?: 'Strict' | 'Lax' | 'None'
  path?: string
}

/**
 * Serializes a cookie.
 *
 * Defaults follow OWASP guidance for session cookies: `HttpOnly`,
 * `SameSite=Lax`, `Path=/`, and `Secure` whenever the server is not in
 * development.
 */
export function serializeCookie(name: string, value: string, options: CookieOptions = {}): string {
  const { maxAgeMs, httpOnly = true, secure = true, sameSite = 'Lax', path = '/' } = options

  const parts = [`${name}=${value}`, `Path=${path}`, `SameSite=${sameSite}`]
  if (httpOnly) parts.push('HttpOnly')
  if (secure) parts.push('Secure')
  if (typeof maxAgeMs === 'number') {
    const seconds = Math.floor(maxAgeMs / 1000)
    parts.push(`Max-Age=${Math.max(0, seconds)}`)
    parts.push(`Expires=${new Date(Date.now() + maxAgeMs).toUTCString()}`)
  }
  return parts.join('; ')
}

/** Serializes a cookie that instructs the browser to delete it immediately. */
export function clearCookie(name: string, secure: boolean, path = '/'): string {
  return serializeCookie(name, '', { secure, path, maxAgeMs: 0 })
}

/** Parses a `Cookie` request header into a plain object. */
export function parseCookieHeader(header: string | undefined): Record<string, string> {
  const result: Record<string, string> = {}
  if (!header) return result
  for (const part of header.split(';')) {
    const separator = part.indexOf('=')
    if (separator === -1) continue
    const name = part.slice(0, separator).trim()
    if (name.length === 0) continue
    const value = part.slice(separator + 1).trim()
    try {
      result[name] = decodeURIComponent(value)
    } catch {
      result[name] = value
    }
  }
  return result
}
