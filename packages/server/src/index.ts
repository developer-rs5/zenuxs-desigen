/**
 * Production entry point.
 *
 * The app itself is built by `createApp()` so tests can mount the same
 * middleware chain without binding a port.
 */

import dotenv from 'dotenv'

import { createApp } from './app.js'
import { loadConfig } from './config.js'
import { connectDB } from './db/connection.js'

dotenv.config()

async function start(): Promise<void> {
  const config = loadConfig()
  try {
    await connectDB(config.mongoURI)
  } catch (error) {
    console.error('[Zenuxs Backend] Database connection failed:', error)
    process.exit(1)
  }

  const app = createApp({ config })
  app.listen(config.port, () => {
    console.info(`[Zenuxs Backend] Listening on http://localhost:${config.port}`)
    console.info(`[Zenuxs Backend] Issuer: ${config.issuer}`)
    console.info(`[Zenuxs Backend] Allowed origins: ${config.allowedOrigins.join(', ')}`)
    if (!config.isProduction) {
      console.warn('[Zenuxs Backend] Running outside production; cookies are not marked Secure.')
    }
  })
}

void start()
