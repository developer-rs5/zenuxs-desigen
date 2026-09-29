/**
 * Token verification must rely only on what the identity provider attests to.
 *
 * These tests pin the rules that stop a browser from asserting its own identity:
 * a forged access token, a tampered id_token, an `alg: none` downgrade, a wrong
 * audience, and a mismatched token pair all have to be rejected.
 */

import { describe, expect, it } from 'bun:test'

import { OidcVerifier, TokenVerificationError } from '../src/auth/oidc.js'
import { startFakeProvider, testConfig } from './helpers/harness.js'

/**
 * Builds a `fetch` replacement that always answers with `build()`.
 *
 * The OIDC verifier takes an injected `fetch`, so the stub is expressed in the
 * verifier's own option shape rather than widened to the global `fetch` type.
 */
function stubFetch(build: () => Response | Promise<Response>): typeof fetch {
  const stub: typeof fetch = (_input) => Promise.resolve(build()) as ReturnType<typeof fetch>
  return stub
}

/** Builds a `fetch` replacement that always fails, standing in for a dead network. */
function unreachableFetch(): typeof fetch {
  return stubFetch(() => {
    throw new Error('network down')
  })
}

async function withProvider<T>(
  run: (
    provider: Awaited<ReturnType<typeof startFakeProvider>>,
    verifier: OidcVerifier
  ) => Promise<T>
): Promise<T> {
  const provider = await startFakeProvider()
  try {
    return await run(provider, new OidcVerifier(testConfig(provider.origin)))
  } finally {
    await provider.close()
  }
}

async function expectRejection(promise: Promise<unknown>): Promise<TokenVerificationError> {
  try {
    await promise
  } catch (error) {
    expect(error).toBeInstanceOf(TokenVerificationError)
    return error as TokenVerificationError
  }
  throw new Error('Expected verification to be rejected')
}

describe('OidcVerifier', () => {
  it('accepts a valid access token and returns the provider subject', async () => {
    await withProvider(async (provider, verifier) => {
      const token = provider.issueAccessToken('user-a', { email: 'a@example.com', name: 'A' })
      const identity = await verifier.verifyTokens({ accessToken: token })
      expect(identity.sub).toBe('user-a')
      expect(identity.email).toBe('a@example.com')
    })
  })

  it('rejects an access token the provider does not recognise', async () => {
    await withProvider(async (_provider, verifier) => {
      const error = await expectRejection(
        verifier.verifyTokens({ accessToken: 'at_completely_made_up' })
      )
      expect(error.code).toBe('access_token_rejected')
    })
  })

  it('rejects a random or malformed bearer token', async () => {
    await withProvider(async (_provider, verifier) => {
      for (const token of ['', 'x', 'null', '{"sub":"user-a"}', 'a'.repeat(5000)]) {
        await expectRejection(verifier.verifyTokens({ accessToken: token }))
      }
    })
  })

  it('verifies a correctly signed id_token', async () => {
    await withProvider(async (provider, verifier) => {
      const idToken = provider.issueIdToken('user-b')
      const identity = await verifier.verifyTokens({ idToken })
      expect(identity.sub).toBe('user-b')
    })
  })

  it('rejects an id_token whose payload was tampered with', async () => {
    await withProvider(async (provider, verifier) => {
      const idToken = provider.issueIdToken('user-b')
      const [header, _payload, signature] = idToken.split('.') as [string, string, string]
      const forgedPayload = Buffer.from(
        JSON.stringify({
          iss: provider.origin,
          aud: 'test-client-id',
          sub: 'admin',
          exp: Math.floor(Date.now() / 1000) + 3600
        })
      ).toString('base64url')
      const error = await expectRejection(
        verifier.verifyIdToken(`${header}.${forgedPayload}.${signature}`)
      )
      expect(error.code).toBe('id_token_signature_invalid')
    })
  })

  it('rejects an id_token signed by a different key', async () => {
    await withProvider(async (provider, verifier) => {
      const other = await startFakeProvider()
      try {
        // A token minted by a different provider must not validate here.
        await expectRejection(verifier.verifyIdToken(other.issueIdToken('user-c')))
        await expectRejection(verifier.verifyTokens({ idToken: other.issueIdToken('user-c') }))
        expect(provider.origin).not.toBe(other.origin)
      } finally {
        await other.close()
      }
    })
  })

  it('rejects an expired id_token', async () => {
    await withProvider(async (provider, verifier) => {
      const expired = provider.issueIdToken('user-d', { exp: Math.floor(Date.now() / 1000) - 3600 })
      const error = await expectRejection(verifier.verifyIdToken(expired))
      expect(error.code).toBe('id_token_expired')
    })
  })

  it('rejects an id_token issued for a different audience', async () => {
    await withProvider(async (provider, verifier) => {
      const wrongAudience = provider.issueIdToken('user-e', { aud: 'some-other-client' })
      const error = await expectRejection(verifier.verifyIdToken(wrongAudience))
      expect(error.code).toBe('id_token_audience_invalid')
    })
  })

  it('rejects an id_token from a different issuer', async () => {
    await withProvider(async (provider, verifier) => {
      const wrongIssuer = provider.issueIdToken('user-f', { iss: 'https://evil.example' })
      const error = await expectRejection(verifier.verifyIdToken(wrongIssuer))
      expect(error.code).toBe('id_token_issuer_invalid')
    })
  })

  it('rejects an id_token that is not yet valid', async () => {
    await withProvider(async (provider, verifier) => {
      const future = provider.issueIdToken('user-g', { nbf: Math.floor(Date.now() / 1000) + 3600 })
      const error = await expectRejection(verifier.verifyIdToken(future))
      expect(error.code).toBe('id_token_not_yet_valid')
    })
  })

  it('rejects an alg:none downgrade', async () => {
    await withProvider(async (provider, verifier) => {
      const header = Buffer.from(JSON.stringify({ alg: 'none', typ: 'JWT' })).toString('base64url')
      const payload = Buffer.from(
        JSON.stringify({
          iss: provider.origin,
          aud: 'test-client-id',
          sub: 'admin',
          exp: Math.floor(Date.now() / 1000) + 3600
        })
      ).toString('base64url')
      const error = await expectRejection(verifier.verifyIdToken(`${header}.${payload}.`))
      expect(['id_token_alg_rejected', 'id_token_malformed']).toContain(error.code)
    })
  })

  it('rejects an id_token with an unsupported algorithm', async () => {
    await withProvider(async (provider, verifier) => {
      const header = Buffer.from(
        JSON.stringify({ alg: 'HS256', typ: 'JWT', kid: 'test-key' })
      ).toString('base64url')
      const payload = Buffer.from(
        JSON.stringify({
          iss: provider.origin,
          aud: 'test-client-id',
          sub: 'admin',
          exp: Math.floor(Date.now() / 1000) + 3600
        })
      ).toString('base64url')
      const error = await expectRejection(verifier.verifyIdToken(`${header}.${payload}.c2ln`))
      expect(error.code).toBe('id_token_alg_rejected')
    })
  })

  it('rejects a structurally malformed id_token', async () => {
    await withProvider(async (_provider, verifier) => {
      for (const token of ['not.a.jwt', 'onlyonesegment', 'a.b', '...', 'e30.e30.e30']) {
        await expectRejection(verifier.verifyIdToken(token))
      }
    })
  })

  it('rejects an id_token with no subject', async () => {
    await withProvider(async (provider, verifier) => {
      const noSub = provider.issueIdToken('placeholder', { sub: undefined })
      await expectRejection(verifier.verifyIdToken(noSub))
    })
  })

  it('rejects a token pair describing two different subjects', async () => {
    await withProvider(async (provider, verifier) => {
      const accessToken = provider.issueAccessToken('user-h')
      const idToken = provider.issueIdToken('user-i')
      const error = await expectRejection(verifier.verifyTokens({ accessToken, idToken }))
      expect(error.code).toBe('subject_mismatch')
    })
  })

  it('rejects a request with no token at all', async () => {
    await withProvider(async (_provider, verifier) => {
      const error = await expectRejection(verifier.verifyTokens({}))
      expect(error.code).toBe('token_missing')
    })
  })

  it('rejects a discovery document that names a different issuer', async () => {
    // A reachable host that serves a discovery document for someone else.
    const verifier = new OidcVerifier(testConfig('https://configured-issuer.example'), {
      fetchImpl: stubFetch(
        () =>
          new Response(
            JSON.stringify({
              issuer: 'https://attacker-issuer.example',
              userinfo_endpoint: 'https://attacker-issuer.example/oauth/userinfo',
              jwks_uri: 'https://attacker-issuer.example/oauth/.well-known/jwks.json'
            }),
            { status: 200, headers: { 'content-type': 'application/json' } }
          )
      )
    })
    const error = await expectRejection(verifier.getDiscoveryDocument())
    expect(error.code).toBe('issuer_mismatch')
  })

  it('rejects a discovery document that omits required endpoints', async () => {
    const verifier = new OidcVerifier(testConfig('https://configured-issuer.example'), {
      fetchImpl: stubFetch(
        () =>
          new Response(JSON.stringify({ issuer: 'https://configured-issuer.example' }), {
            status: 200,
            headers: { 'content-type': 'application/json' }
          })
      )
    })
    const error = await expectRejection(verifier.getDiscoveryDocument())
    expect(error.code).toBe('discovery_incomplete')
  })

  it('reports an unreachable identity provider instead of trusting the caller', async () => {
    const verifier = new OidcVerifier(testConfig('https://configured-issuer.example'), {
      fetchImpl: unreachableFetch()
    })
    await expectRejection(verifier.verifyTokens({ accessToken: 'anything' }))
  })

  it('does not send the token anywhere except the userinfo endpoint', async () => {
    await withProvider(async (provider, verifier) => {
      const token = provider.issueAccessToken('user-j')
      await verifier.verifyTokens({ accessToken: token })
      // Exactly one provider call: the userinfo lookup.
      expect(provider.userinfoCalls()).toBe(1)
    })
  })
})
