/**
 * Post-sign-in navigation targets.
 *
 * Owned here rather than in `router.ts` so both the router guard and the
 * landing page can use the same validation without importing each other.
 */

import type { RouteLocationRaw } from 'vue-router'

/** Query key used to carry the originally requested route through sign-in. */
export const REDIRECT_QUERY_KEY = 'redirect'

/** Where a user lands when no specific destination was requested. */
export const DEFAULT_POST_SIGN_IN_ROUTE = '/editor'

/**
 * Reports whether a destination contains a character that would be stripped or
 * reinterpreted before `router.push` sees it.
 *
 * A control character is rejected outright instead of being trimmed, so the
 * function never returns something different from what the caller asked for.
 */
function hasControlCharacter(value: string): boolean {
  for (const character of value) {
    const code = character.codePointAt(0)
    if (code === undefined) return true
    if (code < 0x20 || code === 0x7f) return true
  }
  return false
}

/**
 * Validates a post-sign-in destination.
 *
 * Only in-app absolute paths are accepted, so this can never become an open
 * redirect to an external origin. Protocol-relative (`//evil.example`),
 * backslash variants, and any control character are rejected too.
 */
export function readRedirectTarget(value: unknown): string {
  if (typeof value !== 'string') return DEFAULT_POST_SIGN_IN_ROUTE
  if (!value.startsWith('/') || value.startsWith('//') || value.includes('\\'))
    return DEFAULT_POST_SIGN_IN_ROUTE
  // Reject anything that could be re-parsed as a scheme, e.g. "/\evil".
  if (/^\/+[\\@]/.test(value)) return DEFAULT_POST_SIGN_IN_ROUTE
  // Control characters would be stripped or reinterpreted on the way to
  // `router.push`, so they never survive validation.
  if (hasControlCharacter(value)) return DEFAULT_POST_SIGN_IN_ROUTE
  return value
}

/** Builds the sign-in destination for an unauthenticated visitor. */
export function signInRedirectFor(fullPath: string): RouteLocationRaw {
  return { path: '/', query: { [REDIRECT_QUERY_KEY]: readRedirectTarget(fullPath) } }
}
