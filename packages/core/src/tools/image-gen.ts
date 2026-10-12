import { applyGeneratedImage } from './image-gen/apply'
import { getActiveGeneratedImageProvider } from './image-gen/providers'
import { parseGeneratedImageRequests } from './image-gen/requests'
import { defineTool } from './schema'

export { applyGeneratedImage, type GeneratedImageResult } from './image-gen/apply'
export { parseGeneratedImageRequests } from './image-gen/requests'
export {
  getActiveGeneratedImageProvider,
  getGeneratedImageProviders,
  registerGeneratedImageProvider,
  setActiveGeneratedImageProvider,
  type GeneratedImageProvider,
  type GeneratedImageRequest
} from './image-gen/providers'

export const generateImage = defineTool({
  name: 'generate_image',
  mutates: true,
  description:
    'Generate original images with the active AI model and apply them to leaf image placeholders. ' +
    'Use for illustrations, abstract backgrounds, textures, icons and product mockups — not for photographs. ' +
    'Pass a JSON array; each item is {id, prompt, orientation?}. ' +
    'Containers with content, text, lines, and structural nodes are rejected.',
  params: {
    requests: {
      type: 'string',
      description:
        'JSON array: [{"id":"0:5","prompt":"soft gradient mesh, violet and cyan, no text"},{"id":"0:8","prompt":"isometric 3d coffee cup","orientation":"square"}]',
      required: true
    }
  },
  execute: async (figma, { requests }) => {
    const provider = getActiveGeneratedImageProvider()
    if (!provider) {
      return {
        error:
          'Image generation is not available. The active Design model provider has no image model configured.'
      }
    }

    const reqs = parseGeneratedImageRequests(requests)
    if ('error' in reqs) return reqs

    const results = await Promise.all(
      reqs.map((request) => applyGeneratedImage(figma, provider, request))
    )
    const ok = results.filter((result) => result.image).length

    return { applied: ok, failed: results.length - ok, provider: provider.name, results }
  }
})
