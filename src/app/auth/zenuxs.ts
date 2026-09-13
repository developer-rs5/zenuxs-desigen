import ZenuxOAuth, { type UserInfo } from 'zenuxs-oauth'
import { ref } from 'vue'
import { fetchRemoteSettings } from '@/app/settings/remote-sync'

const BACKEND_URL = import.meta.env.VITE_BACKEND_URL || 'http://localhost:3000'

export const oauthClient = new ZenuxOAuth({
  clientId: import.meta.env.VITE_ZENUXS_OAUTH_CLIENT_ID || 'd5695548c45c3ae5',
  autoRefresh: true,
  debug: false
})

export const currentUser = ref<UserInfo | null>(null)
export const isAuthenticated = ref(oauthClient.isAuthenticated())

export async function initAuth(): Promise<UserInfo | null> {
  try {
    if (typeof window !== 'undefined' && (window.location.search.includes('code=') || window.location.search.includes('access_token='))) {
      await oauthClient.handleCallback()
    }
    const initPromise = oauthClient.init()
    const timeoutPromise = new Promise<null>((resolve) => setTimeout(() => resolve(null), 2500))
    const session = await Promise.race([initPromise, timeoutPromise])
    if (oauthClient.isAuthenticated()) {
      const info = await oauthClient.getUserInfo()
      currentUser.value = info
      isAuthenticated.value = true
      await syncUserWithBackend(info)
      return info
    }
  } catch (err) {
    console.warn('[Zenuxs OAuth] Init check skipped/failed:', err)
  }
  return null
}

export async function loginWithZenuxs(loginMode: 'popup' | 'redirect' | 'ui' = 'ui'): Promise<UserInfo | null> {
  try {
    const res = await oauthClient.login({ mode: loginMode })
    if (res && typeof res === 'object' && 'access_token' in res) {
      const info = await oauthClient.getUserInfo()
      currentUser.value = info
      isAuthenticated.value = true
      await syncUserWithBackend(info)
      return info
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
    await fetchRemoteSettings()
  } catch (err) {
    console.warn('[Zenuxs Backend] User sync failed:', err)
  }
}
