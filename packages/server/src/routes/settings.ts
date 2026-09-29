/**
 * User settings endpoints.
 *
 * Previously the caller chose their own owner via `?ownerSub=` / `x-user-sub`
 * and the stored credential map was returned and accepted as untyped JSON. Any
 * visitor could therefore read another user's API keys and plant their own
 * credentials into a victim's account, which the client would then install into
 * its local credential manager on that victim's next sign-in.
 *
 * The owner is now derived from the session, credential values are validated as
 * bounded strings, and prototype-pollution keys are rejected.
 */

import { Router, type Response } from 'express'
import * as v from 'valibot'

import type { SessionService } from '../auth/session-service.js'
import { UserSettings } from '../db/models/UserSettings.js'
import { requireSubject, type AuthenticatedRequest } from '../middleware/auth.js'
import { formatIssues, settingsSaveSchema } from '../validation/schemas.js'

export interface SettingsRouterDeps {
  sessions: SessionService
}

export function createSettingsRouter(_deps: SettingsRouterDeps): Router {
  const router = Router()

  /** GET /api/settings — returns the caller's own settings. */
  router.get('/', async (req: AuthenticatedRequest, res: Response) => {
    const sub = requireSubject(req)
    const settings = await UserSettings.findOne({ ownerSub: sub }).lean()
    res.json({
      success: true,
      settings: settings
        ? {
            ownerSub: settings.ownerSub,
            aiModelSettings: settings.aiModelSettings ?? {},
            mcpServers: settings.mcpServers ?? {},
            skills: settings.skills ?? {},
            credentials: settings.credentials ?? {}
          }
        : null
    })
  })

  /**
   * POST /api/settings — upserts the caller's own settings.
   *
   * Uses `$set` per field so a partial update cannot be used to clear or inject
   * fields the caller did not intend to change.
   */
  router.post('/', async (req: AuthenticatedRequest, res: Response) => {
    const sub = requireSubject(req)
    const parsed = v.safeParse(settingsSaveSchema, req.body)
    if (!parsed.success) {
      res
        .status(400)
        .json({ error: 'Invalid settings payload', detail: formatIssues(parsed.issues) })
      return
    }
    const { aiModelSettings, mcpServers, skills, credentials } = parsed.output

    const update: Record<string, unknown> = { ownerSub: sub }
    if (aiModelSettings !== undefined) update.aiModelSettings = aiModelSettings
    if (mcpServers !== undefined) update.mcpServers = mcpServers
    if (skills !== undefined) update.skills = skills
    if (credentials !== undefined) update.credentials = credentials

    const settings = await UserSettings.findOneAndUpdate(
      { ownerSub: sub },
      { $set: update },
      { upsert: true, new: true }
    ).lean()

    res.json({ success: true, settings })
  })

  return router
}
