/**
 * Authorization: unauthenticated access and cross-user (IDOR) access.
 *
 * Each test here corresponds to a vulnerability that was reproduced against the
 * previous implementation. The rule being enforced is that the subject always
 * comes from the server-side session, never from a request parameter, header, or
 * body field.
 */

import { afterAll, afterEach, beforeAll, describe, expect, it } from 'bun:test'

import { DesignDocument } from '../src/db/models/Document.js'
import { UserSettings } from '../src/db/models/UserSettings.js'
import {
  clearDatabase,
  connectMemoryMongo,
  createHarness,
  disconnectMongo,
  type Harness
} from './helpers/harness.js'

let harness: Harness

/** Narrows a decoded JSON body to an object so assertions can read its keys. */
function asObject(value: unknown): object {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new Error('Expected a JSON object body')
  }
  return value
}

/** Reads one required property from a decoded JSON object or array. */
function readProperty(value: unknown, key: string): unknown {
  if (typeof value !== 'object' || value === null) {
    throw new Error('Expected a JSON object body')
  }
  const descriptor = Object.getOwnPropertyDescriptor(value, key)
  if (descriptor === undefined) throw new Error(`Expected property "${key}" in JSON body`)
  return descriptor.value
}

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

/** Creates a document owned by `sub` using that user's own session. */
async function seedDocument(
  session: { cookie: string; csrf: string },
  documentId: string,
  title: string
) {
  const response = await harness.request('/api/documents', {
    method: 'POST',
    cookies: session.cookie,
    csrf: session.csrf,
    body: JSON.stringify({ documentId, title, payload: { secret: `${title} contents` } })
  })
  expect(response.status).toBe(200)
}

describe('unauthenticated access to protected APIs', () => {
  it('rejects every protected route without a session', async () => {
    const cases: [string, string][] = [
      ['GET', '/api/documents'],
      ['GET', '/api/documents/some-id'],
      ['POST', '/api/documents'],
      ['DELETE', '/api/documents/some-id'],
      ['GET', '/api/settings'],
      ['POST', '/api/settings']
    ]
    for (const [method, path] of cases) {
      const response = await harness.request(path, {
        method,
        ...(method === 'POST' && { body: JSON.stringify({ documentId: 'x', payload: {} }) })
      })
      expect(response.status).toBe(401)
    }
  })

  it('rejects protected routes with a random or malformed cookie', async () => {
    for (const cookie of [
      'zenuxs_session=abc',
      'zenuxs_session=' + 'a'.repeat(500),
      'zenuxs_session=null',
      'zenuxs_session=undefined',
      'zenuxs_session=eyJhbGciOiJub25lIn0.eyJzdWIiOiJhZG1pbiJ9.'
    ]) {
      const response = await harness.request('/api/documents', { cookies: cookie })
      expect(response.status).toBe(401)
    }
  })

  it('does not honour a client-supplied x-user-sub header', async () => {
    const response = await harness.request('/api/documents', {
      headers: { 'x-user-sub': 'alice' }
    })
    expect(response.status).toBe(401)
  })

  it('does not honour a client-supplied ownerSub parameter', async () => {
    const response = await harness.request('/api/documents?ownerSub=alice', {
      headers: { 'x-user-sub': 'alice' }
    })
    expect(response.status).toBe(401)
  })

  it('leaves the health endpoint public', async () => {
    const response = await harness.request('/health')
    expect(response.status).toBe(200)
    // It must not disclose anything sensitive.
    const body: unknown = await response.json()
    expect(body).toMatchObject({ service: expect.any(String), status: expect.any(String) })
    expect(Object.keys(asObject(body)).sort()).toEqual(['service', 'status'])
  })
})

describe('cross-user document access (IDOR)', () => {
  it("cannot read another user's document by id", async () => {
    const alice = await harness.signIn('alice')
    const bob = await harness.signIn('bob')
    await seedDocument(alice, 'alice-private', 'Alice M&A Plans')

    const response = await harness.request('/api/documents/alice-private', { cookies: bob.cookie })
    // 404 rather than 403 so the response does not confirm the document exists.
    expect(response.status).toBe(404)
  })

  it("cannot delete another user's document by id", async () => {
    const alice = await harness.signIn('alice')
    const bob = await harness.signIn('bob')
    await seedDocument(alice, 'alice-private', 'Alice M&A Plans')

    const response = await harness.request('/api/documents/alice-private', {
      method: 'DELETE',
      cookies: bob.cookie,
      csrf: bob.csrf
    })
    expect(response.status).toBe(404)
    // Alice still has her document.
    expect(await DesignDocument.countDocuments({ documentId: 'alice-private' })).toBe(1)
  })

  it("cannot list another user's documents", async () => {
    const alice = await harness.signIn('alice')
    const bob = await harness.signIn('bob')
    await seedDocument(alice, 'doc-a', 'A')
    await seedDocument(bob, 'doc-b', 'B')

    const response = await harness.request('/api/documents', { cookies: bob.cookie })
    const body: unknown = await response.json()
    const documents = readProperty(body, 'documents')
    expect(documents).toHaveLength(1)
    expect(readProperty(documents, '0')).toMatchObject({
      documentId: 'doc-b',
      ownerSub: 'bob'
    })
  })

  it('ignores an ownerSub override in the query string', async () => {
    const alice = await harness.signIn('alice')
    await seedDocument(alice, 'alice-private', 'Alice')

    const response = await harness.request('/api/documents?ownerSub=alice', {
      cookies: alice.cookie
    })
    const body: unknown = await response.json()
    // The caller still only sees their own documents, never a widened view.
    expect(readProperty(body, 'documents')).toHaveLength(1)
  })

  it('cannot hijack an existing documentId owned by someone else', async () => {
    const alice = await harness.signIn('alice')
    const bob = await harness.signIn('bob')
    await seedDocument(alice, 'shared-id', 'Alice original')

    const hijack = await harness.request('/api/documents', {
      method: 'POST',
      cookies: bob.cookie,
      csrf: bob.csrf,
      body: JSON.stringify({
        documentId: 'shared-id',
        title: 'Bob overwrote it',
        payload: { ownerSub: 'bob' }
      })
    })
    expect(hijack.status).toBe(409)

    const stored = await DesignDocument.findOne({ documentId: 'shared-id' }).lean()
    if (stored === null) throw new Error('Document was not persisted')
    expect(stored.ownerSub).toBe('alice')
    expect(stored.title).toBe('Alice original')
  })

  it('ignores an ownerSub field supplied in the save body', async () => {
    const alice = await harness.signIn('alice')
    await harness.request('/api/documents', {
      method: 'POST',
      cookies: alice.cookie,
      csrf: alice.csrf,
      body: JSON.stringify({
        documentId: 'doc-c',
        title: 'C',
        payload: { x: 1 },
        ownerSub: 'someone-else'
      })
    })
    const stored = await DesignDocument.findOne({ documentId: 'doc-c' }).lean()
    if (stored === null) throw new Error('Document was not persisted')
    expect(stored.ownerSub).toBe('alice')
  })

  it('does not return every document when no owner is specified', async () => {
    const alice = await harness.signIn('alice')
    const bob = await harness.signIn('bob')
    await seedDocument(alice, 'doc-a', 'A')
    await seedDocument(bob, 'doc-b', 'B')

    // Previously this returned the whole collection for an anonymous caller.
    const anonymous = await harness.request('/api/documents')
    expect(anonymous.status).toBe(401)
    expect(await DesignDocument.countDocuments({})).toBe(2)
  })
})

describe('cross-user settings access (IDOR)', () => {
  it("cannot read another user's settings or credentials", async () => {
    const alice = await harness.signIn('alice')
    const bob = await harness.signIn('bob')

    await harness.request('/api/settings', {
      method: 'POST',
      cookies: alice.cookie,
      csrf: alice.csrf,
      body: JSON.stringify({ credentials: { 'v1:openrouter:default:api-key': 'sk-alice-secret' } })
    })

    const response = await harness.request('/api/settings?ownerSub=alice', { cookies: bob.cookie })
    expect(response.status).toBe(200)
    const body = (await response.json()) as {
      settings: { ownerSub: string; credentials: Record<string, string> } | null
    }
    // Bob sees his own (empty) settings, never Alice's key material.
    expect(body.settings?.ownerSub ?? 'bob').not.toBe('alice')
    expect(JSON.stringify(body)).not.toContain('sk-alice-secret')
  })

  it("cannot overwrite another user's settings", async () => {
    const alice = await harness.signIn('alice')
    const bob = await harness.signIn('bob')

    await harness.request('/api/settings', {
      method: 'POST',
      cookies: alice.cookie,
      csrf: alice.csrf,
      body: JSON.stringify({ credentials: { 'v1:openrouter:default:api-key': 'sk-alice-secret' } })
    })

    // Bob attempts to plant a key in Alice's account.
    await harness.request('/api/settings', {
      method: 'POST',
      cookies: bob.cookie,
      csrf: bob.csrf,
      body: JSON.stringify({
        ownerSub: 'alice',
        credentials: { 'v1:openrouter:default:api-key': 'sk-attacker-planted' }
      })
    })

    const aliceSettings = await UserSettings.findOne({ ownerSub: 'alice' }).lean()
    if (aliceSettings === null) throw new Error('Settings were not persisted')
    expect(aliceSettings.credentials?.['v1:openrouter:default:api-key']).toBe('sk-alice-secret')
  })

  it('round-trips mcp servers and skills so a sync does not drop them', async () => {
    const alice = await harness.signIn('alice')
    const mcpServers = { 'my-server': { command: 'npx', args: ['-y', 'server'], env: {} } }
    const skills = { 'my-skill': { description: 'does a thing' } }

    const save = await harness.request('/api/settings', {
      method: 'POST',
      cookies: alice.cookie,
      csrf: alice.csrf,
      body: JSON.stringify({ mcpServers, skills })
    })
    expect(save.status).toBe(200)

    const read = await harness.request('/api/settings', { cookies: alice.cookie })
    const body: unknown = await read.json()
    const settings = readProperty(body, 'settings')
    expect(readProperty(settings, 'mcpServers')).toEqual(mcpServers)
    expect(readProperty(settings, 'skills')).toEqual(skills)
  })

  it('leaves omitted fields untouched on a partial update', async () => {
    const alice = await harness.signIn('alice')
    await harness.request('/api/settings', {
      method: 'POST',
      cookies: alice.cookie,
      csrf: alice.csrf,
      body: JSON.stringify({
        credentials: { 'v1:openai:default:key': 'sk-keep' },
        skills: { a: { x: 1 } }
      })
    })
    await harness.request('/api/settings', {
      method: 'POST',
      cookies: alice.cookie,
      csrf: alice.csrf,
      body: JSON.stringify({ aiModelSettings: { version: 1 } })
    })

    const read = await harness.request('/api/settings', { cookies: alice.cookie })
    const body: unknown = await read.json()
    const settings = readProperty(body, 'settings')
    expect(readProperty(readProperty(settings, 'credentials'), 'v1:openai:default:key')).toBe(
      'sk-keep'
    )
    expect(readProperty(settings, 'skills')).toEqual({ a: { x: 1 } })
  })

  it('writes settings under the session subject only', async () => {
    const bob = await harness.signIn('bob')
    const response = await harness.request('/api/settings', {
      method: 'POST',
      cookies: bob.cookie,
      csrf: bob.csrf,
      body: JSON.stringify({
        ownerSub: 'alice',
        aiModelSettings: { version: 1, connections: [], models: [], assignments: { design: null } }
      })
    })
    expect(response.status).toBe(200)
    expect(await UserSettings.countDocuments({ ownerSub: 'alice' })).toBe(0)
    expect(await UserSettings.countDocuments({ ownerSub: 'bob' })).toBe(1)
  })
})

describe('CSRF protection', () => {
  it('rejects a state-changing request with no CSRF token', async () => {
    const alice = await harness.signIn('alice')
    const response = await harness.request('/api/documents', {
      method: 'POST',
      cookies: alice.cookie,
      body: JSON.stringify({ documentId: 'csrf-1', payload: {} })
    })
    expect(response.status).toBe(403)
    expect(await DesignDocument.countDocuments({ documentId: 'csrf-1' })).toBe(0)
  })

  it('rejects a request whose CSRF header does not match the cookie', async () => {
    const alice = await harness.signIn('alice')
    const response = await harness.request('/api/documents', {
      method: 'POST',
      // Header token belongs to someone else entirely.
      cookies: `${alice.cookie}; zenuxs_csrf=attacker-csrf-token`,
      csrf: 'attacker-csrf-token',
      body: JSON.stringify({ documentId: 'csrf-2', payload: {} })
    })
    expect(response.status).toBe(403)
  })

  it('allows read-only requests without a CSRF token', async () => {
    const alice = await harness.signIn('alice')
    const response = await harness.request('/api/documents', { cookies: alice.cookie })
    expect(response.status).toBe(200)
  })
})
