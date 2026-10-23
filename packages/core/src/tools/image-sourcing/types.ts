/**
 * Shared vocabulary for the smart image sourcing pipeline.
 *
 * Every provider result is normalized into {@link ImageAsset}, every routing
 * outcome into {@link RouteDecision}, and every vision inspection into
 * {@link VisionVerdict}. Metadata is only ever used for filtering and ranking —
 * the only thing that can approve an asset is a vision verdict over the real
 * pixels (see `verifier.ts`).
 */

/** Visual style bucket extracted from the design request. */
export type ImageVisualStyle =
  | 'photo'
  | 'flat_2d_vector'
  | 'cartoon'
  | 'illustration'
  | 'icon'
  | 'abstract'
  | 'other'

export type ImageOrientation = 'landscape' | 'portrait' | 'square'

/** Whether an asset is a raster image or a vector document. */
export type ImageAssetKind = 'raster' | 'svg' | 'unknown'

/**
 * One normalized candidate image.
 *
 * Fields beyond the id/provider/url triple are optional because providers
 * report them inconsistently; the pipeline must work with partial metadata.
 */
export interface ImageAsset {
  /** Provider-scoped identifier, unique inside the provider. */
  id: string
  /** Provider name, e.g. `openverse`, `wikimedia`, `pexels`, `local`. */
  provider: string
  /** Original asset URL used for downloading and hashing. */
  url: string
  /** Lower resolution preview, used for cheap inspection when it is enough. */
  thumbnailUrl?: string
  /**
   * Inline source for bundled assets, e.g. a local SVG. When present the
   * pipeline never downloads the asset.
   */
  inlineSource?: string
  /**
   * Inline bytes for assets that were produced locally, e.g. a generated
   * image. When present the pipeline never downloads the asset.
   */
  inlineBytes?: Uint8Array
  title?: string
  description?: string
  mimeType?: string
  width?: number
  height?: number
  fileSize?: number
  creator?: string
  /** Human readable page describing the asset and its license. */
  sourcePage?: string
  license?: string
  licenseUrl?: string
  /** Ready-to-use attribution line that must travel with the asset. */
  attribution?: string
  usageRestrictions?: string
  /** Whether commercial use is permitted by the reported license. */
  commercialUse: boolean
  /** Whether derivatives are permitted by the reported license. */
  modificationAllowed: boolean
  /** Whether the license requires crediting the creator. */
  requiresAttribution: boolean
  kind: ImageAssetKind
}

/** Options every provider honours when it can. */
export interface ImageAssetSearchOptions {
  /** Maximum number of results the provider may return. */
  limit: number
  orientation?: ImageOrientation
  /** Target width / height ratio. */
  aspectRatio?: number
  /** Include licenses that forbid commercial use. */
  allowNonCommercial: boolean
  /** Require licenses that allow derivatives. */
  requireModification: boolean
}

export interface ImageAssetProvider {
  name: string
  /** Providers without credentials are simply skipped, never failed. */
  isConfigured(): boolean
  search(query: string, options: ImageAssetSearchOptions): Promise<ImageAsset[]>
}

/** Structured visual intent for a single image slot in a design. */
export interface VisualIntent {
  /** Main subject of the image, e.g. `city skyline`. */
  subject: string
  /** What the subject is doing, e.g. `crossing a street`. */
  action?: string
  style: ImageVisualStyle
  /** Colour palette description, e.g. `warm orange and teal`. */
  palette?: string
  mood?: string
  orientation?: ImageOrientation
  /** Width / height ratio requested for the slot. */
  aspectRatio?: number
  /** Where the image sits in the UI, e.g. `hero banner`. */
  placement?: string
  /** The slot needs a transparent background. */
  requiresTransparency: boolean
  /** The slot needs empty space reserved for UI text. */
  requiresNegativeSpace: boolean
  /** The image itself must contain rendered text. */
  textInImage: boolean
  /** Explicit exclusions, e.g. `no photographs`. */
  exclusions: string[]
  /** The image is tied to a specific brand or product. */
  brandSpecific: boolean
  /** The image is a mockup of this product's own UI or device. */
  appMockup: boolean
  /** Shared style key so several slots keep one consistent look. */
  styleGroup?: string
  /** Search query derived from the intent. */
  query: string
}

/** Which path the pipeline takes for one image slot. */
export type ImageRoute = 'search' | 'probe_then_generate' | 'generate'

export interface RouteDecision {
  route: ImageRoute
  /** 0..1 confidence in the decision. */
  confidence: number
  /** Human readable justification, logged for debugging. */
  reason: string
  /** Individual signals that produced the decision. */
  signals: string[]
}

/** User overrides and project history that constrain the routing decision. */
export interface RouteContext {
  /** The user explicitly asked for a stock/photo search. */
  forceSearch?: boolean
  /** The user explicitly asked to create the image. */
  forceGenerate?: boolean
  /** The user forbade generation, e.g. "do not generate". */
  disallowGeneration?: boolean
  /** A previous identical request in this project failed to find a match. */
  previousSearchFailed?: boolean
}

/** Model-backed router. The app layer supplies the implementation. */
export interface RouteDecider {
  decide(intent: VisualIntent, context: RouteContext): Promise<RouteDecision>
}

/** A single check the vision model has to judge. */
export interface VisionRequirement {
  id: string
  text: string
  /** A violated mandatory requirement rejects the asset regardless of score. */
  mandatory: boolean
}

/** Structured answer from the vision model about the inspected pixels. */
export interface VisionVerdict {
  approved: boolean
  /** 0..1 relevance of the inspected image to the request. */
  relevanceScore: number
  /** Requirement ids that passed. */
  matchedRequirements: string[]
  /** Requirement ids that failed. */
  failedRequirements: string[]
  /** Why the asset was approved or rejected. */
  reason: string
}

export interface VisionInspectionRequest {
  /** Bytes of the asset, used when the model cannot fetch URLs. */
  data?: Uint8Array
  /** Remote URL, used when the model supports URL image input. */
  url?: string
  mediaType: string
  /** Instructions describing what the model has to judge. */
  prompt: string
}

/** The narrow contract Core needs from a vision-capable model. */
export interface VisionInspector {
  /** Whether the model accepts a remote URL instead of bytes. */
  readonly supportsURLInput: boolean
  inspect(request: VisionInspectionRequest): Promise<VisionVerdict>
}

/** Proof that an exact byte sequence was inspected and approved. */
export interface VerificationRecord {
  /** Hash of the bytes that will be imported. */
  assetContentHash: string
  /** Hash of the bytes the model actually saw. */
  inspectedContentHash: string
  relevanceScore: number
  matchedRequirements: string[]
  failedRequirements: string[]
  reason: string
  /** Whether the model saw the URL or the downloaded bytes. */
  inspectedVia: 'url' | 'bytes'
  verifiedAt: number
}

/** Where an imported asset came from. */
export type AssetOrigin = 'search' | 'local' | 'ai-generated'

/** Debugging metadata attached to every imported asset. */
export interface AssetProvenance {
  origin: AssetOrigin
  provider: string
  /** Model id used for generation. */
  model?: string
  /** Final generation prompt. */
  prompt?: string
  /** Generation attempts consumed. */
  attempts?: number
  contentHash: string
  verification: VerificationRecord
  license?: string
  attribution?: string
  sourcePage?: string
  creator?: string
  /** Routing decision that produced this asset. */
  routing?: RouteDecision
}

/** Terminal states a single image slot can end in. */
export type ImageSourcingState =
  | 'verified_from_search'
  | 'verified_from_local'
  | 'verified_generated'
  | 'no_verified_match'
  | 'vision_unavailable_needs_user_selection'
  | 'generation_unavailable'

/** Result of sourcing one image slot. */
export interface ImageSourcingResult {
  id: string
  state: ImageSourcingState
  asset?: ImageAsset
  provenance?: AssetProvenance
  routing?: RouteDecision
  /** Why the slot failed, or which requirement rejected a candidate. */
  reason?: string
  /** Rejected candidates with the reason each one failed. */
  rejections?: Array<{ provider: string; id: string; reason: string }>
  /** True when the asset is an SVG and was imported through the vector pipeline. */
  isVector?: boolean
}

/** Search limits for one sourcing run. */
export interface SearchBudget {
  /** Maximum candidates requested per provider. */
  maxCandidatesPerProvider: number
  /** Maximum candidates inspected in total. */
  maxTotalCandidates: number
  /** Maximum query refinements after a rejection. */
  maxRefinements: number
  /** Maximum vision calls spent on search. */
  maxVisionCalls: number
  /** Wall clock budget for the whole search, in milliseconds. */
  maxDurationMs: number
  /** Time a single provider may take before it is given up on. */
  providerTimeoutMs: number
}

export const DEFAULT_SEARCH_BUDGET: SearchBudget = {
  maxCandidatesPerProvider: 8,
  maxTotalCandidates: 20,
  maxRefinements: 2,
  maxVisionCalls: 6,
  maxDurationMs: 20_000,
  providerTimeoutMs: 8_000
}

/** Minimum relevance score a candidate must reach to be approved. */
export const DEFAULT_VERIFICATION_THRESHOLD = 0.7

/** Maximum number of candidates inspected in one concurrent batch. */
export const VISION_BATCH_SIZE = 3

/** Default number of generation attempts before giving up. */
export const DEFAULT_GENERATION_ATTEMPTS = 3
