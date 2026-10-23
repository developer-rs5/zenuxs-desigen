/**
 * Parses the `source_image` tool arguments into structured sourcing requests.
 *
 * The AI sends one entry per image slot. Every field is optional except the
 * target node and the subject, so a malformed entry is reported instead of
 * silently sourcing the wrong image.
 */

import { safeDestr } from 'destr'

import type { ImageOrientation, ImageVisualStyle, RouteContext, VisualIntent } from './types'

export interface SourceImageRequest {
  /** Target placeholder node id. */
  id: string
  intent: VisualIntent
  /** Explicit route chosen by the user or the model. */
  route?: 'auto' | 'search' | 'probe_then_generate' | 'generate'
  /** User overrides that constrain the routing decision. */
  context: RouteContext
}

const STYLES: readonly ImageVisualStyle[] = [
  'photo',
  'flat_2d_vector',
  'cartoon',
  'illustration',
  'icon',
  'abstract',
  'other'
]

const ORIENTATIONS: readonly ImageOrientation[] = ['landscape', 'portrait', 'square']

function readString(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : undefined
}

function readBoolean(value: unknown): boolean | undefined {
  if (typeof value === 'boolean') return value
  if (value === 'true') return true
  if (value === 'false') return false
  return undefined
}

function readNumber(value: unknown): number | undefined {
  if (typeof value === 'number' && Number.isFinite(value)) return value
  if (typeof value === 'string') {
    const parsed = Number.parseFloat(value)
    if (Number.isFinite(parsed)) return parsed
  }
  return undefined
}

function readStringList(value: unknown): string[] {
  if (!Array.isArray(value)) return []
  const entries: string[] = []
  for (const entry of value) {
    if (typeof entry === 'string' && entry.trim()) entries.push(entry.trim())
  }
  return entries
}

function readStyle(value: unknown): ImageVisualStyle {
  const style = readString(value)
    ?.toLowerCase()
    .replace(/[\s-]+/g, '_')
  if (style && (STYLES as readonly string[]).includes(style)) return style as ImageVisualStyle
  return 'other'
}

function readOrientation(value: unknown): ImageOrientation | undefined {
  const orientation = readString(value)?.toLowerCase()
  if (orientation && (ORIENTATIONS as readonly string[]).includes(orientation)) {
    return orientation as ImageOrientation
  }
  return undefined
}

/** A parsed request entry with unknown field types. */
interface RequestEntry {
  id?: unknown
  subject?: unknown
  query?: unknown
  action?: unknown
  style?: unknown
  palette?: unknown
  mood?: unknown
  orientation?: unknown
  aspect_ratio?: unknown
  placement?: unknown
  transparent?: unknown
  negative_space?: unknown
  text_in_image?: unknown
  exclusions?: unknown
  brand_specific?: unknown
  app_mockup?: unknown
  style_group?: unknown
  route?: unknown
  use_stock?: unknown
  must_generate?: unknown
  do_not_generate?: unknown
}

function isRequestEntry(value: unknown): value is RequestEntry {
  return typeof value === 'object' && value !== null
}

function parseEntry(entry: unknown): SourceImageRequest | { error: string } {
  if (!isRequestEntry(entry)) return { error: 'Each request must be an object' }
  const record = entry

  const id = readString(record.id)
  if (!id) return { error: 'Each request needs a target node id' }

  const subject = readString(record.subject) ?? readString(record.query)
  if (!subject) return { error: `Request "${id}" needs a subject` }

  const routeValue = readString(record.route)?.toLowerCase()
  const route =
    routeValue === 'search' || routeValue === 'generate' || routeValue === 'probe_then_generate'
      ? routeValue
      : 'auto'

  const intent: VisualIntent = {
    subject,
    action: readString(record.action),
    style: readStyle(record.style),
    palette: readString(record.palette),
    mood: readString(record.mood),
    orientation: readOrientation(record.orientation),
    aspectRatio: readNumber(record.aspect_ratio),
    placement: readString(record.placement),
    requiresTransparency: readBoolean(record.transparent) ?? false,
    requiresNegativeSpace: readBoolean(record.negative_space) ?? false,
    textInImage: readBoolean(record.text_in_image) ?? false,
    exclusions: readStringList(record.exclusions),
    brandSpecific: readBoolean(record.brand_specific) ?? false,
    appMockup: readBoolean(record.app_mockup) ?? false,
    styleGroup: readString(record.style_group),
    query: readString(record.query) ?? subject
  }

  const context: RouteContext = {
    forceSearch: readBoolean(record.use_stock) ?? false,
    forceGenerate: readBoolean(record.must_generate) ?? false,
    disallowGeneration: readBoolean(record.do_not_generate) ?? false
  }

  return { id, intent, route, context }
}

/** Parses the raw tool argument into sourcing requests. */
export function parseSourceRequests(value: unknown): SourceImageRequest[] | { error: string } {
  let parsed: unknown
  try {
    parsed = safeDestr(String(value))
  } catch {
    return { error: 'Invalid JSON in requests' }
  }

  const entries = Array.isArray(parsed) ? parsed : [parsed]
  if (entries.length === 0) return { error: 'Empty requests array' }

  const requests: SourceImageRequest[] = []
  for (const entry of entries) {
    const parsedEntry = parseEntry(entry)
    if ('error' in parsedEntry) return parsedEntry
    requests.push(parsedEntry)
  }
  return requests
}
