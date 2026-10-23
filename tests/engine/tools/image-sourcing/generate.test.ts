import { describe, expect, test } from 'bun:test'

import {
  buildGenerationPrompt,
  generateAndVerify,
  ImageVisionVerifier,
  refineGenerationPrompt,
  type GeneratedImageProvider,
  type VisualIntent
} from '@open-pencil/core/tools'

import {
  approveVerdict,
  createFakeFetcher,
  createFakeInspector,
  PNG_BYTES
} from '#tests/helpers/image-sourcing'

function intent(overrides: Partial<VisualIntent> = {}): VisualIntent {
  return {
    subject: 'flat illustration of a fox reading',
    style: 'flat_2d_vector',
    palette: 'warm autumn',
    orientation: 'landscape',
    requiresTransparency: false,
    requiresNegativeSpace: false,
    textInImage: false,
    exclusions: ['no photographs'],
    brandSpecific: false,
    appMockup: false,
    query: 'fox reading',
    ...overrides
  }
}

function createGenerator(prompts: string[]): GeneratedImageProvider & { prompts: string[] } {
  const recorded: string[] = []
  return {
    name: 'test-image-model',
    prompts: recorded,
    async generate({ prompt }) {
      recorded.push(prompt)
      return new Uint8Array([...PNG_BYTES, prompts.length])
    }
  }
}

function createVerifier(decide: Parameters<typeof createFakeInspector>[0]['decide']) {
  const inspector = createFakeInspector({ decide })
  const verifier = new ImageVisionVerifier({
    inspector,
    fetcher: createFakeFetcher({
      'generated://test-image-model/1': { bytes: PNG_BYTES, contentType: 'image/png' },
      'generated://test-image-model/2': { bytes: PNG_BYTES, contentType: 'image/png' },
      'generated://test-image-model/3': { bytes: PNG_BYTES, contentType: 'image/png' }
    })
  })
  return { verifier, inspector }
}

describe('buildGenerationPrompt', () => {
  test('includes the subject, style, palette and negative constraints', () => {
    const prompt = buildGenerationPrompt(intent())
    expect(prompt).toContain('flat illustration of a fox reading')
    expect(prompt).toContain('flat 2d vector')
    expect(prompt).toContain('warm autumn')
    expect(prompt).toContain('landscape')
    expect(prompt).toContain('no text')
    expect(prompt).toContain('no photographs')
  })

  test('mentions transparency and reserved space when they are required', () => {
    const prompt = buildGenerationPrompt(
      intent({ requiresTransparency: true, requiresNegativeSpace: true })
    )
    expect(prompt).toContain('transparent background')
    expect(prompt).toContain('empty space for text')
  })
})

describe('refineGenerationPrompt', () => {
  test('refines the prompt from the failed requirements', () => {
    const refined = refineGenerationPrompt('a fox', intent(), ['style', 'no-unwanted-text'])
    expect(refined).toContain('not a photograph')
    expect(refined).toContain('free of any text')
  })

  test('keeps the prompt when nothing failed', () => {
    expect(refineGenerationPrompt('a fox', intent(), ['palette'])).toBe('a fox')
  })
})

describe('generateAndVerify', () => {
  test('returns the verified image with its provenance', async () => {
    const { verifier } = createVerifier(() => approveVerdict())
    const generator = createGenerator([])

    const outcome = await generateAndVerify({
      intent: intent(),
      verifier,
      provider: generator
    })

    expect(outcome.state).toBe('verified_generated')
    expect(outcome.bytes?.byteLength).toBe(PNG_BYTES.byteLength + 1)
    expect(outcome.provenance?.origin).toBe('ai-generated')
    expect(outcome.provenance?.provider).toBe('test-image-model')
    expect(outcome.provenance?.attempts).toBe(1)
    expect(outcome.provenance?.contentHash).toBe(outcome.provenance?.verification.assetContentHash)
    expect(outcome.provenance?.prompt).toContain('fox')
  })

  test('regenerates with a refined prompt when the image is rejected', async () => {
    let call = 0
    const { verifier } = createVerifier(() => {
      call++
      return call === 1
        ? approveVerdict({ approved: false, relevanceScore: 0.2, failedRequirements: ['style'] })
        : approveVerdict()
    })
    const generator = createGenerator([])

    const outcome = await generateAndVerify({ intent: intent(), verifier, provider: generator })

    expect(outcome.state).toBe('verified_generated')
    expect(outcome.attempts).toBe(2)
    expect(generator.prompts).toHaveLength(2)
    expect(generator.prompts[1]).not.toBe(generator.prompts[0])
    expect(generator.prompts[1]).toContain('not a photograph')
  })

  test('gives up with no_verified_match after the attempt budget', async () => {
    const { verifier } = createVerifier(() =>
      approveVerdict({ approved: false, relevanceScore: 0.1, failedRequirements: ['subject'] })
    )
    const generator = createGenerator([])

    const outcome = await generateAndVerify({
      intent: intent(),
      verifier,
      provider: generator,
      attempts: 3
    })

    expect(outcome.state).toBe('no_verified_match')
    expect(outcome.attempts).toBe(3)
    expect(generator.prompts).toHaveLength(3)
    expect(outcome.bytes).toBeUndefined()
  })

  test('reports a provider failure', async () => {
    const { verifier } = createVerifier(() => approveVerdict())
    const provider: GeneratedImageProvider = {
      name: 'broken',
      async generate() {
        throw new Error('content policy violation')
      }
    }

    const outcome = await generateAndVerify({ intent: intent(), verifier, provider, attempts: 2 })
    expect(outcome.state).toBe('no_verified_match')
    expect(outcome.reason).toContain('content policy')
  })

  test('stops when the time budget is exhausted', async () => {
    const { verifier } = createVerifier(() => approveVerdict())
    const generator = createGenerator([])
    let clock = 0

    const outcome = await generateAndVerify({
      intent: intent(),
      verifier,
      provider: generator,
      maxDurationMs: 10,
      now: () => {
        clock += 1000
        return clock
      }
    })

    expect(outcome.state).toBe('no_verified_match')
    expect(outcome.reason).toContain('time budget')
  })
})
