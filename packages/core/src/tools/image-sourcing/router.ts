/**
 * Smart router: decides whether an image slot is searched, probed, or generated.
 *
 * The router runs before any provider call, so a custom request never spends
 * a search round. A cheap heuristic pre-check handles the unambiguous cases,
 * and the configured model decides everything else.
 */

import type { RouteContext, RouteDecision, RouteDecider, VisualIntent } from './types'

/** Number of generate signals that make a request unambiguous. */
export const GENERATE_SIGNAL_THRESHOLD = 2

/** Default lifetime of a cached routing decision. */
export const ROUTING_CACHE_TTL_MS = 5 * 60_000

const FICTIONAL_PATTERN =
  /\b(fictional|imaginary|made[- ]?up|fantasy|mythical|legendary|not real|imagined)\b/i
const MOCKUP_PATTERN =
  /\b(mockup|mock[- ]?up|app screen|screenshot of|dashboard ui|device frame)\b/i
const BRAND_PATTERN = /\b(our app|our brand|mascot|logo|brand kit|product shot of)\b/i
const TRADEMARK_PATTERN = /\b(logo|wordmark|trademark|brand mark|brandmark)\b/i
const LIKENESS_PATTERN =
  /\b(likeness|likeness of|the face of|portrait of (?:the |a |an )?(?:famous|celebrity|actor|actress|athlete|musician|politician|president|singer))\b/i

/**
 * Whether the request concerns a real person's likeness or a real brand
 * trademark.
 *
 * Such images are never generated: a fabricated likeness or a made-up logo is
 * both wrong and a legal problem. The pipeline looks for a licensed original
 * instead, and reports the limitation when there is none.
 */
export function isProtectedSubject(intent: VisualIntent): boolean {
  if (intent.brandSpecific) return false
  const text = `${intent.subject} ${intent.action ?? ''}`
  if (TRADEMARK_PATTERN.test(text)) return true
  return LIKENESS_PATTERN.test(text)
}

/** Signals that make a request unlikely to be satisfied by a stock image. */
export function collectGenerateSignals(intent: VisualIntent): string[] {
  const signals: string[] = []
  const text = `${intent.subject} ${intent.action ?? ''} ${intent.exclusions.join(' ')}`

  if (intent.brandSpecific || BRAND_PATTERN.test(text)) {
    signals.push('brand-or-product-specific-imagery')
  }
  if (intent.appMockup || MOCKUP_PATTERN.test(text)) {
    signals.push('app-or-device-mockup')
  }
  if (FICTIONAL_PATTERN.test(text)) {
    signals.push('fictional-or-imaginary-scene')
  }
  if (intent.requiresTransparency) signals.push('transparent-background-required')
  if (intent.requiresNegativeSpace) signals.push('reserved-negative-space-for-text')
  if (intent.aspectRatio !== undefined) signals.push('exact-aspect-ratio')
  if (intent.textInImage) signals.push('text-rendered-inside-the-image')
  if (intent.styleGroup) signals.push('several-images-sharing-one-style')
  if (intent.exclusions.some((entry) => /no photographs?|not a photo|avoid photos/i.test(entry))) {
    signals.push('photographs-explicitly-excluded')
  }

  // Several strict constraints at once mean the request pins down more than a
  // public library can be expected to match.
  const strictConstraints = [
    intent.palette,
    intent.aspectRatio !== undefined,
    intent.requiresTransparency,
    intent.requiresNegativeSpace,
    intent.textInImage,
    intent.exclusions.length > 0
  ].filter(Boolean).length
  if (strictConstraints >= 2) signals.push('multiple-strict-constraints')

  return signals
}

/** The route the heuristic alone would choose. */
export function heuristicRouteDecision(
  intent: VisualIntent,
  context: RouteContext = {}
): RouteDecision {
  const signals = collectGenerateSignals(intent)
  if (context.forceSearch) {
    return {
      route: 'search',
      confidence: 1,
      reason: 'The user explicitly asked for a stock/photo search.',
      signals: ['user-forced-search']
    }
  }
  if (isProtectedSubject(intent)) {
    // A real likeness or a real trademark is never fabricated, so the search
    // looks for a licensed original instead.
    return {
      route: 'search',
      confidence: 1,
      reason:
        "Real people's likeness and real brand trademarks are never generated; only licensed originals are used.",
      signals: ['protected-subject-no-generation']
    }
  }
  if (context.disallowGeneration) {
    return {
      route: 'search',
      confidence: 1,
      reason: 'Generation is forbidden for this request, so only existing assets are used.',
      signals: ['generation-disallowed']
    }
  }
  if (context.forceGenerate) {
    return {
      route: 'generate',
      confidence: 1,
      reason: 'The user explicitly asked for the image to be created.',
      signals: ['user-forced-generate']
    }
  }
  if (signals.length >= GENERATE_SIGNAL_THRESHOLD) {
    return {
      route: 'generate',
      confidence: Math.min(0.95, 0.6 + signals.length * 0.1),
      reason: `The request is too specific for a public image library (${signals.join(', ')}).`,
      signals
    }
  }
  if (signals.length === 1) {
    return {
      route: 'probe_then_generate',
      confidence: 0.55,
      reason: `One constraint suggests the image may not exist publicly (${signals[0]}).`,
      signals
    }
  }
  return {
    route: 'search',
    confidence: 0.8,
    reason: 'The subject is a common, widely available image subject.',
    signals: ['common-subject']
  }
}

/** Normalized key used to cache routing outcomes per intent. */
export function routingCacheKey(intent: VisualIntent): string {
  return [
    intent.subject.trim().toLowerCase(),
    intent.style,
    intent.palette?.trim().toLowerCase() ?? '',
    intent.orientation ?? '',
    intent.styleGroup ?? ''
  ].join('|')
}

/** Small TTL cache of routing outcomes. */
export class RoutingCache {
  private readonly entries = new Map<string, { decision: RouteDecision; expiresAt: number }>()

  constructor(private readonly ttlMs: number = ROUTING_CACHE_TTL_MS) {}

  get(key: string, now = Date.now()): RouteDecision | null {
    const entry = this.entries.get(key)
    if (!entry) return null
    if (entry.expiresAt <= now) {
      this.entries.delete(key)
      return null
    }
    return entry.decision
  }

  set(key: string, decision: RouteDecision, now = Date.now()): void {
    this.entries.set(key, { decision, expiresAt: now + this.ttlMs })
  }

  clear(): void {
    this.entries.clear()
  }
}

/** A recorded routing decision, kept for debugging. */
export interface RoutingLogEntry {
  key: string
  decision: RouteDecision
  source: 'heuristic' | 'model' | 'override' | 'cache'
}

const routingLog: RoutingLogEntry[] = []
const ROUTING_LOG_LIMIT = 50

export function getRoutingLog(): RoutingLogEntry[] {
  return [...routingLog]
}

export function clearRoutingLog(): void {
  routingLog.length = 0
}

function recordRoutingLog(entry: RoutingLogEntry): void {
  routingLog.push(entry)
  if (routingLog.length > ROUTING_LOG_LIMIT) routingLog.shift()
}

export interface RouteOptions {
  /** Model-backed router; without it the heuristic decides. */
  decider?: RouteDecider | null
  cache?: RoutingCache
  /** Called for every decision, e.g. to feed the chat debug log. */
  onDecision?: (entry: RoutingLogEntry) => void
}

function isRoute(value: unknown): value is RouteDecision['route'] {
  return value === 'search' || value === 'probe_then_generate' || value === 'generate'
}

function normalizeDecision(raw: unknown, fallback: RouteDecision): RouteDecision {
  if (!raw || typeof raw !== 'object') return fallback
  const record = raw as Partial<RouteDecision>
  if (!isRoute(record.route)) return fallback
  const confidence =
    typeof record.confidence === 'number' && Number.isFinite(record.confidence)
      ? Math.min(1, Math.max(0, record.confidence))
      : fallback.confidence
  const signals = Array.isArray(record.signals)
    ? record.signals.filter((entry): entry is string => typeof entry === 'string')
    : fallback.signals
  return {
    route: record.route,
    confidence,
    reason: typeof record.reason === 'string' && record.reason ? record.reason : fallback.reason,
    signals
  }
}

/** Records a decision and reports it to the caller. */
function publishDecision(
  key: string,
  decision: RouteDecision,
  source: RoutingLogEntry['source'],
  options: RouteOptions
): RouteDecision {
  recordRoutingLog({ key, decision, source })
  options.onDecision?.({ key, decision, source })
  return decision
}

/** The decision used when an earlier identical request found nothing. */
function previousFailureDecision(): RouteDecision {
  return {
    route: 'generate',
    confidence: 0.9,
    reason: 'An earlier identical request in this project found no usable asset.',
    signals: ['previous-search-failed']
  }
}

/**
 * Decides how one image slot is sourced.
 *
 * User overrides win outright. Otherwise the heuristic pre-check runs first:
 * when it finds enough signals that no public library can satisfy the request,
 * the search is skipped entirely and the image is generated. Everything else
 * is handed to the model, because a keyword list alone cannot judge whether
 * an image exists.
 */
export async function decideRoute(
  intent: VisualIntent,
  context: RouteContext = {},
  options: RouteOptions = {}
): Promise<RouteDecision> {
  const key = routingCacheKey(intent)
  const heuristic = heuristicRouteDecision(intent, context)

  const isUserOverride = context.forceSearch || context.forceGenerate || context.disallowGeneration
  if (isUserOverride) {
    const decision = { ...heuristic, signals: [...heuristic.signals, ...contextSignals(context)] }
    return publishDecision(key, decision, 'override', options)
  }

  if (context.previousSearchFailed) {
    return publishDecision(key, previousFailureDecision(), 'heuristic', options)
  }

  if (heuristic.route === 'generate') {
    return publishDecision(key, heuristic, 'heuristic', options)
  }

  const cache = options.cache
  const cached = cache?.get(key)
  if (cached) {
    return publishDecision(key, cached, 'cache', options)
  }

  const decider = options.decider
  if (!decider) {
    cache?.set(key, heuristic)
    return publishDecision(key, heuristic, 'heuristic', options)
  }

  let decision: RouteDecision
  let source: RoutingLogEntry['source'] = 'model'
  try {
    const raw = await decider.decide(intent, context)
    decision = normalizeDecision(raw, heuristic)
  } catch {
    decision = heuristic
    source = 'heuristic'
  }

  if (context.disallowGeneration && decision.route !== 'search') {
    decision = {
      route: 'search',
      confidence: 1,
      reason: 'Generation is forbidden for this request, so only existing assets are used.',
      signals: [...decision.signals, 'generation-disallowed']
    }
  }

  cache?.set(key, decision)
  return publishDecision(key, decision, source, options)
}

function contextSignals(context: RouteContext): string[] {
  const signals: string[] = []
  if (context.forceSearch) signals.push('user-forced-search')
  if (context.forceGenerate) signals.push('user-forced-generate')
  if (context.disallowGeneration) signals.push('generation-disallowed')
  return signals
}
