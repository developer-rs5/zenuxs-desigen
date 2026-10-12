import { describe, expect, test } from 'bun:test'

import { EASING_TO_CSS, exportPrototypeBundle } from '@open-pencil/dom-css'
import {
  ANIMATIONS_PLUGIN_KEY,
  INTERACTIONS_PLUGIN_KEY,
  PROTOTYPE_PLUGIN_ID,
  STATE_PLUGIN_KEY,
  SceneGraph,
  serializePluginValue,
  type PrototypeInteraction
} from '@open-pencil/scene-graph'

import { easingProgress } from '#core/prototype/motion'

function writePlugin(graph: SceneGraph, nodeId: string, key: string, value: unknown): void {
  const node = graph.getNode(nodeId)
  if (!node) throw new Error(`missing node ${nodeId}`)
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

function setup() {
  const graph = new SceneGraph()
  const page = graph.getPages()[0]
  const home = graph.createNode('FRAME', page.id, { name: 'Home', width: 800, height: 600 })
  const other = graph.createNode('FRAME', page.id, { name: 'Other', width: 800, height: 600 })
  const button = graph.createNode('RECTANGLE', home.id, {
    name: 'Button',
    x: 40,
    y: 40,
    width: 120,
    height: 48
  })
  button.fills = [{ type: 'SOLID', color: { r: 0.1, g: 0.4, b: 0.9, a: 1 } }]
  return { graph, page, home, other, button }
}

async function bundleHTML(graph: SceneGraph, rootId: string): Promise<string> {
  const { bundle } = await exportPrototypeBundle(graph, { rootId })
  const entry = bundle.files.find((file) => file.path === bundle.entrypoint)
  if (!entry || typeof entry.content !== 'string') throw new Error('missing HTML entrypoint')
  return entry.content
}

/** Standard CSS timing-keyword control points (CSS Easing Functions spec). */
const CSS_KEYWORD_BEZIERS: Record<string, readonly [number, number, number, number]> = {
  linear: [0, 0, 1, 1],
  ease: [0.25, 0.1, 0.25, 1],
  'ease-in': [0.42, 0, 1, 1],
  'ease-out': [0, 0, 0.58, 1],
  'ease-in-out': [0.42, 0, 0.58, 1]
}

function bezierY(x1: number, y1: number, x2: number, y2: number, progress: number): number {
  const sampleX = (t: number): number =>
    3 * (1 - t) ** 2 * t * x1 + 3 * (1 - t) * t ** 2 * x2 + t ** 3
  const sampleY = (t: number): number =>
    3 * (1 - t) ** 2 * t * y1 + 3 * (1 - t) * t ** 2 * y2 + t ** 3
  let low = 0
  let high = 1
  let t = progress
  for (let i = 0; i < 40; i++) {
    t = (low + high) / 2
    if (sampleX(t) < progress) low = t
    else high = t
  }
  return sampleY(t)
}

describe('prototype export — preview easing parity', () => {
  test('emitted CSS keywords define the same curve preview eases with', () => {
    const easings = ['linear', 'ease', 'easeIn', 'easeOut', 'easeInOut'] as const
    for (const easing of easings) {
      const keyword = EASING_TO_CSS[easing]
      const control = CSS_KEYWORD_BEZIERS[keyword]
      expect(control).toBeTruthy()
      if (!control) continue
      for (const progress of [0, 0.1, 0.25, 0.5, 0.75, 0.9, 1]) {
        const preview = easingProgress(easing, progress)
        const css = bezierY(control[0], control[1], control[2], control[3], progress)
        expect(Math.abs(preview - css)).toBeLessThan(1e-4)
      }
    }
  })
})

describe('prototype export — emitted artifacts', () => {
  test('supported prototype emits state rules, transition claims, keyframes, screens, and shim', async () => {
    const { graph, page, home, other, button } = setup()
    writePlugin(graph, button.id, STATE_PLUGIN_KEY, {
      version: 1,
      initial: 'Base',
      states: [
        { name: 'Base', visual: {} },
        { name: 'Pressed', visual: { opacity: 0.4, scale: 1.1 } }
      ]
    })
    writePlugin(graph, button.id, ANIMATIONS_PLUGIN_KEY, {
      version: 1,
      animations: [
        {
          id: 'pulse',
          name: 'Pulse',
          durationMs: 400,
          easing: 'easeOut',
          playMode: 'loop',
          keyframes: [
            { offsetMs: 100, visual: { opacity: 0.5 } },
            { offsetMs: 400, visual: { opacity: 1 } }
          ]
        }
      ]
    })
    writeInteractions(graph, button.id, [
      {
        id: 'click-press',
        trigger: 'click',
        action: { type: 'setState', state: 'Pressed' },
        transition: { kind: 'fade', durationMs: 250, easing: 'easeInOut' }
      },
      {
        id: 'go',
        trigger: 'load',
        action: { type: 'navigate', destinationId: other.id },
        transition: { kind: 'slide', direction: 'left', durationMs: 300, easing: 'easeOut' }
      },
      { id: 'spin', trigger: 'press', action: { type: 'playAnimation', animationId: 'pulse' } }
    ])

    const html = await bundleHTML(graph, page.id)
    const selector = `[data-open-pencil-node-id="${button.id}"]`

    // State visuals with preview parity: opacity product, center scale, seed attr.
    expect(html).toContain(`${selector}[data-op-state="Pressed"]{opacity: 0.4`)
    expect(html).toContain('translate(50%, 50%) scale(1.1) translate(-50%, -50%)')
    expect(html).toContain(`data-op-state="Base"`)
    // Interaction-authored motion: fade claim on the base, exact CSS keyword.
    expect(html).toContain('transition: opacity 250ms ease-in-out')
    // Screen slide: dest enters from +width, source exits to -width, timed.
    expect(html).toContain(`[data-op-screen="${other.id}"]{transition: opacity 300ms ease-out`)
    expect(html).toContain(`[data-op-screen="${other.id}"]{transform: translate(800px, 0px)}`)
    expect(html).toContain(
      `[data-op-screen="${home.id}"].is-leaving{transform: translate(-800px, 0px)}`
    )
    // Keyframes: step-end hold, percent math, per-frame timing, loop count.
    expect(html).toContain('0% { animation-timing-function: step-end }')
    expect(html).toContain('25% { opacity: 0.5;')
    expect(html).toContain('animation-timing-function: ease-out')
    expect(html).toContain('infinite forwards')
    expect(html).toContain(':active{animation: op-anim-0')
    // Shim only carries the JS-dependent pieces.
    expect(html).toContain('<script data-op-prototype>')
    expect(html).toContain("setAttribute('data-op-state'")

    const { report } = await exportPrototypeBundle(graph, { rootId: page.id })
    expect(report.interactions.total).toBe(3)
    expect(report.interactions.skipped).toBe(0)
    for (const counts of [report.interactions, report.states, report.animations, report.flows]) {
      expect(counts.total).toBe(counts.exported + counts.approximate + counts.skipped)
    }
    void home
  })

  test('previously-skipped capabilities emit runtime behavior with honest reporting', async () => {
    const { graph, page, home, other, button } = setup()
    writeInteractions(graph, button.id, [
      { id: 'drag', trigger: 'drag', action: { type: 'setState', state: 'Pressed' } },
      {
        id: 'guarded',
        trigger: 'click',
        action: { type: 'setState', state: 'Pressed' },
        guard: { all: [{ variable: 'flag', op: 'eq', value: true }] }
      },
      {
        id: 'overlay',
        trigger: 'hoverEnter',
        action: { type: 'openOverlay', overlayId: other.id }
      },
      {
        id: 'spring-state',
        trigger: 'load',
        action: { type: 'setState', state: 'Pressed' },
        transition: { kind: 'spring', spring: { mode: 'physics', stiffness: 220, damping: 26 } }
      },
      {
        id: 'far-nav',
        trigger: 'afterDelay',
        delayMs: 50,
        action: { type: 'navigate', destinationId: button.id }
      }
    ])
    writePlugin(graph, button.id, STATE_PLUGIN_KEY, {
      version: 1,
      initial: 'Base',
      states: [
        { name: 'Base', visual: {} },
        {
          name: 'Pressed',
          visual: { opacity: 0.4, fill: 'linear-gradient(#fff, #000)' }
        }
      ]
    })

    const { bundle, report } = await exportPrototypeBundle(graph, { rootId: page.id })
    const entry = bundle.files.find((file) => file.path === bundle.entrypoint)
    const html = entry && typeof entry.content === 'string' ? entry.content : ''

    // Every interaction except the genuinely-broken destination exports.
    // (far-nav targets a non-screen node → destination-outside-root.)
    const skipped = report.issues.filter((issue) => issue.status === 'skipped')
    const reasons = new Set(skipped.map((issue) => issue.reason))
    expect(reasons).toContain('destination-outside-root')
    expect(reasons).toContain('fill')
    expect(reasons).not.toContain('unsupported-trigger')
    expect(reasons).not.toContain('guard')
    expect(reasons).not.toContain('overlay')
    expect(reasons).not.toContain('spring')
    for (const counts of [report.interactions, report.states, report.animations, report.flows]) {
      expect(counts.total).toBe(counts.exported + counts.approximate + counts.skipped)
    }
    for (const issue of skipped) expect(issue.reason ?? '').not.toBe('')

    // Runtime artifacts: drag tracking, guard evaluation, overlay open,
    // spring sampled into linear(), variable seeding.
    expect(html).toContain("addEventListener('pointerdown'")
    expect(html).toContain('trigger":"drag')
    expect(html).toContain('guardOk')
    expect(html).toContain('"flag"')
    expect(html).toContain('overlay-open')
    expect(html).toContain('linear(')
    expect(html).toContain('data-op-overlay')
    expect(html).toContain('.op-backdrop')
    // Guarded load setState still claims the spring timing for its state rule.
    expect(html).toContain('linear(')
    // Fill still cannot express → the non-solid fill is withheld from CSS.
    expect(html).not.toContain('linear-gradient')
    void home
  })
})
