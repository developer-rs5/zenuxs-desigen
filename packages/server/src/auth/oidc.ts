/**
 * Server-side verification of Zenuxs OAuth tokens.
 *
 * The browser is never trusted for identity. Two independent, provider-backed
 * checks are performed:
 *
 *  1. `verifyAccessToken` calls the provider's userinfo endpoint from the
 *     server using the presented access token. A token that the provider does
 *     not recognise produces a 401 here, so forged or expired tokens cannot
 *     reach the application. This works for both JWT and opaque access tokens.
 *  2. `verifyIdToken` validates the RS256 signature of the id_token against the
 *     provider's published JWKS and checks `iss`/`aud`/`exp`/`nbf`. This proves
 *     the identity claim was signed by the provider for *this* client.
 *
 * At least one of the two must succeed, and when an id_token is supplied it
 * must agree with the access token subject (`sub`).
 */

import { createHash, createPublicKey, createVerify } from 'node:crypto'

import type { ServerConfig } from '../config.js'

export interface VerifiedIdentity {
  sub: string
  name?: string
  email?: string
  picture?: string
  emailVerified?: boolean
}

export class TokenVerificationError extends Error {
  readonly code: string
  constructor(code: string, message: string) {
    super(message)
    this.name = 'TokenVerificationError'
    this.code = code
  }
}

interface DiscoveryDocument {
  issuer: string
  userinfo_endpoint: string
  jwks_uri: string
  id_token_signing_alg_values_supported?: string[]
}

interface JwtHeader {
  alg?: string
  kid?: string
}

/**
 * Verified-claim bag as emitted by the provider. The payload is untrusted
 * input, so every registered claim is read through an explicit runtime check
 * rather than being trusted by type.
 */
type Claims = Readonly<Record<string, unknown>>

function isClaimsObject(value: unknown): value is Claims {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return false
  for (const entry of Object.values(value)) {
    if (typeof entry === 'function' || typeof entry === 'symbol') return false
  }
  return true
}

function parseClaims(segment: string): Claims | null {
  const parsed: unknown = JSON.parse(b64URLToBuffer(segment).toString('utf8'))
  return isClaimsObject(parsed) ? parsed : null
}

function parseJwtHeader(segment: string): JwtHeader | null {
  const parsed: unknown = JSON.parse(b64URLToBuffer(segment).toString('utf8'))
  if (!isClaimsObject(parsed)) return null
  return {
    alg: typeof parsed.alg === 'string' ? parsed.alg : undefined,
    kid: typeof parsed.kid === 'string' ? parsed.kid : undefined
  }
}

function toAudienceList(value: unknown): string[] {
  if (Array.isArray(value)) {
    return value.filter((entry): entry is string => typeof entry === 'string')
  }
  return typeof value === 'string' ? [value] : []
}

interface Jwk {
  kid?: string
  kty?: string
  alg?: string
  use?: string
  n?: string
  e?: string
}

interface CachedKeys {
  keys: Jwk[]
  fetchedAt: number
}

const DISCOVERY_TTL_MS = 10 * 60 * 1000
const JWKS_TTL_MS = 10 * 60 * 1000
const CLOCK_SKEW_SECONDS = 60

function b64URLToBuffer(value: string): Buffer {
  const padded = value.replace(/-/g, '+').replace(/_/g, '/')
  return Buffer.from(padded + '='.repeat((4 - (padded.length % 4)) % 4), 'base64')
}

export interface OidcVerifierOptions {
  /** Injectable for tests; defaults to the global fetch. */
  fetchImpl?: typeof fetch
  now?: () => number
  discoveryTtlMs?: number
  jwksTtlMs?: number
}

/**
 * Verifies tokens against the configured Zenuxs issuer.
 *
 * Instances are cheap and cache discovery/JWKS documents in memory, so a single
 * instance should be created at startup and reused.
 */
export class OidcVerifier {
  private readonly config: ServerConfig
  private readonly fetchImpl: typeof fetch
  private readonly now: () => number
  private readonly discoveryTtlMs: number
  private readonly jwksTtlMs: number
  private discovery: { doc: DiscoveryDocument; fetchedAt: number } | null = null
  private jwks: CachedKeys | null = null
  private inFlight: Promise<DiscoveryDocument> | null = null

  constructor(config: ServerConfig, options: OidcVerifierOptions = {}) {
    this.config = config
    this.fetchImpl = options.fetchImpl ?? fetch
    this.now = options.now ?? Date.now
    this.discoveryTtlMs = options.discoveryTtlMs ?? DISCOVERY_TTL_MS
    this.jwksTtlMs = options.jwksTtlMs ?? JWKS_TTL_MS
  }

  private isFresh(entry: { fetchedAt: number } | null, ttl: number): boolean {
    return entry !== null && this.now() - entry.fetchedAt < ttl
  }

  /** Fetches and caches the provider's OIDC discovery document. */
  async getDiscoveryDocument(): Promise<DiscoveryDocument> {
    if (this.isFresh(this.discovery, this.discoveryTtlMs) && this.discovery) {
      return this.discovery.doc
    }
    if (this.inFlight) return this.inFlight

    this.inFlight = (async () => {
      const url = `${this.config.issuer}/oauth/.well-known/openid-configuration`
      let res: Response
      try {
        res = await this.fetchImpl(url, { headers: { accept: 'application/json' } })
      } catch {
        // An unreachable provider must never be treated as a valid identity.
        throw new TokenVerificationError(
          'discovery_unreachable',
          'Could not reach the identity provider'
        )
      }
      if (!res.ok) {
        throw new TokenVerificationError(
          'discovery_unavailable',
          `OIDC discovery failed (${res.status})`
        )
      }
      const doc = (await res.json()) as DiscoveryDocument
      // The discovery document must describe the issuer we were configured with,
      // otherwise a compromised/misconfigured document could redirect verification.
      if (doc.issuer?.replace(/\/+$/, '') !== this.config.issuer) {
        throw new TokenVerificationError(
          'issuer_mismatch',
          'OIDC discovery issuer does not match configuration'
        )
      }
      if (!doc.userinfo_endpoint || !doc.jwks_uri) {
        throw new TokenVerificationError(
          'discovery_incomplete',
          'OIDC discovery document is missing required endpoints'
        )
      }
      this.discovery = { doc, fetchedAt: this.now() }
      return doc
    })()

    try {
      return await this.inFlight
    } finally {
      this.inFlight = null
    }
  }

  private async getJwks(): Promise<Jwk[]> {
    if (this.isFresh(this.jwks, this.jwksTtlMs) && this.jwks) return this.jwks.keys
    const doc = await this.getDiscoveryDocument()
    let res: Response
    try {
      res = await this.fetchImpl(doc.jwks_uri, { headers: { accept: 'application/json' } })
    } catch {
      throw new TokenVerificationError(
        'jwks_unreachable',
        'Could not reach the identity provider JWKS'
      )
    }
    if (!res.ok) {
      throw new TokenVerificationError('jwks_unavailable', `JWKS fetch failed (${res.status})`)
    }
    const body = (await res.json()) as { keys?: Jwk[] }
    const keys = Array.isArray(body.keys) ? body.keys : []
    if (keys.length === 0) {
      throw new TokenVerificationError('jwks_empty', 'JWKS document contained no keys')
    }
    this.jwks = { keys, fetchedAt: this.now() }
    return keys
  }

  /**
   * Validates the id_token against the provider JWKS.
   *
   * Rejects any algorithm other than the provider-advertised asymmetric signing
   * algorithms, which is what blocks `alg: none` and HMAC-confusion attacks.
   */
  async verifyIdToken(idToken: string): Promise<VerifiedIdentity> {
    const parts = idToken.split('.')
    if (parts.length !== 3) {
      throw new TokenVerificationError('id_token_malformed', 'id_token is not a well-formed JWS')
    }
    const [headerSegment, payloadSegment, signatureSegment] = parts as [string, string, string]

    let header: JwtHeader
    let payload: Claims
    try {
      const parsedHeader = parseJwtHeader(headerSegment)
      const parsedPayload = parseClaims(payloadSegment)
      if (parsedHeader === null || parsedPayload === null) {
        throw new TokenVerificationError(
          'id_token_malformed',
          'id_token segments are not JSON objects'
        )
      }
      header = parsedHeader
      payload = parsedPayload
    } catch (error) {
      if (error instanceof TokenVerificationError) throw error
      throw new TokenVerificationError(
        'id_token_malformed',
        'id_token segments are not valid base64url JSON'
      )
    }

    const doc = await this.getDiscoveryDocument()
    const supported = doc.id_token_signing_alg_values_supported ?? ['RS256']
    if (!header.alg || !supported.includes(header.alg)) {
      throw new TokenVerificationError(
        'id_token_alg_rejected',
        `Unsupported id_token algorithm: ${header.alg ?? 'none'}`
      )
    }

    const keys = await this.getJwks()
    const candidates = header.kid ? keys.filter((key) => key.kid === header.kid) : keys
    if (candidates.length === 0) {
      throw new TokenVerificationError(
        'id_token_key_unknown',
        'No JWKS key matches the id_token header'
      )
    }

    const signedData = Buffer.from(`${headerSegment}.${payloadSegment}`, 'utf8')
    const signature = b64URLToBuffer(signatureSegment)
    const verified = candidates.some((key) => this.verifySignature(key, signedData, signature))
    if (!verified) {
      throw new TokenVerificationError(
        'id_token_signature_invalid',
        'id_token signature verification failed'
      )
    }

    this.assertRegisteredClaims(payload)
    return toIdentity(payload)
  }

  private verifySignature(key: Jwk, data: Buffer, signature: Buffer): boolean {
    if (!key.n || !key.e || key.kty !== 'RSA') return false
    try {
      const publicKey = createPublicKey({ key: { kty: 'RSA', n: key.n, e: key.e }, format: 'jwk' })
      const verifier = createVerify('RSA-SHA256')
      verifier.update(data)
      verifier.end()
      return verifier.verify(publicKey, signature)
    } catch {
      return false
    }
  }

  private assertRegisteredClaims(payload: Claims): void {
    const nowSeconds = Math.floor(this.now() / 1000)
    const issuer = typeof payload.iss === 'string' ? payload.iss.replace(/\/+$/, '') : null
    if (issuer !== this.config.issuer) {
      throw new TokenVerificationError(
        'id_token_issuer_invalid',
        'id_token issuer is not the configured issuer'
      )
    }

    const audiences = toAudienceList(payload.aud)
    if (!audiences.includes(this.config.clientId)) {
      throw new TokenVerificationError(
        'id_token_audience_invalid',
        'id_token audience does not include this client'
      )
    }

    if (typeof payload.exp !== 'number' || payload.exp + CLOCK_SKEW_SECONDS < nowSeconds) {
      throw new TokenVerificationError('id_token_expired', 'id_token is expired')
    }
    if (typeof payload.nbf === 'number' && payload.nbf - CLOCK_SKEW_SECONDS > nowSeconds) {
      throw new TokenVerificationError('id_token_not_yet_valid', 'id_token is not yet valid')
    }
    if (typeof payload.sub !== 'string' || payload.sub.length === 0) {
      throw new TokenVerificationError('id_token_missing_sub', 'id_token is missing a subject')
    }
  }

  /**
   * Confirms an access token with the provider and returns the verified subject.
   *
   * This is the authoritative identity source: the request originates from the
   * server, so the response cannot have been produced by the browser.
   */
  async verifyAccessToken(accessToken: string): Promise<VerifiedIdentity> {
    const doc = await this.getDiscoveryDocument()
    let res: Response
    try {
      res = await this.fetchImpl(doc.userinfo_endpoint, {
        headers: { authorization: `Bearer ${accessToken}`, accept: 'application/json' }
      })
    } catch {
      throw new TokenVerificationError(
        'userinfo_unreachable',
        'Could not reach the identity provider'
      )
    }
    if (res.status === 401 || res.status === 403) {
      throw new TokenVerificationError(
        'access_token_rejected',
        'Identity provider rejected the access token'
      )
    }
    if (!res.ok) {
      throw new TokenVerificationError(
        'userinfo_unavailable',
        `Identity provider error (${res.status})`
      )
    }

    let claims: Claims
    try {
      const parsed: unknown = await res.json()
      if (!isClaimsObject(parsed)) {
        throw new TokenVerificationError(
          'userinfo_malformed',
          'Identity provider returned a malformed userinfo response'
        )
      }
      claims = parsed
    } catch (error) {
      if (error instanceof TokenVerificationError) throw error
      throw new TokenVerificationError(
        'userinfo_malformed',
        'Identity provider returned a malformed userinfo response'
      )
    }
    if (typeof claims.sub !== 'string' || claims.sub.length === 0) {
      throw new TokenVerificationError(
        'userinfo_missing_sub',
        'Identity provider response is missing a subject'
      )
    }
    return toIdentity(claims)
  }

  /**
   * Verifies a token pair presented by the browser and returns the identity the
   * provider attests to. At least one provider-backed check must succeed.
   */
  async verifyTokens(input: { accessToken?: string; idToken?: string }): Promise<VerifiedIdentity> {
    if (!input.accessToken && !input.idToken) {
      throw new TokenVerificationError('token_missing', 'No access_token or id_token was provided')
    }

    const results: VerifiedIdentity[] = []
    const errors: TokenVerificationError[] = []

    if (input.accessToken) {
      try {
        results.push(await this.verifyAccessToken(input.accessToken))
      } catch (error) {
        if (error instanceof TokenVerificationError) errors.push(error)
        else throw error
      }
    }
    if (input.idToken) {
      try {
        results.push(await this.verifyIdToken(input.idToken))
      } catch (error) {
        if (error instanceof TokenVerificationError) errors.push(error)
        else throw error
      }
    }

    if (results.length === 0) {
      throw errors[0] ?? new TokenVerificationError('token_rejected', 'Token verification failed')
    }

    // When both are present they must describe the same principal; a mismatch
    // means one of the two was obtained for a different identity.
    const subjects = new Set(results.map((identity) => identity.sub))
    if (subjects.size > 1) {
      throw new TokenVerificationError(
        'subject_mismatch',
        'access_token and id_token describe different subjects'
      )
    }

    const [primary] = results
    return results.find((identity) => identity.email !== undefined) ?? primary
  }
}

function toIdentity(claims: Claims): VerifiedIdentity {
  const identity: VerifiedIdentity = { sub: String(claims.sub) }
  if (typeof claims.name === 'string') identity.name = claims.name
  if (typeof claims.email === 'string') identity.email = claims.email
  if (typeof claims.picture === 'string') identity.picture = claims.picture
  if (typeof claims.email_verified === 'boolean') identity.emailVerified = claims.email_verified
  return identity
}

/** Stable hash used for audit logging so tokens are never written to logs. */
export function fingerprintToken(token: string): string {
  return createHash('sha256').update(token, 'utf8').digest('hex').slice(0, 12)
}
