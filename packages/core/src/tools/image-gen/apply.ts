import type { SceneNode } from '@open-pencil/scene-graph'

import { BLACK } from '#core/constants'
import type { FigmaAPI } from '#core/figma-api'

import type { GeneratedImageProvider, GeneratedImageRequest } from './providers'

const GENERATED_IMAGE_TARGET_TYPES: ReadonlySet<SceneNode['type']> = new Set([
  'FRAME',
  'RECTANGLE',
  'ROUNDED_RECTANGLE',
  'ELLIPSE',
  'STAR',
  'POLYGON',
  'VECTOR',
  'BOOLEAN_OPERATION',
  'COMPONENT',
  'INSTANCE'
])

export type { GeneratedImageRequest }

export interface GeneratedImageResult {
  id: string
  image?: {
    imageHash: string
    provider: string
    width: number
    height: number
  }
  error?: string
}

/** Orientation is advisory: providers vary in what they honour. */
const ORIENTATION_SIZE: Record<'landscape' | 'portrait' | 'square', `${number}x${number}`> = {
  landscape: '1024x1024',
  portrait: '1024x1536',
  square: '1024x1024'
}

/**
 * Generates one image and applies it as an IMAGE fill. The target-node guards
 * mirror `stock_photo`: only leaf placeholders and closed area geometry accept
 * an image, so a generated image can never silently replace text or content.
 */
export async function applyGeneratedImage(
  figma: FigmaAPI,
  provider: GeneratedImageProvider,
  request: GeneratedImageRequest
): Promise<GeneratedImageResult> {
  const node = figma.getNodeById(request.id)
  if (!node) return { id: request.id, error: 'Not found' }

  if (!GENERATED_IMAGE_TARGET_TYPES.has(node.type)) {
    return {
      id: request.id,
      error: `"${node.name}" (${node.type}) is not a suitable generated image target`
    }
  }

  if (node.type === 'VECTOR' && (node.vectorNetwork.regions?.length ?? 0) === 0) {
    return {
      id: request.id,
      error: `"${node.name}" has no closed vector regions — use closed area geometry`
    }
  }

  if (node.children.length > 0) {
    return { id: request.id, error: `"${node.name}" already has content` }
  }

  let bytes: Uint8Array
  try {
    bytes = await provider.generate({
      prompt: request.prompt,
      size: ORIENTATION_SIZE[request.orientation ?? 'landscape']
    })
  } catch (error) {
    return {
      id: request.id,
      error: error instanceof Error ? error.message : 'Image generation failed'
    }
  }

  if (bytes.length === 0) return { id: request.id, error: 'Provider returned no image data' }

  const image = figma.createImage(bytes)
  node.fills = [
    {
      type: 'IMAGE',
      color: BLACK,
      imageHash: image.hash,
      imageScaleMode: 'FILL',
      visible: true,
      opacity: 1
    }
  ]
  return {
    id: request.id,
    image: {
      imageHash: image.hash,
      provider: provider.name,
      width: node.width,
      height: node.height
    }
  }
}
