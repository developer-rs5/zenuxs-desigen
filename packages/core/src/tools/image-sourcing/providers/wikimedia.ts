/**
 * Wikimedia Commons image search.
 *
 * Uses the public MediaWiki API (`action=query&generator=search`) which needs
 * no credentials and returns the license metadata the attribution flow needs.
 */

import { canonicalizeURL } from '#core/tools/image-sourcing/safety'
import type {
  ImageAsset,
  ImageAssetProvider,
  ImageAssetSearchOptions
} from '#core/tools/image-sourcing/types'

import { readNumber, readString } from './metadata'

const COMMONS_ENDPOINT = 'https://commons.wikimedia.org/w/api.php'

export const WIKIMEDIA_USER_AGENT = 'OpenPencil/0.14 (https://github.com/open-pencil/open-pencil)'

interface CommonsImageInfo {
  url?: unknown
  thumburl?: unknown
  descriptionurl?: unknown
  mime?: unknown
  size?: unknown
  width?: unknown
  height?: unknown
  extmetadata?: Record<string, { value?: unknown } | undefined>
}

interface CommonsPage {
  pageid?: unknown
  title?: unknown
  index?: unknown
  imageinfo?: unknown
}

interface CommonsResponse {
  query?: { pages?: Record<string, CommonsPage | undefined> }
}

function readMetadata(info: CommonsImageInfo, key: string): string | undefined {
  const entry = info.extmetadata?.[key]
  const value = entry ? readString(entry.value) : undefined
  return value
}

/** Strips the HTML Commons stores inside metadata values. */
export function stripHTML(value: string): string {
  return value
    .replace(/<[^>]*>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/\s+/g, ' ')
    .trim()
}

function mapPage(page: CommonsPage): ImageAsset | null {
  const info = Array.isArray(page.imageinfo) ? (page.imageinfo[0] as CommonsImageInfo) : undefined
  if (!info) return null
  const url = readString(info.url)
  if (!url) return null
  const mime = readString(info.mime)
  const licenseCode = readMetadata(info, 'License')?.toLowerCase()
  const licenseName = readMetadata(info, 'LicenseShortName')
  const artist = readMetadata(info, 'Artist')
  const creator = artist ? stripHTML(artist) : undefined
  const attributionRequired = readMetadata(info, 'AttributionRequired') === 'true'
  const usageTerms = readMetadata(info, 'UsageTerms')
  const restrictions = readMetadata(info, 'Restrictions')
  const title = readString(page.title)
    ?.replace(/^File:/, '')
    .replace(/\.[A-Za-z0-9]+$/, '')
  const kind = mime === 'image/svg+xml' ? 'svg' : 'raster'

  return {
    id: readString(page.pageid) ?? url,
    provider: 'wikimedia',
    url: canonicalizeURL(url),
    thumbnailUrl: readString(info.thumburl),
    title,
    description: readMetadata(info, 'ImageDescription')
      ? stripHTML(readMetadata(info, 'ImageDescription') as string)
      : undefined,
    mimeType: mime,
    width: readNumber(info.width),
    height: readNumber(info.height),
    fileSize: readNumber(info.size),
    creator,
    sourcePage: readString(info.descriptionurl),
    license: licenseCode ?? licenseName,
    licenseUrl: readMetadata(info, 'LicenseUrl'),
    attribution: creator ? `${title ?? 'Untitled'} — ${creator}` : title,
    usageRestrictions: restrictions ? stripHTML(restrictions) : usageTerms,
    commercialUse: licenseCode ? !licenseCode.includes('-nc') : true,
    modificationAllowed: licenseCode ? !licenseCode.includes('-nd') : true,
    requiresAttribution: attributionRequired,
    kind
  }
}

export interface WikimediaProviderOptions {
  endpoint?: string
  userAgent?: string
  fetchImpl?: typeof fetch
  /** Prefer vector results when the slot can take them. */
  preferSvg?: boolean
}

/** Creates the Wikimedia Commons provider. */
export function createWikimediaProvider(
  options: WikimediaProviderOptions = {}
): ImageAssetProvider {
  const endpoint = options.endpoint ?? COMMONS_ENDPOINT
  const userAgent = options.userAgent ?? WIKIMEDIA_USER_AGENT
  const fetchImpl = options.fetchImpl ?? globalThis.fetch

  return {
    name: 'wikimedia',
    isConfigured: () => typeof fetchImpl === 'function',
    async search(query, searchOptions: ImageAssetSearchOptions) {
      if (typeof fetchImpl !== 'function') return []
      const url = new URL(endpoint)
      const fileType = options.preferSvg ? 'drawing' : 'bitmap'
      url.searchParams.set('action', 'query')
      url.searchParams.set('generator', 'search')
      url.searchParams.set('gsrsearch', `${query} filetype:${fileType}`)
      url.searchParams.set('gsrnamespace', '6')
      url.searchParams.set('gsrlimit', String(Math.min(searchOptions.limit, 20)))
      url.searchParams.set('prop', 'imageinfo')
      url.searchParams.set('iiprop', 'url|mime|size|extmetadata')
      url.searchParams.set('iiurlwidth', '960')
      url.searchParams.set('format', 'json')
      url.searchParams.set('origin', '*')

      const response = await fetchImpl(url.toString(), {
        headers: { Accept: 'application/json', 'User-Agent': userAgent }
      })
      if (!response.ok) {
        throw new Error(`Wikimedia search failed with status ${response.status}`)
      }
      const payload = (await response.json()) as CommonsResponse
      const pages = payload.query?.pages
      if (!pages) return []
      // MediaWiki returns pages in an arbitrary object order; the `index`
      // field carries the search rank, so restore it before ranking.
      const ranked = Object.values(pages)
        .map((page, position) => ({
          page,
          index: typeof page?.index === 'number' ? page.index : position
        }))
        .sort((left, right) => left.index - right.index)
      const ordered: ImageAsset[] = []
      for (const entry of ranked) {
        if (!entry.page) continue
        const asset = mapPage(entry.page)
        if (asset) ordered.push(asset)
      }
      return ordered
    }
  }
}
