/**
 * Candidate ranking for image search.
 *
 * Ranking only decides which pixels the vision model looks at first. Metadata
 * never approves an asset: that stays with the verifier.
 */

import type { ProviderSearchOutcome } from './providers/registry'
import { tokenize } from './query'
import { canonicalizeURL } from './safety'
import type { ImageAsset, VisualIntent } from './types'
import type { LicensePolicy } from './verifier'

export interface RankedCandidate {
  asset: ImageAsset
  score: number
}

/** Removes duplicate candidates coming from different providers. */
export function dedupeAssets(assets: ImageAsset[]): ImageAsset[] {
  const seen = new Set<string>()
  const unique: ImageAsset[] = []
  for (const asset of assets) {
    const key = `${asset.provider}:${asset.id}`
    const canonical = canonicalizeURL(asset.url)
    const urlKey = `url:${canonical}`
    if (seen.has(key) || seen.has(urlKey)) continue
    seen.add(key)
    seen.add(urlKey)
    unique.push(asset)
  }
  return unique
}

/** Whether an asset passes the metadata filters. */
export function passesMetadataFilters(
  asset: ImageAsset,
  intent: VisualIntent,
  policy: LicensePolicy
): boolean {
  if (!policy.allowNonCommercial && !asset.commercialUse) return false
  if (policy.requireModification && !asset.modificationAllowed) return false
  if (asset.mimeType && !asset.mimeType.startsWith('image/')) return false
  if (asset.kind !== 'svg' && asset.width !== undefined && asset.height !== undefined) {
    if (asset.width < 120 || asset.height < 120) return false
  }
  if (intent.aspectRatio && asset.width && asset.height) {
    const ratio = asset.width / asset.height
    const deviation = Math.abs(ratio - intent.aspectRatio) / intent.aspectRatio
    if (deviation > 0.75) return false
  }
  return true
}

/** Score for the metadata that describes the asset. */
function scoreTextMatch(asset: ImageAsset, query: string): number {
  const tokens = tokenize(query)
  const haystack = `${asset.title ?? ''} ${asset.description ?? ''}`.toLowerCase()
  let score = 0
  for (const token of tokens) {
    if (haystack.includes(token)) score += 2
  }
  return score
}

/** Score for the orientation of the asset. */
function scoreOrientation(asset: ImageAsset, intent: VisualIntent): number {
  const ratio = asset.width && asset.height ? asset.width / asset.height : undefined
  if (!intent.orientation || ratio === undefined) return 0
  if (intent.orientation === 'landscape' && ratio > 1.15) return 3
  if (intent.orientation === 'portrait' && ratio < 0.87) return 3
  if (intent.orientation === 'square' && ratio > 0.87 && ratio < 1.15) return 3
  return -2
}

/** Score for the requested aspect ratio. */
function scoreAspectRatio(asset: ImageAsset, intent: VisualIntent): number {
  const ratio = asset.width && asset.height ? asset.width / asset.height : undefined
  if (!intent.aspectRatio || ratio === undefined) return 0
  const deviation = Math.abs(ratio - intent.aspectRatio) / intent.aspectRatio
  if (deviation < 0.2) return 3
  if (deviation < 0.4) return 1
  return -2
}

/** Ranks a candidate using metadata only. Metadata never approves an asset. */
export function scoreAsset(asset: ImageAsset, intent: VisualIntent, query: string): number {
  let score = scoreTextMatch(asset, query)
  score += scoreOrientation(asset, intent)
  score += scoreAspectRatio(asset, intent)
  if (asset.commercialUse) score += 1
  if (!asset.requiresAttribution) score += 1
  if (asset.width && asset.height && Math.max(asset.width, asset.height) >= 800) score += 1
  // Bundled assets are a safety net, so they rank behind real search results.
  if (asset.provider === 'local') score -= 2
  return score
}

/** Merges one round of provider results into the candidates to inspect. */
export function collectRoundCandidates(
  outcomes: ProviderSearchOutcome[],
  intent: VisualIntent,
  policy: LicensePolicy,
  query: string,
  inspected: Set<string>,
  remaining: number
): RankedCandidate[] {
  const collected: ImageAsset[] = []
  for (const outcome of outcomes) {
    if (outcome.error) continue
    collected.push(...outcome.assets)
  }
  return dedupeAssets(collected)
    .filter((asset) => passesMetadataFilters(asset, intent, policy))
    .filter((asset) => !inspected.has(`${asset.provider}:${asset.id}`))
    .map((asset) => ({ asset, score: scoreAsset(asset, intent, query) }))
    .sort((left, right) => right.score - left.score)
    .slice(0, Math.max(0, remaining))
}
