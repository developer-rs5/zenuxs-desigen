import cors from 'cors'
import dotenv from 'dotenv'
import express from 'express'
import { connectDB } from './db/connection.js'
import { authRouter } from './routes/auth.js'
import { documentsRouter } from './routes/documents.js'

dotenv.config()

const app = express()
const PORT = process.env.PORT || 3000

app.use(cors())
app.use(express.json({ limit: '50mb' }))

// Health Check
app.get('/health', (_req, res) => {
  res.json({ status: 'ok', service: 'zenuxs-desigen-server', timestamp: new Date().toISOString() })
})

// Routes
app.use('/api/auth', authRouter)
app.use('/api/documents', documentsRouter)

async function start() {
  try {
    await connectDB()
    app.listen(PORT, () => {
      console.log(`[Zenuxs Backend] Server listening on http://localhost:${PORT}`)
    })
  } catch (error) {
    console.error('[Zenuxs Backend] Startup failed:', error)
    process.exit(1)
  }
}

start()
