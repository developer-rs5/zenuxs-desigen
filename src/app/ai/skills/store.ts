import { useLocalStorage } from '@vueuse/core'
import { computed } from 'vue'

import { DEFAULT_SKILLS } from './defaults'
import type { AISkill } from './types'

const STORAGE_KEY = 'open-pencil:ai:skills:v2'

function generateSkillId(): string {
  const array = new Uint8Array(8)
  crypto.getRandomValues(array)
  return `custom-${Array.from(array, (byte) => byte.toString(16).padStart(2, '0')).join('')}`
}

function normalizeStoredSkills(stored: unknown): AISkill[] {
  const defaults = DEFAULT_SKILLS.map((s) => ({ ...s }))
  if (!Array.isArray(stored)) {
    return defaults
  }

  const storedMap = new Map<string, Partial<AISkill>>()
  const customSkills: AISkill[] = []

  for (const item of stored) {
    if (item && typeof item === 'object' && 'name' in item && typeof item.name === 'string') {
      const candidate = item as Partial<AISkill> & { name: string; id?: string }
      const identifier = candidate.id || candidate.name
      if (candidate.isDefault || defaults.some((d) => d.id === identifier || d.name === identifier)) {
        storedMap.set(identifier, candidate)
      } else if (typeof candidate.name === 'string' && typeof candidate.promptContent === 'string') {
        customSkills.push({
          id: candidate.id || generateSkillId(),
          name: candidate.name,
          displayName: candidate.displayName || candidate.name,
          description: typeof candidate.description === 'string' ? candidate.description : '',
          version: typeof candidate.version === 'string' ? candidate.version : '1.0.0',
          author: typeof candidate.author === 'string' ? candidate.author : 'User',
          sourceUrl: typeof candidate.sourceUrl === 'string' ? candidate.sourceUrl : '',
          tags: Array.isArray(candidate.tags) ? candidate.tags : [],
          enabled: typeof candidate.enabled === 'boolean' ? candidate.enabled : true,
          isDefault: false,
          promptContent: candidate.promptContent
        })
      }
    }
  }

  const mergedDefaults = defaults.map((defaultSkill) => {
    const override = storedMap.get(defaultSkill.id) || storedMap.get(defaultSkill.name)
    if (!override) return defaultSkill
    return {
      ...defaultSkill,
      enabled: typeof override.enabled === 'boolean' ? override.enabled : defaultSkill.enabled
    }
  })

  return [...mergedDefaults, ...customSkills]
}

export const aiSkills = useLocalStorage<AISkill[]>(
  STORAGE_KEY,
  DEFAULT_SKILLS.map((s) => ({ ...s })),
  {
    mergeDefaults: (storageValue) => normalizeStoredSkills(storageValue)
  }
)

export const activeAISkills = computed(() => aiSkills.value.filter((s) => s.enabled))

export function toggleAISkill(idOrName: string, enabled?: boolean): void {
  aiSkills.value = aiSkills.value.map((skill) => {
    if (skill.id !== idOrName && skill.name !== idOrName) return skill
    return {
      ...skill,
      enabled: enabled !== undefined ? enabled : !skill.enabled
    }
  })
}

export function addCustomAISkill(skill: Omit<AISkill, 'id'> & { id?: string }): AISkill {
  const newSkill: AISkill = {
    id: skill.id || generateSkillId(),
    name: skill.name.trim(),
    displayName: skill.displayName?.trim() || skill.name.trim(),
    description: skill.description.trim(),
    version: skill.version?.trim() || '1.0.0',
    author: skill.author?.trim() || 'User',
    sourceUrl: skill.sourceUrl.trim(),
    tags: skill.tags ?? [],
    enabled: skill.enabled ?? true,
    isDefault: false,
    promptContent: skill.promptContent.trim()
  }

  aiSkills.value = [...aiSkills.value, newSkill]
  return newSkill
}

export function removeAISkill(idOrName: string): void {
  aiSkills.value = aiSkills.value.filter(
    (skill) => (skill.id !== idOrName && skill.name !== idOrName) || skill.isDefault
  )
}

export function resetAISkillsToDefaults(): void {
  aiSkills.value = DEFAULT_SKILLS.map((s) => ({ ...s }))
}

export function getActiveSkillsPrompt(): string {
  const active = activeAISkills.value
  if (active.length === 0) return ''

  const sections = active.map((skill) => skill.promptContent)

  return [
    '# Active Design Skills & Frameworks',
    'Follow the rules and design discipline defined in the active skills below when planning and rendering designs:',
    '',
    ...sections
  ].join('\n\n')
}
