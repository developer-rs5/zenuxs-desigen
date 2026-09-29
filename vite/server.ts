import { normalizePath, type ServerOptions } from 'vite'

const WATCHED_MARKDOWN_ROOTS = ['/src/', '/packages/core/src/', '/packages/vue/src/']

function ignoreMarkdownOutsideSource(path: string): boolean {
  const normalized = normalizePath(path)
  if (!normalized.endsWith('.md')) return false
  return !WATCHED_MARKDOWN_ROOTS.some((root) => normalized.includes(root))
}

export const WATCH_IGNORED = [
  '**/desktop/**',
  '**/packages/cli/**',
  '**/packages/mcp/**',
  '**/packages/docs/**',
  '**/tests/**',
  '**/.worktrees/**',
  '**/.github/**',
  '**/.pi/**',
  ignoreMarkdownOutsideSource
]

/** Default origin of the ZenuxsDesign backend during local development. */
export const DEV_BACKEND_ORIGIN = 'http://127.0.0.1:3000'

/**
 * Paths proxied to the backend so the browser sees a single origin.
 *
 * Keeping the API same-origin in development means the `HttpOnly`,
 * `SameSite=Lax` session cookie is actually sent, which is the same arrangement
 * used in production behind a reverse proxy.
 */
export const BACKEND_PROXY_PATHS = ['/api', '/health'] as const

export function createBackendProxyOptions(
  backendOrigin = process.env.VITE_BACKEND_URL || DEV_BACKEND_ORIGIN
): Record<string, unknown> {
  const proxy: Record<string, unknown> = {}
  for (const path of BACKEND_PROXY_PATHS) {
    proxy[path] = {
      target: backendOrigin,
      changeOrigin: false,
      // Server session cookies must survive the dev hop.
      secure: false,
      ws: false
    }
  }
  return proxy
}

export function createDevServerOptions(host: string | undefined): ServerOptions {
  return {
    port: 1420,
    strictPort: true,
    host: host || false,
    hmr: host
      ? {
          protocol: 'ws',
          host,
          port: 1421
        }
      : undefined,
    proxy: createBackendProxyOptions(),
    watch: {
      ignored: WATCH_IGNORED
    }
  }
}
