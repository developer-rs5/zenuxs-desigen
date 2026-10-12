import { describe, expect, test } from 'bun:test'

import {
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
  // Bottom sheet authored over the lower half of the screen (resting position);
  // the runtime slides it in from below the screen edge.
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

describe('prototype runtime — vertical slice 1: splash → home', () => {
  test('OnLoad navigate with 500ms ease-out fade', () => {
    const { graph, splash, home } = setup()
    writeInteractions(graph, splash.id, [
      {
        id: 'load-nav',
        trigger: 'load',
        action: { type: 'navigate', destinationId: home.id },
        transition: { kind: 'fade', durationMs: 500, easing: 'easeOut' }
      }
    ])
    const runtime = createPrototypeRuntime(graph)

    runtime.start(0, splash.id)
    // Navigated on load: current screen is already Home, fade still running.
    expect(runtime.getScreenId()).toBe(home.id)

    runtime.tick(250) // mid-fade
    const mid = runtime.getRenderState()
    expect(mid?.drawIds).toEqual([splash.id, home.id])
    const homeVisual = mid?.nodeVisuals.get(home.id)
    expect(homeVisual?.opacity).toBeGreaterThan(0)
    expect(homeVisual?.opacity).toBeLessThan(1)
    const splashVisual = mid?.nodeVisuals.get(splash.id)
    expect(splashVisual?.opacity).toBeGreaterThan(0)
    expect(splashVisual?.opacity).toBeLessThan(1)

    runtime.tick(600)
    const done = runtime.getRenderState()
    expect(done?.drawIds).toEqual([home.id])
  })

  test('spring navigate crossfades both screens, then settles to exactly the destination', () => {
    const { graph, splash, home } = setup()
    writeInteractions(graph, splash.id, [
      {
        id: 'spring-nav',
        trigger: 'load',
        action: { type: 'navigate', destinationId: home.id },
        transition: { kind: 'spring', spring: { mode: 'time', bounce: 0.3 }, durationMs: 600 }
      }
    ])
    const runtime = createPrototypeRuntime(graph)
    runtime.start(0, splash.id)
    expect(runtime.getScreenId()).toBe(home.id)

    runtime.tick(150) // early spring: partial crossfade, not an instant swap
    const early = runtime.getRenderState()
    expect(early?.drawIds).toEqual([splash.id, home.id])
    const earlyHome = early?.nodeVisuals.get(home.id)?.opacity ?? 0
    const earlySplash = early?.nodeVisuals.get(splash.id)?.opacity ?? 1
    expect(earlyHome).toBeGreaterThan(0)
    expect(earlyHome).toBeLessThan(1)
    expect(earlyHome + earlySplash).toBeCloseTo(1, 5)

    runtime.tick(350) // spring progress is in its overshoot band here
    const overshoot = runtime.getRenderState()
    expect(overshoot?.drawIds).toEqual([splash.id, home.id])
    expect(overshoot?.nodeVisuals.get(home.id)?.opacity).toBeLessThanOrEqual(1)
    expect(overshoot?.nodeVisuals.get(splash.id)?.opacity).toBeGreaterThanOrEqual(0)

    runtime.tick(700) // past settle window
    const done = runtime.getRenderState()
    expect(done?.drawIds).toEqual([home.id])
    expect(done?.nodeVisuals.has(splash.id)).toBe(false)
    expect(done?.nodeVisuals.has(home.id)).toBe(false)
    expect(runtime.hasPendingWork(700)).toBe(false)
  })

  test('rapid reverse spring navigations keep exactly two screens drawn', () => {
    const { graph, splash, home } = setup()
    writeInteractions(graph, splash.id, [
      {
        id: 'to-home',
        trigger: 'click',
        action: { type: 'navigate', destinationId: home.id },
        transition: { kind: 'spring', spring: { mode: 'time', bounce: 0.5 }, durationMs: 500 }
      }
    ])
    writeInteractions(graph, home.id, [
      {
        id: 'to-splash',
        trigger: 'click',
        action: { type: 'navigate', destinationId: splash.id },
        transition: { kind: 'spring', spring: { mode: 'time', bounce: 0.5 }, durationMs: 500 }
      }
    ])
    const runtime = createPrototypeRuntime(graph)
    runtime.start(0, splash.id)

    runtime.click(splash.id, 100)
    runtime.tick(200)
    expect(runtime.getRenderState()?.drawIds).toEqual([splash.id, home.id])

    runtime.click(home.id, 250) // jump mid-flight back to splash
    runtime.tick(300)
    const mid = runtime.getRenderState()
    expect(mid?.drawIds).toEqual([home.id, splash.id])
    expect(mid?.drawIds).toHaveLength(2)

    runtime.tick(900)
    expect(runtime.getRenderState()?.drawIds).toEqual([splash.id])
    expect(runtime.hasPendingWork(900)).toBe(false)
  })

  test('missing destination is a no-op, never throws', () => {
    const { graph, splash } = setup()
    writeInteractions(graph, splash.id, [
      { id: 'bad', trigger: 'load', action: { type: 'navigate', destinationId: 'ghost' } }
    ])
    const runtime = createPrototypeRuntime(graph)
    runtime.start(0, splash.id)
    expect(runtime.getScreenId()).toBe(splash.id)
  })
})

describe('prototype runtime — vertical slice 2: button states', () => {
  test('press scales down, release springs back', () => {
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
      { id: 'down', trigger: 'press', action: { type: 'setState', state: 'pressed' } },
      {
        id: 'up',
        trigger: 'release',
        action: { type: 'setState', state: 'default' },
        transition: { kind: 'spring', spring: { mode: 'time', bounce: 0.4 } }
      }
    ])
    const runtime = createPrototypeRuntime(graph)
    runtime.start(0, home.id)

    runtime.pointerDown(button.id, 100)
    const pressed = runtime.getRenderState()
    expect(pressed?.nodeVisuals.get(button.id)?.scale).toBeCloseTo(0.96)

    runtime.pointerUp(button.id, 150)
    runtime.tick(250) // mid-spring: between 0.96 and 1
    const rebound = runtime.getRenderState()?.nodeVisuals.get(button.id)
    expect(rebound?.scale).toBeGreaterThan(0.96)
    expect(rebound?.scale).toBeLessThanOrEqual(1.05)

    runtime.tick(600) // spring settled
    expect(runtime.getRenderState()?.nodeVisuals.has(button.id)).toBe(false)
  })

  test('hover enter/leave dispatches only along changed chain', () => {
    const { graph, home, button } = setup()
    writeInteractions(graph, button.id, [
      { id: 'h-in', trigger: 'hoverEnter', action: { type: 'setState', state: 'hovered' } },
      { id: 'h-out', trigger: 'hoverLeave', action: { type: 'setState', state: 'default' } }
    ])
    writePlugin(graph, button.id, STATE_PLUGIN_KEY, {
      version: 1,
      initial: 'default',
      states: [
        { name: 'default', visual: { opacity: 1 } },
        { name: 'hovered', visual: { opacity: 0.8 } }
      ]
    })
    const runtime = createPrototypeRuntime(graph)
    runtime.start(0, home.id)

    runtime.updateHover([button.id, home.id], 10)
    expect(runtime.getRenderState()?.nodeVisuals.get(button.id)?.opacity).toBeCloseTo(0.8)

    // Same chain again: no re-dispatch (visual unchanged / no restart glitch).
    runtime.updateHover([button.id, home.id], 20)
    expect(runtime.getRenderState()?.nodeVisuals.get(button.id)?.opacity).toBeCloseTo(0.8)

    runtime.updateHover([home.id], 30)
    expect(runtime.getRenderState()?.nodeVisuals.get(button.id)?.opacity).toBeUndefined()
  })
})

describe('prototype runtime — vertical slice 3: bottom sheet', () => {
  test('open overlay with backdrop + slide from bottom, then close reverses', () => {
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
    const runtime = createPrototypeRuntime(graph)
    runtime.start(0, home.id)

    runtime.click(button.id, 0)
    runtime.tick(150) // mid-open
    let state = runtime.getRenderState()
    expect(state?.drawIds).toEqual([home.id, sheet.id])
    expect(state?.backdropOpacity).toBeGreaterThan(0)
    expect(state?.backdropOpacity).toBeLessThanOrEqual(0.4)
    expect(state?.nodeVisuals.get(sheet.id)?.translateY).toBeGreaterThan(0) // still below

    runtime.tick(300)
    state = runtime.getRenderState()
    expect(state?.backdropOpacity).toBeCloseTo(0.4)
    expect(state?.nodeVisuals.get(sheet.id)?.translateY ?? 0).toBeCloseTo(0, 5)

    runtime.click(sheet.id, 400)
    runtime.tick(550)
    state = runtime.getRenderState()
    expect(state?.backdropOpacity).toBeLessThan(0.4)
    expect(state?.nodeVisuals.get(sheet.id)?.translateY).toBeGreaterThan(0)

    runtime.tick(750)
    state = runtime.getRenderState()
    expect(state?.drawIds).toEqual([home.id])
    expect(state?.backdropOpacity).toBe(0)
  })
})

describe('prototype runtime — timers and safety', () => {
  test('afterDelay fires on tick', () => {
    const { graph, splash, home } = setup()
    writeInteractions(graph, splash.id, [
      {
        id: 'later',
        trigger: 'afterDelay',
        delayMs: 1000,
        action: { type: 'navigate', destinationId: home.id }
      }
    ])
    const runtime = createPrototypeRuntime(graph)
    runtime.start(0, splash.id)
    expect(runtime.getScreenId()).toBe(splash.id)
    runtime.tick(500)
    expect(runtime.getScreenId()).toBe(splash.id)
    runtime.tick(1000)
    expect(runtime.getScreenId()).toBe(home.id)
  })

  test('cyclic OnLoad navigates terminate instead of hanging', () => {
    const { graph, splash, home } = setup()
    const instant = { kind: 'instant' } as const
    writeInteractions(graph, splash.id, [
      {
        id: 'a',
        trigger: 'load',
        action: { type: 'navigate', destinationId: home.id },
        transition: instant
      }
    ])
    writeInteractions(graph, home.id, [
      {
        id: 'b',
        trigger: 'load',
        action: { type: 'navigate', destinationId: splash.id },
        transition: instant
      }
    ])
    const runtime = createPrototypeRuntime(graph)
    runtime.start(0, splash.id)
    const screen = runtime.getScreenId()
    expect(screen === splash.id || screen === home.id).toBe(true)
  })

  test('stopped runtime returns no render state and ignores input', () => {
    const { graph, home, button } = setup()
    const runtime = createPrototypeRuntime(graph)
    runtime.start(0, home.id)
    runtime.stop()
    expect(runtime.getRenderState()).toBeNull()
    runtime.click(button.id, 10)
    expect(runtime.getRenderState()).toBeNull()
  })

  test('unknown setState target is a no-op', () => {
    const { graph, home, button } = setup()
    writeInteractions(graph, button.id, [
      { id: 'x', trigger: 'press', action: { type: 'setState', state: 'nope' } }
    ])
    const runtime = createPrototypeRuntime(graph)
    runtime.start(0, home.id)
    runtime.pointerDown(button.id, 10)
    expect(runtime.getRenderState()?.nodeVisuals.has(button.id)).toBe(false)
  })
})
