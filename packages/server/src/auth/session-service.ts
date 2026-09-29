/**
 * Server-managed session lifecycle: create, resolve, rotate, and revoke.
 *
 * The browser only ever holds an opaque random token in an `HttpOnly` cookie.
 * Every request re-derives the user from the database, so a revoked or expired
 * session stops working immediately even if the client kept its cookie.
 */

import type { Request, Response } from 'express'

import type { ServerConfig } from '../config.js'
import { Session } from '../db/models/Session.js'
import {
  clearCookie,
  generateCsrfToken,
  generateSessionToken,
  hashToken,
  tokensMatch
} from '../security/session-token.js'
import type { VerifiedIdentity } from './oidc.js'

export interface SessionContext {
  sessionId: string
  sub: string
  csrfHash: string
  expiresAt: Date
}

export interface CreateSessionInput {
  identity: VerifiedIdentity
  userAgent?: string
  ip?: string
}

/** Maximum characters persisted from a user agent string. */
const MAX_USER_AGENT = 512

function normalizeUserAgent(userAgent: string | undefined): string | undefined {
  if (!userAgent) return undefined
  return userAgent.slice(0, MAX_USER_AGENT)
}

export class SessionService {
  private readonly config: ServerConfig

  constructor(config: ServerConfig) {
    this.config = config
  }

  /** True when cookies must carry the `Secure` attribute. */
  get useSecureCookies(): boolean {
    return this.config.isProduction
  }

  async createSession(
    input: CreateSessionInput
  ): Promise<{ token: string; csrfToken: string; context: SessionContext }> {
    const token = generateSessionToken()
    const csrfToken = generateCsrfToken()
    const expiresAt = new Date(Date.now() + this.config.sessionTtlMs)

    const record = await Session.create({
      tokenHash: hashToken(token),
      sub: input.identity.sub,
      csrfHash: hashToken(csrfToken),
      expiresAt,
      lastUsedAt: new Date(),
      userAgent: normalizeUserAgent(input.userAgent),
      ip: input.ip
    })

    return {
      token,
      csrfToken,
      context: {
        sessionId: String(record._id),
        sub: input.identity.sub,
        csrfHash: record.csrfHash,
        expiresAt
      }
    }
  }

  /**
   * Resolves a raw cookie token to a live session.
   *
   * Returns `null` for unknown, expired, or revoked sessions. A revoked session
   * is treated as absent so that logging out genuinely invalidates access.
   */
  async resolveSession(token: string | undefined): Promise<SessionContext | null> {
    if (!token) return null
    const record = await Session.findOne({ tokenHash: hashToken(token) })
    if (!record) return null
    if (record.revokedAt) return null
    if (record.expiresAt.getTime() <= Date.now()) return null
    return {
      sessionId: String(record._id),
      sub: record.sub,
      csrfHash: record.csrfHash,
      expiresAt: record.expiresAt
    }
  }

  /** Records activity without extending the absolute expiry. */
  async touchSession(sessionId: string): Promise<void> {
    await Session.updateOne({ _id: sessionId }, { $set: { lastUsedAt: new Date() } })
  }

  /** Revokes a single session. Safe to call with an already-revoked token. */
  async revokeSession(token: string | undefined): Promise<void> {
    if (!token) return
    await Session.updateOne({ tokenHash: hashToken(token) }, { $set: { revokedAt: new Date() } })
  }

  /** Revokes every live session for a subject (used on credential compromise). */
  async revokeAllForSubject(sub: string): Promise<number> {
    const result = await Session.updateMany(
      { sub, revokedAt: { $exists: false } },
      { $set: { revokedAt: new Date() } }
    )
    return result.modifiedCount
  }

  /** Constant-time CSRF check for state-changing requests. */
  csrfTokenValid(expectedHash: string, presented: string | undefined): boolean {
    if (!presented) return false
    return tokensMatch(expectedHash, hashToken(presented))
  }

  /** Writes the session and CSRF cookies onto a response. */
  attachCookies(res: Response, token: string, csrfToken: string): void {
    const secure = this.useSecureCookies
    res.append(
      'Set-Cookie',
      serializeSessionCookie(this.config.sessionCookieName, token, this.config.sessionTtlMs, secure)
    )
    // Readable by JS on purpose: it must be echoed back in a header so that a
    // cross-site form post (which cannot read the response) still fails.
    res.append(
      'Set-Cookie',
      `${this.config.csrfCookieName}=${encodeURIComponent(csrfToken)}; Path=/; SameSite=Lax; Max-Age=${Math.floor(
        this.config.sessionTtlMs / 1000
      )}${secure ? '; Secure' : ''}`
    )
  }

  /** Removes the session and CSRF cookies. */
  clearCookies(res: Response): void {
    const secure = this.useSecureCookies
    res.append('Set-Cookie', clearCookie(this.config.sessionCookieName, secure))
    res.append('Set-Cookie', clearCookie(this.config.csrfCookieName, secure))
  }
}

function serializeSessionCookie(
  name: string,
  value: string,
  maxAgeMs: number,
  secure: boolean
): string {
  return [
    `${name}=${value}`,
    'Path=/',
    'HttpOnly',
    'SameSite=Lax',
    secure ? 'Secure' : '',
    `Max-Age=${Math.floor(maxAgeMs / 1000)}`,
    `Expires=${new Date(Date.now() + maxAgeMs).toUTCString()}`
  ]
    .filter((part) => part.length > 0)
    .join('; ')
}

/** Reads the raw session token from the request cookies. */
export function readSessionCookie(req: Request, config: ServerConfig): string | undefined {
  const header = req.headers.cookie
  if (!header) return undefined
  for (const part of header.split(';')) {
    const separator = part.indexOf('=')
    if (separator === -1) continue
    if (part.slice(0, separator).trim() !== config.sessionCookieName) continue
    const raw = part.slice(separator + 1).trim()
    try {
      return decodeURIComponent(raw)
    } catch {
      return raw
    }
  }
  return undefined
}

/** Reads the raw CSRF token from the request cookies. */
export function readCsrfCookie(req: Request, config: ServerConfig): string | undefined {
  const header = req.headers.cookie
  if (!header) return undefined
  for (const part of header.split(';')) {
    const separator = part.indexOf('=')
    if (separator === -1) continue
    if (part.slice(0, separator).trim() !== config.csrfCookieName) continue
    const raw = part.slice(separator + 1).trim()
    try {
      return decodeURIComponent(raw)
    } catch {
      return raw
    }
  }
  return undefined
}
