/**
 * Shared fixtures for the server security tests.
 *
 * The app under test is the real Express application with the real middleware
 * chain. Only two things are substituted: MongoDB (an in-memory connection) and
 * the identity provider (a local HTTP server that speaks the subset of OIDC the
 * verifier uses). That keeps the tests honest about routing, cookies, headers,
 * and status codes.
 */

import { afterAll, afterEach, beforeAll, beforeEach } from 'bun:test'
import { createPublicKey, generateKeyPairSync, sign } from 'node:crypto'
import { createServer, type Server } from 'node:http'

import { createApp, type ZenuxsApp } from '#src/app.js'
import { loadConfig, type ServerConfig } from '#src/config.js'
import { hashToken } from '#src/security/session-token.js'
import mongoose from 'mongoose'

/** RSA keypair used to sign test id_tokens. */
const { privateKey, publicKey } = generateKeyPairSync('rsa', { modulusLength: 2048 })
const KID = 'test-key'

/** Random suffix so tokens issued in one test cannot collide with another. */
function uniqueSuffix(): string {
  return crypto.randomUUID()
}

/** Resolves once the server is listening on an ephemeral port. */
function listen(server: Server): Promise<void> {
  return new Promise<void>((resolve) => {
    server.listen(0, '127.0.0.1', () => {
      resolve()
    })
  })
}

/** Resolves once the server has closed, rejecting on a close error. */
function closed(server: Server): Promise<void> {
  return new Promise<void>((resolve, reject) => {
    server.close((error) => {
      if (error) reject(error)
      else resolve()
    })
  })
}

/** Strips attributes from a `Set-Cookie` entry, leaving `name=value`. */
function firstCookiePair(entry: string): string {
  const separator = entry.indexOf(';')
  return separator === -1 ? entry : entry.slice(0, separator)
}

/** Reads the bound port from a listening server. */
function boundPort(server: Server): number {
  const address = server.address()
  if (address === null || typeof address === 'string') {
    throw new Error('Test server is not listening on a TCP port')
  }
  return address.port
}

export interface FakeProviderOptions {
  /** Subjects the provider will accept as valid access tokens. */
  validTokens?: Map<string, { sub: string; name?: string; email?: string; picture?: string }>
}

export interface FakeProvider {
  origin: string
  /** Issues a valid opaque access token for a subject. */
  issueAccessToken(sub: string, claims?: Record<string, unknown>): string
  /** Builds a signed id_token. Pass overrides to break specific claims. */
  issueIdToken(sub: string, overrides?: Record<string, unknown>): string
  /** Registers a token the provider will report as valid. */
  acceptToken(token: string, subject: string, claims?: Record<string, unknown>): void
  /** Number of userinfo calls received. */
  userinfoCalls(): number
  close(): Promise<void>
}

function b64url(input: Buffer | string): string {
  return Buffer.from(input).toString('base64url')
}

export async function startFakeProvider(options: FakeProviderOptions = {}): Promise<FakeProvider> {
  const accepted = new Map<string, { sub: string; [key: string]: unknown }>(
    options.validTokens ?? new Map()
  )
  let userinfoCalls = 0

  const server: Server = createServer((req, res) => {
    const send = (status: number, body: unknown) => {
      res.writeHead(status, { 'content-type': 'application/json' })
      res.end(JSON.stringify(body))
    }

    if (req.url === '/oauth/.well-known/openid-configuration') {
      const origin = `http://127.0.0.1:${(server.address() as AddressInfo).port}`
      send(200, {
        issuer: origin,
        authorization_endpoint: `${origin}/oauth/authorize`,
        token_endpoint: `${origin}/oauth/token`,
        userinfo_endpoint: `${origin}/oauth/userinfo`,
        jwks_uri: `${origin}/oauth/.well-known/jwks.json`,
        id_token_signing_alg_values_supported: ['RS256']
      })
      return
    }

    if (req.url === '/oauth/.well-known/jwks.json') {
      const jwk = publicKey.export({ format: 'jwk' })
      send(200, { keys: [{ ...jwk, kid: KID, alg: 'RS256', use: 'sig' }] })
      return
    }

    if (req.url === '/oauth/userinfo') {
      userinfoCalls += 1
      const auth = req.headers.authorization ?? ''
      const token = auth.startsWith('Bearer ') ? auth.slice(7) : ''
      const record = accepted.get(token)
      if (!record) {
        send(401, { error: 'invalid_token' })
        return
      }
      send(200, record)
      return
    }

    send(404, { error: 'not_found' })
  })

  await listen(server)
  const origin = `http://127.0.0.1:${boundPort(server)}`

  return {
    origin,
    issueAccessToken(sub, claims = {}) {
      const token = `at_${b64url(`${sub}:${uniqueSuffix()}`)}`
      accepted.set(token, { sub, ...claims })
      return token
    },
    issueIdToken(sub, overrides = {}) {
      const header = b64url(JSON.stringify({ alg: 'RS256', typ: 'JWT', kid: KID }))
      const now = Math.floor(Date.now() / 1000)
      const payload = b64url(
        JSON.stringify({
          iss: origin,
          aud: 'test-client-id',
          sub,
          iat: now,
          exp: now + 3600,
          ...overrides
        })
      )
      const signature = sign('RSA-SHA256', Buffer.from(`${header}.${payload}`), privateKey)
      return `${header}.${payload}.${b64url(signature)}`
    },
    acceptToken(token, subject, claims = {}) {
      accepted.set(token, { sub: subject, ...claims })
    },
    userinfoCalls: () => userinfoCalls,
    close: () => closed(server)
  }
}

export function testConfig(issuer: string, overrides: Partial<ServerConfig> = {}): ServerConfig {
  const base = loadConfig({
    NODE_ENV: 'test',
    ZENUXS_ISSUER: issuer,
    ZENUXS_CLIENT_ID: 'test-client-id',
    ALLOWED_ORIGINS: 'https://app.example',
    SESSION_TTL_MS: '3600000',
    // High enough that a whole test file sharing one server is not throttled;
    // the limiter has its own test that builds a server with a low limit.
    SESSION_RATE_LIMIT_MAX: '100000'
  } as NodeJS.ProcessEnv)
  return { ...base, ...overrides }
}

export interface Harness {
  app: ZenuxsApp
  provider: FakeProvider
  config: ServerConfig
  server: Server
  baseURL: string
  request(path: string, init?: RequestInit & { cookies?: string; csrf?: string }): Promise<Response>
  /** Signs in and returns the cookie header plus the CSRF token. */
  signIn(
    sub: string,
    claims?: Record<string, unknown>
  ): Promise<{ cookie: string; csrf: string; sub: string }>
  close(): Promise<void>
}

export async function createHarness(options: FakeProviderOptions = {}): Promise<Harness> {
  const provider = await startFakeProvider(options)
  const config = testConfig(provider.origin)
  const app = createApp({ config })

  const server = createServer(app)
  await listen(server)
  const baseURL = `http://127.0.0.1:${boundPort(server)}`

  const request = async (
    path: string,
    init: RequestInit & { cookies?: string; csrf?: string } = {}
  ): Promise<Response> => {
    const headers = new Headers(init.headers)
    if (init.cookies) headers.set('cookie', init.cookies)
    if (init.csrf) headers.set('x-csrf-token', init.csrf)
    if (init.body && !headers.has('content-type')) {
      headers.set('content-type', 'application/json')
    }
    return fetch(`${baseURL}${path}`, { ...init, headers, redirect: 'manual' })
  }

  const signIn = async (sub: string, claims: Record<string, unknown> = {}) => {
    const accessToken = provider.issueAccessToken(sub, claims)
    const response = await request('/api/auth/session', {
      method: 'POST',
      body: JSON.stringify({ access_token: accessToken })
    })
    if (!response.ok) {
      throw new Error(`Sign-in failed: ${response.status} ${await response.text()}`)
    }
    const setCookies = response.headers.getSetCookie()
    const cookie = setCookies.map((entry) => firstCookiePair(entry)).join('; ')
    const csrfEntry = setCookies.find((entry) => entry.startsWith(`${config.csrfCookieName}=`))
    const csrf = csrfEntry
      ? decodeURIComponent(firstCookiePair(csrfEntry).slice(config.csrfCookieName.length + 1))
      : ''
    return { cookie, csrf, sub }
  }

  return {
    app,
    provider,
    config,
    server,
    baseURL,
    request,
    signIn,
    async close() {
      await closed(server)
      await provider.close()
    }
  }
}

let sharedMemoryServer: InstanceType<
  (typeof import('mongodb-memory-server'))['MongoMemoryServer']
> | null = null

/** Connects Mongoose to an in-memory MongoDB for the duration of the suite. */
export async function connectMemoryMongo(): Promise<void> {
  if (mongoose.connection.readyState === 1) return
  if (!sharedMemoryServer) {
    const { resolve } = await import('node:path')
    const { MongoMemoryServer } = await import('mongodb-memory-server')
    const dbPath = resolve(process.cwd(), 'node_modules/.cache/mongodb-memory-server')
    sharedMemoryServer = await MongoMemoryServer.create({
      instance: { dbPath }
    })
  }
  await mongoose.connect(sharedMemoryServer.getUri('zenuxs-test'))
  process.on('exit', () => {
    void sharedMemoryServer?.stop()
  })
}

export async function disconnectMongo(): Promise<void> {
  await mongoose.disconnect()
  if (sharedMemoryServer) {
    await sharedMemoryServer.stop()
    sharedMemoryServer = null
  }
}

export async function clearDatabase(): Promise<void> {
  const { collections } = mongoose.connection
  await Promise.all(Object.values(collections).map((collection) => collection.deleteMany({})))
}

export { beforeAll, afterAll, beforeEach, afterEach, hashToken, createPublicKey }
