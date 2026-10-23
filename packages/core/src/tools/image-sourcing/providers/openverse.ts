/**
 * Openverse image search.
 *
 * The public API supports anonymous access (burst and daily rate limits are
 * published in the response headers), so this provider needs no credentials.
 * License metadata comes from the API and is used for filtering and
 * attribution only — approval always comes from vision.
 */

import { canonicalizeURL } from '#core/tools/image-sourcing/safety'
import type {
  ImageAsset,
  ImageAssetProvider,
  ImageAssetSearchOptions
} from '#core/tools/image-sourcing/types'

import { readNumber, readString } from './metadata'

const OPENVERSE_ENDPOINT = 'https://api.openverse.org/v1/images/'

/** Openverse asks API clients to identify themselves. */
export const OPENVERSE_USER_AGENT = 'OpenPencil/0.14 (https://github.com/open-pencil/open-pencil)'

interface OpenverseResult {
  id?: unknown
  title?: unknown
  url?: unknown
  thumbnail?: unknown
  creator?: unknown
  creator_url?: unknown
  license?: unknown
  license_version?: unknown
  license_url?: unknown
  foreign_landing_url?: unknown
  width?: unknown
  height?: unknown
  filesize?: unknown
  filetype?: unknown
  source?: unknown
  attribution?: unknown
  category?: unknown
  tags?: unknown
}

interface OpenverseResponse {
  results?: unknown
}

function readTags(value: unknown): string[] {
  if (!Array.isArray(value)) return []
  const tags: string[] = []
  for (const entry of value) {
    if (entry && typeof entry === 'object' && 'name' in entry) {
      const name = readString((entry as { name?: unknown }).name)
      if (name) tags.push(name)
    }
  }
  return tags
}

const MIME_BY_FILETYPE: Record<string, string> = {
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  png: 'image/png',
  gif: 'image/gif',
  webp: 'image/webp',
  svg: 'image/svg+xml',
  tif: 'image/tiff',
  tiff: 'image/tiff'
}

/** Openverse license codes such as `by`, `by-sa`, `cc0`, `by-nc`, `by-nd`. */
export function licenseAllowsCommercialUse(license: string | undefined): boolean {
  if (!license) return false
  return !license.toLowerCase().includes('-nc')
}

/** Derivative works are forbidden by the `nd` (no derivatives) licenses. */
export function licenseAllowsModification(license: string | undefined): boolean {
  if (!license) return false
  return !license.toLowerCase().includes('-nd')
}

function mapResult(result: OpenverseResult): ImageAsset | null {
  const url = readString(result.url)
  if (!url) return null
  const license = readString(result.license)?.toLowerCase()
  const tags = readTags(result.tags)
  const creator = readString(result.creator)
  const title = readString(result.title)
  const filetype = readString(result.filetype)?.toLowerCase()
  const attribution =
    readString(result.attribution) ?? (creator ? `${title ?? 'Untitled'} by ${creator}` : title)
  return {
    id: readString(result.id) ?? url,
    provider: 'openverse',
    url: canonicalizeURL(url),
    thumbnailUrl: readString(result.thumbnail),
    title,
    description: tags.length > 0 ? tags.join(', ') : undefined,
    mimeType: filetype ? MIME_BY_FILETYPE[filetype] : undefined,
    width: readNumber(result.width),
    height: readNumber(result.height),
    fileSize: readNumber(result.filesize),
    creator,
    sourcePage: readString(result.foreign_landing_url),
    license,
    licenseUrl: readString(result.license_url),
    attribution,
    usageRestrictions: license,
    commercialUse: licenseAllowsCommercialUse(license),
    modificationAllowed: licenseAllowsModification(license),
    requiresAttribution: license !== 'cc0' && license !== 'pdm',
    kind: 'unknown'
  }
}

export interface OpenverseProviderOptions {
  endpoint?: string
  userAgent?: string
  fetchImpl?: typeof fetch
}

/** Creates the Openverse provider. */
export function createOpenverseProvider(
  options: OpenverseProviderOptions = {}
): ImageAssetProvider {
  const endpoint = options.endpoint ?? OPENVERSE_ENDPOINT
  const userAgent = options.userAgent ?? OPENVERSE_USER_AGENT
  const fetchImpl = options.fetchImpl ?? globalThis.fetch

  return {
    name: 'openverse',
    isConfigured: () => typeof fetchImpl === 'function',
    async search(query, searchOptions: ImageAssetSearchOptions) {
      if (typeof fetchImpl !== 'function') return []
      const url = new URL(endpoint)
      url.searchParams.set('q', query)
      url.searchParams.set('page_size', String(Math.min(searchOptions.limit, 20)))
      url.searchParams.set('mature', 'false')
      if (!searchOptions.allowNonCommercial) {
        url.searchParams.set('license_type', 'commercial')
      }
      if (searchOptions.requireModification) {
        const existing = url.searchParams.get('license_type')
        url.searchParams.set('license_type', existing ? `${existing},modification` : 'modification')
      }
      if (searchOptions.orientation === 'portrait') url.searchParams.set('aspect_ratio', 'tall')
      if (searchOptions.orientation === 'landscape') url.searchParams.set('aspect_ratio', 'wide')
      if (searchOptions.orientation === 'square') url.searchParams.set('aspect_ratio', 'square')

      const response = await fetchImpl(url.toString(), {
        headers: { Accept: 'application/json', 'User-Agent': userAgent }
      })
      if (!response.ok) {
        throw new Error(`Openverse search failed with status ${response.status}`)
      }
      const payload = (await response.json()) as OpenverseResponse
      if (!Array.isArray(payload.results)) return []
      const assets: ImageAsset[] = []
      for (const entry of payload.results) {
        if (!entry || typeof entry !== 'object') continue
        const asset = mapResult(entry as OpenverseResult)
        if (asset) assets.push(asset)
      }
      return assets
    }
  }
}
