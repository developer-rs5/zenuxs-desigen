import { parseSourceRequests } from './image-sourcing/requests'
import { getImageSourcingServices } from './image-sourcing/services'
import { sourceImageAsset } from './image-sourcing/source'
import { defineTool } from './schema'

export const sourceImage = defineTool({
  name: 'source_image',
  mutates: true,
  description:
    'Source images for a design and apply them to leaf image placeholders. ' +
    'Every slot is routed automatically: common subjects are searched in the free image ' +
    'providers (Pexels when configured, Openverse, Wikimedia) and custom subjects are ' +
    'generated directly. Each candidate is inspected by the vision model and only approved ' +
    'images are applied. Pass a JSON array; each item is ' +
    '{id, subject, style?, query?, orientation?, palette?, placement?, route?}. ' +
    'Containers with content, text, lines, and structural nodes are rejected.',
  params: {
    requests: {
      type: 'string',
      description:
        'JSON array: [{"id":"0:5","subject":"city skyline at sunset","style":"photo","query":"city skyline sunset","orientation":"landscape"}]',
      required: true
    }
  },
  execute: async (figma, { requests }) => {
    const services = getImageSourcingServices()
    if (!services) {
      return {
        error:
          'Image sourcing is unavailable. Configure a Vision model in Settings so images can be verified before they are applied.'
      }
    }

    const reqs = parseSourceRequests(requests)
    if ('error' in reqs) return reqs

    const results = await Promise.all(
      reqs.map((request) => sourceImageAsset(services, figma, request))
    )
    const applied = results.filter(
      (result) =>
        result.state === 'verified_from_search' ||
        result.state === 'verified_from_local' ||
        result.state === 'verified_generated'
    ).length

    return {
      applied,
      failed: results.length - applied,
      results
    }
  }
})
