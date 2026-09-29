/**
 * Adversarial reproduction of the original vulnerabilities against the hardened
 * server. Each case replays the exact request that previously succeeded and
 * asserts the hardened response.
 *
 * Run: bun test packages/server/tests/adversarial-repro.ts
 */

import { describe, expect, it } from 'bun:test'
import { createServer, type Server } from 'node:http'

import { createApp } from '#src/app.js'
import { DesignDocument } from '#src/db/models/Document.js'
import { UserSettings } from '#src/db/models/UserSettings.js'

import {
  connectMemoryMongo,
  createHarness,
  disconnectMongo,
  testConfig,
  type Harness
} from './helpers/harness.js'

const results: { name: string; expected: string; actual: string; pass: boolean }[] = []

function check(name: string, pass: boolean, expected: string, actual: string): void {
  results.push({ name, expected, actual, pass })
}

/** Reads the `documents` array out of a decoded list response, or null. */
function readDocuments(body: unknown): unknown[] | null {
  if (typeof body !== 'object' || body === null) return null
  const value = Object.getOwnPropertyDescriptor(body, 'documents')?.value
  return Array.isArray(value) ? value : null
}

/** Reads the `credentials` map out of a decoded settings response. */
function readCredentials(body: unknown): unknown {
  if (typeof body !== 'object' || body === null) return undefined
  const settings = Object.getOwnPropertyDescriptor(body, 'settings')?.value
  if (typeof settings !== 'object' || settings === null) return undefined
  return Object.getOwnPropertyDescriptor(settings, 'credentials')?.value
}

/** Boots an extra app instance with a tight sign-in rate limit. */
async function startRateLimitedServer(
  issuer: string
): Promise<{ baseURL: string; close: () => Promise<void> }> {
  const config = testConfig(issuer, { sessionRateLimitMax: 5 })
  const server: Server = createServer(createApp({ config }))
  await new Promise<void>((resolve) => {
    server.listen(0, '127.0.0.1', () => {
      resolve()
    })
  })
  const address = server.address()
  if (address === null || typeof address === 'string') throw new Error('Server is not listening')
  return {
    baseURL: `http://127.0.0.1:${address.port}`,
    close: () =>
      new Promise<void>((resolve, reject) => {
        server.close((error) => {
          if (error) reject(error)
          else resolve()
        })
      })
  }
}

describe('adversarial reproductions', () => {
  let harness: Harness

  it('replays every original attack', async () => {
    await connectMemoryMongo()
    harness = await createHarness()

    try {
      // 1. Arbitrary identity creation: previously any visitor could mint a
      //    session for any subject they chose.
      const forge = await harness.request('/api/auth/session', {
        method: 'POST',
        body: JSON.stringify({ access_token: 'not-a-real-token' })
      })
      check('forged token cannot mint a session', forge.status === 401, '401', String(forge.status))

      // The strict body schema rejects an unknown identity field outright.
      const forgeByBody = await harness.request('/api/auth/session', {
        method: 'POST',
        body: JSON.stringify({ access_token: 'not-a-real-token', sub: 'admin' })
      })
      check(
        'client-supplied identity is rejected at the schema',
        forgeByBody.status === 400,
        '400',
        String(forgeByBody.status)
      )

      const forgeByHeader = await harness.request('/api/auth/session', {
        method: 'POST',
        headers: { 'x-user-sub': 'admin' },
        body: JSON.stringify({ access_token: 'not-a-real-token' })
      })
      check(
        'client-supplied identity header is ignored',
        forgeByHeader.status === 401,
        '401',
        String(forgeByHeader.status)
      )

      // 2. Unauthenticated document access.
      const anonList = await harness.request('/api/documents')
      check('anonymous list is refused', anonList.status === 401, '401', String(anonList.status))

      // 3. Cross-user document read (IDOR).
      const alice = await harness.signIn('alice')
      const bob = await harness.signIn('bob')
      await harness.request('/api/documents', {
        method: 'POST',
        cookies: alice.cookie,
        csrf: alice.csrf,
        body: JSON.stringify({ documentId: 'alice-doc', title: 'Alice secret', payload: { x: 1 } })
      })
      const bobReadsAlice = await harness.request('/api/documents/alice-doc', {
        cookies: bob.cookie
      })
      check(
        "bob cannot read alice's document",
        bobReadsAlice.status === 404,
        '404',
        String(bobReadsAlice.status)
      )

      // 4. Cross-user document delete.
      const bobDeletesAlice = await harness.request('/api/documents/alice-doc', {
        method: 'DELETE',
        cookies: bob.cookie,
        csrf: bob.csrf
      })
      check(
        "bob cannot delete alice's document",
        bobDeletesAlice.status === 404,
        '404',
        String(bobDeletesAlice.status)
      )
      const stillThere = await DesignDocument.countDocuments({ documentId: 'alice-doc' })
      check("alice's document survived bob's delete", stillThere === 1, '1', String(stillThere))

      // 5. Cross-user settings read (credential theft).
      await harness.request('/api/settings', {
        method: 'POST',
        cookies: alice.cookie,
        csrf: alice.csrf,
        body: JSON.stringify({ credentials: { 'v1:openai:default:k': 'sk-alice' } })
      })
      const bobSteals = await harness.request('/api/settings?ownerSub=alice', {
        cookies: bob.cookie
      })
      const bobStealBody: unknown = await bobSteals.json()
      check(
        'ownerSub query cannot widen the settings read',
        readCredentials(bobStealBody) === undefined,
        'undefined',
        JSON.stringify(readCredentials(bobStealBody))
      )

      // 6. Cross-user settings write (credential tampering).
      await harness.request('/api/settings', {
        method: 'POST',
        cookies: bob.cookie,
        csrf: bob.csrf,
        body: JSON.stringify({
          ownerSub: 'alice',
          credentials: { 'v1:openai:default:k': 'sk-attacker' }
        })
      })
      const aliceSettings = await UserSettings.findOne({ ownerSub: 'alice' }).lean()
      check(
        "bob cannot plant credentials in alice's account",
        aliceSettings?.credentials?.['v1:openai:default:k'] === 'sk-alice',
        'sk-alice',
        String(aliceSettings?.credentials?.['v1:openai:default:k'])
      )

      // 7. NoSQL operator injection on the owner selector.
      await harness.request('/api/documents', {
        method: 'POST',
        cookies: bob.cookie,
        csrf: bob.csrf,
        body: JSON.stringify({ documentId: 'bob-doc', title: 'Bob', payload: { x: 1 } })
      })
      const injection = await harness.request('/api/documents', {
        cookies: bob.cookie,
        headers: { 'x-user-sub': JSON.stringify({ $ne: null }) }
      })
      const injectionBody: unknown = await injection.json()
      const leakedCount = Array.isArray(injectionBody) ? injectionBody.length : -1
      const listed = readDocuments(injectionBody)
      check(
        'operator injection in the identity header is not honoured',
        listed !== null && listed.length === 1,
        '1 document (bob only)',
        `${leakedCount} documents`
      )

      // 8. Prototype pollution.
      await harness.request('/api/settings', {
        method: 'POST',
        cookies: bob.cookie,
        csrf: bob.csrf,
        body: '{"credentials":{"__proto__":{"polluted":"yes"}}}'
      })
      check(
        'prototype pollution payload is rejected',
        Object.getOwnPropertyDescriptor({}, 'polluted') === undefined,
        'undefined',
        String(Object.getOwnPropertyDescriptor({}, 'polluted')?.value)
      )

      // 9. Unbounded payload.
      const huge = await harness.request('/api/settings', {
        method: 'POST',
        cookies: bob.cookie,
        csrf: bob.csrf,
        body: JSON.stringify({ aiModelSettings: { blob: 'x'.repeat(3_000_000) } })
      })
      check(
        'oversized settings blob is rejected',
        huge.status === 400 || huge.status === 413,
        '400 or 413',
        String(huge.status)
      )

      // 10. Wildcard CORS.
      const wildcard = await harness.request('/api/documents', {
        cookies: bob.cookie,
        headers: { origin: 'https://evil.example' }
      })
      check(
        'unknown origin gets no CORS grant',
        wildcard.headers.get('access-control-allow-origin') === null,
        'no ACAO header',
        String(wildcard.headers.get('access-control-allow-origin'))
      )
      const allowed = await harness.request('/api/documents', {
        cookies: bob.cookie,
        headers: { origin: 'https://app.example' }
      })
      check(
        'allowlisted origin is granted',
        allowed.headers.get('access-control-allow-origin') === 'https://app.example',
        'https://app.example',
        String(allowed.headers.get('access-control-allow-origin'))
      )

      // 11. Missing security headers.
      const headerProbe = await harness.request('/health')
      check(
        'security headers are present',
        headerProbe.headers.get('x-content-type-options') === 'nosniff' &&
          headerProbe.headers.get('x-frame-options') !== null,
        'nosniff + X-Frame-Options',
        `${headerProbe.headers.get('x-content-type-options')} / ${headerProbe.headers.get('x-frame-options')}`
      )
      check(
        'server fingerprint is hidden',
        headerProbe.headers.get('x-powered-by') === null,
        'no x-powered-by',
        String(headerProbe.headers.get('x-powered-by'))
      )

      // 12. Malformed input must not 500.
      const malformed = await harness.request('/api/auth/session', {
        method: 'POST',
        body: '{not json'
      })
      check(
        'malformed JSON returns a JSON 4xx',
        malformed.status === 400,
        '400',
        String(malformed.status)
      )

      // 13. Missing rate limiting on sign-in. Uses a dedicated server with a low
      //     limit so the shared harness is not throttled.
      const rateLimited = await startRateLimitedServer(harness.provider.origin)
      try {
        const statuses: number[] = []
        for (let i = 0; i < 20; i += 1) {
          const response = await fetch(`${rateLimited.baseURL}/api/auth/session`, {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ access_token: `brute-${i}` })
          })
          statuses.push(response.status)
        }
        check(
          'brute-force sign-in is throttled',
          statuses.includes(429),
          'at least one 429',
          statuses.join(',')
        )
      } finally {
        await rateLimited.close()
      }

      // 14. Logout CSRF.
      const csrflessLogout = await harness.request('/api/auth/session', {
        method: 'DELETE',
        cookies: bob.cookie
      })
      check(
        'logout without CSRF is refused',
        csrflessLogout.status === 403,
        '403',
        String(csrflessLogout.status)
      )
      const stillValid = await harness.request('/api/auth/session', { cookies: bob.cookie })
      check(
        'session survives a refused logout',
        stillValid.status === 200,
        '200',
        String(stillValid.status)
      )

      const realLogout = await harness.request('/api/auth/session', {
        method: 'DELETE',
        cookies: bob.cookie,
        csrf: bob.csrf
      })
      check(
        'logout with CSRF succeeds',
        realLogout.status === 200 || realLogout.status === 204,
        '200 or 204',
        String(realLogout.status)
      )
      const afterLogout = await harness.request('/api/auth/session', { cookies: bob.cookie })
      check(
        'session is dead after logout',
        afterLogout.status === 401,
        '401',
        String(afterLogout.status)
      )

      // Report.
      console.log('\n=== ADVERSARIAL REPRODUCTION RESULTS ===')
      for (const result of results) {
        const mark = result.pass ? 'BLOCKED' : 'VULNERABLE'
        console.log(
          `${mark.padEnd(10)} ${result.name} | expected ${result.expected} | got ${result.actual}`
        )
      }
      const failed = results.filter((result) => !result.pass)
      console.log(`\n${results.length - failed.length}/${results.length} attacks blocked`)

      expect(failed.map((result) => result.name)).toEqual([])
    } finally {
      await harness.close()
      await disconnectMongo()
    }
  }, 120_000)
})
