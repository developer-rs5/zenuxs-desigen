import type { SkillRoute } from '@open-pencil/core/skills'

/**
 * Last skill route resolved for a message (spec §63 observability): chat and
 * ACP submissions record here so the AI debug log can show which skills were
 * active and whether routing produced an issue. Safe metadata only — skill ids
 * and issue text, never message content or credentials.
 */
let latest: SkillRoute | null = null

export function recordSkillRoute(route: SkillRoute): void {
  latest = route
}

export function lastSkillRoute(): SkillRoute | null {
  return latest
}
