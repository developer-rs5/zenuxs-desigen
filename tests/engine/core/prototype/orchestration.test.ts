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

import { planPlayback } from '#core/prototype/keyframes'
import { createPrototypeRuntime } from '#core/prototype/runtime'

function setup() {
  const graph = new SceneGraph()
  const page = graph.getPages()[0]
  const home = graph.createNode('FRAME', page.id, { name: 'Home', width: 800, height: 600 })
  const button = graph.createNode('RECTANGLE', home.id, {
    name: 'Btn',
    x: 100,
    y: 100,
    width: 80,
    height: 40,
    cornerRadius: 4,
    fills: [{ type: 'SOLID', color: { r: 1, g: 1, b: 1, a: 1 }, opacity: 1, visible: true }]
  })
  return { graph, page, home, button }
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

function writeAnimations(graph: SceneGraph, nodeId: string, value: unknown): void {
  writePlugin(graph, nodeId, ANIMATIONS_PLUGIN_KEY, value)
}

function writeStateModel(graph: SceneGraph, nodeId: string, value: unknown): void {
  writePlugin(graph, nodeId, STATE_PLUGIN_KEY, value)
}

function buttonVisual(
  runtime: ReturnType<typeof createPrototypeRuntime>,
  buttonId: string
): Record<string, unknown> {
  const visual = runtime.getRenderState()?.nodeVisuals.get(buttonId)
  return visual ? { ...visual } : {}
}

describe('prototype runtime — keyframe animation playback', () => {
  test('click playAnimation interpolates keyframes exactly at known elapsed time', () => {
    const { graph, home, button } = setup()
    writeAnimations(graph, button.id, {
      version: 1,
      animations: [
        {
          id: 'anim-1',
          name: 'Fade-slide',
          durationMs: 400,
          keyframes: [
            { offsetMs: 0, visual: { opacity: 1, translateX: 0 } },
            { offsetMs: 400, visual: { opacity: 0.2, translateX: 100 } }
          ],
          playMode: 'once',
          easing: 'linear'
        }
      ]
    })
    writeInteractions(graph, button.id, [
      {
        id: 'play',
        trigger: 'click',
        action: { type: 'playAnimation', animationId: 'anim-1' }
      }
    ])
    const runtime = createPrototypeRuntime(graph)
    runtime.start(0, home.id)
    runtime.click(button.id, 0)

    runtime.tick(200) // exactly half the timeline, linear easing
    const mid = buttonVisual(runtime, button.id)
    expect(mid.opacity).toBeCloseTo(0.6, 10)
    expect(mid.translateX).toBeCloseTo(50, 10)

    runtime.tick(400) // settled: final keyframe values
    const done = buttonVisual(runtime, button.id)
    expect(done.opacity).toBe(0.2)
    expect(done.translateX).toBe(100)
  })

  test('a plan that ends on an identity keyframe prunes its visual after settling', () => {
    const { graph, home, button } = setup()
    writeAnimations(graph, button.id, {
      version: 1,
      animations: [
        {
          id: 'snap',
          name: 'Snap back',
          durationMs: 100,
          keyframes: [
            { offsetMs: 0, visual: { scale: 1.2 } },
            { offsetMs: 100, visual: {} }
          ],
          playMode: 'once'
        }
      ]
    })
    const runtime = createPrototypeRuntime(graph)
    runtime.start(0, home.id)
    runtime.playAnimation(button.id, 'snap', 0)

    runtime.tick(50)
    expect(buttonVisual(runtime, button.id).scale).toBeCloseTo(1.1, 10)

    runtime.tick(150) // settled into identity → no leftover visual
    expect(runtime.getRenderState()?.nodeVisuals.has(button.id)).toBe(false)
    expect(runtime.hasPendingWork(150)).toBe(false)
  })
})

describe('prototype runtime — animation groups', () => {
  const groupContainer = {
    version: 1,
    animations: [
      {
        id: 'a1',
        name: 'A1',
        durationMs: 100,
        keyframes: [
          { offsetMs: 0, visual: { opacity: 1 } },
          { offsetMs: 100, visual: { opacity: 0.5 } }
        ],
        playMode: 'once'
      },
      {
        id: 'a2',
        name: 'A2',
        durationMs: 200,
        keyframes: [
          { offsetMs: 0, visual: { translateX: 0 } },
          { offsetMs: 200, visual: { translateX: 40 } }
        ],
        playMode: 'once'
      }
    ],
    groups: [
      {
        id: 'seq-group',
        name: 'Sequence',
        mode: 'sequence' as const,
        items: [{ animationId: 'a1' }, { animationId: 'a2', delayMs: 50 }]
      },
      {
        id: 'par-group',
        name: 'Parallel',
        mode: 'parallel' as const,
        items: [{ animationId: 'a1' }, { animationId: 'a2', delayMs: 50 }]
      }
    ]
  }

  test('sequence plans chain items; parallel plans overlap them', () => {
    const container = groupContainer
    const sequence = planPlayback('btn', container, 'seq-group', true, 0)
    expect(sequence?.items.map((item) => item.startMs)).toEqual([0, 150])
    expect(sequence?.items.map((item) => item.endMs)).toEqual([100, 350])
    expect(sequence?.totalMs).toBe(350)

    const parallel = planPlayback('btn', container, 'par-group', true, 0)
    expect(parallel?.items.map((item) => item.startMs)).toEqual([0, 50])
    expect(parallel?.items.map((item) => item.endMs)).toEqual([100, 250])
    expect(parallel?.totalMs).toBe(250)
  })

  test('sequence playback holds item two until item one completes plus its delay', () => {
    const { graph, home, button } = setup()
    writeAnimations(graph, button.id, groupContainer)
    writeInteractions(graph, button.id, [
      {
        id: 'play-group',
        trigger: 'click',
        action: { type: 'playAnimation', animationId: 'seq-group', group: true }
      }
    ])
    const runtime = createPrototypeRuntime(graph)
    runtime.start(0, home.id)
    runtime.click(button.id, 0)

    runtime.tick(120) // a1 done (100), a2 starts at 150 → only a1's final visual
    const between = buttonVisual(runtime, button.id)
    expect(between.opacity).toBeCloseTo(0.5, 10)
    expect(between.translateX).toBeUndefined()

    runtime.tick(250) // a2 mid-flight (elapsed 100 of 200) → translateX 20
    const second = buttonVisual(runtime, button.id)
    expect(second.translateX).toBeCloseTo(20, 10)

    runtime.tick(400) // past totalMs 350
    expect(buttonVisual(runtime, button.id).translateX).toBe(40)
    expect(runtime.hasPendingWork(400)).toBe(false)
  })

  test('parallel playback starts item two after its delay while item one still runs', () => {
    const { graph, home, button } = setup()
    writeAnimations(graph, button.id, groupContainer)
    writeInteractions(graph, button.id, [
      {
        id: 'play-parallel',
        trigger: 'click',
        action: { type: 'playAnimation', animationId: 'par-group', group: true }
      }
    ])
    const runtime = createPrototypeRuntime(graph)
    runtime.start(0, home.id)
    runtime.click(button.id, 0)

    runtime.tick(120) // a1 finished at 100; a2 running since 50 → elapsed 70 → translateX 14
    const mid = buttonVisual(runtime, button.id)
    expect(mid.translateX).toBeCloseTo(14, 4)
    expect(mid.opacity).toBeUndefined()

    runtime.tick(300) // totalMs 250 → settled
    expect(buttonVisual(runtime, button.id).translateX).toBe(40)
    expect(runtime.hasPendingWork(300)).toBe(false)
  })
})

describe('prototype runtime — motion cancellation', () => {
  test('a second playAnimation on the same node cancels the first', () => {
    const { graph, home, button } = setup()
    writeAnimations(graph, button.id, {
      version: 1,
      animations: [
        {
          id: 'slow',
          name: 'Slow',
          durationMs: 1000,
          keyframes: [
            { offsetMs: 0, visual: { opacity: 1 } },
            { offsetMs: 1000, visual: { opacity: 0.1 } }
          ],
          playMode: 'once'
        },
        {
          id: 'quick',
          name: 'Quick',
          durationMs: 200,
          keyframes: [
            { offsetMs: 0, visual: { translateX: 0 } },
            { offsetMs: 200, visual: { translateX: 60 } }
          ],
          playMode: 'once'
        }
      ]
    })
    const runtime = createPrototypeRuntime(graph)
    runtime.start(0, home.id)
    runtime.playAnimation(button.id, 'slow', 0)
    runtime.playAnimation(button.id, 'quick', 100)

    runtime.tick(200) // quick mid-flight; slow must contribute nothing
    const mid = buttonVisual(runtime, button.id)
    expect(mid.translateX).toBeCloseTo(30, 10)
    expect(mid.opacity).toBeUndefined()

    runtime.tick(350) // quick settled; slow would still be mid-animation if not cancelled
    const settled = buttonVisual(runtime, button.id)
    expect(settled.translateX).toBe(60)
    expect(settled.opacity).toBeUndefined()
  })
})

describe('prototype runtime — drag, scroll, longPress triggers', () => {
  function setupDragNode() {
    const ctx = setup()
    writeStateModel(ctx.graph, ctx.button.id, {
      version: 1,
      initial: 'default',
      states: [
        { name: 'default', visual: {} },
        { name: 'dragging', visual: { scale: 0.98 } },
        { name: 'clicked', visual: { opacity: 0.3 } }
      ]
    })
    writeInteractions(ctx.graph, ctx.button.id, [
      {
        id: 'drag-start',
        trigger: 'drag',
        action: { type: 'setState', state: 'dragging' }
      },
      {
        id: 'click-toggle',
        trigger: 'click',
        action: { type: 'setState', state: 'clicked' }
      }
    ])
    return ctx
  }

  test('drag dispatches, follows updateDrag deltas, settles on endDrag, suppresses click', () => {
    const { graph, home, button } = setupDragNode()
    const runtime = createPrototypeRuntime(graph)
    runtime.start(0, home.id)

    runtime.beginDrag(button.id, 10)
    expect(runtime.isDragging()).toBe(true)
    expect(buttonVisual(runtime, button.id).scale).toBe(0.98)

    runtime.updateDrag(30, 15, 20)
    const dragging = buttonVisual(runtime, button.id)
    expect(dragging.translateX).toBe(30)
    expect(dragging.translateY).toBe(15)
    expect(dragging.scale).toBe(0.98)
    expect(dragging.opacity).not.toBe(0.3)

    // A drag owns the pointer: click must not fire while it is active.
    runtime.click(button.id, 25)
    expect(buttonVisual(runtime, button.id).opacity).not.toBe(0.3)

    runtime.endDrag(30)
    expect(runtime.isDragging()).toBe(false)
    runtime.tick(35)
    const settled = buttonVisual(runtime, button.id)
    expect(settled.translateX).toBe(30)
    expect(settled.translateY).toBe(15)
    expect(settled.scale).toBe(0.98)
    expect(settled.opacity).not.toBe(0.3)

    // After the drag, click works again (state visuals replace, not merge).
    runtime.click(button.id, 40)
    const afterClick = buttonVisual(runtime, button.id)
    expect(afterClick.opacity).toBe(0.3)
    expect(afterClick.scale).toBeUndefined()
    expect(afterClick.translateX).toBeUndefined()
  })

  test('scroll dispatches only with a non-zero deltaY', () => {
    const { graph, home, button } = setup()
    writeStateModel(graph, button.id, {
      version: 1,
      initial: 'default',
      states: [
        { name: 'default', visual: {} },
        { name: 'scrolled', visual: { opacity: 0.7 } }
      ]
    })
    writeInteractions(graph, button.id, [
      {
        id: 'scroll-dim',
        trigger: 'scroll',
        action: { type: 'setState', state: 'scrolled' }
      }
    ])
    const runtime = createPrototypeRuntime(graph)
    runtime.start(0, home.id)

    runtime.scroll(button.id, 0, 10)
    expect(buttonVisual(runtime, button.id).opacity).toBeUndefined()

    runtime.scroll(button.id, 12, 20)
    expect(buttonVisual(runtime, button.id).opacity).toBe(0.7)
  })

  test('longPress dispatches its interaction', () => {
    const { graph, home, button } = setup()
    writeStateModel(graph, button.id, {
      version: 1,
      initial: 'default',
      states: [
        { name: 'default', visual: {} },
        { name: 'held', visual: { rotation: 15 } }
      ]
    })
    writeInteractions(graph, button.id, [
      {
        id: 'hold-rotate',
        trigger: 'longPress',
        action: { type: 'setState', state: 'held' }
      }
    ])
    const runtime = createPrototypeRuntime(graph)
    runtime.start(0, home.id)
    runtime.longPress(button.id, 10)
    expect(buttonVisual(runtime, button.id).rotation).toBe(15)
  })
})

describe('prototype runtime — guards', () => {
  function guardRuntime(open: boolean) {
    const { graph, home, button } = setup()
    writeStateModel(graph, button.id, {
      version: 1,
      initial: 'default',
      states: [
        { name: 'default', visual: {} },
        { name: 'armed', visual: { opacity: 0.6 } }
      ],
      vars: { open }
    })
    writeInteractions(graph, button.id, [
      {
        id: 'guarded',
        trigger: 'click',
        action: { type: 'setState', state: 'armed' },
        guard: { all: [{ variable: 'open', op: 'eq', value: true }] }
      }
    ])
    const runtime = createPrototypeRuntime(graph)
    runtime.start(0, home.id)
    return { runtime, button }
  }

  test('a passing guard fires the interaction', () => {
    const { runtime, button } = guardRuntime(true)
    runtime.click(button.id, 10)
    expect(buttonVisual(runtime, button.id).opacity).toBe(0.6)
  })

  test('a failing guard silently blocks the interaction', () => {
    const { runtime, button } = guardRuntime(false)
    runtime.click(button.id, 10)
    expect(buttonVisual(runtime, button.id).opacity).toBeUndefined()
  })
})

describe('prototype runtime — setVariant mutation channel', () => {
  function variantSetup() {
    const ctx = setup()
    writeInteractions(ctx.graph, ctx.button.id, [
      {
        id: 'swap',
        trigger: 'click',
        action: { type: 'setVariant', variant: 'Size=Large' }
      }
    ])
    return ctx
  }

  test('without an injected channel the action records a warning and never crashes', () => {
    const { graph, home, button } = variantSetup()
    const runtime = createPrototypeRuntime(graph)
    runtime.start(0, home.id)
    runtime.click(button.id, 10)
    expect(runtime.getWarnings()).toEqual([`setVariant "Size=Large" skipped: no mutation channel`])
  })

  test('with an injected channel the action calls it with node and variant', () => {
    const { graph, home, button } = variantSetup()
    const calls: Array<[string, string]> = []
    const runtime = createPrototypeRuntime(graph, {
      onMutate: (nodeId, variant) => {
        calls.push([nodeId, variant])
        return true
      }
    })
    runtime.start(0, home.id)
    runtime.click(button.id, 10)
    expect(calls).toEqual([[button.id, 'Size=Large']])
    expect(runtime.getWarnings()).toEqual([])
  })

  test('a failing channel records a failed-mutation warning', () => {
    const { graph, home, button } = variantSetup()
    const runtime = createPrototypeRuntime(graph, { onMutate: () => false })
    runtime.start(0, home.id)
    runtime.click(button.id, 10)
    expect(runtime.getWarnings()).toEqual([`setVariant "Size=Large" failed on node "${button.id}"`])
  })
})

describe('prototype runtime — seedInitialStates', () => {
  test('non-first initial states render their visual when the screen is entered', () => {
    const { graph, home, button } = setup()
    writeStateModel(graph, home.id, {
      version: 1,
      initial: 'pressed',
      states: [
        { name: 'default', visual: {} },
        { name: 'pressed', visual: { scale: 0.9 } }
      ]
    })
    writeStateModel(graph, button.id, {
      version: 1,
      initial: 'hidden',
      states: [
        { name: 'default', visual: {} },
        { name: 'hidden', visual: { opacity: 0.4 } }
      ]
    })
    const runtime = createPrototypeRuntime(graph)
    runtime.start(0, home.id)

    const state = runtime.getRenderState()
    expect(state?.nodeVisuals.get(home.id)?.scale).toBe(0.9)
    expect(state?.nodeVisuals.get(button.id)?.opacity).toBe(0.4)
  })

  test('identity initial states seed nothing', () => {
    const { graph, home, button } = setup()
    writeStateModel(graph, button.id, {
      version: 1,
      initial: 'default',
      states: [{ name: 'default', visual: {} }]
    })
    const runtime = createPrototypeRuntime(graph)
    runtime.start(0, home.id)
    expect(runtime.getRenderState()?.nodeVisuals.has(button.id)).toBe(false)
  })
})

describe('prototype runtime — motion targets lerp numerics and fill color', () => {
  test('setState fade interpolates rotation/size/radius/blur and mixes fill via culori', () => {
    const { graph, home, button } = setup()
    writeStateModel(graph, button.id, {
      version: 1,
      initial: 'default',
      states: [
        { name: 'default', visual: {} },
        {
          name: 'big',
          visual: {
            rotation: 90,
            width: 160,
            height: 80,
            cornerRadius: 24,
            blur: 8,
            fill: '#000000'
          }
        }
      ]
    })
    writeInteractions(graph, button.id, [
      {
        id: 'grow',
        trigger: 'press',
        action: { type: 'setState', state: 'big' },
        transition: { kind: 'fade', durationMs: 200, easing: 'linear' }
      }
    ])
    const runtime = createPrototypeRuntime(graph)
    runtime.start(0, home.id)
    runtime.pointerDown(button.id, 0)

    runtime.tick(100) // halfway: authored base (80×40, r4, #fff) → target
    const mid = buttonVisual(runtime, button.id)
    expect(mid.rotation).toBeCloseTo(45, 10)
    expect(mid.width).toBeCloseTo(120, 10)
    expect(mid.height).toBeCloseTo(60, 10)
    expect(mid.cornerRadius).toBeCloseTo(14, 10)
    expect(mid.blur).toBeCloseTo(4, 10)
    expect(mid.fill).toBe('#808080')

    runtime.tick(250) // settled: exact absolute targets
    const done = buttonVisual(runtime, button.id)
    expect(done.rotation).toBe(90)
    expect(done.width).toBe(160)
    expect(done.height).toBe(80)
    expect(done.cornerRadius).toBe(24)
    expect(done.blur).toBe(8)
    expect(done.fill).toBe('#000000')
  })
})
