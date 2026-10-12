import type { ImageModel } from 'ai'

import { createImageModel } from '@/app/ai/chat/model'
import { resolveAIModelRole } from '@/app/ai/models/store'
import { modelProviderAdapter } from '@/app/ai/providers/registry'

import { resolveModelConnectionAPIKey } from './runtime'

/**
 * Resolves an image-generation model from the Design profile, or null when the
 * active provider cannot generate images or its credential is missing.
 *
 * Returning null (rather than throwing) is deliberate: the caller hides the
 * tool instead of exposing one that can only fail, so the model never wastes a
 * step or spends the user's money discovering the provider lacks the feature.
 */
export async function resolveImageModel(): Promise<ImageModel | null> {
  const resolved = resolveAIModelRole('design')
  if (!resolved) return null

  const adapter = modelProviderAdapter(resolved.connection.providerID)
  if (typeof adapter.createImage !== 'function') return null

  const apiKey = await resolveModelConnectionAPIKey(resolved.connection.id)
  if (!apiKey) return null

  return createImageModel({
    providerID: resolved.connection.providerID,
    apiKey,
    modelID: resolved.profile.modelID,
    customModelID: resolved.profile.customModelID,
    customBaseURL: resolved.connection.customBaseURL,
    customAPIType: resolved.connection.customAPIType
  })
}
