import { beforeEach, describe, expect, it } from 'bun:test'

import {
  activeAISkills,
  addCustomAISkill,
  aiSkills,
  DEFAULT_SKILLS,
  getActiveSkillsPrompt,
  removeAISkill,
  resetAISkillsToDefaults,
  toggleAISkill
} from '@/app/ai/skills'

describe('AI Skills System', () => {
  beforeEach(() => {
    resetAISkillsToDefaults()
  })

  it('loads UI/UX Pro Max and Taste Skill as default skills enabled by default', () => {
    expect(aiSkills.value.length).toBe(2)

    const uiUxSkill = aiSkills.value.find((s) => s.name === 'ui-ux-pro-max')
    expect(uiUxSkill).toBeDefined()
    expect(uiUxSkill?.displayName).toBe('UI/UX Pro Max')
    expect(uiUxSkill?.version).toBe('2.13.0')
    expect(uiUxSkill?.author).toBe('NextLevelBuilder')
    expect(uiUxSkill?.enabled).toBe(true)
    expect(uiUxSkill?.isDefault).toBe(true)
    expect(uiUxSkill?.sourceUrl).toBe('https://github.com/nextlevelbuilder/ui-ux-pro-max-skill')
    expect(uiUxSkill?.tags).toContain('ui')
    expect(uiUxSkill?.tags).toContain('ux')
    expect(uiUxSkill?.promptContent).toContain('=== UI/UX PRO MAX — DESIGN INTELLIGENCE ===')

    const tasteSkill = aiSkills.value.find((s) => s.name === 'design-taste-frontend')
    expect(tasteSkill).toBeDefined()
    expect(tasteSkill?.displayName).toBe('Taste Skill (Anti-Slop)')
    expect(tasteSkill?.version).toBe('2.0.0')
    expect(tasteSkill?.author).toBe('tasteskill.dev (@lexnlin)')
    expect(tasteSkill?.enabled).toBe(true)
    expect(tasteSkill?.isDefault).toBe(true)
    expect(tasteSkill?.sourceUrl).toBe('https://github.com/Leonxlnx/taste-skill')
    expect(tasteSkill?.tags).toContain('anti-slop')
    expect(tasteSkill?.promptContent).toContain('=== TASTE SKILL (ANTI-SLOP FRONTEND FRAMEWORK) ===')
  })

  it('computes active skills correctly', () => {
    expect(activeAISkills.value.length).toBe(DEFAULT_SKILLS.length)

    toggleAISkill('design-taste-frontend', false)
    expect(activeAISkills.value.some((s) => s.name === 'design-taste-frontend')).toBe(false)
    expect(activeAISkills.value.some((s) => s.name === 'ui-ux-pro-max')).toBe(true)

    toggleAISkill('design-taste-frontend', true)
    expect(activeAISkills.value.some((s) => s.name === 'design-taste-frontend')).toBe(true)
  })

  it('compiles active skills into system prompt text', () => {
    const prompt = getActiveSkillsPrompt()
    expect(prompt).toContain('# Active Design Skills & Frameworks')
    expect(prompt).toContain('=== UI/UX PRO MAX — DESIGN INTELLIGENCE ===')
    expect(prompt).toContain('=== TASTE SKILL (ANTI-SLOP FRONTEND FRAMEWORK) ===')
  })

  it('omits disabled skills from the compiled prompt', () => {
    toggleAISkill('design-taste-frontend', false)
    const prompt = getActiveSkillsPrompt()
    expect(prompt).not.toContain('=== TASTE SKILL (ANTI-SLOP FRONTEND FRAMEWORK) ===')
    expect(prompt).toContain('=== UI/UX PRO MAX — DESIGN INTELLIGENCE ===')

    toggleAISkill('ui-ux-pro-max', false)
    expect(getActiveSkillsPrompt()).toBe('')
  })

  it('allows adding and removing custom skills', () => {
    const custom = addCustomAISkill({
      name: 'custom-brand-guidelines',
      displayName: 'Custom Brand Guidelines',
      description: 'Specific typography and color rules for Project X',
      sourceUrl: 'https://example.com/guidelines',
      promptContent: '## SKILL: Custom Brand Guidelines\nUse primary color #FF5500 exclusively.',
      enabled: true
    })

    expect(custom.id).toBeDefined()
    expect(custom.isDefault).toBe(false)
    expect(aiSkills.value.some((s) => s.name === 'custom-brand-guidelines')).toBe(true)
    expect(getActiveSkillsPrompt()).toContain('Custom Brand Guidelines')

    removeAISkill(custom.id)
    expect(aiSkills.value.some((s) => s.id === custom.id)).toBe(false)
  })

  it('prevents default skills from being deleted with removeAISkill', () => {
    removeAISkill('ui-ux-pro-max')
    expect(aiSkills.value.some((s) => s.name === 'ui-ux-pro-max')).toBe(true)
  })

  it('resets all skills back to default settings', () => {
    toggleAISkill('design-taste-frontend', false)
    addCustomAISkill({
      name: 'temporary',
      displayName: 'Temporary',
      description: '',
      sourceUrl: '',
      promptContent: 'temp',
      enabled: true
    })

    resetAISkillsToDefaults()
    expect(aiSkills.value.length).toBe(DEFAULT_SKILLS.length)
    expect(aiSkills.value.every((s) => s.enabled)).toBe(true)
  })
})
