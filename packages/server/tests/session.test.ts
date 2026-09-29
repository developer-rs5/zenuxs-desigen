/**
 * Session lifecycle: create, restore, refuse, and genuinely revoke.
 *
 * The property under test is that the *server* decides who is signed in. A
 * client that keeps its cookie, replays it, or edits its own state must not be
 * able to regain access once a session is gone.
 */

import { afterAll, afterEach, beforeAll, describe, expect, it } from 'bun:test'

import { Session } from '../src/db/models/Session.js'
import {
  clearDatabase,
  connectMemoryMongo,
  createHarness,
  disconnectMongo,
  type Harness
} from './helpers/harness.js'

let harness: Harness & { close(): Promise<void> }

beforeAll(async () => {
  await connectMemoryMongo()
  harness = await createHarness()
})

afterAll(async () => {
  await harness.close()
  await disconnectMongo()
})

afterEach(async () => {
  await clearDatabase()
})

describe('session creation', () => {
  it('issues an HttpOnly, SameSite session cookie on successful sign-in', async () => {
    const accessToken = harness.provider.issueAccessToken('alice')
    const response = await harness.request('/api/auth/session', {
      method: 'POST',
      body: JSON.stringify({ access_token: accessToken })
    })

    expect(response.status).toBe(200)
    const cookies = response.headers.getSetCookie()
    const sessionCookie = cookies.find((entry) => entry.startsWith('zenuxs_session='))
    expect(sessionCookie).toBeDefined()
    // The session token must not be readable by JavaScript.
    expect(sessionCookie).toContain('HttpOnly')
    expect(sessionCookie).toContain('SameSite=Lax')
    expect(sessionCookie).toContain('Path=/')
  })

  it('marks the cookie Secure in production', async () => {
    const { createApp } = await import('../src/app.js')
    const { testConfig } = await import('./helpers/harness.js')
    const prod = testConfig(harness.provider.origin, { isProduction: true, nodeEnv: 'production' })
    const { createServer } = await import('node:http')
    const server = createServer(createApp({ config: prod }))
    await new Promise<void>((resolve) => {
      server.listen(0, '127.0.0.1', () => {
        resolve()
      })
    })
    const address = server.address()
    if (address === null || typeof address === 'string') throw new Error('Server is not listening')
    const port = address.port
    try {
      const response = await fetch(`http://127.0.0.1:${port}/api/auth/session`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ access_token: harness.provider.issueAccessToken('prod-user') })
      })
      const cookie = response.headers
        .getSetCookie()
        .find((entry) => entry.startsWith('zenuxs_session='))
      expect(cookie).toContain('Secure')
      expect(cookie).toContain('HttpOnly')
    } finally {
      await new Promise<void>((resolve) => {
        server.close(() => {
          resolve()
        })
      })
    }
  })

  it('never stores the raw session token in the database', async () => {
    const accessToken = harness.provider.issueAccessToken('alice')
    const response = await harness.request('/api/auth/session', {
      method: 'POST',
      body: JSON.stringify({ access_token: accessToken })
    })
    const sessionCookie = response.headers
      .getSetCookie()
      .find((entry) => entry.startsWith('zenuxs_session='))
    if (sessionCookie === undefined) throw new Error('No session cookie was issued')
    const rawCookie = sessionCookie.split(';')[0]?.slice('zenuxs_session='.length)
    if (rawCookie === undefined) throw new Error('Session cookie had no value')

    const record = await Session.findOne({ sub: 'alice' })
    if (record === null) throw new Error('Session was not persisted')
    // Only a hash is persisted.
    expect(record.tokenHash).not.toBe(rawCookie)
    expect(record.tokenHash).toMatch(/^[a-f0-9]{64}$/)
  })

  it('refuses to create a session for an unverified token', async () => {
    const response = await harness.request('/api/auth/session', {
      method: 'POST',
      body: JSON.stringify({ access_token: 'at_forged_by_attacker' })
    })
    expect(response.status).toBe(401)
    expect(await Session.countDocuments({})).toBe(0)
  })

  it('rejects a structurally invalid session request', async () => {
    // Malformed bodies are a client error.
    for (const body of [
      { access_token: '' },
      { access_token: 123 },
      { nonsense: true },
      { id_token: [] }
    ]) {
      const response = await harness.request('/api/auth/session', {
        method: 'POST',
        body: JSON.stringify(body)
      })
      expect(response.status).toBe(400)
    }
    expect(await Session.countDocuments({})).toBe(0)
  })

  it('rejects a well-formed request that carries no token', async () => {
    const response = await harness.request('/api/auth/session', {
      method: 'POST',
      body: JSON.stringify({})
    })
    expect(response.status).toBe(401)
    expect(await Session.countDocuments({})).toBe(0)
  })

  it('rejects a non-JSON body', async () => {
    const response = await harness.request('/api/auth/session', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: '{not json'
    })
    expect(response.status).toBe(400)
    expect(await Session.countDocuments({})).toBe(0)
  })

  it('no longer exposes the identity-forgery endpoint', async () => {
    // The old endpoint upserted a user from an arbitrary client-supplied `sub`.
    for (const path of ['/api/auth/verify', '/api/auth/login', '/api/auth/register']) {
      const response = await harness.request(path, {
        method: 'POST',
        body: JSON.stringify({ sub: 'attacker', email: 'attacker@evil.example' })
      })
      expect(response.status).toBeGreaterThanOrEqual(404)
    }
    const { User } = await import('../src/db/models/User.js')
    expect(await User.countDocuments({ sub: 'attacker' })).toBe(0)
  })
})

describe('session restoration', () => {
  it('restores the session from the cookie after a page refresh', async () => {
    const { cookie } = await harness.signIn('alice')
    // A refresh sends only the cookie; no token, no body.
    const response = await harness.request('/api/auth/session', { cookies: cookie })

    expect(response.status).toBe(200)
    const body = (await response.json()) as { user: { sub: string } }
    expect(body.user.sub).toBe('alice')
  })

  it('returns 401 when there is no session at all', async () => {
    const response = await harness.request('/api/auth/session')
    expect(response.status).toBe(401)
  })

  it('rejects a deleted cookie', async () => {
    const response = await harness.request('/api/auth/session', { cookies: '' })
    expect(response.status).toBe(401)
  })

  it('rejects a tampered session cookie', async () => {
    const { cookie } = await harness.signIn('alice')
    const tampered = cookie.replace(/zenuxs_session=[^;]+/, 'zenuxs_session=forged-token-value')
    const response = await harness.request('/api/auth/session', { cookies: tampered })
    expect(response.status).toBe(401)
  })

  it('rejects an expired session', async () => {
    const { cookie } = await harness.signIn('alice')
    // Move the expiry into the past rather than waiting for the real timeout.
    await Session.updateMany({}, { $set: { expiresAt: new Date(Date.now() - 1000) } })

    const response = await harness.request('/api/auth/session', { cookies: cookie })
    expect(response.status).toBe(401)
  })

  it('rejects a random session token', async () => {
    for (const value of ['abc', 'a'.repeat(64), '../../etc/passwd', '%00']) {
      const response = await harness.request('/api/auth/session', {
        cookies: `zenuxs_session=${encodeURIComponent(value)}`
      })
      expect(response.status).toBe(401)
    }
  })
})

describe('logout', () => {
  it('revokes the session so the old cookie stops working', async () => {
    const { cookie, csrf } = await harness.signIn('alice')

    const beforeLogout = await harness.request('/api/documents', { cookies: cookie })
    expect(beforeLogout.status).toBe(200)

    const logout = await harness.request('/api/auth/session', {
      method: 'DELETE',
      cookies: cookie,
      csrf
    })
    expect(logout.status).toBe(204)

    // The captured cookie must be useless afterwards, which is what makes
    // "back button" and "replay an old cookie" safe.
    const afterLogout = await harness.request('/api/documents', { cookies: cookie })
    expect(afterLogout.status).toBe(401)

    const restore = await harness.request('/api/auth/session', { cookies: cookie })
    expect(restore.status).toBe(401)
  })

  it('clears both cookies on logout', async () => {
    const { cookie, csrf } = await harness.signIn('alice')
    const response = await harness.request('/api/auth/session', {
      method: 'DELETE',
      cookies: cookie,
      csrf
    })
    const cleared = response.headers.getSetCookie()
    expect(
      cleared.some((entry) => entry.startsWith('zenuxs_session=') && entry.includes('Max-Age=0'))
    ).toBe(true)
    expect(
      cleared.some((entry) => entry.startsWith('zenuxs_csrf=') && entry.includes('Max-Age=0'))
    ).toBe(true)
  })

  it('leaves other sessions for the same user intact', async () => {
    const first = await harness.signIn('alice')
    const second = await harness.signIn('alice')

    await harness.request('/api/auth/session', {
      method: 'DELETE',
      cookies: first.cookie,
      csrf: first.csrf
    })

    expect((await harness.request('/api/auth/session', { cookies: first.cookie })).status).toBe(401)
    expect((await harness.request('/api/auth/session', { cookies: second.cookie })).status).toBe(
      200
    )
  })

  it('refuses a cross-site logout that carries no CSRF token', async () => {
    const alice = await harness.signIn('alice')

    // A cross-site attacker can cause the cookie to be sent, but not read the
    // token, so they cannot supply the header.
    const response = await harness.request('/api/auth/session', {
      method: 'DELETE',
      cookies: alice.cookie
    })
    expect(response.status).toBe(403)
    // The session must survive the failed attempt.
    expect((await harness.request('/api/auth/session', { cookies: alice.cookie })).status).toBe(200)
  })

  it('refuses a logout whose CSRF token does not match the session', async () => {
    const alice = await harness.signIn('alice')
    const response = await harness.request('/api/auth/session', {
      method: 'DELETE',
      cookies: `${alice.cookie}; zenuxs_csrf=attacker-csrf-token`,
      csrf: 'attacker-csrf-token'
    })
    expect(response.status).toBe(403)
    expect((await harness.request('/api/auth/session', { cookies: alice.cookie })).status).toBe(200)
  })

  it('is safe to call without a session', async () => {
    const response = await harness.request('/api/auth/session', { method: 'DELETE' })
    expect([204, 403]).toContain(response.status)
  })
})
