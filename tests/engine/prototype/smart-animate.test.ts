import { describe, expect, test } from 'bun:test'

import {
  computeSmartAnimateVisuals,
  decomposeNode,
  lerpTransformDecomposed,
  matchLayers,
  namePath
} from '@open-pencil/core'
import { SceneGraph } from '@open-pencil/scene-graph'

describe('Smart Animate layer matching', () => {
  test('builds hierarchy name paths joined by delimiter', () => {
    const graph = new SceneGraph()
    const page = graph.createNode('FRAME', graph.rootId, { name: 'Page' })
    const frame = graph.createNode('FRAME', page.id, { name: 'Screen' })
    const card = graph.createNode('FRAME', frame.id, { name: 'Card' })
    const btn = graph.createNode('RECTANGLE', card.id, { name: 'Button' })

    const path = namePath(graph, frame.id, btn.id)
    expect(path).toBe('Card\u001fButton')
  })

  test('matches layers between outgoing and incoming screens by name path', () => {
    const fromGraph = new SceneGraph()
    const fromScreen = fromGraph.createNode('FRAME', fromGraph.rootId, {
      name: 'ScreenA',
      width: 390,
      height: 844
    })
    const fromHero = fromGraph.createNode('FRAME', fromScreen.id, {
      name: 'Hero',
      width: 300,
      height: 200,
      x: 20,
      y: 50
    })
    const fromBtn = fromGraph.createNode('RECTANGLE', fromHero.id, {
      name: 'CTA',
      width: 100,
      height: 40,
      x: 0,
      y: 0
    })

    const toGraph = new SceneGraph()
    const toScreen = toGraph.createNode('FRAME', toGraph.rootId, {
      name: 'ScreenB',
      width: 390,
      height: 844
    })
    const toHero = toGraph.createNode('FRAME', toScreen.id, {
      name: 'Hero',
      width: 390,
      height: 400,
      x: 0,
      y: 0
    })
    const toBtn = toGraph.createNode('RECTANGLE', toHero.id, {
      name: 'CTA',
      width: 200,
      height: 50,
      x: 50,
      y: 100
    })

    const pairs = matchLayers(fromGraph, fromScreen.id, toGraph, toScreen.id)
    expect(pairs.length).toBe(2)
    expect(pairs[0].fromId).toBe(fromHero.id)
    expect(pairs[0].toId).toBe(toHero.id)
    expect(pairs[1].fromId).toBe(fromBtn.id)
    expect(pairs[1].toId).toBe(toBtn.id)
  })

  test('interpolates transforms taking shortest angular arc', () => {
    const t0 = { cx: 0, cy: 0, rotation: 0.1, scaleX: 1, scaleY: 1 }
    const t1 = { cx: 100, cy: 50, rotation: Math.PI * 1.9, scaleX: 2, scaleY: 2 }

    const mid = lerpTransformDecomposed(t0, t1, 0.5)
    expect(mid.cx).toBe(50)
    expect(mid.cy).toBe(25)
    // 0.1 and 1.9*PI (~-0.1*PI) should wrap around 0, not rotate 300+ degrees
    expect(Math.abs(mid.rotation)).toBeLessThan(0.5)
  })

  test('computes smart animate visual tweens at progress t', () => {
    const fromGraph = new SceneGraph()
    const fromScreen = fromGraph.createNode('FRAME', fromGraph.rootId, {
      name: 'ScreenA',
      width: 390,
      height: 844
    })
    const fromCard = fromGraph.createNode('RECTANGLE', fromScreen.id, {
      name: 'Card',
      x: 20,
      y: 100,
      width: 100,
      height: 100,
      cornerRadius: 8,
      opacity: 1
    })

    const toGraph = new SceneGraph()
    const toScreen = toGraph.createNode('FRAME', toGraph.rootId, {
      name: 'ScreenB',
      width: 390,
      height: 844
    })
    const toCard = toGraph.createNode('RECTANGLE', toScreen.id, {
      name: 'Card',
      x: 0,
      y: 0,
      width: 390,
      height: 400,
      cornerRadius: 24,
      opacity: 1
    })

    const visualsMid = computeSmartAnimateVisuals(
      fromGraph,
      fromScreen.id,
      toGraph,
      toScreen.id,
      0.5
    )
    const cardVisual = visualsMid.get(toCard.id)
    expect(cardVisual).toBeDefined()
    expect(cardVisual?.width).toBe(245)
    expect(cardVisual?.height).toBe(250)
    expect(cardVisual?.cornerRadius).toBe(16)
  })
})
