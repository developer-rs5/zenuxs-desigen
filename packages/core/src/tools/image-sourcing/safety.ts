/**
 * Security primitives for remote asset handling.
 *
 * The sourcing pipeline downloads images from third-party providers, so every
 * URL is validated before a request is made, every response is bounded, and
 * every SVG is sanitized before it is parsed or rasterized.
 */

import { DOMParser, XMLSerializer } from '@xmldom/xmldom'
import type { Document, Element, Node } from '@xmldom/xmldom'

/** Maximum number of redirects the fetcher follows. */
export const MAX_REDIRECTS = 3

/** Content types the pipeline is willing to import. */
export const ALLOWED_IMAGE_CONTENT_TYPES = [
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/gif',
  'image/avif',
  'image/svg+xml',
  'image/bmp',
  'image/tiff'
] as const

/** Elements that never belong in an imported illustration. */
const FORBIDDEN_SVG_ELEMENTS = new Set([
  'script',
  'foreignobject',
  'iframe',
  'object',
  'embed',
  'audio',
  'video',
  'handler',
  'listener'
])

/** Attributes that may reference another resource. */
const RESOURCE_ATTRIBUTES = ['href', 'xlink:href', 'src', 'from', 'to', 'values', 'style'] as const

/** Host suffixes that only ever resolve inside a local network. */
const PRIVATE_HOST_SUFFIXES = ['.localhost', '.local', '.internal']

/** Literal addresses that must never be fetched. */
const PRIVATE_HOST_NAMES = new Set(['localhost', '::1', '::', '0.0.0.0'])

/** First octet ranges that are reserved for private or special use. */
const PRIVATE_IPV4_RANGES: ReadonlyArray<[number, number]> = [
  [0, 0],
  [10, 10],
  [100, 100],
  [127, 127],
  [169, 169],
  [172, 172],
  [192, 192],
  [198, 198]
]

function isPrivateIPv4(host: string): boolean {
  if (!/^\d{1,3}(\.\d{1,3}){3}$/.test(host)) return false
  const octets = host.split('.').map((part) => Number.parseInt(part, 10))
  if (octets.some((octet) => !Number.isFinite(octet) || octet > 255)) return true
  const [first = 0, second = 0] = octets
  const reserved = PRIVATE_IPV4_RANGES.some(([from, to]) => {
    if (first < from || first > to) return false
    if (first !== 172 && first !== 192 && first !== 198) return true
    if (first === 172) return second >= 16 && second <= 31
    if (first === 192) return second === 168 || second === 0
    return second === 18 || second === 19
  })
  if (reserved) return true
  if (first === 100) return second >= 64 && second <= 127
  return false
}

/**
 * Whether a hostname points at a network location that must never be reached
 * from a user supplied URL.
 */
export function isPrivateHostname(hostname: string): boolean {
  const host = hostname.toLowerCase().replace(/^\[|\]$/g, '')
  if (host.length === 0) return true
  if (PRIVATE_HOST_NAMES.has(host)) return true
  if (PRIVATE_HOST_SUFFIXES.some((suffix) => host.endsWith(suffix))) return true
  if (host.startsWith('fc') || host.startsWith('fd') || host.startsWith('fe80:')) return true
  if (isPrivateIPv4(host)) return true
  // A bare hostname without a dot can only resolve inside the local network.
  if (!host.includes('.') && !host.includes(':')) return true
  return false
}

export interface URLValidationOptions {
  /** When set, only these hosts (and their subdomains) are accepted. */
  allowedHosts?: readonly string[]
  /** When set, only these hosts are rejected. */
  blockedHosts?: readonly string[]
}

/**
 * Validates a remote URL and returns the parsed result.
 *
 * Throws when the URL is unusable or points somewhere unsafe, so callers
 * cannot accidentally continue with an unchecked address.
 */
export function validateRemoteURL(rawURL: string, options: URLValidationOptions = {}): URL {
  let url: URL
  try {
    url = new URL(rawURL)
  } catch {
    throw new Error(`Invalid asset URL: ${rawURL}`)
  }
  if (url.protocol !== 'https:' && url.protocol !== 'http:') {
    throw new Error(`Unsupported asset URL scheme: ${url.protocol}`)
  }
  if (url.username || url.password) {
    throw new Error('Asset URL must not carry credentials')
  }
  const hostname = url.hostname.toLowerCase()
  if (isPrivateHostname(hostname)) {
    throw new Error(`Refusing to fetch a private address: ${hostname}`)
  }
  const allowed = options.allowedHosts
  if (allowed && allowed.length > 0) {
    const permitted = allowed.some(
      (host) => hostname === host.toLowerCase() || hostname.endsWith(`.${host.toLowerCase()}`)
    )
    if (!permitted) {
      throw new Error(`Asset host is not allowed: ${hostname}`)
    }
  }
  const blocked = options.blockedHosts
  if (blocked && blocked.length > 0) {
    const rejected = blocked.some(
      (host) => hostname === host.toLowerCase() || hostname.endsWith(`.${host.toLowerCase()}`)
    )
    if (rejected) {
      throw new Error(`Asset host is blocked: ${hostname}`)
    }
  }
  return url
}

/** Whether a content type may be imported. */
export function isAllowedImageContentType(contentType: string | null | undefined): boolean {
  if (!contentType) return false
  const normalized = contentType.split(';')[0]?.trim().toLowerCase() ?? ''
  return (ALLOWED_IMAGE_CONTENT_TYPES as readonly string[]).includes(normalized)
}

/** Whether the bytes look like an SVG document. */
export function looksLikeSVG(data: Uint8Array): boolean {
  const head = new TextDecoder('utf-8', { fatal: false })
    .decode(data.subarray(0, 512))
    .toLowerCase()
  if (!head.includes('<svg')) return false
  return head.includes('xmlns') || head.includes('<svg')
}

/** Removes tracking parameters so the same asset deduplicates correctly. */
export function canonicalizeURL(rawURL: string): string {
  let url: URL
  try {
    url = new URL(rawURL)
  } catch {
    return rawURL
  }
  const tracking = new Set([
    'utm_source',
    'utm_medium',
    'utm_campaign',
    'utm_content',
    'utm_term',
    'utm_id'
  ])
  for (const key of Array.from(url.searchParams.keys())) {
    if (tracking.has(key.toLowerCase())) url.searchParams.delete(key)
  }
  url.hash = ''
  return url.toString()
}

function isSafeResourceValue(value: string): boolean {
  const trimmed = value.trim()
  if (trimmed.length === 0) return false
  if (trimmed.startsWith('#')) return true
  // Only local fragment references survive; anything else could pull in
  // remote content or execute code.
  return false
}

function sanitizeElement(element: Element): void {
  const attributes = element.attributes
  const names: string[] = []
  for (let index = 0; index < attributes.length; index++) {
    const attribute = attributes.item(index)
    if (attribute) names.push(attribute.name)
  }
  for (const name of names) {
    const attribute = attributes.getNamedItem(name)
    if (!attribute) continue
    const lowerName = attribute.name.toLowerCase()
    const value = attribute.value
    if (lowerName.startsWith('on')) {
      element.removeAttribute(attribute.name)
      continue
    }
    if (lowerName === 'style' && /url\s*\(|javascript:|expression\s*\(/i.test(value)) {
      element.removeAttribute(attribute.name)
      continue
    }
    if ((RESOURCE_ATTRIBUTES as readonly string[]).includes(lowerName)) {
      if (!isSafeResourceValue(value)) element.removeAttribute(attribute.name)
    }
  }
}

/**
 * Removes scripts, event handlers and external resource references from an SVG.
 *
 * The document is parsed, cleaned and re-serialized, so the sanitized output
 * is a different byte sequence than the original — that is intentional, and
 * the pipeline hashes the sanitized bytes it actually imports.
 */
export function sanitizeSVG(source: string): string {
  if (/<!ENTITY/i.test(source)) {
    throw new Error('SVG with entity declarations is not allowed')
  }
  let svgDocument: Document
  try {
    svgDocument = new DOMParser({
      onError: (level, message) => {
        if (level !== 'warning') throw new Error(message)
      }
    }).parseFromString(source, 'image/svg+xml')
  } catch {
    throw new Error('SVG could not be parsed')
  }
  const root = svgDocument.documentElement
  if (!root || (root.localName ?? '').toLowerCase() !== 'svg') {
    throw new Error('SVG root element is missing')
  }

  const doomed: Element[] = []
  sanitizeElement(root)
  const walk = (node: Node): void => {
    for (let child = node.firstChild; child; child = child.nextSibling) {
      if (child.nodeType !== 1) continue
      const element = child as Element
      const name = (element.localName ?? '').toLowerCase()
      if (FORBIDDEN_SVG_ELEMENTS.has(name)) {
        doomed.push(element)
        continue
      }
      if (name === 'style') {
        const css = element.textContent ?? ''
        if (/@import|javascript:|url\s*\(\s*['"]?\s*(https?:|data:)/i.test(css)) {
          doomed.push(element)
          continue
        }
      }
      sanitizeElement(element)
      walk(element)
    }
  }
  walk(root)
  for (const element of doomed) {
    element.parentNode?.removeChild(element)
  }

  // The XML declaration is intentionally left out: the vectorizer parses the
  // markup with a DOM that does not accept a declaration before the root.
  return new XMLSerializer().serializeToString(root)
}
