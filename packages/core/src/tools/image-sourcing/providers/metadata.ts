/**
 * Shared helpers for reading provider metadata.
 *
 * Provider payloads are untrusted JSON, so every field is read through a
 * narrowing helper instead of being cast.
 */

export function readString(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : undefined
}

export function readNumber(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined
}

export function readStringList(value: unknown): string[] {
  if (!Array.isArray(value)) return []
  const entries: string[] = []
  for (const entry of value) {
    if (typeof entry === 'string') entries.push(entry)
  }
  return entries
}
