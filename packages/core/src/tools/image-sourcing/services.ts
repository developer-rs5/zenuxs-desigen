/**
 * Registry of the image sourcing services.
 *
 * Core stays framework neutral: the app layer registers the vision inspector,
 * the router and the generation provider here, and the tool uses them.
 */

import type { ImageSourcingServices } from './source'

let services: ImageSourcingServices | null = null

export function registerImageSourcingServices(next: ImageSourcingServices | null): void {
  services = next
}

export function getImageSourcingServices(): ImageSourcingServices | null {
  return services
}
