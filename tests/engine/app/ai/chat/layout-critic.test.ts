import { describe, expect, test } from 'bun:test'

import { SceneGraph } from '@open-pencil/core'
import { FigmaAPI } from '@open-pencil/core/figma-api'

import {
  MAX_LAYOUT_REPAIR_ROUNDS,
  collectPageLayoutErrors,
  createLayoutCritic
} from '@/app/ai/chat/layout-critic'

function store() {
  const graph = new SceneGraph()
  const figma = new FigmaAPI(graph)
  figma.currentPage = figma.wrapNode(graph.getPages()[0].id)
  figma.currentPage.selection = []
  return figma
}

/**
 * The spill case from a real AI build: an auto-layout column whose paragraph
 * is wider than the column that owns it.
 */
function buildOverflowingColumn(figma: ReturnType<typeof store>): void {
  const pageId = figma.currentPageId
  const column = figma.graph.createNode('FRAME', pageId, {
    name: 'FeatureText',
    x: 0,
    y: 0,
    width: 200,
    height: 100,
    layoutMode: 'VERTICAL',
    primaryAxisSizing: 'FIXED',
    counterAxisSizing: 'FIXED'
  })
  figma.graph.createNode('TEXT', column.id, {
    name: 'Paragraph',
    x: 0,
    y: 0,
    width: 320,
    height: 40,
    characters: 'Seamlessly invite creators and guest experts.'
  })
}

describe('collectPageLayoutErrors', () => {
  test('reports nothing for a page whose children fit', () => {
    const figma = store()
    const pageId = figma.currentPageId
    const card = figma.graph.createNode('FRAME', pageId, {
      name: 'Card',
      x: 0,
      y: 0,
      width: 320,
      height: 200
    })
    figma.graph.createNode('TEXT', card.id, {
      name: 'Title',
      x: 0,
      y: 0,
      width: 280,
      height: 24,
      characters: 'Multi-Host Feature',
      fills: [{ type: 'SOLID', visible: true, opacity: 1, color: { r: 0.1, g: 0.1, b: 0.1, a: 1 } }]
    })
    expect(collectPageLayoutErrors(figma)).toEqual([])
  })

  test('reports the child that escapes its container', () => {
    const figma = store()
    buildOverflowingColumn(figma)
    const errors = collectPageLayoutErrors(figma)
    expect(errors.length).toBeGreaterThan(0)
    expect(errors.join(' ')).toContain('FeatureText')
  })

  test('reports two siblings stacked on the same coordinates', () => {
    const figma = store()
    const pageId = figma.currentPageId
    figma.graph.createNode('FRAME', pageId, {
      name: 'Hero',
      x: 0,
      y: 0,
      width: 480,
      height: 320
    })
    figma.graph.createNode('FRAME', pageId, {
      name: 'HeroCard',
      x: 0,
      y: 0,
      width: 480,
      height: 320
    })
    const errors = collectPageLayoutErrors(figma)
    expect(errors.join(' ')).toContain('overlaps')
    expect(errors.join(' ')).toContain('Hero')
  })

  test('does not report a deliberate overlay on a larger surface', () => {
    const figma = store()
    const pageId = figma.currentPageId
    const hero = figma.graph.createNode('FRAME', pageId, {
      name: 'Hero',
      x: 0,
      y: 0,
      width: 480,
      height: 320
    })
    figma.graph.createNode('RECTANGLE', hero.id, {
      name: 'PlayButton',
      x: 200,
      y: 120,
      width: 80,
      height: 80,
      fills: [{ type: 'SOLID', visible: true, opacity: 1, color: { r: 0.1, g: 0.1, b: 0.1, a: 1 } }]
    })
    expect(collectPageLayoutErrors(figma)).toEqual([])
  })

  test('reports a collapsed element that occupies no area', () => {
    const figma = store()
    const pageId = figma.currentPageId
    const section = figma.graph.createNode('FRAME', pageId, {
      name: 'Section',
      x: 0,
      y: 0,
      width: 480,
      height: 320
    })
    figma.graph.createNode('FRAME', section.id, {
      name: 'Ghost',
      x: 0,
      y: 0,
      width: 0,
      height: 40
    })
    const errors = collectPageLayoutErrors(figma)
    expect(errors.join(' ')).toContain('collapses to')
    expect(errors.join(' ')).toContain('Ghost')
  })
})

describe('layout critic repair budget', () => {
  test('spends two rounds per run and never loops', () => {
    const critic = createLayoutCritic()
    // No mutation yet — nothing to repair.
    expect(critic.takeRepair(['overflows'])).toBeNull()

    critic.noteMutation()
    const repair = critic.takeRepair(['FeatureText: "Paragraph" (320px) overflows'])
    expect(repair).not.toBeNull()
    expect(repair).toContain('FeatureText')
    expect(repair).toContain('w="fill"')
    expect(repair).toContain('Automatic layout check failed')

    // The second round is the final review before the reply.
    const finalReview = critic.takeRepair(['FeatureText: still overflowing'])
    expect(finalReview).not.toBeNull()
    expect(finalReview).toContain('Final layout review')
    expect(finalReview).toContain('no further repair round')

    // The budget is spent: a third overflow cannot inject another round.
    expect(critic.takeRepair(['FeatureText: yet again'])).toBeNull()
    expect(critic.report().repairRoundsUsed).toBe(MAX_LAYOUT_REPAIR_ROUNDS)
  })

  test('carries overlap and collapsed repairs in the instruction', () => {
    const critic = createLayoutCritic()
    critic.noteMutation()
    const repair = critic.takeRepair([
      'Hero: "HeroText" overlaps "HeroCard" (70% of "HeroText") in "Hero"',
      'Section: "Ghost" collapses to 0×40 — invisible'
    ])
    expect(repair).not.toBeNull()
    expect(repair).toContain('overlaps')
    expect(repair).toContain('collapses to')
    expect(repair).toContain('flex="col"/"row"')
  })

  test('reset restores the budget for the next message', () => {
    const critic = createLayoutCritic()
    critic.noteMutation()
    critic.takeRepair(['overflows'])
    critic.reset()
    critic.noteMutation()
    expect(critic.takeRepair(['overflows'])).not.toBeNull()
  })

  test('a clean page spends nothing', () => {
    const critic = createLayoutCritic()
    critic.noteMutation()
    expect(critic.takeRepair([])).toBeNull()
    expect(critic.report().repairRoundsUsed).toBe(0)
  })
})
