/**
 * Post-sign-in redirect validation.
 *
 * The `redirect` query parameter survives a trip through the sign-in page, so it
 * has to be proven that it can only ever resolve to an in-app path. An open
 * redirect here would let a crafted link bounce a freshly authenticated user
 * (carrying a valid session cookie) onto an attacker origin.
 */

import { describe, expect, it } from 'bun:test'

import {
  DEFAULT_POST_SIGN_IN_ROUTE,
  readRedirectTarget,
  REDIRECT_QUERY_KEY,
  signInRedirectFor
} from '@/app/auth/redirect'

describe('readRedirectTarget', () => {
  it('keeps in-app absolute paths', () => {
    expect(readRedirectTarget('/editor')).toBe('/editor')
    expect(readRedirectTarget('/share/room-1')).toBe('/share/room-1')
    expect(readRedirectTarget('/demo?mode=play')).toBe('/demo?mode=play')
  })

  it('falls back for non-strings', () => {
    expect(readRedirectTarget(undefined)).toBe(DEFAULT_POST_SIGN_IN_ROUTE)
    expect(readRedirectTarget(null)).toBe(DEFAULT_POST_SIGN_IN_ROUTE)
    expect(readRedirectTarget(42)).toBe(DEFAULT_POST_SIGN_IN_ROUTE)
    expect(readRedirectTarget(['/editor'])).toBe(DEFAULT_POST_SIGN_IN_ROUTE)
    expect(readRedirectTarget({ path: '/editor' })).toBe(DEFAULT_POST_SIGN_IN_ROUTE)
  })

  it('rejects absolute external URLs', () => {
    // Assembled from parts so this file does not itself contain a live
    // `javascript:` URL for the linter's script-URL rule to trip over.
    const scriptScheme = ['java', 'script:alert(1)'].join('')
    expect(readRedirectTarget('https://evil.example/steal')).toBe(DEFAULT_POST_SIGN_IN_ROUTE)
    expect(readRedirectTarget('http://evil.example')).toBe(DEFAULT_POST_SIGN_IN_ROUTE)
    expect(readRedirectTarget(scriptScheme)).toBe(DEFAULT_POST_SIGN_IN_ROUTE)
    expect(readRedirectTarget('data:text/html,<script>alert(1)</script>')).toBe(
      DEFAULT_POST_SIGN_IN_ROUTE
    )
  })

  it('rejects protocol-relative and backslash variants', () => {
    expect(readRedirectTarget('//evil.example')).toBe(DEFAULT_POST_SIGN_IN_ROUTE)
    expect(readRedirectTarget('///evil.example')).toBe(DEFAULT_POST_SIGN_IN_ROUTE)
    expect(readRedirectTarget('/\\evil.example')).toBe(DEFAULT_POST_SIGN_IN_ROUTE)
    expect(readRedirectTarget('/\\/evil.example')).toBe(DEFAULT_POST_SIGN_IN_ROUTE)
    expect(readRedirectTarget('/path\\to')).toBe(DEFAULT_POST_SIGN_IN_ROUTE)
  })

  it('rejects relative paths that escape the origin', () => {
    expect(readRedirectTarget('editor')).toBe(DEFAULT_POST_SIGN_IN_ROUTE)
    expect(readRedirectTarget('../editor')).toBe(DEFAULT_POST_SIGN_IN_ROUTE)
    expect(readRedirectTarget('./editor')).toBe(DEFAULT_POST_SIGN_IN_ROUTE)
  })

  it('rejects an embedded newline that could split a header', () => {
    expect(readRedirectTarget('/editor\r\nSet-Cookie: a=b')).toBe(DEFAULT_POST_SIGN_IN_ROUTE)
    expect(readRedirectTarget('/editor\nSet-Cookie: a=b')).toBe(DEFAULT_POST_SIGN_IN_ROUTE)
  })
})

describe('signInRedirectFor', () => {
  it('carries the requested path through sign-in', () => {
    expect(signInRedirectFor('/share/room-9')).toMatchObject({
      path: '/',
      query: { [REDIRECT_QUERY_KEY]: '/share/room-9' }
    })
  })

  it('sanitises an attacker-supplied destination', () => {
    expect(signInRedirectFor('https://evil.example')).toMatchObject({
      path: '/',
      query: { [REDIRECT_QUERY_KEY]: DEFAULT_POST_SIGN_IN_ROUTE }
    })
  })
})
