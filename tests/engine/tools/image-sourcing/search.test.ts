import { describe, expect, test } from 'bun:test'

import {
  broadenQuery,
  dedupeAssets,
  ImageVisionVerifier,
  passesMetadataFilters,
  refineQuery,
  scoreAsset,
  searchAndVerify,
  type VisualIntent
} from '@open-pencil/core/tools'

import {
  approveVerdict,
  createAsset,
  createFakeFetcher,
  createFakeInspector,
  createFakeProvider,
  PNG_BYTES
} from '#tests/helpers/image-sourcing'

const FIRST = 'https://cdn.example.com/one.png'
const SECOND = 'https://cdn.example.com/two.png'

function intent(overrides: Partial<VisualIntent> = {}): VisualIntent {
  return {
    subject: 'city skyline',
    style: 'photo',
    orientation: 'landscape',
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

function createVerifier(decide: Parameters<typeof createFakeInspector>[0]['decide']) {
  const inspector = createFakeInspector({ decide })
  const fetcher = createFakeFetcher({
    [FIRST]: { bytes: PNG_BYTES, contentType: 'image/png' },
    [SECOND]: { bytes: new Uint8Array([1, 2, 3, 4]), contentType: 'image/png' }
  })
  return { verifier: new ImageVisionVerifier({ inspector, fetcher }), inspector, fetcher }
}

describe('dedupeAssets', () => {
  test('removes duplicates by provider id and canonical url', () => {
    const assets = [
      createAsset({ id: 'a', provider: 'openverse', url: FIRST }),
      createAsset({ id: 'a', provider: 'openverse', url: FIRST }),
      createAsset({ id: 'b', provider: 'wikimedia', url: FIRST })
    ]
    expect(dedupeAssets(assets)).toHaveLength(1)
  })
})

describe('passesMetadataFilters', () => {
  const policy = { allowNonCommercial: false, requireModification: true }

  test('rejects licenses that forbid commercial use', () => {
    expect(passesMetadataFilters(createAsset({ commercialUse: false }), intent(), policy)).toBe(
      false
    )
  })

  test('rejects licenses that forbid modifications', () => {
    expect(
      passesMetadataFilters(createAsset({ modificationAllowed: false }), intent(), policy)
    ).toBe(false)
  })

  test('rejects tiny rasters', () => {
    expect(passesMetadataFilters(createAsset({ width: 32, height: 32 }), intent(), policy)).toBe(
      false
    )
  })

  test('keeps svg assets whatever their size', () => {
    expect(
      passesMetadataFilters(createAsset({ kind: 'svg', width: 15, height: 15 }), intent(), policy)
    ).toBe(true)
  })
})

describe('scoreAsset', () => {
  test('prefers a matching orientation and title', () => {
    const matching = createAsset({ title: 'city skyline', width: 1600, height: 900 })
    const mismatched = createAsset({ title: 'a cat', width: 400, height: 1200 })
    expect(scoreAsset(matching, intent(), 'city skyline')).toBeGreaterThan(
      scoreAsset(mismatched, intent(), 'city skyline')
    )
  })
})

describe('refineQuery', () => {
  test('adds the style terms when the style failed', () => {
    const refined = refineQuery('scooter', intent({ style: 'flat_2d_vector' }), ['style'])
    expect(refined).toContain('flat vector illustration')
  })

  test('adds orientation terms when the orientation failed', () => {
    const refined = refineQuery('scooter', intent({ orientation: 'portrait' }), ['orientation'])
    expect(refined).toContain('portrait')
  })

  test('keeps the query when nothing relevant failed', () => {
    expect(refineQuery('scooter', intent(), ['palette'])).toBe('scooter')
  })

  test('never pushes a photo request toward illustrations', () => {
    const refined = refineQuery('coffee shop', intent({ style: 'photo' }), ['subject'])
    expect(refined).not.toContain('illustration')
  })
})

describe('broadenQuery', () => {
  test('keeps the leading subject words and drops the art direction', () => {
    expect(
      broadenQuery(
        'specialty coffee shop interior minimalist espresso bar',
        intent({ subject: 'specialty coffee shop interior' }),
        1
      )
    ).toBe('coffee shop interior')
  })

  test('shortens further on later rounds', () => {
    expect(
      broadenQuery('coffee roaster cooling tray', intent({ subject: 'coffee roaster' }), 2)
    ).toBe('coffee roaster')
  })

  test('falls back to the subject when the query is already short', () => {
    expect(
      broadenQuery('beans', intent({ query: '', subject: 'coffee beans cooling tray' }), 1)
    ).toBe('coffee beans cooling')
  })

  test('returns the query unchanged when nothing can be removed', () => {
    expect(broadenQuery('beans', intent({ query: '', subject: 'beans' }), 1)).toBe('beans')
  })
})

describe('searchAndVerify', () => {
  test('queries the providers in parallel and keeps the successful results', async () => {
    const { verifier } = createVerifier(() => approveVerdict())
    const failing = createFakeProvider('failing', [], { fail: true })
    const working = createFakeProvider('working', [
      createAsset({ url: FIRST, provider: 'working' })
    ])

    const outcome = await searchAndVerify({
      intent: intent(),
      verifier,
      providers: [failing, working]
    })

    expect(outcome.asset?.provider).toBe('working')
    expect(outcome.providerErrors).toHaveLength(1)
    expect(outcome.providerErrors[0]?.provider).toBe('failing')
  })

  test('approves the first candidate the vision model accepts', async () => {
    const { verifier, inspector } = createVerifier(() => approveVerdict())
    const provider = createFakeProvider('working', [
      createAsset({ url: FIRST, id: 'one' }),
      createAsset({ url: SECOND, id: 'two' })
    ])

    const outcome = await searchAndVerify({ intent: intent(), verifier, providers: [provider] })

    expect(outcome.asset?.id).toBe('one')
    // The batch is inspected concurrently, so both candidates cost one call.
    expect(outcome.visionCalls).toBe(2)
    expect(inspector.calls).toHaveLength(2)
    expect(outcome.provenance?.origin).toBe('search')
    expect(outcome.provenance?.contentHash).toBe(outcome.provenance?.verification.assetContentHash)
  })

  test('rejects an irrelevant image and tries the next candidate', async () => {
    let call = 0
    const { verifier } = createVerifier(() => {
      call++
      return call === 1
        ? approveVerdict({ approved: false, relevanceScore: 0.2, failedRequirements: ['subject'] })
        : approveVerdict()
    })
    const provider = createFakeProvider('working', [
      createAsset({ url: FIRST, id: 'one', title: 'city skyline' }),
      createAsset({ url: SECOND, id: 'two', title: 'city skyline' })
    ])

    const outcome = await searchAndVerify({ intent: intent(), verifier, providers: [provider] })

    expect(outcome.asset?.id).toBe('two')
    expect(outcome.rejections).toHaveLength(1)
    expect(outcome.rejections[0]?.reason).toContain('subject')
  })

  test('refines the query after a rejection and searches again', async () => {
    let call = 0
    const { verifier } = createVerifier(() => {
      call++
      return call === 1
        ? approveVerdict({ approved: false, relevanceScore: 0.1, failedRequirements: ['style'] })
        : approveVerdict()
    })
    const provider = {
      name: 'working',
      calls: [] as string[],
      isConfigured: () => true,
      async search(query: string) {
        provider.calls.push(query)
        // A refined query returns a different candidate, like a real provider.
        return provider.calls.length === 1
          ? [createAsset({ url: FIRST, id: 'one' })]
          : [createAsset({ url: SECOND, id: 'two' })]
      }
    }

    const outcome = await searchAndVerify({
      intent: intent({ style: 'flat_2d_vector' }),
      verifier,
      providers: [provider]
    })

    expect(outcome.asset?.id).toBe('two')
    expect(provider.calls.length).toBeGreaterThan(1)
    expect(provider.calls[1]).toContain('flat vector illustration')
  })

  test('gives up after the refinement budget and reports the rejections', async () => {
    const { verifier } = createVerifier(() =>
      approveVerdict({ approved: false, relevanceScore: 0.1, failedRequirements: ['subject'] })
    )
    const provider = createFakeProvider('working', [createAsset({ url: FIRST, id: 'one' })])

    const outcome = await searchAndVerify({
      intent: intent(),
      verifier,
      providers: [provider],
      budget: { maxRefinements: 1, maxVisionCalls: 10 }
    })

    expect(outcome.asset).toBeUndefined()
    expect(outcome.reason).toContain('rejected')
    // One search plus one refinement, never an endless loop.
    expect(provider.calls.length).toBeLessThanOrEqual(3)
  })

  test('stops when the vision call budget is exhausted', async () => {
    const { verifier } = createVerifier(() =>
      approveVerdict({ approved: false, relevanceScore: 0.1, failedRequirements: ['subject'] })
    )
    const provider = createFakeProvider('working', [
      createAsset({ url: FIRST, id: 'one' }),
      createAsset({ url: SECOND, id: 'two' }),
      createAsset({ url: FIRST, id: 'three' })
    ])

    const outcome = await searchAndVerify({
      intent: intent(),
      verifier,
      providers: [provider],
      budget: { maxVisionCalls: 1, maxRefinements: 0 }
    })

    expect(outcome.visionCalls).toBe(1)
    expect(outcome.asset).toBeUndefined()
  })

  test('stops when the time budget is exhausted', async () => {
    let clock = 0
    const { verifier } = createVerifier(() => approveVerdict())
    const provider = createFakeProvider('working', [createAsset({ url: FIRST, id: 'one' })])

    const outcome = await searchAndVerify({
      intent: intent(),
      verifier,
      providers: [provider],
      budget: { maxDurationMs: 1 },
      now: () => {
        clock += 1000
        return clock
      }
    })

    expect(outcome.asset).toBeUndefined()
    expect(outcome.reason).toContain('budget')
  })

  test('reports when no provider returned a candidate', async () => {
    const { verifier } = createVerifier(() => approveVerdict())
    const provider = createFakeProvider('empty', [])

    const outcome = await searchAndVerify({
      intent: intent(),
      verifier,
      providers: [provider],
      budget: { maxRefinements: 0 }
    })

    expect(outcome.asset).toBeUndefined()
    expect(outcome.reason).toContain('No usable image candidates')
  })

  test('broadens an over-specific query until a provider returns candidates', async () => {
    const { verifier } = createVerifier(() => approveVerdict())
    const provider = {
      name: 'working',
      calls: [] as string[],
      isConfigured: () => true,
      async search(query: string) {
        provider.calls.push(query)
        return query === 'coffee shop interior' ? [createAsset({ url: FIRST, id: 'one' })] : []
      }
    }

    const outcome = await searchAndVerify({
      intent: intent({
        subject: 'specialty coffee shop interior minimalist',
        query: 'specialty coffee shop interior minimalist espresso bar'
      }),
      verifier,
      providers: [provider]
    })

    expect(outcome.asset?.id).toBe('one')
    expect(provider.calls[0]).toBe('specialty coffee shop interior minimalist espresso bar')
    expect(provider.calls[1]).toBe('coffee shop interior')
  })

  test('keeps broadening while only the bundled fallback matched', async () => {
    const { verifier } = createVerifier(() => approveVerdict())
    const local = createFakeProvider('local', [
      createAsset({ provider: 'local', id: 'local-1', url: SECOND })
    ])
    const web = {
      name: 'web',
      calls: [] as string[],
      isConfigured: () => true,
      async search(query: string) {
        web.calls.push(query)
        return query === 'coffee shop interior' ? [createAsset({ url: FIRST, id: 'web-1' })] : []
      }
    }

    const outcome = await searchAndVerify({
      intent: intent({
        subject: 'specialty coffee shop interior minimalist',
        query: 'specialty coffee shop interior minimalist espresso bar'
      }),
      verifier,
      providers: [local, web]
    })

    expect(outcome.asset?.id).toBe('web-1')
    expect(web.calls).toEqual([
      'specialty coffee shop interior minimalist espresso bar',
      'coffee shop interior'
    ])
  })

  test('never repeats a query that already returned nothing', async () => {
    const { verifier } = createVerifier(() => approveVerdict())
    const provider = createFakeProvider('empty', [])

    const outcome = await searchAndVerify({
      intent: intent({ query: 'beans', subject: 'beans' }),
      verifier,
      providers: [provider]
    })

    expect(outcome.asset).toBeUndefined()
    expect(outcome.reason).toContain('No usable image candidates')
    expect(provider.calls).toEqual(['beans'])
  })

  test('excludes assets whose license forbids commercial use', async () => {
    const { verifier, inspector } = createVerifier(() => approveVerdict())
    const provider = createFakeProvider('working', [
      createAsset({ url: FIRST, id: 'nc', commercialUse: false })
    ])

    const outcome = await searchAndVerify({
      intent: intent(),
      verifier,
      providers: [provider],
      budget: { maxRefinements: 0 }
    })

    expect(outcome.asset).toBeUndefined()
    expect(inspector.calls).toHaveLength(0)
  })

  test('gives up on a hanging provider without losing the other results', async () => {
    const { verifier, inspector } = createVerifier(() => approveVerdict())
    const hanging = {
      name: 'hanging',
      calls: [] as string[],
      isConfigured: () => true,
      async search(query: string) {
        hanging.calls.push(query)
        await new Promise((resolve) => {
          setTimeout(resolve, 60_000)
        })
        return []
      }
    }
    const working = createFakeProvider('working', [createAsset({ url: FIRST, id: 'one' })])

    const outcome = await searchAndVerify({
      intent: intent(),
      verifier,
      providers: [hanging, working],
      budget: { maxRefinements: 0, providerTimeoutMs: 50, maxDurationMs: 5_000 }
    })

    expect(outcome.asset?.id).toBe('one')
    expect(inspector.calls.length).toBeGreaterThan(0)
    expect(outcome.providerErrors[0]?.provider).toBe('hanging')
    expect(outcome.providerErrors[0]?.error).toContain('timed out')
  })
})
