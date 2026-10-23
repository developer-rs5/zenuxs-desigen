/**
 * Mandatory vision verification.
 *
 * Nothing is imported without a vision model having looked at the actual
 * pixels. Metadata, filenames and tags never approve an asset, and a failed,
 * malformed or ambiguous inspection is treated as "not verified".
 */

import { sniffImageContentType } from './fetch-asset'
import type { AssetFetcher } from './fetch-asset'
import { contentHash } from './hash'
import { looksLikeSVG, sanitizeSVG } from './safety'
import type {
  ImageAsset,
  VisionInspector,
  VisionRequirement,
  VerificationRecord,
  VisualIntent
} from './types'
import { DEFAULT_VERIFICATION_THRESHOLD } from './types'

/** Renders an SVG to a raster preview so a vision model can inspect it. */
export interface SVGRasterizer {
  rasterize(
    svg: string,
    options?: { maxEdge?: number }
  ): Promise<{ bytes: Uint8Array; mediaType: string }>
}

/** Checks a license against the project policy before an asset is used. */
export interface LicensePolicy {
  allowNonCommercial: boolean
  requireModification: boolean
}

export const DEFAULT_LICENSE_POLICY: LicensePolicy = {
  allowNonCommercial: false,
  requireModification: true
}

export interface VerifyOptions {
  intent: VisualIntent
  requirements?: VisionRequirement[]
  threshold?: number
  licensePolicy?: LicensePolicy
  /** Maximum number of vision calls per verification. */
  maxBytes?: number
}

export interface VerificationOutcome {
  verified: boolean
  /** Present only for verified assets. */
  record?: VerificationRecord
  /** Bytes that must be imported. Present only for verified assets. */
  bytes?: Uint8Array
  /** Media type of the imported bytes. */
  mimeType?: string
  /** Sanitized SVG source, present when the asset is vector. */
  svg?: string
  /** Why the asset was rejected or could not be verified. */
  reason?: string
  /** The raw verdict, kept for debugging. */
  verdict?: unknown
}

/** Cache of verification decisions, keyed by content hash and requirements. */
export class VerificationCache {
  private readonly entries = new Map<string, { record: VerificationRecord; expiresAt: number }>()

  constructor(private readonly ttlMs: number = 30 * 60_000) {}

  static key(contentHash: string, requirements: VisionRequirement[]): string {
    // The requirement text is part of the key: the same content inspected for
    // a photo request must not be reused for a flat vector request.
    const ids = requirements
      .map(
        (requirement) =>
          `${requirement.id}:${requirement.mandatory ? 'm' : 'o'}:${requirement.text}`
      )
      .sort()
      .join('|')
    return `${contentHash}|${ids}`
  }

  get(key: string, now = Date.now()): VerificationRecord | null {
    const entry = this.entries.get(key)
    if (!entry) return null
    if (entry.expiresAt <= now) {
      this.entries.delete(key)
      return null
    }
    return entry.record
  }

  set(key: string, record: VerificationRecord, now = Date.now()): void {
    this.entries.set(key, { record, expiresAt: now + this.ttlMs })
  }

  clear(): void {
    this.entries.clear()
  }
}

/** Builds the checks the vision model has to judge for one intent. */
export function buildVisionRequirements(intent: VisualIntent): VisionRequirement[] {
  const requirements: VisionRequirement[] = [
    {
      id: 'subject',
      text: `The image clearly shows ${intent.subject}${intent.action ? `, ${intent.action}` : ''}.`,
      mandatory: true
    },
    {
      id: 'style',
      text: `The image is rendered in the ${intent.style.replace(/_/g, ' ')} style that was requested.`,
      mandatory: true
    },
    {
      id: 'no-unwanted-text',
      text: intent.textInImage
        ? 'Any text inside the image is intentional and legible.'
        : 'The image contains no text, letters, numbers, logos or watermarks.',
      mandatory: true
    },
    {
      id: 'no-artifacts',
      text: 'The image has no visual artifacts, malformed shapes, duplicated limbs or generation glitches.',
      mandatory: true
    },
    {
      id: 'usable-in-ui',
      text: `The image is complete, clear and usable as ${intent.placement ?? 'an image in a user interface'}.`,
      mandatory: true
    }
  ]

  if (intent.orientation) {
    requirements.push({
      id: 'orientation',
      // The slot crops the image, so framing is a preference, not a gate:
      // a wrong orientation must not throw away a good photo.
      text: `The composition works in a ${intent.orientation} slot, even if it has to be cropped.`,
      mandatory: false
    })
  }
  if (intent.aspectRatio !== undefined) {
    requirements.push({
      id: 'aspect-ratio',
      text: `The image can be cropped to about ${intent.aspectRatio.toFixed(2)}:1 without losing the subject.`,
      mandatory: false
    })
  }
  if (intent.palette) {
    requirements.push({
      id: 'palette',
      text: `The colours stay close to the requested palette (${intent.palette}).`,
      mandatory: false
    })
  }
  if (intent.requiresTransparency) {
    requirements.push({
      id: 'transparency',
      text: 'The background is transparent rather than painted.',
      mandatory: true
    })
  }
  if (intent.requiresNegativeSpace) {
    requirements.push({
      id: 'negative-space',
      text: 'The image leaves empty space where text will be placed.',
      mandatory: true
    })
  }
  for (const exclusion of intent.exclusions) {
    requirements.push({
      id: `exclusion:${exclusion}`,
      text: `The image respects the constraint "${exclusion}".`,
      mandatory: true
    })
  }
  return requirements
}

/** Builds the instruction that is sent to the vision model. */
export function buildVerificationPrompt(
  intent: VisualIntent,
  requirements: VisionRequirement[]
): string {
  const lines = requirements.map(
    (requirement) =>
      `- ${requirement.id}: ${requirement.text}${requirement.mandatory ? '' : ' (optional)'}`
  )
  return [
    'You are inspecting a candidate image for a design.',
    `The design needs: ${intent.subject}${intent.action ? `, ${intent.action}` : ''}.`,
    `Requested style: ${intent.style.replace(/_/g, ' ')}.`,
    intent.palette ? `Requested palette: ${intent.palette}.` : '',
    intent.exclusions.length > 0 ? `Hard exclusions: ${intent.exclusions.join('; ')}.` : '',
    '',
    'Judge every requirement below against the pixels you can actually see.',
    'Judge the subject, not the exact wording of the request: a close depiction of the same subject is acceptable.',
    'The image is cropped to fit the slot, so framing that differs from the requested orientation is fine as long as the subject stays visible.',
    ...lines,
    '',
    'Answer with the structured result. Approve only when the image really matches.',
    'A matching title, filename or tag is not evidence — judge the visible content.'
  ]
    .filter((line) => line !== '')
    .join('\n')
}

function readStringArray(value: unknown): string[] | null {
  if (!Array.isArray(value)) return null
  const entries: string[] = []
  for (const entry of value) {
    if (typeof entry !== 'string') return null
    entries.push(entry)
  }
  return entries
}

/** The raw shape the vision model has to answer with. */
interface RawVerdict {
  approved?: unknown
  relevanceScore?: unknown
  matchedRequirements?: unknown
  failedRequirements?: unknown
  reason?: unknown
}

function isRawVerdict(value: unknown): value is RawVerdict {
  return typeof value === 'object' && value !== null
}

/** Reads the failed requirement ids from a raw verdict. */
export function readFailedRequirements(verdict: unknown): string[] {
  if (!verdict || typeof verdict !== 'object' || !('failedRequirements' in verdict)) return []
  const failed = (verdict as { failedRequirements?: unknown }).failedRequirements
  if (!Array.isArray(failed)) return []
  return failed.filter((value): value is string => typeof value === 'string')
}

/**
 * Validates the raw verdict returned by the inspector.
 *
 * Anything unexpected means "not verified" — there is no silent downgrade to
 * metadata matching.
 */
export function parseVisionVerdict(raw: unknown): {
  approved: boolean
  relevanceScore: number
  matchedRequirements: string[]
  failedRequirements: string[]
  reason: string
} | null {
  if (!isRawVerdict(raw)) return null
  if (typeof raw.approved !== 'boolean') return null
  const score = raw.relevanceScore
  if (typeof score !== 'number' || !Number.isFinite(score)) return null
  const matched = readStringArray(raw.matchedRequirements)
  const failed = readStringArray(raw.failedRequirements)
  if (!matched || !failed) return null
  if (typeof raw.reason !== 'string') return null
  return {
    approved: raw.approved,
    relevanceScore: Math.min(1, Math.max(0, score)),
    matchedRequirements: matched,
    failedRequirements: failed,
    reason: raw.reason
  }
}

export interface VerifierDependencies {
  /** The vision model. Without one no asset can be verified. */
  inspector?: VisionInspector
  fetcher: AssetFetcher
  rasterizer?: SVGRasterizer
  cache?: VerificationCache
}

/**
 * Verifies candidate assets with a vision model.
 *
 * The verifier owns the policy: which requirements are mandatory, which score
 * is enough, and that the imported bytes are exactly the inspected bytes.
 */
export class ImageVisionVerifier {
  private readonly cache: VerificationCache

  constructor(private readonly deps: VerifierDependencies) {
    this.cache = deps.cache ?? new VerificationCache()
  }

  /** Whether a vision model is available at all. */
  get available(): boolean {
    return Boolean(this.deps.inspector)
  }
  /**
   * Inspects one candidate.
   *
   * Returns a verified outcome only when the model inspected the pixels, every
   * mandatory requirement passed, the score reached the threshold, the license
   * is acceptable and the imported bytes match the inspected content hash.
   */
  async verify(asset: ImageAsset, options: VerifyOptions): Promise<VerificationOutcome> {
    const requirements = options.requirements ?? buildVisionRequirements(options.intent)
    const threshold = options.threshold ?? DEFAULT_VERIFICATION_THRESHOLD
    const policy = options.licensePolicy ?? DEFAULT_LICENSE_POLICY

    const licenseProblem = checkLicense(asset, policy)
    if (licenseProblem) return { verified: false, reason: licenseProblem }

    let prepared: PreparedAsset
    try {
      prepared = await this.prepare(asset, options)
    } catch (error) {
      return {
        verified: false,
        reason: `The asset could not be retrieved: ${error instanceof Error ? error.message : String(error)}`
      }
    }

    const cacheKey = VerificationCache.key(prepared.assetHash, requirements)
    const cached = this.cache.get(cacheKey)
    if (cached) {
      return {
        verified: true,
        record: cached,
        bytes: prepared.importBytes,
        mimeType: prepared.mimeType,
        svg: prepared.svg
      }
    }

    const prompt = buildVerificationPrompt(options.intent, requirements)
    const inspector = this.deps.inspector
    if (!inspector) {
      return { verified: false, reason: 'No vision model is configured' }
    }
    let raw: unknown
    try {
      raw = await inspector.inspect({
        ...(prepared.inspectionUrl
          ? { url: prepared.inspectionUrl }
          : { data: prepared.inspectionBytes }),
        mediaType: prepared.inspectionMediaType,
        prompt
      })
    } catch (error) {
      return {
        verified: false,
        reason: `Vision inspection failed: ${error instanceof Error ? error.message : String(error)}`
      }
    }

    const verdict = parseVisionVerdict(raw)
    if (!verdict) {
      return {
        verified: false,
        reason: 'The vision model returned an unusable result',
        verdict: raw
      }
    }

    const mandatoryIds = new Set(
      requirements
        .filter((requirement) => requirement.mandatory)
        .map((requirement) => requirement.id)
    )
    const violated = verdict.failedRequirements.filter((id) => mandatoryIds.has(id))
    if (violated.length > 0) {
      return {
        verified: false,
        verdict,
        reason: `Mandatory requirements failed: ${violated.join(', ')}`
      }
    }
    if (!verdict.approved) {
      return {
        verified: false,
        verdict,
        reason: verdict.reason || 'The vision model rejected the image'
      }
    }
    if (verdict.relevanceScore < threshold) {
      return {
        verified: false,
        verdict,
        reason: `Relevance ${verdict.relevanceScore.toFixed(2)} is below the ${threshold} threshold`
      }
    }

    const record: VerificationRecord = {
      assetContentHash: prepared.assetHash,
      inspectedContentHash: prepared.inspectedHash,
      relevanceScore: verdict.relevanceScore,
      matchedRequirements: verdict.matchedRequirements,
      failedRequirements: verdict.failedRequirements,
      reason: verdict.reason,
      inspectedVia: prepared.inspectionUrl ? 'url' : 'bytes',
      verifiedAt: Date.now()
    }
    this.cache.set(cacheKey, record)

    return {
      verified: true,
      record,
      bytes: prepared.importBytes,
      mimeType: prepared.mimeType,
      svg: prepared.svg
    }
  }

  private async prepare(asset: ImageAsset, options: VerifyOptions): Promise<PreparedAsset> {
    const isVector =
      asset.kind === 'svg' || asset.mimeType === 'image/svg+xml' || looksLikeSVGText(asset)

    if (isVector) {
      const source = asset.inlineSource ?? (await this.downloadText(asset))
      const sanitized = sanitizeSVG(source)
      const svgBytes = new TextEncoder().encode(sanitized)
      const assetHash = await contentHash(svgBytes)
      if (!this.deps.rasterizer) {
        throw new Error('SVG assets need a rasterizer before they can be inspected')
      }
      const preview = await this.deps.rasterizer.rasterize(sanitized)
      const inspectedHash = await contentHash(preview.bytes)
      return {
        assetHash,
        inspectedHash,
        importBytes: svgBytes,
        mimeType: 'image/svg+xml',
        svg: sanitized,
        inspectionBytes: preview.bytes,
        inspectionMediaType: preview.mediaType
      }
    }

    const maxBytes = options.maxBytes
    if (asset.inlineBytes) {
      // Locally produced bytes (a generated image) are inspected as they are,
      // so the imported bytes are exactly the inspected bytes.
      const inline = asset.inlineBytes
      const assetHash = await contentHash(inline)
      const contentType = asset.mimeType ?? sniffImageContentType(inline) ?? 'image/png'
      return {
        assetHash,
        inspectedHash: assetHash,
        importBytes: inline,
        mimeType: contentType,
        inspectionBytes: inline,
        inspectionMediaType: contentType
      }
    }

    const downloaded = await this.deps.fetcher.fetch(asset.url, maxBytes ? { maxBytes } : {})
    const assetHash = await contentHash(downloaded.bytes)
    const useURL = (this.deps.inspector?.supportsURLInput ?? false) && !asset.inlineSource
    return {
      assetHash,
      inspectedHash: assetHash,
      importBytes: downloaded.bytes,
      mimeType: downloaded.contentType,
      inspectionBytes: useURL ? undefined : downloaded.bytes,
      inspectionUrl: useURL ? downloaded.finalUrl : undefined,
      inspectionMediaType: downloaded.contentType
    }
  }

  private async downloadText(asset: ImageAsset): Promise<string> {
    const downloaded = await this.deps.fetcher.fetch(asset.url)
    return new TextDecoder('utf-8', { fatal: false }).decode(downloaded.bytes)
  }
}

interface PreparedAsset {
  /** Hash of the bytes that will be imported. */
  assetHash: string
  /** Hash of the bytes the model sees. */
  inspectedHash: string
  importBytes: Uint8Array
  mimeType: string
  svg?: string
  inspectionBytes?: Uint8Array
  inspectionUrl?: string
  inspectionMediaType: string
}

function looksLikeSVGText(asset: ImageAsset): boolean {
  if (!asset.inlineSource) return false
  return looksLikeSVG(new TextEncoder().encode(asset.inlineSource))
}

function checkLicense(asset: ImageAsset, policy: LicensePolicy): string | null {
  if (!policy.allowNonCommercial && !asset.commercialUse) {
    return `The license "${asset.license ?? 'unknown'}" does not allow commercial use`
  }
  if (policy.requireModification && !asset.modificationAllowed) {
    return `The license "${asset.license ?? 'unknown'}" does not allow modifications`
  }
  return null
}
