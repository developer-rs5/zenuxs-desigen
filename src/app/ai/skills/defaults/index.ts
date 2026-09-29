import type { AISkill } from '../types'
import { TASTE_SKILL_DEFAULT } from './taste-skill'
import { UI_UX_PRO_MAX_DEFAULT } from './ui-ux-pro-max'

export { TASTE_SKILL_DEFAULT } from './taste-skill'
export { UI_UX_PRO_MAX_DEFAULT } from './ui-ux-pro-max'

export const DEFAULT_SKILLS: readonly AISkill[] = [UI_UX_PRO_MAX_DEFAULT, TASTE_SKILL_DEFAULT]

export const DEFAULT_AI_SKILLS = DEFAULT_SKILLS
