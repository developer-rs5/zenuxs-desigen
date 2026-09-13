import { Router } from 'express'
import { User } from '../db/models/User.js'

export const authRouter = Router()

/**
 * POST /api/auth/verify
 * Accepts OAuth user info / token and ensures user record exists in MongoDB.
 */
authRouter.post('/verify', async (req, res) => {
  try {
    const { sub, email, name, picture } = req.body
    if (!sub) {
      return res.status(400).json({ error: 'Missing required "sub" (subject identifier)' })
    }

    const user = await User.findOneAndUpdate(
      { sub },
      {
        sub,
        ...(email && { email }),
        ...(name && { name }),
        ...(picture && { picture }),
        lastLoginAt: new Date()
      },
      { upsert: true, new: true }
    )

    return res.json({ success: true, user })
  } catch (error) {
    console.error('[Auth Route Error]', error)
    return res.status(500).json({ error: 'Internal auth verification error' })
  }
})
