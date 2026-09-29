/**
 * Bidirectional sync of per-user settings with the backend.
 *
 * The backend derives ownership from the session cookie, so no subject is sent
 * from the browser. The previous version passed `ownerSub` as a query parameter
 * and an `x-user-sub` header, which let any caller read or overwrite another
 * user's stored settings.
 */

import { aiModelSettings } from '@/app/ai/models/store'
import { apiRequest, SessionRequestError } from '@/app/auth/api'
import { appCredentialServices } from '@/app/settings/credentials/app'
import { credentialRef, parseCredentialKey } from '@/app/settings/credentials/reference'

type SyncResult = 'ok' | 'skipped' | 'failed'

interface RemoteSettings {
  aiModelSettings?: Record<string, unknown>
  credentials?: Record<string, string>
}

function syncFailed(): SyncResult {
  return 'failed'
}

/**
 * Applies credentials restored from the server.
 *
 * Keys are validated as credential references so a malformed or hostile key
 * cannot be turned into an arbitrary credential slot.
 */
async function applyRemoteCredentials(credentials: Record<string, string>): Promise<void> {
  for (const [key, value] of Object.entries(credentials)) {
    if (typeof value !== 'string' || value.trim().length === 0) continue
    if (key === '__proto__' || key === 'constructor' || key === 'prototype') continue

    const parsed = parseCredentialKey(key)
    const ref = parsed ? credentialRef(parsed.integrationId, parsed.field, parsed.profileId) : null
    if (!ref) continue
    await appCredentialServices.manager.set(ref, value)
  }
}

/** Pulls the signed-in user's settings. Requires a live server session. */
export async function fetchRemoteSettings(_sub?: string): Promise<SyncResult> {
  try {
    const result = await apiRequest<{ settings: RemoteSettings | null }>('/api/settings')
    const settings = result.settings
    if (!settings) return 'ok'

    if (settings.aiModelSettings && typeof settings.aiModelSettings === 'object') {
      aiModelSettings.value = { ...aiModelSettings.value, ...settings.aiModelSettings }
    }
    if (settings.credentials && typeof settings.credentials === 'object') {
      await applyRemoteCredentials(settings.credentials)
    }
    return 'ok'
  } catch (error) {
    // 401 simply means the session ended; the local cache stays authoritative.
    if (error instanceof SessionRequestError && error.status === 401) return 'skipped'
    console.warn('[Remote Settings Sync] Fetch error (using local cache):', error)
    return syncFailed()
  }
}

/** Pushes the signed-in user's settings. Requires a live server session. */
export async function pushRemoteSettings(
  _sub?: string,
  credentials?: Record<string, string>
): Promise<SyncResult> {
  try {
    await apiRequest('/api/settings', {
      method: 'POST',
      body: {
        aiModelSettings: aiModelSettings.value,
        ...(credentials && { credentials })
      }
    })
    return 'ok'
  } catch (error) {
    if (error instanceof SessionRequestError && error.status === 401) return 'skipped'
    console.warn('[Remote Settings Sync] Push error:', error)
    return syncFailed()
  }
}
