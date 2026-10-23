/**
 * Pexels adapter for the sourcing pipeline.
 *
 * The Pexels implementation itself is unchanged and still owned by
 * `stock-photo`; this adapter only maps its results onto the normalized asset
 * shape and adds the Pexels license facts. A missing credential simply makes
 * the provider ineligible — it never fails the run.
 */

import { canonicalizeURL } from '#core/tools/image-sourcing/safety'
import type {
  ImageAsset,
  ImageAssetProvider,
  ImageAssetSearchOptions
} from '#core/tools/image-sourcing/types'
import { hasPexelsAPIKey, pexelsProvider } from '#core/tools/stock-photo/providers'

/** The Pexels license permits commercial use and modification without attribution. */
export const PEXELS_LICENSE = 'Pexels License'

function mapResult(result: {
  url: string
  width: number
  height: number
  photographer: string
  sourceId: string
}): ImageAsset {
  return {
    id: result.sourceId,
    provider: 'pexels',
    url: canonicalizeURL(result.url),
    title: `Pexels photo ${result.sourceId}`,
    mimeType: 'image/jpeg',
    width: result.width,
    height: result.height,
    creator: result.photographer,
    sourcePage: `https://www.pexels.com/photo/${result.sourceId}/`,
    license: PEXELS_LICENSE,
    attribution: result.photographer ? `Photo by ${result.photographer} on Pexels` : undefined,
    usageRestrictions: 'Free to use, no attribution required',
    commercialUse: true,
    modificationAllowed: true,
    requiresAttribution: false,
    kind: 'raster'
  }
}

/** Creates the Pexels provider. */
export function createPexelsAssetProvider(): ImageAssetProvider {
  return {
    name: 'pexels',
    isConfigured: () => hasPexelsAPIKey(),
    async search(query, options: ImageAssetSearchOptions) {
      if (!hasPexelsAPIKey()) return []
      const results = await pexelsProvider.search(query, {
        perPage: Math.min(options.limit, 15),
        orientation: options.orientation ?? 'landscape',
        targetDim: 1200
      })
      return results.map(mapResult)
    }
  }
}
