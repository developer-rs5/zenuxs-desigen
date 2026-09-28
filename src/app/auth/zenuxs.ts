import ZenuxOAuth, { type UserInfo } from 'zenuxs-oauth'
import { ref } from 'vue'
import { IS_BROWSER } from '@/constants'
import { fetchRemoteSettings } from '@/app/settings/remote-sync'

const BACKEND_URL = import.meta.env.VITE_BACKEND_URL || 'http://localhost:3000'
const CLIENT_ID = import.meta.env.VITE_ZENUXS_OAUTH_CLIENT_ID || 'd5695548c45c3ae5'

export const oauthClient = new ZenuxOAuth({
  clientId: CLIENT_ID,
  autoRefresh: true,
  debug: false
})

export const currentUser = ref<UserInfo | null>(null)
export const isAuthenticated = ref(oauthClient.isAuthenticated())
/** True once initAuth() has completed at least once. Prevents premature redirects. */
export const authReady = ref(false)

/** Use getAuthenticatedFetch() to bypass getUserInfo()'s internal font-fetch
 *  which fails against api.auth.zenuxs.in and blocks the entire auth flow. */
async function fetchUserInfo(): Promise<UserInfo> {
  const authFetch = oauthClient.getAuthenticatedFetch()
  const res = await authFetch('https://api.auth.zenuxs.in/oauth/userinfo')
  if (!res.ok) throw new Error(`UserInfo request failed: ${res.status}`)
  return res.json()
}

export async function initAuth(): Promise<UserInfo | null> {
  const hadCallback =
    IS_BROWSER &&
    (window.location.search.includes('code=') || window.location.search.includes('access_token='))
  try {
    if (hadCallback) {
      isAuthenticated.value = true
      await oauthClient.handleCallback()
      if (oauthClient.isAuthenticated()) {
        try {
          const info = await fetchUserInfo()
          currentUser.value = info
          await syncUserWithBackend(info)
        } catch (err) {
          console.warn('[Zenuxs OAuth] Token valid but user info unavailable:', err)
        }
        authReady.value = true
        return currentUser.value
      }
    }

    const initPromise = oauthClient.init()
    const timeoutPromise = new Promise<null>((resolve) => {
      setTimeout(() => resolve(null), 2500)
    })
    await Promise.race([initPromise, timeoutPromise])
    if (oauthClient.isAuthenticated()) {
      isAuthenticated.value = true
      try {
        const info = await fetchUserInfo()
        currentUser.value = info
        await syncUserWithBackend(info)
      } catch (err) {
        console.warn('[Zenuxs OAuth] Token valid but user info unavailable:', err)
      }
      return currentUser.value
    }

    try {
      await oauthClient.refreshTokens()
      if (oauthClient.isAuthenticated()) {
        isAuthenticated.value = true
        try {
          const info = await fetchUserInfo()
          currentUser.value = info
          await syncUserWithBackend(info)
        } catch (err) {
          console.warn('[Zenuxs OAuth] Refreshed token but user info unavailable:', err)
        }
        return currentUser.value
      }
    } catch (refreshErr) {
      console.warn('[Zenuxs OAuth] Token refresh failed, clearing session:', refreshErr)
    }
    oauthClient.logout({ revoke: false })
    isAuthenticated.value = false
    currentUser.value = null
  } catch (err) {
    console.warn('[Zenuxs OAuth] Init check skipped/failed:', err)
  } finally {
    authReady.value = true
  }
  return null
}

export async function loginWithZenuxsTag(onSuccess?: (info: UserInfo) => void, onError?: (err: unknown) => void): Promise<void> {
  /* Mount the <zenuxs-auth> web component (auth tag) provided by zenuxs-oauth
     so the hosted Zenuxs sign-in UI renders inline, then resolve tokens via
     the tag's auth-success event. Falls back to auto-redirect on error. */
  const tag = document.createElement('zenuxs-auth')
  tag.setAttribute('client-id', CLIENT_ID)
  tag.setAttribute('redirect-uri', window.location.href)
  tag.setAttribute('theme', 'auto')
  tag.setAttribute('height', '540px')
  tag.setAttribute('width', '100%')
  tag.setAttribute('auto-redirect', 'true')

  const onSuccessEvent = (e: Event) => {
    const detail = (e as CustomEvent).detail
    cleanup()
    void finishLogin(detail, onSuccess, onError)
  }
  const onErrorEvent = (e: Event) => {
    cleanup()
    onError?.((e as CustomEvent).detail)
  }
  function cleanup() {
    tag.removeEventListener('auth-success', onSuccessEvent)
    tag.removeEventListener('error', onErrorEvent)
    tag.remove()
  }
  tag.addEventListener('auth-success', onSuccessEvent)
  tag.addEventListener('error', onErrorEvent)
  document.body.appendChild(tag)
}

async function finishLogin(detail: unknown, onSuccess?: (info: UserInfo) => void, onError?: (err: unknown) => void): Promise<void> {
  if (!detail || typeof detail !== 'object' || !('access_token' in detail)) {
    onError?.(new Error('Zenuxs auth tag did not return tokens'))
    return
  }
  isAuthenticated.value = true
  try {
    const info = await fetchUserInfo()
    currentUser.value = info
    await syncUserWithBackend(info)
    onSuccess?.(info)
  } catch (err) {
    console.warn('[Zenuxs OAuth] Token valid but user info unavailable:', err)
    onSuccess?.({} as UserInfo)
  }
}

export async function loginWithZenuxs(loginMode: 'popup' | 'redirect' | 'ui' = 'ui'): Promise<UserInfo | null> {
  try {
    const res = await oauthClient.login({ mode: loginMode })
    if (res && typeof res === 'object' && 'access_token' in res) {
      isAuthenticated.value = true
      try {
        const info = await fetchUserInfo()
        currentUser.value = info
        await syncUserWithBackend(info)
        return info
      } catch (err) {
        console.warn('[Zenuxs OAuth] Token valid but user info unavailable:', err)
        return null
      }
    }
  } catch (err) {
    console.error('[Zenuxs OAuth] Popup/UI login failed, attempting redirect:', err)
    if (loginMode !== 'redirect') {
      await oauthClient.login({ mode: 'redirect' })
    }
  }
  return null
}

export async function logoutZenuxs(): Promise<void> {
  try {
    await oauthClient.logout()
  } finally {
    currentUser.value = null
    isAuthenticated.value = false
  }
}

async function syncUserWithBackend(info: UserInfo): Promise<void> {
  if (!info || !info.sub) return
  try {
    await fetch(`${BACKEND_URL}/api/auth/verify`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(info)
    })
    await fetchRemoteSettings(info.sub)
  } catch (err) {
    console.warn('[Zenuxs Backend] User sync failed:', err)
  }
}
