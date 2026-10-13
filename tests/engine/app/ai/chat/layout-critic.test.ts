import { describe, expect, test } from 'bun:test'

import { SceneGraph } from '@open-pencil/core'
import { FigmaAPI } from '@open-pencil/core/figma-api'

import {
  MAX_LAYOUT_REPAIR_ROUNDS,
  collectPageOverflowErrors,
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

describe('collectPageOverflowErrors', () => {
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
      characters: 'Multi-Host Feature'
    })
    expect(collectPageOverflowErrors(figma)).toEqual([])
  })

  test('reports the child that escapes its container', () => {
    const figma = store()
    buildOverflowingColumn(figma)
    const errors = collectPageOverflowErrors(figma)
    expect(errors.length).toBeGreaterThan(0)
    expect(errors.join(' ')).toContain('FeatureText')
  })
})

describe('layout critic repair budget', () => {
  test('spends one round per run and never loops', () => {
    const critic = createLayoutCritic()
    // No mutation yet — nothing to repair.
    expect(critic.takeRepair(['overflows'])).toBeNull()

    critic.noteMutation()
    const repair = critic.takeRepair(['FeatureText: "Paragraph" (320px) overflows'])
    expect(repair).not.toBeNull()
    expect(repair).toContain('FeatureText')
    expect(repair).toContain('w="fill"')
    // The budget is spent: a second overflow cannot inject another round.
    expect(critic.takeRepair(['FeatureText: still overflowing'])).toBeNull()
    expect(critic.report().repairRoundsUsed).toBe(MAX_LAYOUT_REPAIR_ROUNDS)
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
