/**
 * Query building for image search.
 *
 * Providers match on captions and categories rather than on design language,
 * so the query is kept to what the picture shows. Refinement adds a failed
 * requirement; broadening removes art direction when nothing came back.
 */

import type { VisualIntent } from './types'

/** Lowercases a query into words worth matching. */
export function tokenize(query: string): string[] {
  return query
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((token) => token.length > 2)
}

/** Query terms that describe a style, used when a query is refined. */
export function styleQueryTerms(style: VisualIntent['style']): string {
  switch (style) {
    case 'photo':
      return 'photo photograph realistic'
    case 'flat_2d_vector':
      return 'flat vector illustration'
    case 'cartoon':
      return 'cartoon illustration'
    case 'illustration':
      return 'illustration'
    case 'icon':
      return 'flat icon vector'
    case 'abstract':
      return 'abstract gradient background'
    default:
      return ''
  }
}

/**
 * Words that describe how an image should look rather than what it shows.
 *
 * Providers match on captions and categories, so a modifier-heavy query like
 * "specialty coffee shop interior minimalist espresso bar" matches nothing
 * while "coffee shop interior" matches plenty. Broadening drops these words
 * before shortening the query.
 */
const QUERY_NOISE = new Set([
  // Grammar.
  'a',
  'an',
  'the',
  'and',
  'or',
  'of',
  'in',
  'on',
  'at',
  'to',
  'for',
  'with',
  'from',
  'by',
  'as',
  'into',
  'over',
  'under',
  'near',
  'across',
  // Image medium: providers already index photographs as photographs.
  'image',
  'images',
  'photo',
  'photos',
  'photograph',
  'photographs',
  'photography',
  'picture',
  'pictures',
  'shot',
  'stock',
  'render',
  'rendering',
  'realistic',
  'photorealistic',
  // Art direction and mood.
  'closeup',
  'close',
  'high',
  'low',
  'quality',
  'professional',
  'commercial',
  'editorial',
  'cinematic',
  'dramatic',
  'moody',
  'warm',
  'cool',
  'natural',
  'soft',
  'bright',
  'dark',
  'minimal',
  'minimalist',
  'modern',
  'contemporary',
  'clean',
  'elegant',
  'luxury',
  'premium',
  'artisan',
  'artisanal',
  'specialty',
  'speciality',
  'rustic',
  'vintage',
  'retro',
  'bold',
  'vibrant',
  'colorful',
  'muted',
  'cozy',
  'airy',
  'sleek',
  'beautiful',
  'stunning',
  'gorgeous',
  'aesthetic',
  'detailed',
  'shallow',
  'bokeh',
  'blurred',
  'background',
  // Orientation is passed to providers as a search option.
  'landscape',
  'portrait',
  'square'
])

/** Words of a query worth sending to a provider, in order. */
function queryWords(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s-]/gu, ' ')
    .split(/\s+/)
    .filter((word) => word.length > 1 && !QUERY_NOISE.has(word))
}

/**
 * Simplifies a query that returned no candidates at all.
 *
 * Appending more words only makes an over-specific query worse, so each round
 * keeps the leading words of the subject instead: round one keeps three, later
 * rounds keep two. The original query is the last resort, and the caller skips
 * a query it has already searched.
 */
export function broadenQuery(query: string, intent: VisualIntent, round: number): string {
  const limit = round <= 1 ? 3 : 2
  const sources = [query, intent.query, intent.subject]

  for (const source of sources) {
    const words = queryWords(source)
    if (words.length > limit) return words.slice(0, limit).join(' ')
  }
  // Every source is already short: drop the art direction instead of the words.
  for (const source of sources) {
    const words = queryWords(source)
    if (words.length > 0) return words.join(' ')
  }
  return query
}

/** Builds a refined query from the requirements that actually failed. */
export function refineQuery(
  query: string,
  intent: VisualIntent,
  failedRequirements: string[]
): string {
  const additions: string[] = []
  if (failedRequirements.includes('style')) {
    const terms = styleQueryTerms(intent.style)
    if (terms) additions.push(terms)
  }
  if (failedRequirements.includes('subject')) {
    // A missing subject is never fixed by switching medium, so reuse the
    // requested style terms instead of pushing photos toward illustrations.
    const terms = styleQueryTerms(intent.style)
    if (terms && !additions.includes(terms)) additions.push(terms)
  }
  if (failedRequirements.includes('orientation') && intent.orientation) {
    additions.push(intent.orientation)
  }
  if (additions.length === 0) return query
  return `${query} ${additions.join(' ')}`.trim()
}
