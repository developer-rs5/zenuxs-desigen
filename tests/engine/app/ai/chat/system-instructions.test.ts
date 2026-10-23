import { describe, expect, test } from 'bun:test'

import { buildSystemInstructions } from '@/app/ai/chat/transports'

const SKILL_PROMPT =
  '# Active Design Skills & Frameworks\n\n## Skill: impeccable (v4.7.0)\nCraft floor.'

function instructionsFor(options: {
  sourcing?: boolean
  generation?: 'no-api-key' | 'provider-unsupported' | 'unavailable' | null
  skills?: string
}) {
  return buildSystemInstructions({
    skillsPrompt: options.skills ?? '',
    imageSourcingAvailable: options.sourcing ?? false,
    imageGenerationReason: options.generation === undefined ? null : (options.generation as never)
  })
}

describe('buildSystemInstructions image tool contract', () => {
  test('a sourcing session is told about source_image and no other image tool', () => {
    const instructions = instructionsFor({ sourcing: true })

    expect(instructions).toContain('`source_image`')
    expect(instructions).toContain('Image slots are part of the build')
    // Every reference to a tool that is not in this session's schema is a
    // hallucination waiting to happen.
    expect(instructions).not.toContain('stock_photo')
    expect(instructions).not.toContain('`generate_image`')
    expect(instructions).toContain('# Image Sources — vector first')
  })

  test('a sourcing session tells Phase 4 to batch with source_image', () => {
    const instructions = instructionsFor({ sourcing: true })
    expect(instructions).toContain('`source_image` — batch EVERY named image placeholder')
    expect(instructions).not.toContain('1. `stock_photo`')
  })

  test('a generation session keeps generate_image and stock_photo', () => {
    const instructions = instructionsFor({ sourcing: false, generation: null })

    expect(instructions).toContain('`generate_image`')
    expect(instructions).toContain('`stock_photo`')
    expect(instructions).not.toContain('`source_image` — batch EVERY named image placeholder')
  })

  test('a session with no image tool advertises none and stays vector-first', () => {
    const instructions = instructionsFor({ sourcing: false, generation: 'no-api-key' })

    expect(instructions).not.toContain('`source_image` — batch')
    expect(instructions).not.toContain('generate_image` creates original images')
    expect(instructions).toContain('Image generation unavailable')
    expect(instructions).toContain('# Image Sources — vector only')
  })

  test('appends the skills prompt after the base instructions', () => {
    const instructions = instructionsFor({ sourcing: true, skills: SKILL_PROMPT })
    expect(instructions).toContain('## Skill: impeccable (v4.7.0)')
    expect(instructions.indexOf('## Skill: impeccable')).toBeGreaterThan(
      instructions.indexOf('# Document model')
    )
  })

  test('leaves the instructions untouched when no skill is active', () => {
    const withSkills = instructionsFor({ sourcing: true, skills: SKILL_PROMPT })
    const without = instructionsFor({ sourcing: true })
    expect(withSkills.length).toBeGreaterThan(without.length)
    expect(without).not.toContain('Active Design Skills')
  })

  test('never repeats a tool it removed from the schema in the examples', () => {
    const instructions = instructionsFor({ sourcing: true })
    expect(instructions).not.toContain('1 stock_photo')
    expect(instructions).not.toContain('1 stock_photo + final describe')
    expect(instructions).toContain('1 image batch')
  })
})
