import { describe, expect, test } from 'bun:test'

import { SceneGraph } from '@open-pencil/core'

import {
  MAX_MEDIA_REPAIR_ROUNDS,
  createMediaCritic,
  findUnfilledImageSlots
} from '@/app/ai/chat/media-critic'

function page() {
  const graph = new SceneGraph()
  const pageNode = graph.getPages()[0]
  return { graph, pageId: pageNode.id }
}

const IMAGE_FILL = {
  type: 'IMAGE' as const,
  color: { r: 0, g: 0, b: 0, a: 1 },
  opacity: 1,
  visible: true,
  imageHash: 'hash'
}

function createRect(
  graph: SceneGraph,
  pageId: string,
  name: string,
  overrides: Record<string, unknown> = {}
) {
  return graph.createNode('RECTANGLE', pageId, {
    name,
    x: 0,
    y: 0,
    width: 640,
    height: 400,
    ...overrides
  })
}

describe('findUnfilledImageSlots', () => {
  test('finds a created placeholder that promises an image', () => {
    const { graph, pageId } = page()
    const slot = createRect(graph, pageId, 'HeroImg')
    const found = findUnfilledImageSlots(graph.getAllNodes(), new Set([slot.id]))
    expect(found).toEqual([
      { id: slot.id, name: 'HeroImg', type: 'RECTANGLE', width: 640, height: 400 }
    ])
  })

  test('a filled image is not a slot', () => {
    const { graph, pageId } = page()
    const slot = createRect(graph, pageId, 'HeroImg', { fills: [IMAGE_FILL] })
    expect(findUnfilledImageSlots(graph.getAllNodes(), new Set([slot.id]))).toEqual([])
  })

  test('nodes that existed before the run are never touched', () => {
    const { graph, pageId } = page()
    createRect(graph, pageId, 'HeroImg')
    expect(findUnfilledImageSlots(graph.getAllNodes(), new Set())).toEqual([])
  })

  test('names that do not promise an image are ignored', () => {
    const { graph, pageId } = page()
    const card = createRect(graph, pageId, 'FeatureCard')
    expect(findUnfilledImageSlots(graph.getAllNodes(), new Set([card.id]))).toEqual([])
  })

  test('small nodes are ignored', () => {
    const { graph, pageId } = page()
    const icon = createRect(graph, pageId, 'IconImg', { width: 24, height: 24 })
    expect(findUnfilledImageSlots(graph.getAllNodes(), new Set([icon.id]))).toEqual([])
  })

  test('containers with children are ignored', () => {
    const { graph, pageId } = page()
    const frame = graph.createNode('FRAME', pageId, {
      name: 'HeroVisual',
      x: 0,
      y: 0,
      width: 640,
      height: 400
    })
    createRect(graph, frame.id, 'Inner', { width: 100, height: 100 })
    expect(findUnfilledImageSlots(graph.getAllNodes(), new Set([frame.id]))).toEqual([])
  })
})

describe('media critic repair budget', () => {
  test('spends one round per run and never loops', () => {
    const { graph, pageId } = page()
    const slot = createRect(graph, pageId, 'StoryImg')
    const critic = createMediaCritic()
    critic.noteCreated([slot.id])

    const repair = critic.takeRepair(graph.getAllNodes())
    expect(repair).not.toBeNull()
    expect(repair).toContain(slot.id)
    expect(repair).toContain('source_image')
    expect(critic.report().repairRoundsUsed).toBe(MAX_MEDIA_REPAIR_ROUNDS)

    expect(critic.takeRepair(graph.getAllNodes())).toBeNull()
  })

  test('nothing created means nothing to repair', () => {
    const { graph } = page()
    const critic = createMediaCritic()
    expect(critic.takeRepair(graph.getAllNodes())).toBeNull()
    expect(critic.report().repairRoundsUsed).toBe(0)
  })

  test('a run that filled its slots spends nothing', () => {
    const { graph, pageId } = page()
    const slot = createRect(graph, pageId, 'HeroImg', { fills: [IMAGE_FILL] })
    const critic = createMediaCritic()
    critic.noteCreated([slot.id])
    expect(critic.takeRepair(graph.getAllNodes())).toBeNull()
    expect(critic.report().repairRoundsUsed).toBe(0)
  })

  test('reset restores the budget for the next message', () => {
    const { graph, pageId } = page()
    const slot = createRect(graph, pageId, 'HeroImg')
    const critic = createMediaCritic()
    critic.noteCreated([slot.id])
    expect(critic.takeRepair(graph.getAllNodes())).not.toBeNull()
    critic.reset()
    expect(critic.report().createdCount).toBe(0)
    critic.noteCreated([slot.id])
    expect(critic.takeRepair(graph.getAllNodes())).not.toBeNull()
  })
})
