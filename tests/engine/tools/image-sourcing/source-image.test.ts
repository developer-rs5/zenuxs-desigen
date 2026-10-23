import { afterEach, describe, expect, test } from 'bun:test'

import { FigmaAPI, SceneGraph } from '@open-pencil/core'
import {
  ImageVisionVerifier,
  registerImageSourcingServices,
  sourceImageAsset,
  type GeneratedImageProvider,
  type ImageSourcingServices,
  type ImageSourcingState
} from '@open-pencil/core/tools'

import {
  approveVerdict,
  createAsset,
  createFakeFetcher,
  createFakeInspector,
  createFakeProvider,
  PNG_BYTES
} from '#tests/helpers/image-sourcing'

const ASSET_URL = 'https://cdn.example.com/asset.png'

/** The result shape the `source_image` tool reports. */
interface SourcingToolResult {
  applied: number
  failed: number
  error?: string
  results: Array<{
    state: ImageSourcingState
    reason?: string
    isVector?: boolean
    rejections?: unknown[]
    routing?: { route: string; reason: string }
    provenance?: { license?: string; attribution?: string; sourcePage?: string }
  }>
}

function setup() {
  const graph = new SceneGraph()
  const page = graph.getPages()[0]
  if (!page) throw new Error('Expected a default page')
  const figma = new FigmaAPI(graph)
  const node = graph.createNode('RECTANGLE', page.id, {
    name: 'HeroImg',
    width: 400,
    height: 300
  })
  return { graph, page, figma, node }
}

interface Harness {
  services: ImageSourcingServices
  provider: ReturnType<typeof createFakeProvider>
  generator: GeneratedImageProvider & { prompts: string[] }
  inspector: ReturnType<typeof createFakeInspector>
}

function createHarness(options: {
  decide?: Parameters<typeof createFakeInspector>[0]['decide']
  assets?: ReturnType<typeof createAsset>[]
  providerFails?: boolean
  withGenerator?: boolean
  withVision?: boolean
  noResults?: boolean
  withRasterizer?: boolean
}): Harness {
  const decide = options.decide ?? (() => approveVerdict())
  const inspector = createFakeInspector({ decide })
  const fetcher = createFakeFetcher({
    [ASSET_URL]: { bytes: PNG_BYTES, contentType: 'image/png' }
  })
  const provider = createFakeProvider(
    'test-provider',
    options.noResults ? [] : (options.assets ?? [createAsset({ url: ASSET_URL })]),
    { fail: options.providerFails }
  )
  const prompts: string[] = []
  const generator: GeneratedImageProvider & { prompts: string[] } = {
    name: 'test-image-model',
    prompts,
    async generate({ prompt }) {
      prompts.push(prompt)
      return new Uint8Array([...PNG_BYTES, prompts.length])
    }
  }
  const services: ImageSourcingServices = {
    verifier: new ImageVisionVerifier({
      inspector: options.withVision === false ? undefined : inspector,
      fetcher,
      rasterizer: options.withRasterizer
        ? {
            async rasterize() {
              return { bytes: PNG_BYTES, mediaType: 'image/png' }
            }
          }
        : undefined
    }),
    decider: null,
    generator: options.withGenerator === false ? null : generator,
    providers: [provider]
  }
  return { services, provider, generator, inspector }
}

afterEach(() => {
  registerImageSourcingServices(null)
})

describe('source_image tool', () => {
  test('is exported but absent from the static tool registry', async () => {
    const { ALL_TOOLS } = await import('@open-pencil/core')
    const { sourceImage: tool } = await import('@open-pencil/core/tools')
    expect(ALL_TOOLS.some((entry) => entry.name === 'source_image')).toBe(false)
    expect(tool.name).toBe('source_image')
    expect(tool.mutates).toBe(true)
  })

  test('reports an honest error when no services are registered', async () => {
    const { sourceImage: tool } = await import('@open-pencil/core/tools')
    const { figma, node } = setup()
    const result = (await tool.execute(figma, {
      requests: JSON.stringify([{ id: node.id, subject: 'city skyline' }])
    })) as SourcingToolResult
    expect(result.error).toContain('Vision model')
  })

  test('sources a common subject from the search providers', async () => {
    const { sourceImage: tool } = await import('@open-pencil/core/tools')
    const { services, provider } = createHarness({})
    registerImageSourcingServices(services)
    const { graph, figma, node } = setup()

    const result = (await tool.execute(figma, {
      requests: JSON.stringify([{ id: node.id, subject: 'city skyline', style: 'photo' }])
    })) as SourcingToolResult

    expect(result.applied).toBe(1)
    expect(result.failed).toBe(0)
    expect(result.results[0]?.state).toBe('verified_from_search')
    expect(provider.calls.length).toBeGreaterThan(0)
    // The verified bytes reached the document as an image fill.
    expect(node.fills[0]?.type).toBe('IMAGE')
    expect(graph.images.size).toBe(1)
  })

  test('generates a custom subject without calling any provider', async () => {
    const { sourceImage: tool } = await import('@open-pencil/core/tools')
    const { services, provider, generator } = createHarness({})
    registerImageSourcingServices(services)
    const { figma, node } = setup()

    const result = (await tool.execute(figma, {
      requests: JSON.stringify([
        {
          id: node.id,
          subject: 'our brand mascot illustration',
          style: 'flat_2d_vector',
          brand_specific: true,
          transparent: true
        }
      ])
    })) as SourcingToolResult

    expect(result.applied).toBe(1)
    expect(result.results[0]?.state).toBe('verified_generated')
    // The whole point of the router: no search happened at all.
    expect(provider.calls).toHaveLength(0)
    expect(generator.prompts).toHaveLength(1)
    expect(node.fills[0]?.type).toBe('IMAGE')
  })

  test('probes once and then generates for an ambiguous subject', async () => {
    const { sourceImage: tool } = await import('@open-pencil/core/tools')
    const { services, provider, generator } = createHarness({ noResults: true })
    registerImageSourcingServices(services)
    const { figma, node } = setup()

    const result = (await tool.execute(figma, {
      requests: JSON.stringify([
        { id: node.id, subject: 'a fox reading', style: 'illustration', text_in_image: true }
      ])
    })) as SourcingToolResult

    expect(result.applied).toBe(1)
    expect(result.results[0]?.state).toBe('verified_generated')
    expect(result.results[0]?.routing?.route).toBe('probe_then_generate')
    // Exactly one probe round, then the generation fallback.
    expect(provider.calls).toHaveLength(1)
    expect(generator.prompts).toHaveLength(1)
  })

  test('falls back to generation when the search returns nothing', async () => {
    const { sourceImage: tool } = await import('@open-pencil/core/tools')
    const { services, generator } = createHarness({ noResults: true })
    registerImageSourcingServices(services)
    const { figma, node } = setup()

    const result = (await tool.execute(figma, {
      requests: JSON.stringify([{ id: node.id, subject: 'city skyline' }])
    })) as SourcingToolResult

    expect(result.applied).toBe(1)
    expect(result.results[0]?.state).toBe('verified_generated')
    expect(generator.prompts).toHaveLength(1)
  })

  test('falls back to generation when a provider fails', async () => {
    const { sourceImage: tool } = await import('@open-pencil/core/tools')
    const { services, generator } = createHarness({ providerFails: true })
    registerImageSourcingServices(services)
    const { figma, node } = setup()

    const result = (await tool.execute(figma, {
      requests: JSON.stringify([{ id: node.id, subject: 'city skyline' }])
    })) as SourcingToolResult

    expect(result.results[0]?.state).toBe('verified_generated')
    expect(generator.prompts).toHaveLength(1)
  })

  test('falls back to generation when every candidate is rejected', async () => {
    const { sourceImage: tool } = await import('@open-pencil/core/tools')
    let inspections = 0
    const { services, generator } = createHarness({
      decide: () => {
        inspections++
        // The searched candidate is rejected, the generated one is approved.
        return inspections === 1
          ? approveVerdict({
              approved: false,
              relevanceScore: 0.1,
              failedRequirements: ['subject']
            })
          : approveVerdict()
      }
    })
    registerImageSourcingServices(services)
    const { figma, node } = setup()

    const result = (await tool.execute(figma, {
      requests: JSON.stringify([{ id: node.id, subject: 'city skyline' }])
    })) as SourcingToolResult

    expect(result.results[0]?.state).toBe('verified_generated')
    expect(result.results[0]?.rejections?.length).toBeGreaterThan(0)
    expect(generator.prompts).toHaveLength(1)
  })

  test('reports that generation is unavailable instead of importing an unverified image', async () => {
    const { sourceImage: tool } = await import('@open-pencil/core/tools')
    const { services } = createHarness({ noResults: true, withGenerator: false })
    registerImageSourcingServices(services)
    const { graph, figma, node } = setup()

    const result = (await tool.execute(figma, {
      requests: JSON.stringify([{ id: node.id, subject: 'city skyline' }])
    })) as SourcingToolResult

    expect(result.applied).toBe(0)
    expect(result.failed).toBe(1)
    expect(result.results[0]?.state).toBe('generation_unavailable')
    // Nothing was written to the document.
    expect(node.fills[0]?.type).not.toBe('IMAGE')
    expect(graph.images.size).toBe(0)
  })

  test('reports the honest state when no vision model is available', async () => {
    const { sourceImage: tool } = await import('@open-pencil/core/tools')
    const { services } = createHarness({ withVision: false })
    registerImageSourcingServices(services)
    const { graph, figma, node } = setup()

    const result = (await tool.execute(figma, {
      requests: JSON.stringify([{ id: node.id, subject: 'city skyline' }])
    })) as SourcingToolResult

    expect(result.applied).toBe(0)
    expect(result.results[0]?.state).toBe('vision_unavailable_needs_user_selection')
    expect(graph.images.size).toBe(0)
  })

  test('never generates when the user forbids it', async () => {
    const { sourceImage: tool } = await import('@open-pencil/core/tools')
    const { services, generator } = createHarness({ noResults: true })
    registerImageSourcingServices(services)
    const { graph, figma, node } = setup()

    const result = (await tool.execute(figma, {
      requests: JSON.stringify([{ id: node.id, subject: 'city skyline', do_not_generate: true }])
    })) as SourcingToolResult

    expect(result.applied).toBe(0)
    expect(result.results[0]?.state).toBe('no_verified_match')
    expect(result.results[0]?.reason).toContain('generation is not allowed')
    expect(generator.prompts).toHaveLength(0)
    expect(graph.images.size).toBe(0)
  })

  test('keeps the license and attribution of a found asset', async () => {
    const { sourceImage: tool } = await import('@open-pencil/core/tools')
    const { services } = createHarness({
      assets: [
        createAsset({
          url: ASSET_URL,
          license: 'CC BY 2.0',
          attribution: 'Photo by Someone',
          creator: 'Someone',
          sourcePage: 'https://example.com/photo'
        })
      ]
    })
    registerImageSourcingServices(services)
    const { figma, node } = setup()

    const result = (await tool.execute(figma, {
      requests: JSON.stringify([{ id: node.id, subject: 'city skyline' }])
    })) as SourcingToolResult

    expect(result.results[0]?.provenance?.license).toBe('CC BY 2.0')
    expect(result.results[0]?.provenance?.attribution).toBe('Photo by Someone')
    expect(result.results[0]?.provenance?.sourcePage).toBe('https://example.com/photo')
  })

  test('records the routing decision with every result', async () => {
    const { sourceImage: tool } = await import('@open-pencil/core/tools')
    const { services } = createHarness({})
    registerImageSourcingServices(services)
    const { figma, node } = setup()

    const result = (await tool.execute(figma, {
      requests: JSON.stringify([{ id: node.id, subject: 'city skyline' }])
    })) as SourcingToolResult

    expect(result.results[0]?.routing?.route).toBe('search')
    expect(result.results[0]?.routing?.reason).toBeTruthy()
  })

  test('uses the bundled library when the network providers are offline', async () => {
    const { sourceImage: tool } = await import('@open-pencil/core/tools')
    const { createLocalAssetProvider } = await import('@open-pencil/core/tools')
    const { services } = createHarness({ providerFails: true, withRasterizer: true })
    services.providers = [createLocalAssetProvider()]
    registerImageSourcingServices(services)
    const { graph, figma, node } = setup()

    const result = (await tool.execute(figma, {
      requests: JSON.stringify([{ id: node.id, subject: 'coffee cup' }])
    })) as SourcingToolResult

    expect(result.applied).toBe(1)
    expect(result.results[0]?.state).toBe('verified_from_local')
    expect(result.results[0]?.isVector).toBe(true)
    // The vector artwork replaced the placeholder with editable nodes.
    expect(graph.getNode(node.id)).toBeUndefined()
  })
})

describe('sourceImageAsset', () => {
  test('rejects a request without a subject', async () => {
    const { services } = createHarness({})
    const { figma, node } = setup()
    const result = await sourceImageAsset(services, figma, {
      id: node.id,
      intent: {
        subject: '',
        style: 'photo',
        requiresTransparency: false,
        requiresNegativeSpace: false,
        textInImage: false,
        exclusions: [],
        brandSpecific: false,
        appMockup: false,
        query: ''
      },
      context: {}
    })
    expect(result.state).toBe('no_verified_match')
  })
})
