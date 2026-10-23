import { beforeEach, describe, expect, test } from 'bun:test'

import {
  DESIGN_DIRECTIONS,
  looksLikeDesignRequest,
  nextDesignVariationDirective,
  pickDesignDirection,
  recentDesignDirectionIds,
  resetDesignDirectionHistory
} from '@/app/ai/chat/design-variation'

describe('design direction catalog', () => {
  test('offers distinct compositions, palettes, and type pairings', () => {
    expect(DESIGN_DIRECTIONS.length).toBeGreaterThanOrEqual(12)

    const ids = new Set(DESIGN_DIRECTIONS.map((direction) => direction.id))
    expect(ids.size).toBe(DESIGN_DIRECTIONS.length)

    const backgrounds = new Set(DESIGN_DIRECTIONS.map((direction) => direction.palette.background))
    expect(backgrounds.size).toBe(DESIGN_DIRECTIONS.length)

    const accents = new Set(DESIGN_DIRECTIONS.map((direction) => direction.palette.accent))
    expect(accents.size).toBe(DESIGN_DIRECTIONS.length)

    // Two directions may share a body face, but the display face is what makes
    // a page recognisable, so every direction names a different one.
    const displayFaces = new Set(DESIGN_DIRECTIONS.map((direction) => direction.type.display))
    expect(displayFaces.size).toBe(DESIGN_DIRECTIONS.length)

    const modes = new Set(DESIGN_DIRECTIONS.map((direction) => direction.mode))
    expect(modes.size).toBe(4)
  })

  test('pickDesignDirection never returns an excluded direction', () => {
    const excluded = DESIGN_DIRECTIONS.slice(0, 5).map((direction) => direction.id)
    for (let attempt = 0; attempt < 40; attempt += 1) {
      expect(excluded).not.toContain(pickDesignDirection(excluded).id)
    }
  })

  test('pickDesignDirection still returns a direction when everything is excluded', () => {
    const all = DESIGN_DIRECTIONS.map((direction) => direction.id)
    expect(all).toContain(pickDesignDirection(all).id)
  })
})

describe('looksLikeDesignRequest', () => {
  test('recognises build requests', () => {
    expect(looksLikeDesignRequest('Build a landing page for a coffee roastery')).toBe(true)
    expect(looksLikeDesignRequest('design a pricing page')).toBe(true)
    expect(looksLikeDesignRequest('Redesign this dashboard')).toBe(true)
  })

  test('ignores questions and short replies', () => {
    expect(looksLikeDesignRequest('What does the layer tree show?')).toBe(false)
    expect(looksLikeDesignRequest('thanks')).toBe(false)
    expect(looksLikeDesignRequest('')).toBe(false)
  })
})

describe('nextDesignVariationDirective', () => {
  beforeEach(() => {
    resetDesignDirectionHistory()
  })

  test('does not attach a direction to a non-design message', () => {
    expect(nextDesignVariationDirective('What is a component?')).toBeNull()
    expect(recentDesignDirectionIds()).toEqual([])
  })

  test('assigns a full direction to a design request', () => {
    const directive = nextDesignVariationDirective('Build a landing page for a coffee roastery')
    expect(directive).not.toBeNull()
    expect(directive).toContain('[Design variation for this request]')
    expect(directive).toContain('Composition:')
    expect(directive).toContain('Palette:')
    expect(directive).toContain('Type:')
    expect(directive).toContain('Signature element:')
    expect(directive).toContain('the brief wins on brand colors')
  })

  test('never repeats a direction within the remembered window', () => {
    const assigned: string[] = []
    for (let index = 0; index < 8; index += 1) {
      const directive = nextDesignVariationDirective(`Build screen number ${index}`)
      expect(directive).not.toBeNull()
      assigned.push(directive ?? '')
    }

    const used = recentDesignDirectionIds()
    expect(used.length).toBe(8)
    expect(new Set(used).size).toBe(8)

    // Every run after the first names the earlier directions as anti-references.
    expect(assigned[0]).not.toContain('Already used in this session')
    expect(assigned[1]).toContain('Already used in this session')
  })

  test('the next run differs from the previous one', () => {
    const first = nextDesignVariationDirective('Build a landing page')
    const second = nextDesignVariationDirective('Build a landing page')
    expect(first).not.toBe(second)
  })

  test('reset clears the remembered window', () => {
    nextDesignVariationDirective('Build a landing page')
    expect(recentDesignDirectionIds().length).toBe(1)
    resetDesignDirectionHistory()
    expect(recentDesignDirectionIds()).toEqual([])
  })
})
