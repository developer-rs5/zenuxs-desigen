import ZenuxOAuth, { type UserInfo } from 'zenuxs-oauth'
import { ref } from 'vue'

const BACKEND_URL = import.meta.env.VITE_BACKEND_URL || 'http://localhost:3000'

export const oauthClient = new ZenuxOAuth({
  clientId: 'zenuxs-desigen',
  autoRefresh: true,
  debug: false
})

export const currentUser = ref<UserInfo | null>(null)
export const isAuthenticated = ref(oauthClient.isAuthenticated())

export async function initAuth(): Promise<UserInfo | null> {
  try {
    const session = await oauthClient.init()
    if (session && oauthClient.isAuthenticated()) {
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

export async function loginWithZenuxs(): Promise<UserInfo | null> {
  try {
    const res = await oauthClient.login({ mode: 'popup' })
    if (res && 'access_token' in res) {
      const info = await oauthClient.getUserInfo()
      currentUser.value = info
      isAuthenticated.value = true
      await syncUserWithBackend(info)
      return info
    }
  } catch (err) {
    console.error('[Zenuxs OAuth] Login failed:', err)
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
  } catch (err) {
    console.warn('[Zenuxs Backend] User sync failed:', err)
  }
}
