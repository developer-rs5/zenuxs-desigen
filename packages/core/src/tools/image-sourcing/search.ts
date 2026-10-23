/**
 * Search pipeline: query providers, merge and rank the candidates, then let
 * the vision verifier approve one of them.
 *
 * The pipeline is bounded on purpose: candidates, refinements, vision calls and
 * wall-clock time all have a budget, and exhausting the budget ends the
 * search so the caller can fall back to generation.
 */

import {
  DEFAULT_PROVIDER_GRACE_MS,
  getEligibleImageAssetProviders,
  searchImageAssetProviders
} from './providers/registry'
import { broadenQuery, refineQuery } from './query'
import { collectRoundCandidates, type RankedCandidate } from './ranking'
import type {
  AssetProvenance,
  ImageAsset,
  ImageAssetProvider,
  VerificationRecord,
  VisualIntent
} from './types'
import { DEFAULT_SEARCH_BUDGET, VISION_BATCH_SIZE } from './types'
import type { ImageVisionVerifier, LicensePolicy, VerificationOutcome } from './verifier'
import { DEFAULT_LICENSE_POLICY, readFailedRequirements } from './verifier'

export interface SearchOptions {
  intent: VisualIntent
  verifier: ImageVisionVerifier
  budget?: Partial<typeof DEFAULT_SEARCH_BUDGET>
  licensePolicy?: LicensePolicy
  verificationThreshold?: number
  /** Providers to query. Defaults to every eligible provider. */
  providers?: ImageAssetProvider[]
  /** Monotonic clock, injectable for tests. */
  now?: () => number
}

export interface SearchRejection {
  provider: string
  id: string
  reason: string
}

export interface SearchOutcome {
  asset?: ImageAsset
  bytes?: Uint8Array
  mimeType?: string
  svg?: string
  provenance?: AssetProvenance
  rejections: SearchRejection[]
  /** Set when the search ended without an approved candidate. */
  reason?: string
  /** True when the budget, not the candidates, ended the search. */
  exhausted: boolean
  visionCalls: number
  providerErrors: Array<{ provider: string; error: string }>
}

interface BatchResult {
  approved: { asset: ImageAsset; outcome: VerificationOutcome } | null
  rejections: SearchRejection[]
  failedRequirements: string[]
}

async function verifyBatch(
  batch: RankedCandidate[],
  options: SearchOptions,
  policy: LicensePolicy
): Promise<BatchResult> {
  const verified = await Promise.all(
    batch.map(async (candidate) => {
      const outcome = await options.verifier.verify(candidate.asset, {
        intent: options.intent,
        threshold: options.verificationThreshold,
        licensePolicy: policy
      })
      return { candidate, outcome }
    })
  )

  const rejections: SearchRejection[] = []
  const failedRequirements: string[] = []
  let approved: { asset: ImageAsset; outcome: VerificationOutcome } | null = null

  // Rejections are recorded for every candidate that did not pass, even when a
  // sibling in the same batch was approved.
  for (const entry of verified) {
    if (entry.outcome.verified) {
      approved ??= { asset: entry.candidate.asset, outcome: entry.outcome }
      continue
    }
    rejections.push({
      provider: entry.candidate.asset.provider,
      id: entry.candidate.asset.id,
      reason: entry.outcome.reason ?? 'The vision model rejected the image'
    })
    failedRequirements.push(...readFailedRequirements(entry.outcome.verdict))
  }

  return { approved, rejections, failedRequirements }
}

function buildProvenance(asset: ImageAsset, record: VerificationRecord): AssetProvenance {
  return {
    origin: asset.provider === 'local' ? 'local' : 'search',
    provider: asset.provider,
    contentHash: record.assetContentHash,
    verification: record,
    license: asset.license,
    attribution: asset.attribution,
    sourcePage: asset.sourcePage,
    creator: asset.creator
  }
}

/**
 * Searches for one approved image.
 *
 * Every failure mode — no results, provider errors, all candidates rejected,
 * budget exhausted — is reported through the outcome so the caller can fall
 * back to generation.
 */
/** The reason the search stopped, or null while it may continue. */
function budgetExhausted(
  budget: typeof DEFAULT_SEARCH_BUDGET,
  visionCalls: number,
  elapsedMs: number
): string | null {
  if (elapsedMs >= budget.maxDurationMs) {
    return 'The search budget ran out before an image was approved'
  }
  if (visionCalls >= budget.maxVisionCalls) {
    return 'The vision call budget ran out before an image was approved'
  }
  return null
}

/** The mutable state of one search run. */
interface SearchState {
  rejections: SearchRejection[]
  providerErrors: Array<{ provider: string; error: string }>
  visionCalls: number
  failedRequirements: string[]
  inspected: Set<string>
}

/** The approved asset of a verification round, if there is one. */
interface ApprovedAsset {
  asset: ImageAsset
  bytes: Uint8Array
  mimeType?: string
  svg?: string
  record: VerificationRecord
}

/**
 * Verifies the candidates in small concurrent batches.
 *
 * Returns the first approved asset, or null when every candidate failed.
 */
async function verifyCandidates(
  candidates: RankedCandidate[],
  options: SearchOptions,
  policy: LicensePolicy,
  state: SearchState,
  budget: typeof DEFAULT_SEARCH_BUDGET,
  now: () => number,
  startedAt: number
): Promise<ApprovedAsset | null> {
  for (let index = 0; index < candidates.length; index += VISION_BATCH_SIZE) {
    if (state.visionCalls >= budget.maxVisionCalls) break
    if (now() - startedAt >= budget.maxDurationMs) break
    const remainingSlots = budget.maxVisionCalls - state.visionCalls
    const batch = candidates.slice(index, index + VISION_BATCH_SIZE).slice(0, remainingSlots)
    if (batch.length === 0) break

    const result = await verifyBatch(batch, options, policy)
    state.visionCalls += batch.length
    state.rejections.push(...result.rejections)
    state.failedRequirements = state.failedRequirements.concat(result.failedRequirements)
    for (const rejection of result.rejections) {
      state.inspected.add(`${rejection.provider}:${rejection.id}`)
    }

    const record = result.approved?.outcome.record
    if (record && result.approved?.outcome.bytes) {
      return {
        asset: result.approved.asset,
        bytes: result.approved.outcome.bytes,
        mimeType: result.approved.outcome.mimeType,
        svg: result.approved.outcome.svg,
        record
      }
    }
  }
  return null
}

export async function searchAndVerify(options: SearchOptions): Promise<SearchOutcome> {
  const budget = { ...DEFAULT_SEARCH_BUDGET, ...options.budget }
  const policy = options.licensePolicy ?? DEFAULT_LICENSE_POLICY
  const now = options.now ?? (() => Date.now())
  const startedAt = now()

  const state: SearchState = {
    rejections: [],
    providerErrors: [],
    visionCalls: 0,
    failedRequirements: [],
    inspected: new Set<string>()
  }
  let query = options.intent.query.trim() || options.intent.subject.trim()
  let refinement = 0
  const searched = new Set<string>()
  const providers = options.providers ?? getEligibleImageAssetProviders()

  for (;;) {
    const exhausted = budgetExhausted(budget, state.visionCalls, now() - startedAt)
    if (exhausted) {
      return {
        rejections: state.rejections,
        exhausted: true,
        visionCalls: state.visionCalls,
        providerErrors: state.providerErrors,
        reason: exhausted
      }
    }

    // A broadened query can collapse onto one already searched; repeating it
    // would only spend another provider timeout on the same result.
    const queryKey = query.toLowerCase()
    if (searched.has(queryKey)) {
      return {
        rejections: state.rejections,
        exhausted: false,
        visionCalls: state.visionCalls,
        providerErrors: state.providerErrors,
        reason:
          state.rejections.length > 0
            ? 'Every candidate was rejected by the vision model'
            : 'No usable image candidates were found'
      }
    }
    searched.add(queryKey)

    const outcomes = await searchImageAssetProviders(
      query,
      {
        limit: budget.maxCandidatesPerProvider,
        orientation: options.intent.orientation,
        aspectRatio: options.intent.aspectRatio,
        allowNonCommercial: policy.allowNonCommercial,
        requireModification: policy.requireModification
      },
      providers,
      budget.providerTimeoutMs,
      DEFAULT_PROVIDER_GRACE_MS
    )
    for (const outcome of outcomes) {
      if (outcome.error) {
        state.providerErrors.push({ provider: outcome.provider, error: outcome.error })
      }
    }

    const candidates = collectRoundCandidates(
      outcomes,
      options.intent,
      policy,
      query,
      state.inspected,
      budget.maxTotalCandidates - state.inspected.size
    )

    // Bundled fallback assets are always available, so they must not hide a
    // query that matched nothing: only a real provider result ends the
    // broadening. Local assets are still inspected once the rounds run out.
    const hasWebProviders = providers.some((provider) => provider.name !== 'local')
    const hasWebResults = outcomes.some(
      (outcome) => outcome.provider !== 'local' && outcome.assets.length > 0
    )
    const shouldBroaden = candidates.length === 0 || (hasWebProviders && !hasWebResults)

    if (shouldBroaden && refinement < budget.maxRefinements) {
      refinement++
      // Nothing came back, so the query is too specific, not too vague:
      // broadening is the only refinement that can help.
      query = broadenQuery(query, options.intent, refinement)
      continue
    }

    if (candidates.length === 0) {
      return {
        rejections: state.rejections,
        exhausted: false,
        visionCalls: state.visionCalls,
        providerErrors: state.providerErrors,
        reason:
          state.rejections.length > 0
            ? 'Every candidate was rejected by the vision model'
            : 'No usable image candidates were found'
      }
    }

    const approved = await verifyCandidates(
      candidates,
      options,
      policy,
      state,
      budget,
      now,
      startedAt
    )
    if (approved) {
      return {
        asset: approved.asset,
        bytes: approved.bytes,
        mimeType: approved.mimeType,
        svg: approved.svg,
        provenance: buildProvenance(approved.asset, approved.record),
        rejections: state.rejections,
        exhausted: false,
        visionCalls: state.visionCalls,
        providerErrors: state.providerErrors
      }
    }

    if (refinement >= budget.maxRefinements) {
      const exhausted = budgetExhausted(budget, state.visionCalls, now() - startedAt)
      return {
        rejections: state.rejections,
        exhausted: exhausted !== null,
        visionCalls: state.visionCalls,
        providerErrors: state.providerErrors,
        reason: exhausted ?? 'Every candidate was rejected by the vision model'
      }
    }
    refinement++
    query = refineQuery(query, options.intent, state.failedRequirements)
  }
}
