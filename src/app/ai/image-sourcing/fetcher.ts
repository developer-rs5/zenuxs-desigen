/**
 * Asset downloads for the sourcing pipeline.
 *
 * The desktop app routes the request through the native HTTP proxy so the
 * same limits apply there; the browser uses the regular fetch. Every URL is
 * validated before the request and every response is bounded.
 */

import { IS_TAURI } from '@open-pencil/core/constants'
import {
  createAssetFetcher,
  DEFAULT_ASSET_TIMEOUT_MS,
  DEFAULT_MAX_ASSET_BYTES,
  type AssetFetcher
} from '@open-pencil/core/tools'

import { tauriFetch } from '@/app/tauri/http'

/**
 * Creates the fetcher used to download candidate images.
 *
 * `User-Agent` is only set where it is allowed: browsers refuse to let a page
 * override it, and the providers that require one are reached from the
 * desktop app.
 */
export function createAppAssetFetcher(): AssetFetcher {
  const fetchImpl = IS_TAURI
    ? (input: string, init?: RequestInit): Promise<Response> =>
        tauriFetch(input, init, DEFAULT_MAX_ASSET_BYTES, DEFAULT_ASSET_TIMEOUT_MS)
    : (input: string, init?: RequestInit): Promise<Response> => fetch(input, init)
  return createAssetFetcher(fetchImpl)
}
