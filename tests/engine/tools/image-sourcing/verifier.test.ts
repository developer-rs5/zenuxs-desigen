import { describe, expect, test } from 'bun:test'

import {
  buildVerificationPrompt,
  buildVisionRequirements,
  contentHash,
  ImageVisionVerifier,
  type VisualIntent
} from '@open-pencil/core/tools'

import {
  approveVerdict,
  createAsset,
  createFakeFetcher,
  createFakeInspector,
  PNG_BYTES
} from '#tests/helpers/image-sourcing'

const URL = 'https://cdn.example.com/asset.png'

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

function createVerifier(options: {
  decide: Parameters<typeof createFakeInspector>[0]['decide']
  supportsURLInput?: boolean
}) {
  const inspector = createFakeInspector({
    decide: options.decide,
    supportsURLInput: options.supportsURLInput
  })
  const fetcher = createFakeFetcher({
    [URL]: { bytes: PNG_BYTES, contentType: 'image/png' }
  })
  const verifier = new ImageVisionVerifier({ inspector, fetcher })
  return { verifier, inspector, fetcher }
}

describe('ImageVisionVerifier', () => {
  test('approves an image the vision model accepted', async () => {
    const { verifier, inspector } = createVerifier({ decide: () => approveVerdict() })
    const outcome = await verifier.verify(createAsset({ url: URL }), { intent: intent() })

    expect(outcome.verified).toBe(true)
    expect(outcome.record?.relevanceScore).toBe(0.95)
    expect(inspector.calls).toHaveLength(1)
    expect(inspector.calls[0]?.data).toEqual(PNG_BYTES)
    expect(outcome.mimeType).toBe('image/png')
  })

  test('the imported bytes are exactly the inspected bytes', async () => {
    const { verifier } = createVerifier({ decide: () => approveVerdict() })
    const outcome = await verifier.verify(createAsset({ url: URL }), { intent: intent() })

    const importedHash = await contentHash(outcome.bytes as Uint8Array)
    expect(outcome.record?.assetContentHash).toBe(importedHash)
    expect(outcome.record?.inspectedContentHash).toBe(importedHash)
  })

  test('rejects an irrelevant image even when title and tags match', async () => {
    const { verifier } = createVerifier({
      decide: () =>
        approveVerdict({
          approved: false,
          relevanceScore: 0.2,
          failedRequirements: ['subject'],
          reason: 'The image shows a cat, not a city skyline'
        })
    })
    const outcome = await verifier.verify(
      createAsset({ url: URL, title: 'city skyline', description: 'city skyline photo' }),
      { intent: intent() }
    )

    expect(outcome.verified).toBe(false)
    expect(outcome.reason).toContain('Mandatory requirements failed')
    expect(outcome.reason).toContain('subject')
  })

  test('rejects when a mandatory requirement failed despite a high score', async () => {
    const { verifier } = createVerifier({
      decide: () =>
        approveVerdict({
          relevanceScore: 0.99,
          failedRequirements: ['style'],
          reason: 'This is a photograph, not a flat vector illustration'
        })
    })
    const outcome = await verifier.verify(createAsset({ url: URL }), {
      intent: intent({ style: 'flat_2d_vector' })
    })
    expect(outcome.verified).toBe(false)
    expect(outcome.reason).toContain('style')
  })

  test('rejects when the score is below the threshold', async () => {
    const { verifier } = createVerifier({
      decide: () => approveVerdict({ relevanceScore: 0.4 })
    })
    const outcome = await verifier.verify(createAsset({ url: URL }), {
      intent: intent(),
      threshold: 0.7
    })
    expect(outcome.verified).toBe(false)
    expect(outcome.reason).toMatch(/below the 0.7 threshold/)
  })

  test('treats a vision failure as not verified', async () => {
    const { verifier } = createVerifier({
      decide: () => {
        throw new Error('the vision model timed out')
      }
    })
    const outcome = await verifier.verify(createAsset({ url: URL }), { intent: intent() })
    expect(outcome.verified).toBe(false)
    expect(outcome.reason).toContain('Vision inspection failed')
  })

  test('treats a malformed verdict as not verified', async () => {
    const { verifier } = createVerifier({
      decide: () => ({ approved: 'yes' }) as never
    })
    const outcome = await verifier.verify(createAsset({ url: URL }), { intent: intent() })
    expect(outcome.verified).toBe(false)
    expect(outcome.reason).toContain('unusable result')
  })

  test('reuses a cached decision for the same content and requirements', async () => {
    const { verifier, inspector } = createVerifier({ decide: () => approveVerdict() })
    const asset = createAsset({ url: URL })

    const first = await verifier.verify(asset, { intent: intent() })
    const second = await verifier.verify(asset, { intent: intent() })

    expect(first.verified).toBe(true)
    expect(second.verified).toBe(true)
    expect(inspector.calls).toHaveLength(1)
  })

  test('inspects again when the requirements changed', async () => {
    const { verifier, inspector } = createVerifier({ decide: () => approveVerdict() })
    const asset = createAsset({ url: URL })

    await verifier.verify(asset, { intent: intent() })
    await verifier.verify(asset, { intent: intent({ style: 'illustration' }) })

    expect(inspector.calls).toHaveLength(2)
  })

  test('inspects again when the content changed', async () => {
    const { inspector } = createVerifier({ decide: () => approveVerdict() })
    const otherURL = 'https://cdn.example.com/other.png'
    const fetcher = createFakeFetcher({
      [URL]: { bytes: PNG_BYTES, contentType: 'image/png' },
      [otherURL]: { bytes: new Uint8Array([1, 2, 3, 4]), contentType: 'image/png' }
    })
    const inspectorWithCalls = createFakeInspector({ decide: () => approveVerdict() })
    const verifierWithCache = new ImageVisionVerifier({
      inspector: inspectorWithCalls,
      fetcher
    })

    await verifierWithCache.verify(createAsset({ url: URL }), { intent: intent() })
    await verifierWithCache.verify(createAsset({ url: otherURL, id: 'asset-2' }), {
      intent: intent()
    })

    expect(inspectorWithCalls.calls).toHaveLength(2)
    expect(inspector.calls).toHaveLength(0)
  })

  test('passes the url to the model when url input is supported', async () => {
    const { verifier, inspector } = createVerifier({
      decide: () => approveVerdict(),
      supportsURLInput: true
    })
    const outcome = await verifier.verify(createAsset({ url: URL }), { intent: intent() })

    expect(outcome.verified).toBe(true)
    expect(inspector.calls[0]?.url).toBe(URL)
    expect(inspector.calls[0]?.data).toBeUndefined()
    expect(outcome.record?.inspectedVia).toBe('url')
  })

  test('downloads the bytes when url input is unsupported', async () => {
    const { verifier, inspector } = createVerifier({ decide: () => approveVerdict() })
    const outcome = await verifier.verify(createAsset({ url: URL }), { intent: intent() })

    expect(inspector.calls[0]?.data).toEqual(PNG_BYTES)
    expect(inspector.calls[0]?.url).toBeUndefined()
    expect(outcome.record?.inspectedVia).toBe('bytes')
  })

  test('keeps a good image whose framing differs from the slot', async () => {
    const { verifier } = createVerifier({
      decide: () =>
        approveVerdict({
          relevanceScore: 0.82,
          failedRequirements: ['orientation'],
          reason: 'The photo is landscape, the slot is portrait'
        })
    })

    const outcome = await verifier.verify(createAsset({ url: URL }), {
      intent: intent({ orientation: 'portrait' })
    })

    expect(outcome.verified).toBe(true)
  })

  test('asks the model about the subject, not the wording of the request', () => {
    const requirements = buildVisionRequirements(intent({ subject: 'coffee beans' }))

    expect(requirements.find((requirement) => requirement.id === 'subject')?.mandatory).toBe(true)
    expect(requirements.find((requirement) => requirement.id === 'orientation')?.mandatory).toBe(
      false
    )
    expect(buildVerificationPrompt(intent(), requirements)).toContain('cropped to fit the slot')
  })

  test('rejects a license that forbids commercial use', async () => {
    const { verifier, inspector } = createVerifier({ decide: () => approveVerdict() })
    const outcome = await verifier.verify(
      createAsset({ url: URL, license: 'CC BY-NC', commercialUse: false }),
      { intent: intent() }
    )
    expect(outcome.verified).toBe(false)
    expect(outcome.reason).toMatch(/commercial use/)
    expect(inspector.calls).toHaveLength(0)
  })

  test('sanitizes and rasterizes an svg before inspecting it', async () => {
    const dirtySVG =
      '<svg xmlns="http://www.w3.org/2000/svg" onload="alert(1)"><script>alert(2)</script><rect width="10" height="10" fill="#fff"/></svg>'
    const svgURL = 'https://cdn.example.com/a.svg'
    const inspector = createFakeInspector({ decide: () => approveVerdict() })
    const verifier = new ImageVisionVerifier({
      inspector,
      fetcher: createFakeFetcher({
        [svgURL]: { bytes: new TextEncoder().encode(dirtySVG), contentType: 'image/svg+xml' }
      }),
      rasterizer: {
        async rasterize(svg) {
          expect(svg).not.toContain('<script')
          expect(svg).not.toContain('onload')
          return { bytes: PNG_BYTES, mediaType: 'image/png' }
        }
      }
    })

    const outcome = await verifier.verify(
      createAsset({ url: svgURL, kind: 'svg', mimeType: 'image/svg+xml' }),
      { intent: intent() }
    )

    expect(outcome.verified).toBe(true)
    expect(outcome.svg).toBeDefined()
    expect(outcome.svg).not.toContain('<script')
    // The model inspected the rendered preview, the import keeps the vector.
    expect(inspector.calls[0]?.mediaType).toBe('image/png')
    expect(outcome.mimeType).toBe('image/svg+xml')
  })

  test('cannot verify an svg without a rasterizer', async () => {
    const { verifier } = createVerifier({ decide: () => approveVerdict() })
    const outcome = await verifier.verify(
      createAsset({
        url: 'open-pencil://local/coffee-cup.svg',
        kind: 'svg',
        mimeType: 'image/svg+xml',
        inlineSource: '<svg xmlns="http://www.w3.org/2000/svg"><rect width="1" height="1"/></svg>'
      }),
      { intent: intent() }
    )
    expect(outcome.verified).toBe(false)
    expect(outcome.reason).toMatch(/rasterizer/i)
  })
})
