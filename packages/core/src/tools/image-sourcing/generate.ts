/**
 * Generation pipeline: the fallback whenever search cannot deliver an
 * approved image.
 *
 * Generated images get exactly the same vision verification as found images.
 * An image that cannot be inspected is never imported.
 */

import type { GeneratedImageProvider } from '#core/tools/image-gen/providers'

import type { AssetProvenance, VisualIntent } from './types'
import { DEFAULT_GENERATION_ATTEMPTS } from './types'
import type { ImageVisionVerifier, LicensePolicy } from './verifier'
import { DEFAULT_LICENSE_POLICY, readFailedRequirements } from './verifier'

export interface GenerateOptions {
  intent: VisualIntent
  verifier: ImageVisionVerifier
  provider: GeneratedImageProvider
  /** Maximum number of generation attempts. */
  attempts?: number
  threshold?: number
  licensePolicy?: LicensePolicy
  /** Wall clock budget for all attempts. */
  maxDurationMs?: number
  now?: () => number
}

export type GenerateState = 'verified_generated' | 'no_verified_match' | 'generation_unavailable'

export interface GenerateOutcome {
  state: GenerateState
  bytes?: Uint8Array
  mimeType?: string
  provenance?: AssetProvenance
  reason?: string
  attempts: number
}

/** Builds the generation prompt from the structured intent. */
export function buildGenerationPrompt(intent: VisualIntent): string {
  const parts: string[] = []
  parts.push(intent.action ? `${intent.subject}, ${intent.action}` : intent.subject)
  parts.push(`style: ${intent.style.replace(/_/g, ' ')}`)

  if (intent.styleGroup) parts.push(`part of a set with one shared style`)
  if (intent.palette) parts.push(`palette: ${intent.palette}`)
  if (intent.mood) parts.push(`mood: ${intent.mood}`)
  if (intent.orientation) parts.push(`orientation: ${intent.orientation}`)
  if (intent.aspectRatio !== undefined) {
    parts.push(`aspect ratio ${intent.aspectRatio.toFixed(2)}:1`)
  }
  if (intent.requiresTransparency) parts.push('transparent background')
  if (intent.requiresNegativeSpace) parts.push('leave empty space for text overlay')
  if (intent.placement) parts.push(`intended placement: ${intent.placement}`)

  const negatives: string[] = []
  if (!intent.textInImage) negatives.push('no text, no letters, no watermark')
  for (const exclusion of intent.exclusions) negatives.push(exclusion)
  negatives.push('no artifacts, no extra limbs, no distorted shapes')

  parts.push(`avoid: ${negatives.join('; ')}`)
  return parts.join(', ')
}

/** Refines the prompt from the requirements the vision model rejected. */
export function refineGenerationPrompt(
  prompt: string,
  intent: VisualIntent,
  failedRequirements: string[]
): string {
  const additions: string[] = []
  if (failedRequirements.includes('style')) {
    additions.push(`clearly ${intent.style.replace(/_/g, ' ')}, not a photograph`)
  }
  if (failedRequirements.includes('subject')) {
    additions.push(`the subject must be exactly ${intent.subject}`)
  }
  if (failedRequirements.includes('no-unwanted-text')) {
    additions.push('completely free of any text or watermark')
  }
  if (failedRequirements.includes('no-artifacts')) {
    additions.push('clean shapes without artifacts')
  }
  if (failedRequirements.includes('orientation')) {
    additions.push(`${intent.orientation ?? 'landscape'} composition`)
  }
  if (failedRequirements.includes('usable-in-ui')) {
    additions.push('clean and complete, suitable for a user interface')
  }
  if (additions.length === 0) return prompt
  return `${prompt}. ${additions.join('. ')}`
}

/** Size hint derived from the requested orientation. */
function generationSize(intent: VisualIntent): `${number}x${number}` {
  if (intent.orientation === 'portrait') return '1024x1536'
  if (intent.orientation === 'square') return '1024x1024'
  return '1536x1024'
}

/** The asset wrapper for one generated image. */
function buildGeneratedAsset(provider: GeneratedImageProvider, attempt: number, bytes: Uint8Array) {
  return {
    id: `generated-${attempt}`,
    provider: provider.name,
    url: `generated://${provider.name}/${attempt}`,
    inlineBytes: bytes,
    mimeType: 'image/png',
    width: undefined,
    height: undefined,
    commercialUse: true,
    modificationAllowed: true,
    requiresAttribution: false,
    license: 'AI generated',
    kind: 'raster' as const
  }
}

async function generateBytes(
  provider: GeneratedImageProvider,
  prompt: string,
  size: `${number}x${number}`
): Promise<{ bytes: Uint8Array | null; error?: string }> {
  try {
    const bytes = await provider.generate({ prompt, size })
    if (bytes.byteLength === 0) return { bytes: null }
    return { bytes }
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error)
    return { bytes: null, error: reason }
  }
}

/**
 * Generates an image and verifies it.
 *
 * The loop is bounded: a fixed attempt cap and a wall clock budget. When it
 * runs out the honest `no_verified_match` state is returned instead of an
 * unverified image.
 */
export async function generateAndVerify(options: GenerateOptions): Promise<GenerateOutcome> {
  const attemptsAllowed = options.attempts ?? DEFAULT_GENERATION_ATTEMPTS
  const policy = options.licensePolicy ?? DEFAULT_LICENSE_POLICY
  const now = options.now ?? (() => Date.now())
  const startedAt = now()
  const maxDurationMs = options.maxDurationMs ?? 120_000

  let prompt = buildGenerationPrompt(options.intent)
  let failedRequirements: string[] = []
  let attempts = 0
  let lastFailure = 'No generated image passed the vision verification'

  while (attempts < attemptsAllowed) {
    if (now() - startedAt >= maxDurationMs) {
      return {
        state: 'no_verified_match',
        attempts,
        reason: 'The generation time budget ran out before an approved image was produced'
      }
    }
    attempts++

    const generated = await generateBytes(options.provider, prompt, generationSize(options.intent))
    if (!generated.bytes) {
      lastFailure = generated.error
        ? `Image generation failed: ${generated.error}`
        : 'The image model returned no usable data'
      continue
    }
    const bytes = generated.bytes

    const generatedAsset = buildGeneratedAsset(options.provider, attempts, bytes)
    const outcome = await options.verifier.verify(generatedAsset, {
      intent: options.intent,
      threshold: options.threshold,
      licensePolicy: policy
    })

    if (outcome.verified && outcome.record && outcome.bytes) {
      const provenance: AssetProvenance = {
        origin: 'ai-generated',
        provider: options.provider.name,
        model: options.provider.name,
        prompt,
        attempts,
        contentHash: outcome.record.assetContentHash,
        verification: outcome.record,
        license: 'AI generated'
      }
      return {
        state: 'verified_generated',
        bytes: outcome.bytes,
        mimeType: outcome.mimeType ?? 'image/png',
        provenance,
        attempts
      }
    }

    const failed = readFailedRequirements(outcome.verdict)
    if (failed.length > 0) failedRequirements = failedRequirements.concat(failed)
    else lastFailure = outcome.reason ?? lastFailure
    prompt = refineGenerationPrompt(prompt, options.intent, failedRequirements)
  }

  return {
    state: 'no_verified_match',
    attempts,
    reason: lastFailure
  }
}
