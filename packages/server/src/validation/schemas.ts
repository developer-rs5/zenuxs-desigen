/**
 * Runtime validation for every untrusted value entering the server.
 *
 * Valibot is used per the project's first-party validation convention. Validating
 * at the boundary is what prevents NoSQL operator injection: a request parameter
 * must be a plain string before it can ever reach a MongoDB query.
 */

import * as v from 'valibot'

/** Maximum accepted length for a document payload, in characters. */
const MAX_PAYLOAD_LENGTH = 15_000_000
const MAX_TITLE_LENGTH = 200
const MAX_CREDENTIAL_VALUE_LENGTH = 4096
const MAX_CREDENTIAL_KEY_LENGTH = 200
const MAX_CREDENTIAL_ENTRIES = 200

/** A plain, non-empty, length-bounded string. Rejects objects/arrays/numbers. */
const shortString = (max: number) => v.pipe(v.string(), v.trim(), v.minLength(1), v.maxLength(max))

/** Subject identifiers: bounded and free of characters that break queries/logs. */
export const subjectSchema = v.pipe(
  v.string(),
  v.trim(),
  v.minLength(1),
  v.maxLength(255),
  // Reject anything that could be interpreted as a query operator or a path.
  v.regex(/^[A-Za-z0-9._:@+-]+$/, 'Subject contains unsupported characters')
)

export const documentIdSchema = v.pipe(
  v.string(),
  v.trim(),
  v.minLength(1),
  v.maxLength(128),
  v.regex(/^[A-Za-z0-9._-]+$/, 'Document id contains unsupported characters')
)

export const titleSchema = shortString(MAX_TITLE_LENGTH)

/** A flat map of bounded string -> bounded string. Rejects nested objects. */
const flatStringMap = (maxEntries: number, maxKey: number, maxValue: number) =>
  v.pipe(
    v.unknown(),
    // `v.record` does not run checks on its key schema, and it silently drops
    // reserved keys, so they are rejected here against the raw input instead.
    v.check((raw) => {
      if (raw === null || typeof raw !== 'object' || Array.isArray(raw)) return true
      return !Object.keys(raw).some((key) => FORBIDDEN_KEYS.has(key))
    }, 'Reserved key is not allowed'),
    v.record(
      v.pipe(v.string(), v.minLength(1), v.maxLength(maxKey), safeKey),
      v.pipe(v.string(), v.maxLength(maxValue))
    ),
    v.maxEntries(maxEntries)
  )

/** Keys that must never be accepted from a client, at any nesting depth. */
const FORBIDDEN_KEYS = new Set(['__proto__', 'constructor', 'prototype'])

/** Rejects prototype-pollution vectors before they are persisted. */
const safeKey = v.check((key: string) => !FORBIDDEN_KEYS.has(key), 'Reserved key is not allowed')

/** Reads one own property from a plain object without widening it. */
function readEntry(object: object, key: string): unknown {
  return Object.getOwnPropertyDescriptor(object, key)?.value
}

export const MAX_JSON_DEPTH = 12
export const MAX_JSON_ENTRIES = 5000
export const MAX_JSON_LENGTH = 2_000_000

/**
 * Validates an arbitrary JSON document.
 *
 * The AI model settings shape evolves with the app (scalars, arrays, and nested
 * objects together), so the blob cannot be pinned to a fixed schema here. Instead
 * it is bounded on every axis that matters for abuse — depth, entry count, and
 * serialized size — while rejecting prototype-pollution keys recursively.
 *
 * Returns an error message, or `null` when the value is acceptable.
 */
export function validateBoundedJSON(value: unknown, maxLength = MAX_JSON_LENGTH): string | null {
  const seen = new Set<object>()

  const walk = (node: unknown, depth: number): string | null => {
    if (depth > MAX_JSON_DEPTH) return 'Value is nested too deeply'
    if (node === null) return null

    const type = typeof node
    if (type === 'string' || type === 'boolean') return null
    if (type === 'number')
      return Number.isFinite(node as number) ? null : 'Value contains a non-finite number'
    if (type !== 'object') return 'Value contains an unsupported entry'

    const object = node as object
    // A cycle would otherwise serialise to null or exhaust the stack.
    if (seen.has(object)) return 'Value contains a circular reference'
    seen.add(object)

    try {
      if (Array.isArray(object)) {
        if (object.length > MAX_JSON_ENTRIES) return 'Value contains too many entries'
        for (const item of object) {
          const error = walk(item, depth + 1)
          if (error) return error
        }
        return null
      }

      const prototype = Object.getPrototypeOf(object)
      if (prototype !== Object.prototype && prototype !== null) {
        return 'Value contains a non-plain object'
      }

      const keys = Object.keys(object)
      if (keys.length > MAX_JSON_ENTRIES) return 'Value contains too many entries'
      for (const key of keys) {
        if (FORBIDDEN_KEYS.has(key)) return 'Value contains a reserved key'
        const error = walk(readEntry(object, key), depth + 1)
        if (error) return error
      }
      return null
    } finally {
      seen.delete(object)
    }
  }

  const error = walk(value, 0)
  if (error) return error
  return JSON.stringify(value).length <= maxLength ? null : 'Value is too large'
}

/**
 * A JSON object body: not an array, bounded, and free of reserved keys at any
 * depth. `v.looseObject` alone is not enough — it accepts arrays and performs no
 * structural checks, so the bounds are applied here.
 *
 * `v.check` passes on any truthy return in this Valibot version, so these
 * predicates return booleans rather than a message.
 */
const boundedJSONObject = (maxLength: number) =>
  v.pipe(
    v.unknown(),
    // The type is checked against the raw input: `v.looseObject` accepts an
    // array and reshapes it into an object, so a check placed after it can no
    // longer tell the two apart.
    v.check(
      (raw) => raw !== null && typeof raw === 'object' && !Array.isArray(raw),
      'Expected a JSON object'
    ),
    v.looseObject({}),
    v.check(
      (value: Record<string, unknown>) => validateBoundedJSON(value, maxLength) === null,
      'Value failed structural validation'
    )
  )

export const sessionCreateSchema = v.strictObject({
  access_token: v.optional(v.pipe(v.string(), v.minLength(1), v.maxLength(8192))),
  id_token: v.optional(v.pipe(v.string(), v.minLength(1), v.maxLength(16384)))
})
export type SessionCreateInput = v.InferOutput<typeof sessionCreateSchema>

export const documentSaveSchema = v.object({
  documentId: documentIdSchema,
  title: v.optional(titleSchema),
  payload: boundedJSONObject(MAX_PAYLOAD_LENGTH),
  previewDataURL: v.optional(
    v.pipe(
      v.string(),
      v.maxLength(2_000_000),
      // Only inline image data URLs are meaningful here; blocks `javascript:` URIs.
      v.regex(
        /^data:image\/(png|jpeg|webp|gif|svg\+xml);base64,[A-Za-z0-9+/=]+$/,
        'Preview must be a base64 image data URL'
      )
    )
  )
})
export type DocumentSaveInput = v.InferOutput<typeof documentSaveSchema>

export const settingsSaveSchema = v.object({
  aiModelSettings: v.optional(boundedJSONObject(MAX_JSON_LENGTH)),
  // Round-tripped so existing MCP and skill configuration is not dropped by a
  // settings sync; the client only consumes the two fields above today.
  mcpServers: v.optional(boundedJSONObject(MAX_JSON_LENGTH)),
  skills: v.optional(boundedJSONObject(MAX_JSON_LENGTH)),
  credentials: v.optional(
    flatStringMap(MAX_CREDENTIAL_ENTRIES, MAX_CREDENTIAL_KEY_LENGTH, MAX_CREDENTIAL_VALUE_LENGTH)
  )
})
export type SettingsSaveInput = v.InferOutput<typeof settingsSaveSchema>

export { FORBIDDEN_KEYS as safeKey }

/** Flattens a Valibot issue list into a short, safe, single-line message. */
export function formatIssues(issues: v.BaseIssue<unknown>[] | undefined): string {
  if (!issues || issues.length === 0) return 'Invalid request body'
  const messages = issues.slice(0, 3).map((issue) => {
    const path = issue.path?.map((item) => String(item.key)).join('.')
    return path ? `${path}: ${issue.message}` : String(issue.message)
  })
  return messages.join('; ').slice(0, 300)
}
