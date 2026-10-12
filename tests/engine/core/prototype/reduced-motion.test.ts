import { describe, expect, test } from 'bun:test'

import {
  ANIMATIONS_PLUGIN_KEY,
  INTERACTIONS_PLUGIN_KEY,
  PROTOTYPE_PLUGIN_ID,
  STATE_PLUGIN_KEY,
  SceneGraph,
  serializePluginValue,
  type PrototypeInteraction
} from '@open-pencil/scene-graph'

import { createPrototypeRuntime } from '#core/prototype/runtime'

function setup() {
  const graph = new SceneGraph()
  const page = graph.getPages()[0]
  const splash = graph.createNode('FRAME', page.id, { name: 'Splash', width: 800, height: 600 })
  const home = graph.createNode('FRAME', page.id, { name: 'Home', width: 800, height: 600 })
  const button = graph.createNode('RECTANGLE', home.id, {
    name: 'Btn',
    x: 100,
    y: 100,
    width: 80,
    height: 40
  })
  const sheet = graph.createNode('FRAME', page.id, {
    name: 'Sheet',
    x: 0,
    y: 300,
    width: 800,
    height: 300
  })
  return { graph, page, splash, home, button, sheet }
}

function writePlugin(graph: SceneGraph, nodeId: string, key: string, value: unknown): void {
  const node = graph.getNode(nodeId)
  if (!node) throw new Error('missing node')
  graph.updateNode(nodeId, {
    pluginData: [
      ...node.pluginData.filter(
        (entry) => !(entry.pluginId === PROTOTYPE_PLUGIN_ID && entry.key === key)
      ),
      { pluginId: PROTOTYPE_PLUGIN_ID, key, value: serializePluginValue(value) }
    ]
  })
}

function writeInteractions(
  graph: SceneGraph,
  nodeId: string,
  interactions: PrototypeInteraction[]
): void {
  writePlugin(graph, nodeId, INTERACTIONS_PLUGIN_KEY, interactions)
}

describe('prototype runtime — prefers-reduced-motion', () => {
  test('navigate fades collapse to settled visuals while still navigating', () => {
    const { graph, splash, home } = setup()
    writeInteractions(graph, splash.id, [
      {
        id: 'load-nav',
        trigger: 'load',
        action: { type: 'navigate', destinationId: home.id },
        transition: { kind: 'fade', durationMs: 500, easing: 'easeOut' }
      }
    ])

    const animated = createPrototypeRuntime(graph)
    animated.start(0, splash.id)
    animated.tick(250)
    const mid = animated.getRenderState()
    expect(mid?.drawIds).toEqual([splash.id, home.id])
    const midHome = mid?.nodeVisuals.get(home.id)?.opacity ?? 0
    expect(midHome).toBeGreaterThan(0)
    expect(midHome).toBeLessThan(1)
    expect(animated.hasPendingWork(250)).toBe(true)

    const reduced = createPrototypeRuntime(graph, { reducedMotion: true })
    reduced.start(0, splash.id)
    // Functionality preserved: the destination is current on the same tick.
    expect(reduced.getScreenId()).toBe(home.id)
    const settled = reduced.getRenderState()
    expect(settled?.drawIds).toEqual([home.id])
    expect(settled?.nodeVisuals.has(splash.id)).toBe(false)
    expect(settled?.nodeVisuals.has(home.id)).toBe(false)
    expect(reduced.hasPendingWork(250)).toBe(false)
  })

  test('slide navigate settles immediately, no outgoing screen left behind', () => {
    const { graph, splash, home } = setup()
    writeInteractions(graph, splash.id, [
      {
        id: 'slide-nav',
        trigger: 'click',
        action: { type: 'navigate', destinationId: home.id },
        transition: { kind: 'slide', direction: 'left', durationMs: 300, easing: 'easeOut' }
      }
    ])
    const runtime = createPrototypeRuntime(graph, { reducedMotion: true })
    runtime.start(0, splash.id)
    runtime.click(splash.id, 10)
    const state = runtime.getRenderState()
    expect(runtime.getScreenId()).toBe(home.id)
    expect(state?.drawIds).toEqual([home.id])
    expect(state?.nodeVisuals.has(splash.id)).toBe(false)
  })

  test('overlay still opens with backdrop and closes without a settle window', () => {
    const { graph, home, sheet, button } = setup()
    writeInteractions(graph, button.id, [
      {
        id: 'open',
        trigger: 'click',
        action: { type: 'openOverlay', overlayId: sheet.id, backdropOpacity: 0.4 },
        transition: { kind: 'slide', direction: 'up', durationMs: 300, easing: 'easeOut' }
      }
    ])
    writeInteractions(graph, sheet.id, [
      {
        id: 'close',
        trigger: 'click',
        action: { type: 'closeOverlay' },
        transition: { kind: 'slide', direction: 'down', durationMs: 300, easing: 'easeOut' }
      }
    ])
    const runtime = createPrototypeRuntime(graph, { reducedMotion: true })
    runtime.start(0, home.id)

    runtime.click(button.id, 0)
    let state = runtime.getRenderState()
    expect(state?.drawIds).toEqual([home.id, sheet.id])
    expect(state?.backdropOpacity).toBeCloseTo(0.4)
    // Collapsed: the sheet is at rest, not translated below the screen.
    expect(state?.nodeVisuals.get(sheet.id)?.translateY ?? 0).toBeCloseTo(0, 5)

    runtime.click(sheet.id, 10)
    state = runtime.getRenderState()
    expect(state?.drawIds).toEqual([home.id])
    expect(state?.backdropOpacity).toBe(0)
    expect(runtime.hasPendingWork(10)).toBe(false)
  })

  test('setState applies target visuals immediately', () => {
    const { graph, home, button } = setup()
    writePlugin(graph, button.id, STATE_PLUGIN_KEY, {
      version: 1,
      initial: 'default',
      states: [
        { name: 'default', visual: { scale: 1 } },
        { name: 'pressed', visual: { scale: 0.96 } }
      ]
    })
    writeInteractions(graph, button.id, [
      {
        id: 'down',
        trigger: 'press',
        action: { type: 'setState', state: 'pressed' },
        transition: { kind: 'spring', spring: { mode: 'time', bounce: 0.4 }, durationMs: 400 }
      }
    ])
    const runtime = createPrototypeRuntime(graph, { reducedMotion: true })
    runtime.start(0, home.id)
    runtime.pointerDown(button.id, 0)
    // No mid-flight tween: the target scale is on the very same frame.
    expect(runtime.getRenderState()?.nodeVisuals.get(button.id)?.scale).toBeCloseTo(0.96)
    runtime.tick(50)
    expect(runtime.getRenderState()?.nodeVisuals.get(button.id)?.scale).toBeCloseTo(0.96)
    expect(runtime.hasPendingWork(50)).toBe(false)
  })

  test('afterDelay timers still fire and drag still tracks', () => {
    const { graph, splash, home, button } = setup()
    writeInteractions(graph, splash.id, [
      {
        id: 'later',
        trigger: 'afterDelay',
        delayMs: 500,
        action: { type: 'navigate', destinationId: home.id },
        transition: { kind: 'fade', durationMs: 300, easing: 'easeOut' }
      }
    ])
    writeInteractions(graph, button.id, [
      { id: 'drag', trigger: 'drag', action: { type: 'setState', state: 'idle' } }
    ])
    writePlugin(graph, button.id, STATE_PLUGIN_KEY, {
      version: 1,
      initial: 'idle',
      states: [{ name: 'idle', visual: {} }]
    })
    const runtime = createPrototypeRuntime(graph, { reducedMotion: true })
    runtime.start(0, splash.id)

    runtime.tick(499)
    expect(runtime.getScreenId()).toBe(splash.id)
    runtime.tick(500)
    expect(runtime.getScreenId()).toBe(home.id)

    runtime.beginDrag(button.id, 600)
    runtime.updateDrag(24, -8, 650)
    const dragged = runtime.getRenderState()?.nodeVisuals.get(button.id)
    expect(dragged?.translateX).toBe(24)
    expect(dragged?.translateY).toBe(-8)
    runtime.endDrag(700)
    expect(runtime.getRenderState()?.nodeVisuals.get(button.id)?.translateX).toBe(24)
  })

  test('keyframe play collapses to its end frame', () => {
    const { graph, home, button } = setup()
    writePlugin(graph, button.id, ANIMATIONS_PLUGIN_KEY, {
      version: 1,
      animations: [
        {
          id: 'grow',
          name: 'Grow',
          durationMs: 400,
          playMode: 'once',
          easing: 'linear',
          keyframes: [
            { offsetMs: 0, visual: { scale: 1 } },
            { offsetMs: 400, visual: { scale: 2 } }
          ]
        }
      ]
    })
    const animated = createPrototypeRuntime(graph)
    animated.start(0, home.id)
    animated.playAnimation(button.id, 'grow', 0)
    animated.tick(200)
    const mid = animated.getRenderState()?.nodeVisuals.get(button.id)?.scale ?? 1
    expect(mid).toBeGreaterThan(1)
    expect(mid).toBeLessThan(2)

    const reduced = createPrototypeRuntime(graph, { reducedMotion: true })
    reduced.start(0, home.id)
    reduced.playAnimation(button.id, 'grow', 0)
    expect(reduced.getRenderState()?.nodeVisuals.get(button.id)?.scale).toBeCloseTo(2)
    expect(reduced.hasPendingWork(1)).toBe(false)
  })
})
