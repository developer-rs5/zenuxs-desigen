/**
 * Transport and browser security configuration: response headers, a strict CORS
 * allowlist, and abuse protection for authentication endpoints.
 */

import type { NextFunction, Request, Response } from 'express'

import type { ServerConfig } from '../config.js'

/**
 * Security headers applied to every response.
 *
 * The CSP is deliberately strict: the app never loads remote script, and the
 * Zenuxs sign-in UI is hosted inside a sandboxed iframe provided by the OAuth
 * library. `frame-ancestors 'none'` blocks clickjacking of the whole app.
 */
export function securityHeaders(config: ServerConfig) {
  const connectSources = ["'self'", config.issuer]
  for (const origin of config.allowedOrigins) {
    connectSources.push(origin)
  }

  const headers: Record<string, string> = {
    'Content-Security-Policy': [
      "default-src 'self'",
      "script-src 'self' 'wasm-unsafe-eval' blob:",
      "worker-src 'self' blob:",
      "style-src 'self' 'unsafe-inline'",
      // CanvasKit is loaded from the app origin; the OAuth library hosts its
      // sign-in UI in a sandboxed frame.
      "frame-src 'self' https:",
      "child-src 'self' blob:",
      "img-src 'self' data: blob: https:",
      "font-src 'self' data:",
      `connect-src ${connectSources.join(' ')}`,
      "object-src 'none'",
      "base-uri 'self'",
      "form-action 'self'",
      "frame-ancestors 'none'",
      "manifest-src 'self'",
      'upgrade-insecure-requests'
    ].join('; '),
    'X-Content-Type-Options': 'nosniff',
    'X-Frame-Options': 'DENY',
    'Referrer-Policy': 'no-referrer',
    'Cross-Origin-Opener-Policy': 'same-origin',
    'Cross-Origin-Resource-Policy': 'same-site',
    'Permissions-Policy': 'camera=(), microphone=(), geolocation=(), payment=()'
  }

  if (config.isProduction) {
    headers['Strict-Transport-Security'] = 'max-age=63072000; includeSubDomains; preload'
  }

  return function securityHeadersMiddleware(
    _req: Request,
    res: Response,
    next: NextFunction
  ): void {
    for (const [name, value] of Object.entries(headers)) {
      res.setHeader(name, value)
    }
    next()
  }
}

export interface CORSDecision {
  allowed: boolean
  headers: Record<string, string>
}

/**
 * Decides CORS for a request against a strict origin allowlist.
 *
 * Credentialed requests are only permitted for allowlisted origins, and the
 * response echoes the specific origin rather than `*`, because the wildcard is
 * incompatible with `Access-Control-Allow-Credentials`.
 */
export function decideCORS(origin: string | undefined, config: ServerConfig): CORSDecision {
  const headers: Record<string, string> = {
    Vary: 'Origin',
    'Access-Control-Allow-Methods': 'GET,POST,DELETE,OPTIONS',
    'Access-Control-Allow-Headers': `Content-Type, ${config.csrfHeaderName}`,
    'Access-Control-Max-Age': '600'
  }

  if (!origin) {
    // Same-origin and non-browser clients need no CORS headers.
    return { allowed: true, headers }
  }
  if (!config.allowedOrigins.includes(origin)) {
    return { allowed: false, headers }
  }

  headers['Access-Control-Allow-Origin'] = origin
  headers['Access-Control-Allow-Credentials'] = 'true'
  return { allowed: true, headers }
}

export function corsMiddleware(config: ServerConfig) {
  return function cors(req: Request, res: Response, next: NextFunction): void {
    const origin = req.headers.origin
    const decision = decideCORS(typeof origin === 'string' ? origin : undefined, config)

    for (const [name, value] of Object.entries(decision.headers)) {
      res.setHeader(name, value)
    }

    if (!decision.allowed) {
      // Do not emit Allow-Origin; the browser will block the read.
      res.status(403).json({ error: 'Origin not allowed' })
      return
    }
    if (req.method === 'OPTIONS') {
      res.status(204).end()
      return
    }
    next()
  }
}

interface RateLimitEntry {
  count: number
  resetAt: number
}

export interface RateLimiterOptions {
  windowMs: number
  max: number
  now?: () => number
  /** Distinguishes clients; defaults to the request IP. */
  keyGenerator?: (req: Request) => string
}

/**
 * Fixed-window in-memory rate limiter.
 *
 * Sufficient for a single-instance deployment and for the brute-force and
 * account-enumeration threat models here. A shared store (Redis) would be
 * required to make the limit global across replicas.
 */
export function createRateLimiter(options: RateLimiterOptions) {
  const now = options.now ?? Date.now
  const keyGenerator = options.keyGenerator ?? ((req: Request) => req.ip ?? 'unknown')
  const entries = new Map<string, RateLimitEntry>()

  // Bound memory: drop expired entries whenever the map grows.
  const sweep = (): void => {
    if (entries.size < 10_000) return
    const current = now()
    for (const [key, entry] of entries) {
      if (entry.resetAt <= current) entries.delete(key)
    }
  }

  return function rateLimiter(req: Request, res: Response, next: NextFunction): void {
    const key = keyGenerator(req)
    const current = now()
    sweep()

    let entry = entries.get(key)
    if (!entry || entry.resetAt <= current) {
      entry = { count: 0, resetAt: current + options.windowMs }
      entries.set(key, entry)
    }
    entry.count += 1

    const remaining = Math.max(0, options.max - entry.count)
    res.setHeader('X-RateLimit-Limit', String(options.max))
    res.setHeader('X-RateLimit-Remaining', String(remaining))
    res.setHeader('X-RateLimit-Reset', String(Math.ceil(entry.resetAt / 1000)))

    if (entry.count > options.max) {
      res.setHeader('Retry-After', String(Math.ceil((entry.resetAt - current) / 1000)))
      res.status(429).json({ error: 'Too many requests' })
      return
    }
    next()
  }
}

/**
 * Rejects bodies that are structurally unacceptable for the route.
 *
 * Returning a JSON 400 instead of Express's default HTML page avoids leaking
 * framework internals to clients.
 */
export function notFoundHandler(_req: Request, res: Response): void {
  res.status(404).json({ error: 'Not found' })
}
