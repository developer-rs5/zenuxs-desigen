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

  it('loads four default skills, enabled by default', () => {
    expect(aiSkills.value.length).toBe(4)
    expect(aiSkills.value.every((skill) => skill.enabled && skill.isDefault)).toBe(true)
  })

  it('ships Impeccable as a default skill', () => {
    const impeccable = aiSkills.value.find((s) => s.name === 'impeccable')
    expect(impeccable).toBeDefined()
    expect(impeccable?.id).toBe('impeccable')
    expect(impeccable?.displayName).toBe('Impeccable')
    expect(impeccable?.version).toBe('4.7.0')
    expect(impeccable?.author).toBe('Paul Bakaus (@pbakaus)')
    expect(impeccable?.sourceUrl).toBe('https://github.com/pbakaus/impeccable')
    expect(impeccable?.tags).toContain('craft')
    expect(impeccable?.promptContent).toContain('=== IMPECCABLE — DESIGN-DIRECTOR CRAFT ===')
    expect(impeccable?.promptContent).toContain('ANTI-REPETITION')
  })

  it('ships UI/UX Pro Max as a default skill', () => {
    const uiUxSkill = aiSkills.value.find((s) => s.name === 'ui-ux-pro-max')
    expect(uiUxSkill).toBeDefined()
    expect(uiUxSkill?.displayName).toBe('UI/UX Pro Max')
    expect(uiUxSkill?.version).toBe('2.13.0')
    expect(uiUxSkill?.author).toBe('NextLevelBuilder')
    expect(uiUxSkill?.sourceUrl).toBe('https://github.com/nextlevelbuilder/ui-ux-pro-max-skill')
    expect(uiUxSkill?.tags).toContain('ui')
    expect(uiUxSkill?.tags).toContain('ux')
    expect(uiUxSkill?.promptContent).toContain('=== UI/UX PRO MAX — DESIGN INTELLIGENCE ===')
  })

  it('ships the Taste Skill as a default skill', () => {
    const tasteSkill = aiSkills.value.find((s) => s.name === 'design-taste-frontend')
    expect(tasteSkill).toBeDefined()
    expect(tasteSkill?.displayName).toBe('Taste Skill (Anti-Slop)')
    expect(tasteSkill?.version).toBe('2.0.0')
    expect(tasteSkill?.author).toBe('tasteskill.dev (@lexnlin)')
    expect(tasteSkill?.sourceUrl).toBe('https://github.com/Leonxlnx/taste-skill')
    expect(tasteSkill?.tags).toContain('anti-slop')
    expect(tasteSkill?.promptContent).toContain(
      '=== TASTE SKILL (ANTI-SLOP FRONTEND FRAMEWORK) ==='
    )
  })

  it('ships Anthropic Frontend Design as a default skill', () => {
    const frontendDesign = aiSkills.value.find((s) => s.name === 'frontend-design')
    expect(frontendDesign).toBeDefined()
    expect(frontendDesign?.displayName).toBe('Frontend Design')
    expect(frontendDesign?.version).toBe('1.0.0')
    expect(frontendDesign?.author).toBe('Anthropic')
    expect(frontendDesign?.sourceUrl).toBe(
      'https://github.com/anthropics/claude-code/tree/main/plugins/frontend-design'
    )
    expect(frontendDesign?.tags).toContain('calibration')
    expect(frontendDesign?.promptContent).toContain('=== FRONTEND DESIGN — DISTINCTIVE')
    expect(frontendDesign?.promptContent).toContain('PLAN, REVIEW AGAINST THE BRIEF, BUILD')
    expect(frontendDesign?.promptContent).toContain('WRITING IN DESIGN')
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
    expect(prompt).toContain('## Skill: impeccable (v4.7.0)')
    expect(prompt).toContain('=== IMPECCABLE — DESIGN-DIRECTOR CRAFT ===')
    expect(prompt).toContain('## Skill: frontend-design (v1.0.0)')
    expect(prompt).toContain('=== FRONTEND DESIGN — DISTINCTIVE')
    expect(prompt).toContain('=== UI/UX PRO MAX — DESIGN INTELLIGENCE ===')
    expect(prompt).toContain('=== TASTE SKILL (ANTI-SLOP FRONTEND FRAMEWORK) ===')
  })

  it('states that skills are guidance, not a template to repeat', () => {
    const prompt = getActiveSkillsPrompt()
    expect(prompt).toContain('They are guidance, not a template')
    expect(prompt).toContain('never repeat a composition you have already produced')
  })

  it('omits disabled skills from the compiled prompt', () => {
    toggleAISkill('design-taste-frontend', false)
    const prompt = getActiveSkillsPrompt()
    expect(prompt).not.toContain('=== TASTE SKILL (ANTI-SLOP FRONTEND FRAMEWORK) ===')
    expect(prompt).toContain('=== UI/UX PRO MAX — DESIGN INTELLIGENCE ===')

    toggleAISkill('ui-ux-pro-max', false)
    toggleAISkill('impeccable', false)
    toggleAISkill('frontend-design', false)
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
