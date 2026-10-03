/**
 * Session lifecycle endpoints.
 *
 * The previous `POST /api/auth/verify` accepted an arbitrary `sub` from the
 * browser and upserted it, which let anyone create or overwrite any account.
 * It has been replaced: identity is now established only from a token that the
 * server independently verifies against the identity provider.
 */

import { randomUUID } from 'node:crypto'

import { Router, type Request, type RequestHandler, type Response } from 'express'
import * as v from 'valibot'

import type { OidcVerifier, VerifiedIdentity } from '../auth/oidc.js'
import { readSessionCookie, type SessionService } from '../auth/session-service.js'
import type { ServerConfig } from '../config.js'
import { DesignDocument } from '../db/models/Document.js'
import { User } from '../db/models/User.js'
import { UserSettings } from '../db/models/UserSettings.js'
import type { AuthenticatedRequest } from '../middleware/auth.js'
import { createRateLimiter } from '../middleware/security.js'
import { formatIssues, sessionCreateSchema } from '../validation/schemas.js'

export interface AuthRouterDeps {
  sessions: SessionService
  verifier: OidcVerifier
  config: ServerConfig
  requireCsrfToken: RequestHandler
}

export function createAuthRouter(deps: AuthRouterDeps): Router {
  const { sessions, verifier, config, requireCsrfToken } = deps
  const router = Router()

  // Session creation performs a network call to the identity provider, so it is
  // both the brute-force and the DoS-relevant surface.
  const sessionRateLimit = createRateLimiter({
    windowMs: 60_000,
    max: config.sessionRateLimitMax,
    keyGenerator: (req) => req.ip ?? 'unknown'
  })

  /**
   * POST /api/auth/session
   *
   * Exchanges a verified OAuth token for a server-managed session cookie.
   */
  router.post('/session', sessionRateLimit, async (req: Request, res: Response) => {
    const parsed = v.safeParse(sessionCreateSchema, req.body)
    if (!parsed.success) {
      res
        .status(400)
        .json({ error: 'Invalid session request', detail: formatIssues(parsed.issues) })
      return
    }
    const { access_token: accessToken, id_token: idToken } = parsed.output

    let identity
    try {
      identity = await verifier.verifyTokens({ accessToken, idToken })
    } catch (error) {
      const code = error instanceof Error ? error.message : 'token_rejected'
      // Logged without the token itself.
      console.warn(`[auth] Token verification failed: ${code}`)
      res.status(401).json({ error: 'Invalid or expired credentials' })
      return
    }

    const user = await User.findOneAndUpdate(
      { sub: identity.sub },
      {
        $set: {
          // Profile fields come from the provider's verified response, not the browser.
          ...(identity.name !== undefined && { name: identity.name }),
          ...(identity.email !== undefined && { email: identity.email }),
          ...(identity.picture !== undefined && { picture: identity.picture }),
          lastLoginAt: new Date()
        },
        $setOnInsert: { sub: identity.sub }
      },
      { upsert: true, new: true }
    )

    const previousGuestSub = (req as AuthenticatedRequest).auth?.sub
    if (
      previousGuestSub &&
      previousGuestSub.startsWith('guest_') &&
      previousGuestSub !== identity.sub
    ) {
      try {
        await DesignDocument.updateMany(
          { ownerSub: previousGuestSub },
          { $set: { ownerSub: identity.sub } }
        )
        await UserSettings.updateMany(
          { ownerSub: previousGuestSub },
          { $set: { ownerSub: identity.sub } }
        )
      } catch (err) {
        console.warn('[auth] Failed migrating guest data to user:', err)
      }
    }

    const { token, csrfToken, context } = await sessions.createSession({
      identity,
      userAgent: req.get('user-agent'),
      ip: req.ip
    })
    sessions.attachCookies(res, token, csrfToken)

    res.json({
      success: true,
      user: {
        sub: user.sub,
        name: user.name ?? null,
        email: user.email ?? null,
        picture: user.picture ?? null
      },
      expiresAt: context.expiresAt.toISOString(),
      csrfHeaderName: config.csrfHeaderName
    })
  })

  /**
   * POST /api/auth/guest
   *
   * Provisions an anonymous guest account and session stored in MongoDB,
   * allowing visitors to save projects and settings before signing in.
   */
  router.post('/guest', sessionRateLimit, async (req: Request, res: Response) => {
    // If client already has a valid session (guest or registered), preserve it
    const existingReq = req as AuthenticatedRequest
    if (existingReq.auth?.sub) {
      const existingUser = await User.findOne({ sub: existingReq.auth.sub })
      if (existingUser) {
        res.json({
          success: true,
          user: {
            sub: existingUser.sub,
            name: existingUser.name ?? 'Guest User',
            email: existingUser.email ?? null,
            picture: existingUser.picture ?? null
          },
          csrfHeaderName: config.csrfHeaderName
        })
        return
      }
    }

    const guestSub = `guest_${randomUUID()}`
    const identity: VerifiedIdentity = {
      sub: guestSub,
      name: 'Guest User'
    }

    const user = await User.create({
      sub: guestSub,
      name: identity.name,
      email: null,
      picture: null,
      lastLoginAt: new Date()
    })

    const { token, csrfToken, context } = await sessions.createSession({
      identity,
      userAgent: req.get('user-agent'),
      ip: req.ip
    })
    sessions.attachCookies(res, token, csrfToken)

    res.json({
      success: true,
      user: {
        sub: user.sub,
        name: user.name ?? 'Guest User',
        email: null,
        picture: null
      },
      expiresAt: context.expiresAt.toISOString(),
      csrfHeaderName: config.csrfHeaderName
    })
  })

  /**
   * GET /api/auth/session
   *
   * Restores the current session after a page refresh or browser restart.
   * Returns 401 rather than an error body when there is no live session.
   */
  router.get('/session', async (req: AuthenticatedRequest, res: Response) => {
    if (!req.auth) {
      res.status(401).json({ error: 'No active session' })
      return
    }
    const user = await User.findOne({ sub: req.auth.sub })
    if (!user) {
      res.status(401).json({ error: 'No active session' })
      return
    }
    await sessions.touchSession(req.auth.sessionId)
    res.json({
      success: true,
      user: {
        sub: user.sub,
        name: user.name ?? null,
        email: user.email ?? null,
        picture: user.picture ?? null
      },
      csrfHeaderName: config.csrfHeaderName
    })
  })

  /**
   * DELETE /api/auth/session
   *
   * Revokes the session server-side and clears the cookies, so a previously
   * captured cookie stops working immediately.
   *
   * CSRF is enforced here, unlike on `POST /session`: logout is a state-changing
   * request on an authenticated cookie, so a cross-site request must not be able
   * to sign the user out. A missing session is not an error, so the route stays
   * reachable without one, but a mismatched CSRF token is still refused.
   */
  router.delete('/session', requireCsrfToken, async (req: AuthenticatedRequest, res: Response) => {
    await sessions.revokeSession(readSessionCookie(req, config))
    sessions.clearCookies(res)
    res.status(204).end()
  })

  return router
}
