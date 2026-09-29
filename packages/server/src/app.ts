/**
 * Express application factory.
 *
 * Exported separately from `index.ts` so tests can mount the real app (with the
 * real middleware chain) without binding a port or connecting to MongoDB.
 */

import express, { type Application, type NextFunction, type Request, type Response } from 'express'

import { OidcVerifier, type OidcVerifierOptions } from './auth/oidc.js'
import { SessionService } from './auth/session-service.js'
import { loadConfig, type ServerConfig } from './config.js'
import { createAuthMiddleware } from './middleware/auth.js'
import { corsMiddleware, notFoundHandler, securityHeaders } from './middleware/security.js'
import { createAuthRouter } from './routes/auth.js'
import { createDocumentsRouter } from './routes/documents.js'
import { createSettingsRouter } from './routes/settings.js'

export interface CreateAppOptions {
  config?: ServerConfig
  verifier?: OidcVerifier
  verifierOptions?: OidcVerifierOptions
}

export interface ZenuxsApp extends Application {
  zenuxs: {
    config: ServerConfig
    sessions: SessionService
    verifier: OidcVerifier
  }
}

export function createApp(options: CreateAppOptions = {}): ZenuxsApp {
  const config = options.config ?? loadConfig()
  const verifier = options.verifier ?? new OidcVerifier(config, options.verifierOptions)
  const sessions = new SessionService(config)
  const { attachAuth, requireAuth, requireCsrfToken } = createAuthMiddleware(sessions, config)

  const app: Application = express()

  // Only honour X-Forwarded-* when explicitly enabled; otherwise a client could
  // spoof its IP and evade rate limiting.
  app.set('trust proxy', config.trustProxy)
  app.disable('x-powered-by')

  app.use(securityHeaders(config))
  app.use(corsMiddleware(config))
  // Malformed JSON must produce a JSON 413/400, not an HTML stack page.
  app.use(express.json({ limit: '12mb' }))
  app.use(express.urlencoded({ extended: false, limit: '1mb' }))

  // Health is intentionally public but reveals nothing beyond liveness.
  app.get('/health', (_req: Request, res: Response) => {
    res.json({ status: 'ok', service: 'zenuxs-desigen-server' })
  })

  // Populate req.auth for every API route; `requireAuth` then enforces it.
  app.use('/api', attachAuth)

  app.use('/api/auth', createAuthRouter({ sessions, verifier, config, requireCsrfToken }))
  // Every route below requires a live server session.
  app.use('/api/documents', requireAuth, createDocumentsRouter({ sessions }))
  app.use('/api/settings', requireAuth, createSettingsRouter({ sessions }))

  app.use(notFoundHandler)

  // Terminal error handler: JSON only, and never leaks internals to the client.
  app.use((error: unknown, _req: Request, res: Response, _next: NextFunction) => {
    if (isBodyParserError(error)) {
      res.status(error.status === 413 ? 413 : 400).json({ error: 'Invalid request body' })
      return
    }
    console.error('[server] Unhandled error:', error instanceof Error ? error.message : error)
    res.status(500).json({ error: 'Internal server error' })
  })

  return Object.assign(app, { zenuxs: { config, sessions, verifier } })
}

function isBodyParserError(error: unknown): error is { status: number; type: string } {
  return (
    typeof error === 'object' &&
    error !== null &&
    'type' in error &&
    typeof (error as { type: unknown }).type === 'string' &&
    (error as { type: string }).type.startsWith('entity.')
  )
}
