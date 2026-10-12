import type { ImageModel, LanguageModel } from 'ai'

import type { AIProviderID } from '@open-pencil/core/constants'

import type { FetchFunction } from '@/app/http/types'

export type ModelConfig = {
  providerID: AIProviderID
  apiKey: string
  modelID: string
  customModelID: string
  customBaseURL: string
  customAPIType: 'completions' | 'responses'
}

export type ModelProviderRuntime = {
  fetch?: FetchFunction
}

export interface ModelProviderAdapter {
  create(config: ModelConfig, runtime: ModelProviderRuntime): LanguageModel
  /**
   * Image-generation factory. Only providers that actually ship one define it —
   * an absent method means "this provider cannot generate images", which is how
   * the chat tool set decides to hide `generate_image` rather than offering the
   * model a tool that can only fail.
   */
  createImage?(config: ModelConfig, runtime: ModelProviderRuntime): ImageModel
}
