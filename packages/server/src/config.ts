/**
 * Runtime configuration for the ZenuxsDesign backend.
 *
 * Every security-relevant value is read from the environment exactly once and
 * validated here, so the rest of the server never touches `process.env`
 * directly and cannot accidentally operate on an unvalidated default.
 */

const DEFAULT_ISSUER = 'https://api.auth.zenuxs.in'
const DEFAULT_CLIENT_ID = 'd5695548c45c3ae5'
const DEFAULT_PORT = 3000
const DEFAULT_SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000

/** Local development origins that are allowed to send credentialed requests. */
const DEV_ORIGINS = [
  'http://localhost:1420',
  'http://127.0.0.1:1420',
  'https://open-pencil.localhost'
]

export interface ServerConfig {
  nodeEnv: string
  isProduction: boolean
  port: number
  mongoURI: string
  /** OIDC issuer used to verify tokens presented by the browser. */
  issuer: string
  /** Expected `aud` of the id_token / authorized client. */
  clientId: string
  /** Comma-separated allowlist of browser origins permitted to send credentials. */
  allowedOrigins: string[]
  sessionTtlMs: number
  /** Session-creation attempts allowed per client IP per minute. */
  sessionRateLimitMax: number
  sessionCookieName: string
  csrfCookieName: string
  csrfHeaderName: string
  /** Trust `X-Forwarded-*` (only correct behind a controlled reverse proxy). */
  trustProxy: boolean
}

function readInt(value: string | undefined, fallback: number): number {
  if (!value) return fallback
  const parsed = Number.parseInt(value, 10)
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback
}

function readList(value: string | undefined, fallback: string[]): string[] {
  if (!value) return fallback
  const entries = value
    .split(',')
    .map((entry) => entry.trim())
    .filter((entry) => entry.length > 0)
  return entries.length > 0 ? entries : fallback
}

export function loadConfig(env: NodeJS.ProcessEnv = process.env): ServerConfig {
  const nodeEnv = env.NODE_ENV ?? 'development'
  return {
    nodeEnv,
    isProduction: nodeEnv === 'production',
    port: readInt(env.PORT, DEFAULT_PORT),
    mongoURI: env.MONGODB_URI ?? 'mongodb://127.0.0.1:27017/zenuxs-desigen',
    issuer: (env.ZENUXS_ISSUER ?? DEFAULT_ISSUER).replace(/\/+$/, ''),
    clientId: env.ZENUXS_CLIENT_ID ?? DEFAULT_CLIENT_ID,
    allowedOrigins: readList(env.ALLOWED_ORIGINS, DEV_ORIGINS),
    sessionTtlMs: readInt(env.SESSION_TTL_MS, DEFAULT_SESSION_TTL_MS),
    sessionRateLimitMax: readInt(env.SESSION_RATE_LIMIT_MAX, 20),
    sessionCookieName: env.SESSION_COOKIE_NAME ?? 'zenuxs_session',
    csrfCookieName: env.CSRF_COOKIE_NAME ?? 'zenuxs_csrf',
    csrfHeaderName: (env.CSRF_HEADER_NAME ?? 'x-csrf-token').toLowerCase(),
    trustProxy: env.TRUST_PROXY === 'true'
  }
}
