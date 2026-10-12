/**
 * Image-generation provider contract.
 *
 * Core deliberately knows only this narrow shape: prompt in, bytes out. The AI
 * SDK stays in the app layer, which keeps `@open-pencil/core` free of a runtime
 * `ai` dependency and lets tests inject a deterministic provider with no
 * network at all.
 */
export interface GeneratedImageProvider {
  name: string
  generate(options: { prompt: string; size: `${number}x${number}` }): Promise<Uint8Array>
}

export interface GeneratedImageRequest {
  id: string
  prompt: string
  index?: number
  orientation?: 'landscape' | 'portrait' | 'square'
}

const providers = new Map<string, GeneratedImageProvider>()

export function registerGeneratedImageProvider(provider: GeneratedImageProvider): void {
  providers.set(provider.name, provider)
}

export function getGeneratedImageProviders(): string[] {
  return [...providers.keys()]
}

export function setActiveGeneratedImageProvider(name: string | null): void {
  if (name !== null && !providers.has(name)) {
    throw new Error(`Unknown generated image provider "${name}"`)
  }
  activeProviderName = name
}

export function getActiveGeneratedImageProvider(): GeneratedImageProvider | null {
  if (activeProviderName) return providers.get(activeProviderName) ?? null
  return providers.values().next().value ?? null
}

let activeProviderName: string | null = null
