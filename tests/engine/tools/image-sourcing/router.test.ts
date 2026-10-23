import { beforeEach, describe, expect, test } from 'bun:test'

import {
  clearRoutingLog,
  collectGenerateSignals,
  decideRoute,
  getRoutingLog,
  heuristicRouteDecision,
  routingCacheKey,
  RoutingCache,
  type RouteDecision,
  type RouteDecider,
  type VisualIntent
} from '@open-pencil/core/tools'

function intent(overrides: Partial<VisualIntent> = {}): VisualIntent {
  return {
    subject: 'city skyline',
    style: 'photo',
    requiresTransparency: false,
    requiresNegativeSpace: false,
    textInImage: false,
    exclusions: [],
    brandSpecific: false,
    appMockup: false,
    query: 'city skyline',
    ...overrides
  }
}

describe('collectGenerateSignals', () => {
  test('finds no signal for a common subject', () => {
    expect(collectGenerateSignals(intent())).toEqual([])
  })

  test('finds signals for a brand specific illustration', () => {
    const signals = collectGenerateSignals(
      intent({ subject: 'our app mascot', style: 'flat_2d_vector', brandSpecific: true })
    )
    expect(signals).toContain('brand-or-product-specific-imagery')
  })

  test('a single style requirement is not a generate signal', () => {
    const signals = collectGenerateSignals(intent({ style: 'flat_2d_vector' }))
    expect(signals).toEqual([])
  })

  test('finds a signal when several strict constraints are combined', () => {
    const signals = collectGenerateSignals(
      intent({ style: 'flat_2d_vector', palette: 'warm autumn', aspectRatio: 1.5 })
    )
    expect(signals).toContain('multiple-strict-constraints')
  })

  test('finds signals for an app mockup', () => {
    const signals = collectGenerateSignals(
      intent({ subject: 'dashboard ui mockup', appMockup: true })
    )
    expect(signals).toContain('app-or-device-mockup')
  })

  test('finds signals for a fictional scene', () => {
    const signals = collectGenerateSignals(intent({ subject: 'a fictional dragon city' }))
    expect(signals).toContain('fictional-or-imaginary-scene')
  })

  test('finds signals for text inside the image', () => {
    const signals = collectGenerateSignals(intent({ textInImage: true }))
    expect(signals).toContain('text-rendered-inside-the-image')
  })

  test('finds signals for a set of images that must share one style', () => {
    const signals = collectGenerateSignals(intent({ styleGroup: 'hero' }))
    expect(signals).toContain('several-images-sharing-one-style')
  })
})

describe('heuristicRouteDecision', () => {
  test('routes a common subject to search', () => {
    const decision = heuristicRouteDecision(intent())
    expect(decision.route).toBe('search')
    expect(decision.signals).toContain('common-subject')
  })

  test('routes a specific request to generate', () => {
    const decision = heuristicRouteDecision(
      intent({
        subject: 'our brand mascot illustration',
        style: 'flat_2d_vector',
        brandSpecific: true,
        requiresTransparency: true
      })
    )
    expect(decision.route).toBe('generate')
    expect(decision.confidence).toBeGreaterThan(0.5)
  })

  test('routes a single ambiguous constraint to a probe', () => {
    const decision = heuristicRouteDecision(intent({ textInImage: true }))
    expect(decision.route).toBe('probe_then_generate')
  })

  test('honours the user override to search', () => {
    const decision = heuristicRouteDecision(intent({ brandSpecific: true }), { forceSearch: true })
    expect(decision.route).toBe('search')
    expect(decision.signals).toContain('user-forced-search')
  })

  test('honours the user override to generate', () => {
    const decision = heuristicRouteDecision(intent(), { forceGenerate: true })
    expect(decision.route).toBe('generate')
    expect(decision.signals).toContain('user-forced-generate')
  })

  test('never generates when generation is forbidden', () => {
    const decision = heuristicRouteDecision(intent({ brandSpecific: true }), {
      disallowGeneration: true
    })
    expect(decision.route).toBe('search')
    expect(decision.signals).toContain('generation-disallowed')
  })
  test('never generates a real trademark or a real likeness', () => {
    const trademark = heuristicRouteDecision(
      intent({ subject: 'the Acme Corp logo', requiresTransparency: true, aspectRatio: 1 })
    )
    expect(trademark.route).toBe('search')
    expect(trademark.signals).toContain('protected-subject-no-generation')

    const likeness = heuristicRouteDecision(
      intent({ subject: 'portrait of a famous actor', requiresTransparency: true, aspectRatio: 1 })
    )
    expect(likeness.route).toBe('search')
    expect(likeness.signals).toContain('protected-subject-no-generation')
  })

  test("still generates the user's own brand artwork", () => {
    const ownBrand = heuristicRouteDecision(
      intent({
        subject: 'our brand logo illustration',
        style: 'flat_2d_vector',
        brandSpecific: true,
        requiresTransparency: true
      })
    )
    expect(ownBrand.route).toBe('generate')
  })
})

describe('decideRoute', () => {
  beforeEach(() => {
    clearRoutingLog()
  })

  test('uses the model for an ambiguous request', async () => {
    const decider: RouteDecider = {
      async decide() {
        return {
          route: 'search',
          confidence: 0.9,
          reason: 'The subject is common',
          signals: ['model']
        }
      }
    }
    const decision = await decideRoute(intent({ textInImage: true }), {}, { decider })
    expect(decision.route).toBe('search')
    expect(decision.reason).toBe('The subject is common')
    expect(getRoutingLog()[0]?.source).toBe('model')
  })

  test('skips the model when the request is clearly custom', async () => {
    let called = false
    const decider: RouteDecider = {
      async decide() {
        called = true
        return { route: 'search', confidence: 1, reason: 'should not be used', signals: [] }
      }
    }
    const decision = await decideRoute(
      intent({
        subject: 'our app mascot',
        style: 'flat_2d_vector',
        brandSpecific: true,
        requiresTransparency: true
      }),
      {},
      { decider }
    )
    expect(decision.route).toBe('generate')
    expect(called).toBe(false)
  })

  test('falls back to the heuristic when the model fails', async () => {
    const decider: RouteDecider = {
      async decide() {
        throw new Error('model unavailable')
      }
    }
    const decision = await decideRoute(intent({ textInImage: true }), {}, { decider })
    expect(decision.route).toBe('probe_then_generate')
    expect(getRoutingLog()[0]?.source).toBe('heuristic')
  })

  test('ignores a malformed model decision', async () => {
    const decider: RouteDecider = {
      async decide(): Promise<RouteDecision> {
        // A model that answers with something that is not a route.
        const malformed: Partial<RouteDecision> = { route: 'nonsense' as RouteDecision['route'] }
        return {
          route: malformed.route ?? 'search',
          confidence: 1,
          reason: '',
          signals: []
        }
      }
    }
    const decision = await decideRoute(intent({ textInImage: true }), {}, { decider })
    expect(decision.route).toBe('probe_then_generate')
  })

  test('user overrides never reach the model', async () => {
    let called = false
    const decider: RouteDecider = {
      async decide() {
        called = true
        return { route: 'search', confidence: 1, reason: '', signals: [] }
      }
    }
    const decision = await decideRoute(intent(), { forceGenerate: true }, { decider })
    expect(decision.route).toBe('generate')
    expect(called).toBe(false)
    expect(getRoutingLog()[0]?.source).toBe('override')
  })

  test('routes straight to generate when an earlier search failed', async () => {
    const decision = await decideRoute(intent(), { previousSearchFailed: true })
    expect(decision.route).toBe('generate')
    expect(decision.signals).toContain('previous-search-failed')
  })

  test('caches the decision per intent', async () => {
    let calls = 0
    const decider: RouteDecider = {
      async decide() {
        calls++
        return { route: 'search', confidence: 0.8, reason: 'common', signals: [] }
      }
    }
    const cache = new RoutingCache()
    await decideRoute(intent(), {}, { decider, cache })
    const second = await decideRoute(intent(), {}, { decider, cache })
    expect(calls).toBe(1)
    expect(second.route).toBe('search')
    expect(getRoutingLog()[1]?.source).toBe('cache')
  })

  test('the cache key separates different intents', () => {
    expect(routingCacheKey(intent())).not.toBe(routingCacheKey(intent({ style: 'illustration' })))
  })
})
