import { currentUser } from '@/app/auth/zenuxs'
import { aiModelSettings } from '@/app/ai/models/store'
import { appCredentialServices } from '@/app/settings/credentials/app'
import { credentialRef } from '@/app/settings/credentials/reference'

const BACKEND_URL = import.meta.env.VITE_BACKEND_URL || 'http://localhost:3000'

export async function fetchRemoteSettings(): Promise<void> {
  const sub = currentUser.value?.sub
  if (!sub) return

  try {
    const res = await fetch(`${BACKEND_URL}/api/settings?ownerSub=${encodeURIComponent(sub)}`)
    if (!res.ok) return
    const data = await res.json()
    const settings = data.settings
    if (!settings) return

    // Apply remote AI Model settings to reactive store & local cache
    if (settings.aiModelSettings && typeof settings.aiModelSettings === 'object') {
      aiModelSettings.value = { ...aiModelSettings.value, ...settings.aiModelSettings }
    }

    // Apply remote API credentials to store & local cache
    if (settings.credentials && typeof settings.credentials === 'object') {
      for (const [key, value] of Object.entries(settings.credentials)) {
        if (typeof value === 'string' && value.trim()) {
          const parts = key.split(':')
          if (parts.length === 2) {
            const ref = credentialRef(parts[0], parts[1])
            await appCredentialServices.manager.set(ref, value)
          }
        }
      }
    }
  } catch (err) {
    console.warn('[Remote Settings Sync] Fetch error (using local cache):', err)
  }
}

export async function pushRemoteSettings(credentials?: Record<string, string>): Promise<void> {
  const sub = currentUser.value?.sub
  if (!sub) return

  try {
    await fetch(`${BACKEND_URL}/api/settings`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-user-sub': sub
      },
      body: JSON.stringify({
        ownerSub: sub,
        aiModelSettings: aiModelSettings.value,
        ...(credentials && { credentials })
      })
    })
  } catch (err) {
    console.warn('[Remote Settings Sync] Push error:', err)
  }
}
