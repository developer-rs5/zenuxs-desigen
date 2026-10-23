/**
 * Shared fakes for the image sourcing tests.
 *
 * The pipeline is exercised without any network: providers, the asset
 * downloader and the vision model are all injected.
 */

import type {
  AssetFetcher,
  ImageAsset,
  ImageAssetProvider,
  ImageAssetSearchOptions,
  VisionInspector,
  VisionVerdict
} from '@open-pencil/core/tools'

/** A tiny valid PNG signature — the renderer never decodes it in these tests. */
export const PNG_BYTES = new Uint8Array([
  0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x42, 0x42
])

export interface FakeFile {
  bytes: Uint8Array
  contentType: string
}

export interface FakeInspectorOptions {
  /** Decides the verdict for one inspection. */
  decide: (request: {
    data?: Uint8Array
    url?: string
    mediaType: string
    prompt: string
  }) => VisionVerdict
  supportsURLInput?: boolean
}

/** Creates a vision inspector that answers from a local function. */
export function createFakeInspector(options: FakeInspectorOptions): VisionInspector {
  const calls: Array<{ data?: Uint8Array; url?: string; mediaType: string; prompt: string }> = []
  const inspector: VisionInspector = {
    supportsURLInput: options.supportsURLInput ?? false,
    async inspect(request) {
      calls.push(request)
      return options.decide(request)
    }
  }
  return Object.assign(inspector, { calls })
}

export type InspectorWithCalls = VisionInspector & {
  calls: Array<{ data?: Uint8Array; url?: string; mediaType: string; prompt: string }>
}

/** A fetcher that serves the given files and rejects everything else. */
export function createFakeFetcher(files: Record<string, FakeFile>): AssetFetcher {
  const requests: string[] = []
  return {
    async fetch(url) {
      requests.push(url)
      const file = files[url]
      if (!file) throw new Error(`Unexpected download: ${url}`)
      return { bytes: file.bytes, contentType: file.contentType, finalUrl: url }
    },
    requests
  } as AssetFetcher & { requests: string[] }
}

export type FetcherWithRequests = AssetFetcher & { requests: string[] }

/** Creates a provider that always returns the same assets. */
export function createFakeProvider(
  name: string,
  assets: ImageAsset[],
  options: { fail?: boolean; configured?: boolean } = {}
): ImageAssetProvider & { calls: string[] } {
  const calls: string[] = []
  return {
    name,
    calls,
    isConfigured: () => options.configured ?? true,
    async search(query: string, _searchOptions: ImageAssetSearchOptions) {
      calls.push(query)
      if (options.fail) throw new Error(`${name} is unavailable`)
      return assets
    }
  }
}

/** Builds a normalized asset with sensible defaults. */
export function createAsset(overrides: Partial<ImageAsset> = {}): ImageAsset {
  return {
    id: 'asset-1',
    provider: 'test',
    url: 'https://cdn.example.com/asset-1.png',
    title: 'Asset one',
    mimeType: 'image/png',
    width: 1200,
    height: 800,
    commercialUse: true,
    modificationAllowed: true,
    requiresAttribution: false,
    kind: 'raster',
    ...overrides
  }
}

/** A verdict that approves everything. */
export function approveVerdict(overrides: Partial<VisionVerdict> = {}): VisionVerdict {
  return {
    approved: true,
    relevanceScore: 0.95,
    matchedRequirements: ['subject', 'style'],
    failedRequirements: [],
    reason: 'The image matches the request',
    ...overrides
  }
}
