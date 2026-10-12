import { generateImage } from 'ai'
import type { ImageModel } from 'ai'

import { decodeBase64 } from '@open-pencil/core/bytes'
import type { GeneratedImageProvider } from '@open-pencil/core/tools'

/**
 * Bridges the AI SDK's image model to Core's narrow provider contract. This is
 * the only place the `ai` runtime crosses into the tool layer, so Core stays
 * dependency-free and tests can substitute a deterministic provider.
 */
export function createAIGeneratedImageProvider(model: ImageModel): GeneratedImageProvider {
  return {
    name: 'ai-image-model',
    async generate({ prompt, size }) {
      const { image } = await generateImage({ model, prompt, size })
      return typeof image.base64 === 'string' ? decodeBase64(image.base64) : image.uint8Array
    }
  }
}
