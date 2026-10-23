/**
 * Wires the image sourcing pipeline into Core.
 *
 * The app owns the model access (vision, routing, generation) and the
 * transport (downloads, SVG rasterization); Core owns the policy.
 */

import {
  createLocalAssetProvider,
  createOpenverseProvider,
  createPexelsAssetProvider,
  createWikimediaProvider,
  ImageVisionVerifier,
  registerImageAssetProvider,
  registerImageSourcingServices,
  RoutingCache,
  VerificationCache,
  type ImageSourcingServices
} from '@open-pencil/core/tools'

import { resolveImageGeneration } from '@/app/ai/models/image'
import { createAIGeneratedImageProvider } from '@/app/ai/tools/image-gen-provider'

import { createAppAssetFetcher } from './fetcher'
import { createSVGRasterizer } from './rasterizer'
import { createRouteDecider } from './routing'
import { createVisionInspector } from './vision'

/** Why the sourcing pipeline is unavailable in this session. */
export type ImageSourcingUnavailableReason = 'no-vision-model' | 'not-supported'

export interface ImageSourcingAvailability {
  available: boolean
  reason?: ImageSourcingUnavailableReason
  /** True when an image model is available for the generation fallback. */
  generationAvailable: boolean
}

const routingCache = new RoutingCache()
const verificationCache = new VerificationCache()

let providersRegistered = false

function registerProviders(): void {
  if (providersRegistered) return
  providersRegistered = true
  registerImageAssetProvider(createOpenverseProvider())
  registerImageAssetProvider(createWikimediaProvider())
  registerImageAssetProvider(createPexelsAssetProvider())
  registerImageAssetProvider(createLocalAssetProvider())
}

/**
 * Registers the sourcing services and reports whether the pipeline can run.
 *
 * Without a Vision model no image can be verified, so the pipeline stays
 * unavailable and the caller reports `vision_unavailable_needs_user_selection`
 * instead of importing unverified images.
 */
export async function registerImageSourcingServicesForSession(): Promise<ImageSourcingAvailability> {
  registerProviders()

  const inspector = await createVisionInspector()
  if (!inspector) {
    registerImageSourcingServices(null)
    return { available: false, reason: 'no-vision-model', generationAvailable: false }
  }

  const decider = await createRouteDecider()
  const imageGeneration = await resolveImageGeneration()
  const generator = imageGeneration.available
    ? createAIGeneratedImageProvider(imageGeneration.model)
    : null

  const services: ImageSourcingServices = {
    verifier: new ImageVisionVerifier({
      inspector,
      fetcher: createAppAssetFetcher(),
      rasterizer: createSVGRasterizer() ?? undefined,
      cache: verificationCache
    }),
    decider,
    generator,
    routingCache,
    onRoutingDecision: (entry) => {
      // The routing decision is part of the debug log, so a surprising route
      // can be explained after the fact.
      console.debug(
        `[image-sourcing] route=${entry.decision.route} confidence=${entry.decision.confidence.toFixed(2)} source=${entry.source} reason=${entry.decision.reason}`
      )
    }
  }

  registerImageSourcingServices(services)
  return { available: true, generationAvailable: generator !== null }
}
