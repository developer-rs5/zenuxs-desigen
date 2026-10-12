import { safeDestr } from 'destr'

import type { GeneratedImageRequest } from './providers'

/**
 * Parses the batch payload. Object-prototype keys are stripped so a model cannot
 * smuggle `__proto__` through a JSON string into the request objects.
 */
export function parseGeneratedImageRequests(
  value: unknown
): GeneratedImageRequest[] | { error: string } {
  let parsed: unknown
  try {
    parsed = safeDestr(String(value))
  } catch {
    return { error: 'Invalid JSON in requests' }
  }

  const requests = Array.isArray(parsed) ? parsed : [parsed]
  if (requests.length === 0) return { error: 'Empty requests array' }
  return requests as GeneratedImageRequest[]
}
