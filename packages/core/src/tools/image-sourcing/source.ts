/**
 * Orchestrator for one image slot: route, search, verify, generate, apply.
 *
 * Every failure of the search path falls through to generation, and nothing is
 * applied to the canvas unless a vision model approved the exact bytes.
 */

import type { FigmaAPI } from '#core/figma-api'
import type { GeneratedImageProvider } from '#core/tools/image-gen/providers'

import { applySourcedImage } from './apply'
import { generateAndVerify } from './generate'
import type { SourceImageRequest } from './requests'
import { decideRoute, isProtectedSubject, type RoutingCache, type RoutingLogEntry } from './router'
import { searchAndVerify } from './search'
import type { SearchOutcome } from './search'
import type {
  ImageAssetProvider,
  ImageSourcingResult,
  RouteContext,
  RouteDecision,
  RouteDecider
} from './types'
import { DEFAULT_SEARCH_BUDGET } from './types'
import type { ImageVisionVerifier, LicensePolicy } from './verifier'
import { DEFAULT_LICENSE_POLICY } from './verifier'

export interface ImageSourcingServices {
  verifier: ImageVisionVerifier
  /** Model-backed router. Without it the heuristic decides. */
  decider?: RouteDecider | null
  /** Image generation provider used for the fallback path. */
  generator?: GeneratedImageProvider | null
  /** Providers queried during the search path. */
  providers?: ImageAssetProvider[]
  routingCache?: RoutingCache
  budget?: Partial<typeof DEFAULT_SEARCH_BUDGET>
  licensePolicy?: LicensePolicy
  verificationThreshold?: number
  /** Maximum number of generation attempts. */
  generationAttempts?: number
  /** Wall clock budget for all generation attempts. */
  generationBudgetMs?: number
  /** Receives every routing decision for the debug log. */
  onRoutingDecision?: (entry: RoutingLogEntry) => void
}

/** Reduced budget for the single probe round of `probe_then_generate`. */
export const PROBE_BUDGET = {
  maxRefinements: 0,
  maxVisionCalls: 2,
  maxDurationMs: 8_000,
  maxCandidatesPerProvider: 4,
  maxTotalCandidates: 6,
  providerTimeoutMs: 5_000
}

function routeContext(request: SourceImageRequest): RouteContext {
  const context: RouteContext = { ...request.context }
  if (request.route === 'search') context.forceSearch = true
  if (request.route === 'generate') context.forceGenerate = true
  return context
}

/**
 * Sources one image and applies it to the canvas.
 *
 * The returned state is honest: an image that could not be verified is never
 * applied, and the reason is always included.
 */
/** Applies a found asset to the canvas and reports the outcome. */
async function applyFoundAsset(
  figma: FigmaAPI,
  request: SourceImageRequest,
  search: SearchOutcome,
  decision: RouteDecision
): Promise<ImageSourcingResult | null> {
  if (!search.asset || !search.bytes) return null
  const provenance = search.provenance ? { ...search.provenance, routing: decision } : undefined
  const applied = await applySourcedImage({
    figma,
    nodeId: request.id,
    bytes: search.bytes,
    mimeType: search.mimeType ?? 'image/png',
    svg: search.svg,
    expectedContentHash: provenance?.contentHash,
    provenance
  })
  if ('error' in applied) {
    return {
      id: request.id,
      state: 'no_verified_match',
      reason: applied.error,
      routing: decision,
      rejections: search.rejections
    }
  }
  return {
    id: applied.id,
    state: search.asset.provider === 'local' ? 'verified_from_local' : 'verified_from_search',
    asset: search.asset,
    provenance,
    routing: decision,
    rejections: search.rejections,
    isVector: applied.isVector
  }
}

/** Runs the generation fallback and applies the result. */
async function applyGeneratedAsset(
  services: ImageSourcingServices,
  figma: FigmaAPI,
  request: SourceImageRequest,
  decision: RouteDecision,
  fallback: ImageSourcingResult
): Promise<ImageSourcingResult> {
  const generator = services.generator
  if (!generator) {
    return {
      ...fallback,
      state: 'generation_unavailable',
      reason: 'No approved image was found and image generation is unavailable for the active model'
    }
  }

  const generated = await generateAndVerify({
    intent: request.intent,
    verifier: services.verifier,
    provider: generator,
    attempts: services.generationAttempts,
    threshold: services.verificationThreshold,
    licensePolicy: services.licensePolicy ?? DEFAULT_LICENSE_POLICY,
    maxDurationMs: services.generationBudgetMs
  })

  if (generated.state !== 'verified_generated' || !generated.bytes) {
    return {
      ...fallback,
      state: 'no_verified_match',
      reason: generated.reason ?? fallback.reason
    }
  }

  const provenance = generated.provenance
    ? { ...generated.provenance, routing: decision }
    : undefined
  const applied = await applySourcedImage({
    figma,
    nodeId: request.id,
    bytes: generated.bytes,
    mimeType: generated.mimeType ?? 'image/png',
    expectedContentHash: provenance?.contentHash,
    provenance
  })
  if ('error' in applied) {
    return {
      id: request.id,
      state: 'no_verified_match',
      reason: applied.error,
      routing: decision,
      rejections: fallback.rejections
    }
  }

  return {
    id: applied.id,
    state: 'verified_generated',
    provenance,
    routing: decision,
    rejections: fallback.rejections,
    isVector: applied.isVector
  }
}

/**
 * Sources one image and applies it to the canvas.
 *
 * The returned state is honest: an image that could not be verified is never
 * applied, and the reason is always included.
 */
export async function sourceImageAsset(
  services: ImageSourcingServices,
  figma: FigmaAPI,
  request: SourceImageRequest
): Promise<ImageSourcingResult> {
  if (!request.intent.subject.trim()) {
    return {
      id: request.id,
      state: 'no_verified_match',
      reason: 'The image request has no subject'
    }
  }

  if (!services.verifier.available) {
    return {
      id: request.id,
      state: 'vision_unavailable_needs_user_selection',
      reason:
        'No vision model is configured, so no image can be verified. Configure a Vision model in Settings.'
    }
  }

  const policy = services.licensePolicy ?? DEFAULT_LICENSE_POLICY
  const context = routeContext(request)
  const decision = await decideRoute(request.intent, context, {
    decider: services.decider ?? null,
    cache: services.routingCache,
    onDecision: services.onRoutingDecision
  })

  const probeOnly = decision.route === 'probe_then_generate'
  const searchBudget = probeOnly
    ? { ...DEFAULT_SEARCH_BUDGET, ...services.budget, ...PROBE_BUDGET }
    : { ...DEFAULT_SEARCH_BUDGET, ...services.budget }

  let outcome: ImageSourcingResult = { id: request.id, state: 'no_verified_match' }

  if (decision.route !== 'generate') {
    const search = await searchAndVerify({
      intent: request.intent,
      verifier: services.verifier,
      budget: searchBudget,
      licensePolicy: policy,
      verificationThreshold: services.verificationThreshold,
      providers: services.providers
    })

    const applied = await applyFoundAsset(figma, request, search, decision)
    if (applied) return applied

    outcome = {
      id: request.id,
      state: 'no_verified_match',
      reason: search.reason ?? 'No approved image was found',
      routing: decision,
      rejections: search.rejections
    }
  }

  if (context.disallowGeneration || isProtectedSubject(request.intent)) {
    const reason = isProtectedSubject(request.intent)
      ? "Real people's likeness and real brand trademarks are never generated"
      : 'generation is not allowed'
    return {
      ...outcome,
      reason: `${outcome.reason ?? 'No approved image was found'} (${reason})`
    }
  }

  return applyGeneratedAsset(services, figma, request, decision, outcome)
}
