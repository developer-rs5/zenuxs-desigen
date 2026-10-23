/**
 * Registry of image asset providers.
 *
 * Providers are searched concurrently and independently: one provider failing
 * never removes the results of another.
 */

import type {
  ImageAsset,
  ImageAssetProvider,
  ImageAssetSearchOptions
} from '#core/tools/image-sourcing/types'

export interface ProviderSearchOutcome {
  provider: string
  assets: ImageAsset[]
  /** Present when the provider failed; other providers still contribute. */
  error?: string
}

const providers = new Map<string, ImageAssetProvider>()

export function registerImageAssetProvider(provider: ImageAssetProvider): void {
  providers.set(provider.name, provider)
}

export function getImageAssetProvider(name: string): ImageAssetProvider | null {
  return providers.get(name) ?? null
}

export function getImageAssetProviders(): string[] {
  return [...providers.keys()]
}

/**
 * Whether a provider can run right now.
 *
 * A provider that cannot even report its state is treated as ineligible
 * instead of failing the whole run.
 */
function isProviderEligible(provider: ImageAssetProvider): boolean {
  try {
    return provider.isConfigured()
  } catch (error) {
    console.warn(
      `[image-sourcing] The "${provider.name}" provider could not report its state`,
      error
    )
    return false
  }
}

/** Providers that can run right now, in registration order. */
export function getEligibleImageAssetProviders(): ImageAssetProvider[] {
  const eligible: ImageAssetProvider[] = []
  for (const provider of providers.values()) {
    if (isProviderEligible(provider)) eligible.push(provider)
  }
  return eligible
}

/** Removes every registered provider. Used by tests. */
export function clearImageAssetProviders(): void {
  providers.clear()
}

/** Default time a single provider may take before it is given up on. */
export const DEFAULT_PROVIDER_TIMEOUT_MS = 8_000

/**
 * How long a provider that already returned results waits for the others.
 *
 * Without it, one hung provider makes the whole round cost its full timeout
 * even though another provider answered in under a second.
 */
export const DEFAULT_PROVIDER_GRACE_MS = 2_500

/**
 * Rejects with a timeout error when the promise takes too long.
 *
 * The original promise keeps running, but its result is discarded, so one
 * hanging provider cannot consume the whole search budget.
 */
async function withTimeout<T>(promise: Promise<T>, timeoutMs: number, label: string): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined
  try {
    return await Promise.race([
      promise,
      new Promise<never>((_resolve, reject) => {
        timer = setTimeout(
          () => reject(new Error(`${label} timed out after ${timeoutMs}ms`)),
          timeoutMs
        )
      })
    ])
  } finally {
    if (timer) clearTimeout(timer)
  }
}

/**
 * Queries every eligible provider concurrently.
 *
 * A provider that throws contributes an error entry instead of rejecting the
 * whole search, so a single rate limit or outage never ends the run.
 *
 * With `graceMs` above zero the round also ends shortly after the first
 * provider returns results, so a hung provider cannot hold a full timeout over
 * results that are already usable.
 */
export async function searchImageAssetProviders(
  query: string,
  options: ImageAssetSearchOptions,
  list: ImageAssetProvider[] = getEligibleImageAssetProviders(),
  timeoutMs: number = DEFAULT_PROVIDER_TIMEOUT_MS,
  graceMs: number = 0
): Promise<ProviderSearchOutcome[]> {
  if (list.length === 0) return []

  const outcomes: ProviderSearchOutcome[] = []
  let finished = false
  let graceTimer: ReturnType<typeof setTimeout> | undefined
  let resolveRound: ((value: ProviderSearchOutcome[]) => void) | undefined

  const finish = () => {
    if (finished) return
    finished = true
    if (graceTimer) clearTimeout(graceTimer)
    const resolve = resolveRound
    resolveRound = undefined
    resolve?.(outcomes.slice())
  }

  const settle = (outcome: ProviderSearchOutcome) => {
    if (finished) return
    outcomes.push(outcome)
    if (outcomes.length === list.length) {
      finish()
      return
    }
    if (graceMs > 0 && outcome.assets.length > 0 && !graceTimer) {
      graceTimer = setTimeout(finish, graceMs)
    }
  }

  return new Promise<ProviderSearchOutcome[]>((resolve) => {
    resolveRound = resolve
    for (const provider of list) {
      searchProvider(provider, query, options, timeoutMs)
        .then(settle)
        .catch((error: unknown) =>
          settle({ provider: provider.name, assets: [], error: String(error) })
        )
    }
  })
}

/** Runs one provider search under the shared timeout, never rejecting. */
async function searchProvider(
  provider: ImageAssetProvider,
  query: string,
  options: ImageAssetSearchOptions,
  timeoutMs: number
): Promise<ProviderSearchOutcome> {
  try {
    const search = provider.search(query, options)
    // The race inside `withTimeout` reports the failure; this keeps an
    // abandoned request from surfacing as an unhandled rejection.
    void search.catch(() => undefined)
    const assets = await withTimeout(search, timeoutMs, provider.name)
    return { provider: provider.name, assets }
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error)
    return { provider: provider.name, assets: [], error: reason }
  }
}
