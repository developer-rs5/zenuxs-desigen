import { describe, expect, test } from 'bun:test'

import {
  INTERACTIONS_PLUGIN_KEY,
  PROTOTYPE_PLUGIN_ID,
  SceneGraph,
  serializePluginValue,
  type PrototypeInteraction,
  type PrototypeSpring
} from '@open-pencil/scene-graph'

import { SPRING_DEFAULT_DURATION_MS } from '#core/prototype/motion'
import { createPrototypeRuntime } from '#core/prototype/runtime'

function setup() {
  const graph = new SceneGraph()
  const page = graph.getPages()[0]
  const splash = graph.createNode('FRAME', page.id, { name: 'Splash', width: 800, height: 600 })
  const home = graph.createNode('FRAME', page.id, { name: 'Home', width: 800, height: 600 })
  return { graph, splash, home }
}

function writeInteractions(
  graph: SceneGraph,
  nodeId: string,
  interactions: PrototypeInteraction[]
): void {
  const node = graph.getNode(nodeId)
  if (!node) throw new Error('missing node')
  graph.updateNode(nodeId, {
    pluginData: [
      ...node.pluginData.filter(
        (entry) =>
          !(entry.pluginId === PROTOTYPE_PLUGIN_ID && entry.key === INTERACTIONS_PLUGIN_KEY)
      ),
      {
        pluginId: PROTOTYPE_PLUGIN_ID,
        key: INTERACTIONS_PLUGIN_KEY,
        value: serializePluginValue(interactions)
      }
    ]
  })
}

/**
 * Same shape PrototypeSection writes: the kind select emits
 * `{ kind: 'spring', spring: { mode: 'time' } }`, then every parameter edit
 * spreads into that spring object through the interaction patch path.
 */
function authoredTransition(spring: PrototypeSpring) {
  const base = { kind: 'spring', spring: { mode: 'time' as const } }
  return { ...base, spring: { ...base.spring, ...spring } }
}

/** In-flight crossfade opacity of the destination one quarter into the settle window. */
function sampleSpringOpacity(spring: PrototypeSpring): number {
  const { graph, splash, home } = setup()
  writeInteractions(graph, splash.id, [
    {
      id: 'spring-nav',
      trigger: 'load',
      action: { type: 'navigate', destinationId: home.id },
      transition: authoredTransition(spring)
    }
  ])
  const runtime = createPrototypeRuntime(graph)
  runtime.start(0, splash.id)
  runtime.tick(SPRING_DEFAULT_DURATION_MS / 4)
  return runtime.getRenderState()?.nodeVisuals.get(home.id)?.opacity ?? 0
}

function expectSettles(spring: PrototypeSpring): void {
  const { graph, splash, home } = setup()
  writeInteractions(graph, splash.id, [
    {
      id: 'spring-nav',
      trigger: 'load',
      action: { type: 'navigate', destinationId: home.id },
      transition: authoredTransition(spring)
    }
  ])
  const runtime = createPrototypeRuntime(graph)
  runtime.start(0, splash.id)
  runtime.tick(SPRING_DEFAULT_DURATION_MS + 1)
  expect(runtime.getScreenId()).toBe(home.id)
  expect(runtime.getRenderState()?.drawIds).toEqual([home.id])
  expect(runtime.hasPendingWork(SPRING_DEFAULT_DURATION_MS + 1)).toBe(false)
}

describe('authored spring parameters drive the runtime', () => {
  test('time-mode bounce changes mid-flight progress and still settles', () => {
    const tight = sampleSpringOpacity({ mode: 'time', bounce: 0.05 })
    const bouncy = sampleSpringOpacity({ mode: 'time', bounce: 0.9 })

    expect(tight).toBeGreaterThan(0)
    expect(tight).toBeLessThan(1)
    // The bouncy curve is far ahead here (it overshoots), so the two differ.
    expect(bouncy).not.toBeCloseTo(tight, 5)

    expectSettles({ mode: 'time', bounce: 0.05 })
    expectSettles({ mode: 'time', bounce: 0.9 })
  })

  test('physics-mode stiffness, damping, and mass each change progress', () => {
    const baseline = sampleSpringOpacity({ mode: 'physics' })
    const stiff = sampleSpringOpacity({ mode: 'physics', stiffness: 900, damping: 60, mass: 3 })
    const heavy = sampleSpringOpacity({ mode: 'physics', stiffness: 100, damping: 10, mass: 9 })

    expect(baseline).toBeGreaterThan(0)
    expect(baseline).toBeLessThan(1)
    expect(stiff).not.toBeCloseTo(baseline, 5)
    expect(heavy).not.toBeCloseTo(baseline, 5)

    expectSettles({ mode: 'physics', stiffness: 900, damping: 60, mass: 3 })
  })

  test('re-auditing the authored value round-trips through the interaction read path', () => {
    const { graph, splash } = setup()
    const spring: PrototypeSpring = { mode: 'physics', stiffness: 450, damping: 22, mass: 2 }
    writeInteractions(graph, splash.id, [
      {
        id: 'spring-nav',
        trigger: 'load',
        action: { type: 'navigate', destinationId: splash.id },
        transition: authoredTransition(spring)
      }
    ])
    const node = graph.getNode(splash.id)
    expect(node).toBeDefined()
    const stored = node
      ? (JSON.parse(
          node.pluginData.find(
            (entry) =>
              entry.pluginId === PROTOTYPE_PLUGIN_ID && entry.key === INTERACTIONS_PLUGIN_KEY
          )?.value ?? '[]'
        ) as PrototypeInteraction[])
      : []
    const transition = stored[0]?.transition
    expect(transition?.kind).toBe('spring')
    if (transition?.kind === 'spring') expect(transition.spring).toEqual(spring)
  })
})
