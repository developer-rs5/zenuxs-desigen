import codegenPrompt from './prompts/codegen.md?raw'

export { getComponentCatalog, registerComponentCatalog } from './component-catalog'
export type {
  ComponentCatalog,
  ComponentCatalogInsertInput,
  ComponentCatalogLibraryAsset
} from './component-catalog'
export { ALL_TOOLS, CORE_TOOLS, EXTENDED_TOOLS } from './registry'
export { PROTOTYPE_TOOLS } from './prototype'
export const CODEGEN_PROMPT: string = codegenPrompt
export { exportImage } from './vector'
export {
  defineTool,
  nodeToResult,
  nodeSummary,
  requireNode,
  NodeNotFoundError,
  toolChangesDocument
} from './schema'
export type { ToolDef, ParamDef, ParamType } from './schema'
export { toModelOutputValue, toolsToAI, buildDebugLog } from './ai-adapter'
export type { ToolLogEntry, ToolDebugLog, AIAdapterOptions, StepBudget } from './ai-adapter'
export { calcClusterConfidence, wrapEvalCode } from './analyze'
export {
  VALID_OVERLAP_CATEGORIES,
  VALID_OVERLAP_SCOPES,
  VALID_OVERLAP_SEVERITIES,
  parseOverlapCategories,
  parseOverlapScope,
  parseOverlapSeverity
} from './analyze/overlaps/params'
export {
  generateImage,
  getActiveGeneratedImageProvider,
  getGeneratedImageProviders,
  registerGeneratedImageProvider,
  setActiveGeneratedImageProvider,
  type GeneratedImageProvider,
  type GeneratedImageRequest
} from './image-gen'
export { setPexelsAPIKey, setUnsplashAccessKey } from './stock-photo'
export { sourceImage } from './source-image'
export {
  applySourcedImage,
  broadenQuery,
  buildGenerationPrompt,
  buildVerificationPrompt,
  buildVisionRequirements,
  clearImageAssetProviders,
  canonicalizeURL,
  clearRoutingLog,
  contentHash,
  collectGenerateSignals,
  createAssetFetcher,
  createLocalAssetProvider,
  createOpenverseProvider,
  createPexelsAssetProvider,
  createWikimediaProvider,
  decideRoute,
  dedupeAssets,
  DEFAULT_ASSET_TIMEOUT_MS,
  DEFAULT_MAX_ASSET_BYTES,
  generateAndVerify,
  getEligibleImageAssetProviders,
  getImageSourcingServices,
  getRoutingLog,
  heuristicRouteDecision,
  ImageVisionVerifier,
  isAllowedImageContentType,
  isPrivateHostname,
  looksLikeSVG,
  parseVisionVerdict,
  passesMetadataFilters,
  refineGenerationPrompt,
  refineQuery,
  registerImageAssetProvider,
  registerImageSourcingServices,
  RoutingCache,
  routingCacheKey,
  sanitizeSVG,
  scoreAsset,
  searchAndVerify,
  searchImageAssetProviders,
  sniffImageContentType,
  sourceImageAsset,
  validateRemoteURL,
  VerificationCache
} from './image-sourcing'
export type {
  AssetFetcher,
  AssetProvenance,
  ImageAsset,
  ImageAssetProvider,
  ImageSourcingResult,
  ImageSourcingServices,
  ImageSourcingState,
  RouteDecision,
  RouteDecider,
  SVGRasterizer,
  VerificationRecord,
  VisionInspector,
  VisionVerdict,
  VisualIntent
} from './image-sourcing'
export { importSVG } from './create'
