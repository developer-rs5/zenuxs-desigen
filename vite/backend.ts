import { spawn, type ChildProcess } from 'node:child_process'
import { Socket } from 'node:net'
import process from 'node:process'

import type { Plugin } from 'vite'

function isPortActive(port: number, host = '127.0.0.1'): Promise<boolean> {
  return new Promise((resolve) => {
    const socket = new Socket()
    socket.setTimeout(400)
    socket.once('connect', () => {
      socket.destroy()
      resolve(true)
    })
    socket.once('timeout', () => {
      socket.destroy()
      resolve(false)
    })
    socket.once('error', () => {
      resolve(false)
    })
    socket.connect(port, host)
  })
}

/**
 * Automatically boots the backend server on port 3000 during `vite dev`
 * if it is not already running.
 */
export function openPencilBackendPlugin(command: string): Plugin {
  let backendProc: ChildProcess | null = null

  return {
    name: 'open-pencil-backend-server',
    async configureServer(server) {
      if (command !== 'serve') return

      const active = await isPortActive(3000)
      if (active) {
        console.log('[vite] Backend server is already running on port 3000.')
        return
      }

      console.log('[vite] Starting MongoDB backend server (port 3000)...')
      backendProc = spawn('bun', ['packages/server/src/index.ts'], {
        stdio: 'inherit',
        env: process.env
      })

      backendProc.on('error', (err) => {
        console.error('[vite] Failed to launch backend server:', err)
      })

      const cleanup = () => {
        if (backendProc && !backendProc.killed) {
          backendProc.kill()
          backendProc = null
        }
      }

      server.httpServer?.on('close', cleanup)
      process.on('exit', cleanup)
      process.on('SIGINT', cleanup)
      process.on('SIGTERM', cleanup)
    }
  }
}
