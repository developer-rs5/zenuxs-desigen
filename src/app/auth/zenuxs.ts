/**
 * Authentication state for the application.
 *
 * The **server-managed session cookie is the source of truth** for whether the
 * user is signed in. The OAuth access token held by the browser is only used to
 * *establish* that session (and to silently re-establish it if it lapses); it is
 * never accepted as proof of identity on its own.
 *
 * This ordering is what makes the session survive a page refresh, a new tab, and
 * a browser restart: the cookie is `HttpOnly`, `SameSite=Lax`, and persistent,
 * while the OAuth token lives in `sessionStorage` and is intentionally short
 * lived in JavaScript-readable storage.
 */

import { ref } from 'vue'
import ZenuxOAuth, { type TokenResponse, type UserInfo } from 'zenuxs-oauth'

import {
  createGuestSession,
  createServerSession,
  destroyServerSession,
  fetchServerSession,
  SessionRequestError,
  type SessionUser
} from '@/app/auth/api'
import { IS_BROWSER } from '@/constants'

const CLIENT_ID = import.meta.env.VITE_ZENUXS_OAUTH_CLIENT_ID || 'd5695548c45c3ae5'

export const oauthClient = new ZenuxOAuth({
  clientId: CLIENT_ID,
  autoRefresh: true,
  debug: false
})

interface OAuthLibraryError {
  code?: string
  details?: { status?: number }
}

// The library's auto-refresh retries every 30s. A refresh token the provider
// has rejected (HTTP 400) will never succeed, so drop the local tokens instead
// of hammering the token endpoint; the session cookie keeps the user signed in
// and the next sign-in stores fresh tokens.
oauthClient.on('error', (error: unknown) => {
  const failure = error as OAuthLibraryError
  if (failure?.code !== 'TOKEN_REFRESH_FAILED' || failure.details?.status !== 400) return
  console.warn('[Auth] Refresh token rejected; clearing local OAuth tokens.')
  try {
    oauthClient.logout({ revoke: false })
  } catch (logoutError) {
    console.warn('[Auth] Local token clear failed:', logoutError)
  }
})

export const currentUser = ref<UserInfo | null>(null)
export const isAuthenticated = ref(false)
/** True once initAuth() has settled. Prevents premature redirects. */
export const authReady = ref(false)

/** How long to wait for the identity provider before giving up on a restore. */
const RESTORE_TIMEOUT_MS = 2500

/**
 * Converts the server's verified session user into the app's user shape.
 *
 * Identity always originates from the server's verified response, never from a
 * client-side provider call, so a spoofed browser response cannot influence who
 * the app believes the user is.
 */
function toUserInfo(user: SessionUser): UserInfo {
  const info: UserInfo = { sub: user.sub }
  if (user.name) info.name = user.name
  if (user.email) info.email = user.email
  if (user.picture) info.picture = user.picture
  return info
}

function setAuthenticated(user: UserInfo | null): void {
  currentUser.value = user
  isAuthenticated.value = user !== null && user.sub.length > 0
}

interface ServerTokenInput {
  accessToken?: string
  idToken?: string
}

/** Projects the provider token response onto the server session payload. */
function toServerTokenInput(tokens: TokenResponse): ServerTokenInput {
  const input: ServerTokenInput = {}
  if (tokens.access_token) input.accessToken = tokens.access_token
  if (tokens.id_token) input.idToken = tokens.id_token
  return input
}

/** Current token pair, if the browser still holds a usable one. */
function currentTokens(): ServerTokenInput {
  const tokens = oauthClient.getTokens()
  if (!tokens) return {}
  return toServerTokenInput(tokens)
}

/**
 * Establishes (or refreshes) the server session from an OAuth token.
 *
 * The server independently verifies the token; a failure here means the session
 * was not created and the user stays signed out.
 */
async function establishServerSession(tokens: ServerTokenInput): Promise<SessionUser | null> {
  if (!tokens.accessToken && !tokens.idToken) return null
  try {
    const snapshot = await createServerSession(tokens)
    return snapshot.user
  } catch (error) {
    if (error instanceof SessionRequestError && (error.status === 401 || error.status === 403)) {
      console.warn('[Auth] Identity provider rejected the session token.')
      return null
    }
    console.warn('[Auth] Could not establish server session:', error)
    return null
  }
}

/** Pulls the signed-in user's synced settings now that the session exists. */
async function syncRemoteSettings(sub: string): Promise<void> {
  try {
    const { fetchRemoteSettings } = await import('@/app/settings/remote-sync')
    await fetchRemoteSettings()
    void sub
  } catch (error) {
    console.warn('[Auth] Remote settings sync failed:', error)
  }
}

/** Detects an OAuth redirect landing back in the app. */
function hasOAuthCallbackParams(): boolean {
  if (!IS_BROWSER) return false
  const search = window.location.search
  return search.includes('code=') || search.includes('access_token=')
}

/**
 * Initialises authentication.
 *
 * Safe to call more than once: concurrent callers share the in-flight
 * initialisation, and later calls after it settles return the cached result.
 * Without this, a second call could re-handle an OAuth callback that the first
 * call had already consumed and cleaned out of the URL.
 *
 * Order of attempts:
 *  1. Complete an in-flight OAuth redirect callback and establish a session.
 *  2. Reuse an existing OAuth token to establish a session.
 *  3. Restore an existing server session from the cookie.
 *
 * Step 3 is what keeps a user signed in across refreshes, new tabs, and browser
 * restarts even when the OAuth token is gone.
 */
export function initAuth(): Promise<UserInfo | null> {
  authInit ??= runInitAuth()
  return authInit
}

/** Memoised in-flight/cached result of {@link initAuth}. */
let authInit: Promise<UserInfo | null> | null = null

async function runInitAuth(): Promise<UserInfo | null> {
  try {
    if (hasOAuthCallbackParams()) {
      await completeOAuthCallback()
      if (isAuthenticated.value) return currentUser.value
    }

    const fromToken = await establishServerSession(currentTokens())
    if (fromToken) {
      setAuthenticated(toUserInfo(fromToken))
      await syncRemoteSettings(fromToken.sub)
      return currentUser.value
    }

    // The OAuth token may simply have expired while the server session is still
    // valid; try a silent refresh before falling back to the cookie.
    if (oauthClient.isAuthenticated()) {
      try {
        await oauthClient.refreshTokens()
        const refreshed = await establishServerSession(currentTokens())
        if (refreshed) {
          setAuthenticated(toUserInfo(refreshed))
          await syncRemoteSettings(refreshed.sub)
          return currentUser.value
        }
      } catch (error) {
        console.warn('[Auth] Token refresh failed:', error)
      }
    }

    const restored = await restoreServerSession()
    if (restored) {
      setAuthenticated(toUserInfo(restored))
      return currentUser.value
    }

    // Auto-provision a guest session so all local work is backed by MongoDB
    try {
      const guest = await createGuestSession()
      if (guest?.user) {
        setAuthenticated(toUserInfo(guest.user))
        return currentUser.value
      }
    } catch {
      // Backend may be starting or offline
    }

    clearLocalAuthState()
  } catch (error) {
    console.warn('[Auth] Initialisation failed:', error)
    clearLocalAuthState()
  } finally {
    authReady.value = true
  }
  return null
}

/** Completes an OAuth redirect and establishes the server session. */
async function completeOAuthCallback(): Promise<void> {
  let tokens: TokenResponse | null = null
  try {
    tokens = await oauthClient.handleCallback()
  } catch (error) {
    console.warn('[Auth] OAuth callback handling failed:', error)
  }

  const established = await establishServerSession(
    tokens === null ? {} : toServerTokenInput(tokens)
  )
  if (established) {
    setAuthenticated(toUserInfo(established))
    await syncRemoteSettings(established.sub)
  }
}

/** Restores the session from the cookie, bounded by a timeout. */
async function restoreServerSession(): Promise<SessionUser | null> {
  const restore = fetchServerSession()
  let timer: ReturnType<typeof setTimeout> | undefined
  const timeout = new Promise<null>((resolve) => {
    timer = setTimeout(() => resolve(null), RESTORE_TIMEOUT_MS)
  })
  try {
    const snapshot = await Promise.race([restore, timeout])
    return snapshot?.user ?? null
  } catch (error) {
    console.warn('[Auth] Session restore failed:', error)
    return null
  } finally {
    if (timer) clearTimeout(timer)
  }
}

function clearLocalAuthState(): void {
  try {
    oauthClient.logout({ revoke: false })
  } catch (error) {
    console.warn('[Auth] Local token clear failed:', error)
  }
  setAuthenticated(null)
}

/** Mounts the hosted Zenuxs sign-in UI and establishes a session on success. */
export async function loginWithZenuxsTag(
  onSuccess?: (info: UserInfo) => void,
  onError?: (err: unknown) => void
): Promise<void> {
  const tag = document.createElement('zenuxs-auth')
  tag.setAttribute('client-id', CLIENT_ID)
  // The callback returns to this exact URL, which lets us restore the intended
  // destination after the redirect completes.
  tag.setAttribute('redirect-uri', window.location.href)
  tag.setAttribute('theme', 'auto')
  tag.setAttribute('height', '540px')
  tag.setAttribute('width', '100%')
  tag.setAttribute('auto-redirect', 'true')

  const onSuccessEvent = (event: Event) => {
    cleanup()
    void finishLogin((event as CustomEvent).detail, onSuccess, onError)
  }
  const onErrorEvent = (event: Event) => {
    cleanup()
    onError?.((event as CustomEvent).detail)
  }
  function cleanup(): void {
    tag.removeEventListener('auth-success', onSuccessEvent)
    tag.removeEventListener('error', onErrorEvent)
    tag.remove()
  }
  tag.addEventListener('auth-success', onSuccessEvent)
  tag.addEventListener('error', onErrorEvent)
  document.body.appendChild(tag)
}

async function finishLogin(
  detail: unknown,
  onSuccess?: (info: UserInfo) => void,
  onError?: (err: unknown) => void
): Promise<void> {
  if (!detail || typeof detail !== 'object' || !('access_token' in detail)) {
    onError?.(new Error('Zenuxs auth tag did not return tokens'))
    return
  }
  const tokens = detail as TokenResponse
  const established = await establishServerSession(toServerTokenInput(tokens))
  if (!established) {
    onError?.(new Error('Sign in could not be verified'))
    return
  }
  const info = toUserInfo(established)
  setAuthenticated(info)
  await syncRemoteSettings(info.sub)
  onSuccess?.(info)
}

/**
 * Starts an interactive sign-in.
 *
 * Establishes the server session before resolving, so callers can rely on the
 * user being authenticated once this returns.
 */
export async function loginWithZenuxs(
  loginMode: 'popup' | 'redirect' | 'ui' = 'ui'
): Promise<UserInfo | null> {
  try {
    const result = await oauthClient.login({ mode: loginMode })
    if (result && typeof result === 'object' && 'access_token' in result) {
      const established = await establishServerSession(currentTokens())
      if (!established) {
        clearLocalAuthState()
        return null
      }
      const info = toUserInfo(established)
      setAuthenticated(info)
      await syncRemoteSettings(info.sub)
      return info
    }
  } catch (error) {
    console.error(`[Auth] ${loginMode} login failed, attempting redirect:`, error)
    if (loginMode !== 'redirect') {
      await oauthClient.login({ mode: 'redirect' })
    }
  }
  return null
}

/**
 * Signs the user out.
 *
 * The server session is revoked first so the old cookie stops working even if the
 * browser is closed, restored from cache, or navigated back to. Locally cached
 * non-secret settings are intentionally left alone; access to server-side data is
 * gated purely by the revoked session.
 */
export async function logoutZenuxs(): Promise<void> {
  try {
    await destroyServerSession()
  } catch (error) {
    console.warn('[Auth] Server session revocation failed:', error)
  }
  try {
    await oauthClient.logout()
  } catch (error) {
    console.warn('[Auth] Provider logout failed:', error)
  } finally {
    // Allow a later `initAuth()` to run again from scratch.
    authInit = null
    setAuthenticated(null)
  }
}
