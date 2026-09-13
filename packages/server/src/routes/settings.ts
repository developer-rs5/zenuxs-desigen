import { Router } from 'express'
import { UserSettings } from '../db/models/UserSettings.js'

export const settingsRouter = Router()

/**
 * GET /api/settings
 * Retrieve user settings & credentials from MongoDB
 */
settingsRouter.get('/', async (req, res) => {
  try {
    const ownerSub = (req.query.ownerSub as string) || (req.headers['x-user-sub'] as string)
    if (!ownerSub) return res.status(400).json({ error: 'Missing ownerSub header/param' })

    const settings = await UserSettings.findOne({ ownerSub })
    return res.json({ success: true, settings: settings || null })
  } catch (error) {
    console.error('[Settings GET Error]', error)
    return res.status(500).json({ error: 'Failed to fetch settings from database' })
  }
})

/**
 * POST /api/settings
 * Upsert user settings & credentials into MongoDB
 */
settingsRouter.post('/', async (req, res) => {
  try {
    const ownerSub = (req.body.ownerSub as string) || (req.headers['x-user-sub'] as string)
    if (!ownerSub) return res.status(400).json({ error: 'Missing ownerSub' })

    const { credentials, aiModelSettings, mcpServers, skills } = req.body

    const settings = await UserSettings.findOneAndUpdate(
      { ownerSub },
      {
        ownerSub,
        ...(credentials && { credentials }),
        ...(aiModelSettings && { aiModelSettings }),
        ...(mcpServers && { mcpServers }),
        ...(skills && { skills })
      },
      { upsert: true, new: true }
    )

    return res.json({ success: true, settings })
  } catch (error) {
    console.error('[Settings POST Error]', error)
    return res.status(500).json({ error: 'Failed to save settings to database' })
  }
})
