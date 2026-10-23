/**
 * Smart image sourcing: route, search, verify, generate.
 *
 * The pipeline lives in Core so the CLI, the MCP server and the editor all
 * share one implementation. The app layer injects the vision model, the router
 * model and the image generator through `registerImageSourcingServices`.
 */

export { applySourcedImage, resizeSVGSource } from './apply'
export type { ApplySourcedImageOptions, ApplySourcedImageResult } from './apply'
export { contentHash } from './hash'
export {
  createAssetFetcher,
  sniffImageContentType,
  DEFAULT_ASSET_TIMEOUT_MS,
  DEFAULT_MAX_ASSET_BYTES
} from './fetch-asset'
export type { AssetFetcher, AssetFetchOptions, AssetFetchResult, FetchLike } from './fetch-asset'
export { buildGenerationPrompt, generateAndVerify, refineGenerationPrompt } from './generate'
export type { GenerateOptions, GenerateOutcome, GenerateState } from './generate'
export { createLocalAssetProvider, getLocalAssetSVG, listLocalAssets } from './providers/local'
export { createOpenverseProvider, OPENVERSE_USER_AGENT } from './providers/openverse'
export { createPexelsAssetProvider, PEXELS_LICENSE } from './providers/pexels'
export {
  clearImageAssetProviders,
  getEligibleImageAssetProviders,
  getImageAssetProvider,
  getImageAssetProviders,
  registerImageAssetProvider,
  searchImageAssetProviders
} from './providers/registry'
export type { ProviderSearchOutcome } from './providers/registry'
export { createWikimediaProvider, WIKIMEDIA_USER_AGENT } from './providers/wikimedia'
export { parseSourceRequests } from './requests'
export type { SourceImageRequest } from './requests'
export {
  clearRoutingLog,
  collectGenerateSignals,
  decideRoute,
  getRoutingLog,
  heuristicRouteDecision,
  routingCacheKey,
  RoutingCache,
  GENERATE_SIGNAL_THRESHOLD,
  ROUTING_CACHE_TTL_MS
} from './router'
export type { RouteOptions, RoutingLogEntry } from './router'
export {
  canonicalizeURL,
  isAllowedImageContentType,
  isPrivateHostname,
  looksLikeSVG,
  sanitizeSVG,
  validateRemoteURL,
  ALLOWED_IMAGE_CONTENT_TYPES,
  MAX_REDIRECTS
} from './safety'
export { broadenQuery, refineQuery } from './query'
export { dedupeAssets, passesMetadataFilters, scoreAsset } from './ranking'
export { searchAndVerify } from './search'
export type { SearchOptions, SearchOutcome, SearchRejection } from './search'
export { getImageSourcingServices, registerImageSourcingServices } from './services'
export { PROBE_BUDGET, sourceImageAsset } from './source'
export type { ImageSourcingServices } from './source'
export {
  buildVerificationPrompt,
  buildVisionRequirements,
  ImageVisionVerifier,
  parseVisionVerdict,
  VerificationCache,
  DEFAULT_LICENSE_POLICY
} from './verifier'
export type {
  LicensePolicy,
  SVGRasterizer,
  VerificationOutcome,
  VerifierDependencies,
  VerifyOptions
} from './verifier'
export {
  DEFAULT_GENERATION_ATTEMPTS,
  DEFAULT_SEARCH_BUDGET,
  DEFAULT_VERIFICATION_THRESHOLD,
  VISION_BATCH_SIZE
} from './types'
export type {
  AssetOrigin,
  AssetProvenance,
  ImageAsset,
  ImageAssetKind,
  ImageAssetProvider,
  ImageAssetSearchOptions,
  ImageOrientation,
  ImageRoute,
  ImageSourcingResult,
  ImageSourcingState,
  ImageVisualStyle,
  RouteContext,
  RouteDecision,
  RouteDecider,
  SearchBudget,
  VerificationRecord,
  VisionInspectionRequest,
  VisionInspector,
  VisionRequirement,
  VisionVerdict,
  VisualIntent
} from './types'
