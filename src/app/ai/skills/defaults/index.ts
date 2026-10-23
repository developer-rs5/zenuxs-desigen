import type { AISkill } from '../types'
import { DESIGNER_SKILLS_DEFAULT } from './designer-skills'
import { FRONTEND_DESIGN_DEFAULT } from './frontend-design'
import { IMPECCABLE_DEFAULT } from './impeccable'
import { TASTE_SKILL_DEFAULT } from './taste-skill'
import { UI_UX_PRO_MAX_DEFAULT } from './ui-ux-pro-max'
import { WEB_DESIGN_GUIDELINES_DEFAULT } from './web-design-guidelines'

export { DESIGNER_SKILLS_DEFAULT } from './designer-skills'
export { FRONTEND_DESIGN_DEFAULT } from './frontend-design'
export { IMPECCABLE_DEFAULT } from './impeccable'
export { TASTE_SKILL_DEFAULT } from './taste-skill'
export { UI_UX_PRO_MAX_DEFAULT } from './ui-ux-pro-max'
export { WEB_DESIGN_GUIDELINES_DEFAULT } from './web-design-guidelines'

export const DEFAULT_SKILLS: readonly AISkill[] = [
  IMPECCABLE_DEFAULT,
  FRONTEND_DESIGN_DEFAULT,
  UI_UX_PRO_MAX_DEFAULT,
  TASTE_SKILL_DEFAULT,
  WEB_DESIGN_GUIDELINES_DEFAULT,
  DESIGNER_SKILLS_DEFAULT
]

export const DEFAULT_AI_SKILLS = DEFAULT_SKILLS
