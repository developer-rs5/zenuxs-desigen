/**
 * Client for the server-managed session API.
 *
 * The browser authenticates with an `HttpOnly` cookie it cannot read. The only
 * JavaScript-visible credential is the double-submit CSRF token, which is read
 * from its own cookie and echoed back in a header.
 *
 * All API calls default to same-origin relative URLs so the session cookie is
 * sent under `SameSite=Lax`. `VITE_BACKEND_URL` may point at a separate origin,
 * but that origin must be served over HTTPS and allowlisted server-side for the
 * cookie to be usable.
 */

const CONFIGURED_BASE = (import.meta.env.VITE_BACKEND_URL ?? '').replace(/\/+$/, '')

/** Name must match `CSRF_COOKIE_NAME` on the server. */
export const CSRF_COOKIE_NAME = 'zenuxs_csrf'
/** Name must match `CSRF_HEADER_NAME` on the server. */
export const CSRF_HEADER_NAME = 'x-csrf-token'

export interface SessionUser {
  sub: string
  name: string | null
  email: string | null
  picture: string | null
}

export interface SessionSnapshot {
  user: SessionUser
  expiresAt?: string
}

export class SessionRequestError extends Error {
  readonly status: number
  constructor(status: number, message: string) {
    super(message)
    this.name = 'SessionRequestError'
    this.status = status
  }
}

export function apiURL(path: string): string {
  return `${CONFIGURED_BASE}${path}`
}

/** Reads a non-HttpOnly cookie (used only for the CSRF token). */
export function readCookie(
  name: string,
  cookieString = typeof document === 'undefined' ? '' : document.cookie
): string | undefined {
  if (!cookieString) return undefined
  for (const part of cookieString.split(';')) {
    const separator = part.indexOf('=')
    if (separator === -1) continue
    if (part.slice(0, separator).trim() !== name) continue
    const raw = part.slice(separator + 1).trim()
    try {
      return decodeURIComponent(raw)
    } catch {
      return raw
    }
  }
  return undefined
}

function isSafeMethod(method: string): boolean {
  return method === 'GET' || method === 'HEAD' || method === 'OPTIONS'
}

/**
 * Performs a credentialed API request.
 *
 * Attaches the CSRF header on state-changing methods and parses the JSON error
 * contract the server returns.
 */
export async function apiRequest<T>(
  path: string,
  init: { method?: string; body?: unknown } = {}
): Promise<T> {
  const method = init.method ?? 'GET'
  const headers: Record<string, string> = { Accept: 'application/json' }

  if (init.body !== undefined) {
    headers['Content-Type'] = 'application/json'
  }
  if (!isSafeMethod(method)) {
    const csrfToken = readCookie(CSRF_COOKIE_NAME)
    if (csrfToken) headers[CSRF_HEADER_NAME] = csrfToken
  }

  const response = await fetch(apiURL(path), {
    method,
    headers,
    // Required so the session cookie is sent for cross-origin deployments.
    credentials: 'include',
    ...(init.body !== undefined && { body: JSON.stringify(init.body) })
  })

  if (response.status === 204) {
    return undefined as T
  }

  let payload: unknown = null
  try {
    payload = await response.json()
  } catch {
    payload = null
  }

  if (!response.ok) {
    const message =
      typeof payload === 'object' && payload !== null && 'error' in payload
        ? String((payload as { error: unknown }).error)
        : `Request failed (${response.status})`
    throw new SessionRequestError(response.status, message)
  }

  return payload as T
}

interface SessionResponse {
  success: boolean
  user: SessionUser
  expiresAt?: string
}

/**
 * Exchanges a provider access token for a server session.
 *
 * The server verifies the token against the identity provider; a rejected token
 * surfaces as a 401 rather than silently creating a session.
 */
export async function createServerSession(tokens: {
  accessToken?: string
  idToken?: string
}): Promise<SessionSnapshot> {
  const body: Record<string, string> = {}
  if (tokens.accessToken) body.access_token = tokens.accessToken
  if (tokens.idToken) body.id_token = tokens.idToken
  const result = await apiRequest<SessionResponse>('/api/auth/session', { method: 'POST', body })
  return { user: result.user, expiresAt: result.expiresAt }
}

/**
 * Restores the session from the cookie.
 *
 * Returns `null` when there is no live session, which is the expected result for
 * a signed-out visitor and is not an error.
 */
export async function fetchServerSession(): Promise<SessionSnapshot | null> {
  try {
    const result = await apiRequest<SessionResponse>('/api/auth/session')
    return { user: result.user, expiresAt: result.expiresAt }
  } catch (error) {
    if (error instanceof SessionRequestError && error.status === 401) return null
    throw error
  }
}

/**
 * Revokes the server session.
 *
 * The cookie is cleared and the record is marked revoked, so a copy of the old
 * cookie captured beforehand is no longer accepted.
 */
export async function destroyServerSession(): Promise<void> {
  try {
    await apiRequest<never>('/api/auth/session', { method: 'DELETE' })
  } catch (error) {
    // A missing or already-dead session is not a failure worth surfacing.
    if (!(error instanceof SessionRequestError) || (error.status !== 401 && error.status !== 404)) {
      throw error
    }
  }
}
