/**
 * Authentication middleware.
 *
 * `requireAuth` is the single gate for every protected route. Identity comes
 * exclusively from the server-side session record, so no client-supplied header,
 * query parameter, or body field can influence who the caller is.
 */

import type { NextFunction, Request, Response } from 'express'

import { readCsrfCookie, readSessionCookie, type SessionService } from '../auth/session-service.js'
import type { ServerConfig } from '../config.js'

export interface AuthenticatedRequest extends Request {
  auth?: {
    sessionId: string
    sub: string
    csrfHash: string
  }
}

/** Methods that do not change state and therefore do not need a CSRF token. */
const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS'])

export function createAuthMiddleware(sessions: SessionService, config: ServerConfig) {
  /**
   * Populates `req.auth` when a valid session cookie is present.
   *
   * Never rejects; use `requireAuth` to enforce authentication.
   */
  async function attachAuth(
    req: AuthenticatedRequest,
    res: Response,
    next: NextFunction
  ): Promise<void> {
    const token = readSessionCookie(req, config)
    const context = await sessions.resolveSession(token)
    if (context) {
      req.auth = { sessionId: context.sessionId, sub: context.sub, csrfHash: context.csrfHash }
    }
    next()
  }

  /**
   * Rejects the request unless it carries a live server session.
   *
   * Also enforces the double-submit CSRF check on state-changing methods, so a
   * cross-site request cannot ride on the ambient session cookie.
   */
  async function requireAuth(
    req: AuthenticatedRequest,
    res: Response,
    next: NextFunction
  ): Promise<void> {
    if (!req.auth) {
      res.status(401).json({ error: 'Authentication required' })
      return
    }
    if (!csrfTokenValid(req, res)) return
    next()
  }

  /**
   * CSRF enforcement on its own, for routes that must stay reachable without a
   * session (logout) but still refuse a cross-site state change.
   */
  function requireCsrfToken(req: AuthenticatedRequest, res: Response, next: NextFunction): void {
    if (!csrfTokenValid(req, res)) return
    next()
  }

  /** Runs the double-submit comparison and writes the failure response. */
  function csrfTokenValid(req: AuthenticatedRequest, res: Response): boolean {
    if (SAFE_METHODS.has(req.method)) return true
    if (!req.auth) return true
    const presented = req.get(config.csrfHeaderName)
    const fromCookie = readCsrfCookie(req, config)
    // Both the header and the cookie must carry the same token.
    if (
      !presented ||
      !fromCookie ||
      !sessions.csrfTokenValid(req.auth.csrfHash, presented) ||
      presented !== fromCookie
    ) {
      res.status(403).json({ error: 'CSRF validation failed' })
      return false
    }
    return true
  }

  return { attachAuth, requireAuth, requireCsrfToken }
}

/**
 * Returns the authenticated subject.
 *
 * Throws when called from a route that is not behind `requireAuth`; that would
 * be a programming error rather than a user error.
 */
export function requireSubject(req: AuthenticatedRequest): string {
  if (!req.auth) {
    throw new Error('requireSubject() called on an unauthenticated request')
  }
  return req.auth.sub
}
