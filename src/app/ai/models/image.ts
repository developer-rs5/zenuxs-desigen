import type { ImageModel } from 'ai'

import { createImageModel } from '@/app/ai/chat/model'
import { resolveAIModelRole } from '@/app/ai/models/store'
import { modelProviderAdapter } from '@/app/ai/providers/registry'

import { resolveModelConnectionAPIKey } from './runtime'

/**
 * Why `generate_image` is unavailable in the current session.
 *
 * Read by diagnostics/settings via `imageGenerationUnavailableReason()` so a
 * silently missing tool is explainable instead of looking like the AI
 * ignored the request.
 */
export type ImageGenerationReason = 'no-design-profile' | 'provider-unsupported' | 'no-api-key'

export type ImageGenerationResolution =
  | { available: true; model: ImageModel }
  | { available: false; reason: ImageGenerationReason }

/**
 * Resolves image generation for the Design profile, reporting *why* it is
 * unavailable instead of just returning null.
 *
 * Returning a reason (rather than throwing) is deliberate: the caller hides
 * the tool instead of exposing one that can only fail, so the model never
 * wastes a step or spends the user's money discovering the provider lacks
 * the feature.
 */
export async function resolveImageGeneration(): Promise<ImageGenerationResolution> {
  const resolved = resolveAIModelRole('design')
  if (!resolved) return { available: false, reason: 'no-design-profile' }

  const adapter = modelProviderAdapter(resolved.connection.providerID)
  if (typeof adapter.createImage !== 'function') {
    return { available: false, reason: 'provider-unsupported' }
  }

  const apiKey = await resolveModelConnectionAPIKey(resolved.connection.id)
  if (!apiKey) return { available: false, reason: 'no-api-key' }

  const model = createImageModel({
    providerID: resolved.connection.providerID,
    apiKey,
    modelID: resolved.profile.modelID,
    customModelID: resolved.profile.customModelID,
    customBaseURL: resolved.connection.customBaseURL,
    customAPIType: resolved.connection.customAPIType
  })
  if (!model) return { available: false, reason: 'provider-unsupported' }

  return { available: true, model }
}

/**
 * Legacy nullable form of {@link resolveImageGeneration}.
 * Prefer the resolution variant when the absence reason matters.
 */
export async function resolveImageModel(): Promise<ImageModel | null> {
  const resolution = await resolveImageGeneration()
  return resolution.available ? resolution.model : null
}
