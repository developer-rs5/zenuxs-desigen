import { describe, expect, it } from 'bun:test'

import {
  ANIMATIONS_PLUGIN_KEY,
  INTERACTIONS_PLUGIN_KEY,
  PROTOTYPE_DOC_PLUGIN_KEY,
  PROTOTYPE_PLUGIN_ID,
  STATE_PLUGIN_KEY,
  SceneGraph,
  serializePluginValue,
  type PrototypeInteraction
} from '@open-pencil/scene-graph'

import {
  EASING_TO_CSS,
  analyzePrototype,
  easingToCSS,
  exportPrototypeBundle,
  prototypeShim,
  type PrototypeExportReport,
  type PrototypeShimOp
} from '../src/index'
import {
  animationShorthand,
  keyframeBlock,
  resolvedVisual,
  transformTemplate,
  visualCSS
} from '../src/prototype/css'
import { isSpringTransition, transitionTiming } from '../src/prototype/support'

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
  button.fills = [
    { type: 'SOLID', color: { r: 0.1, g: 0.4, b: 0.9, a: 1 }, opacity: 1, visible: true }
  ]
  return { graph, page, home, other, button }
}

function buttonModel() {
  return {
    version: 1,
    initial: 'Base',
    states: [
      { name: 'Base', visual: {} },
      { name: 'Pressed', visual: { opacity: 0.4 } }
    ]
  }
}

function assertReportInvariants(report: PrototypeExportReport): void {
  for (const counts of [report.interactions, report.states, report.animations, report.flows]) {
    expect(counts.total).toBe(counts.exported + counts.approximate + counts.skipped)
  }
  for (const issue of report.issues) {
    if (issue.status === 'skipped') expect(issue.reason ?? '').not.toBe('')
    if (issue.status === 'exported-approximate') expect(issue.emittedAs ?? '').not.toBe('')
  }
}

describe('prototype export — pure builders', () => {
  it('maps every authored easing to its exact CSS keyword', () => {
    expect(EASING_TO_CSS).toEqual({
      linear: 'linear',
      ease: 'ease',
      easeIn: 'ease-in',
      easeOut: 'ease-out',
      easeInOut: 'ease-in-out'
    })
    expect(easingToCSS('easeInOut')).toBe('ease-in-out')
  })

  it('times fade/slide, samples spring into linear(), and withholds instant', () => {
    expect(transitionTiming({ kind: 'fade', durationMs: 300, easing: 'easeOut' })).toBe(
      '300ms ease-out'
    )
    expect(
      transitionTiming({ kind: 'slide', direction: 'left', durationMs: 400, easing: 'linear' })
    ).toBe('400ms linear')
    expect(transitionTiming({ kind: 'instant' })).toBeNull()
    const spring = transitionTiming({
      kind: 'spring',
      spring: { mode: 'time', bounce: 0.4 },
      durationMs: 400
    })
    expect(spring).toStartWith('400ms linear(')
    // Samples the clamped preview curve: endpoints exact, 64 segments.
    const values = spring
      ?.slice(spring.indexOf('(') + 1, -1)
      .split(',')
      .map(Number)
    expect(values).toHaveLength(65)
    expect(values?.[0]).toBe(0)
    expect(values?.[64]).toBe(1)
    for (const value of values ?? []) {
      expect(value).toBeGreaterThanOrEqual(0)
      expect(value).toBeLessThanOrEqual(1)
    }
    expect(isSpringTransition({ kind: 'spring', spring: { mode: 'physics' } })).toBe(true)
  })

  it('anchors size changes as top-left proportional scale, never CSS width/height', () => {
    const node = setup().button
    const template = transformTemplate(node, resolvedVisual(node, { width: 240, height: 96 }))
    expect(template.startsWith('translate(0px, 0px) scale(2, 2)')).toBe(true)
    expect(template).toContain('translate(50%, 50%) scale(1) translate(-50%, -50%)')
    expect(template).toContain('translate(50%, 50%) rotate(0deg) translate(-50%, -50%)')
    const css = visualCSS(node, resolvedVisual(node, { width: 240 }))
    expect(css.declarations.some((declaration) => declaration.startsWith('width:'))).toBe(false)
    expect(css.declarations).toContain('transform-origin: 0 0')
  })

  it('multiplies opacity, halves blur, and withholds inexpressible fills', () => {
    const node = setup().button
    node.opacity = 0.5
    const css = visualCSS(node, resolvedVisual(node, { opacity: 0.5, blur: 8 }))
    expect(css.declarations).toContain('opacity: 0.25')
    expect(css.declarations).toContain('filter: blur(4px)')
    expect(css.unsupported).toBe(false)

    const gradient = visualCSS(node, resolvedVisual(node, { fill: 'linear-gradient(#fff, #000)' }))
    expect(gradient.unsupported).toBe(true)
    expect(gradient.declarations.some((declaration) => declaration.includes('gradient'))).toBe(
      false
    )
  })

  it('emits keyframe percents, per-frame timing, and loop counts', () => {
    expect(keyframeBlock(25, ['opacity: 0.4'], 'ease-out')).toBe(
      '25% { opacity: 0.4; animation-timing-function: ease-out }'
    )
    expect(
      animationShorthand([
        { name: 'op-anim-0', durationMs: 400, timing: 'ease-out', delayMs: 50, loop: false },
        { name: 'op-anim-1', durationMs: 300, timing: 'linear', delayMs: 450, loop: true }
      ])
    ).toBe(
      'animation: op-anim-0 400ms ease-out 50ms 1 forwards, op-anim-1 300ms linear 450ms infinite forwards'
    )
  })
})

describe('prototype export — analysis', () => {
  it('emits click → setState with fade transition claims and a shim op', () => {
    const { graph, page, button } = setup()
    writePlugin(graph, button.id, STATE_PLUGIN_KEY, buttonModel())
    writeInteractions(graph, button.id, [
      {
        id: 'click-press',
        trigger: 'click',
        action: { type: 'setState', state: 'Pressed' },
        transition: { kind: 'fade', durationMs: 300, easing: 'easeOut' }
      }
    ])

    const analysis = analyzePrototype(graph, page.id)
    const css = analysis.css.join('\n')
    const selector = `[data-open-pencil-node-id="${button.id}"]`
    expect(css).toContain(`${selector}[data-op-state="Pressed"]{opacity: 0.4`)
    expect(css).toContain(`${selector}[data-op-state="Base"]{`)
    expect(css).toContain('transition: opacity 300ms ease-out')
    expect(css).not.toContain(':hover')
    expect(analysis.shim).toHaveLength(1)
    expect(analysis.shim[0]).toMatchObject({
      kind: 'state',
      state: 'Pressed',
      trigger: 'click'
    })
    expect(analysis.seeds.get(button.id)).toBe('Base')
    expect(analysis.report.interactions).toEqual({
      total: 1,
      exported: 1,
      approximate: 0,
      skipped: 0
    })
    assertReportInvariants(analysis.report)
  })

  it('maps hover and press to CSS pseudo-classes without a shim', () => {
    const { graph, page, button } = setup()
    writePlugin(graph, button.id, STATE_PLUGIN_KEY, buttonModel())
    writeInteractions(graph, button.id, [
      { id: 'hover', trigger: 'hoverEnter', action: { type: 'setState', state: 'Pressed' } },
      { id: 'leave', trigger: 'hoverLeave', action: { type: 'setState', state: 'Base' } },
      { id: 'press', trigger: 'press', action: { type: 'setState', state: 'Pressed' } }
    ])

    const analysis = analyzePrototype(graph, page.id)
    const css = analysis.css.join('\n')
    const selector = `[data-open-pencil-node-id="${button.id}"]`
    expect(css).toContain(`${selector}:hover{`)
    expect(css).toContain(`${selector}:active{`)
    expect(css).not.toContain(':not(:hover)')
    expect(analysis.shim).toHaveLength(0)
    expect(analysis.report.interactions.exported).toBe(3)
    assertReportInvariants(analysis.report)
  })

  it('stacks screens, crossfades navigate, and seeds the flow start', () => {
    const { graph, page, home, other, button } = setup()
    writePlugin(graph, graph.rootId, PROTOTYPE_DOC_PLUGIN_KEY, {
      version: 1,
      flows: [{ id: 'f1', name: 'Main', startNodeId: other.id }],
      activeFlowId: 'f1'
    })
    writeInteractions(graph, button.id, [
      {
        id: 'go',
        trigger: 'click',
        action: { type: 'navigate', destinationId: other.id },
        transition: { kind: 'fade', durationMs: 300, easing: 'easeOut' }
      }
    ])

    const analysis = analyzePrototype(graph, page.id)
    const css = analysis.css.join('\n')
    expect(css).toContain('.op-screen{position:absolute;left:0;top:0;')
    expect(css).toContain(`[data-op-screen="${other.id}"]{transition: opacity 300ms ease-out`)
    expect(css).toContain(`[data-op-screen="${other.id}"]{opacity: calc(0 * 1)}`)
    expect(css).toContain(`[data-op-screen="${other.id}"].is-active{opacity: calc(1 * 1)}`)
    expect(css).toContain(`[data-op-screen="${home.id}"].is-leaving{opacity: calc(0 * 1)}`)
    expect(analysis.screens).toEqual([
      { id: home.id, active: false },
      { id: other.id, active: true }
    ])
    expect(analysis.stage).toEqual({ width: 800, height: 600 })
    const nav = analysis.shim.find((op) => op.kind === 'navigate')
    expect(nav).toMatchObject({ dest: other.id, leaveVisible: true, trigger: 'click' })
    expect(analysis.report.flows).toEqual({ total: 1, exported: 1, approximate: 0, skipped: 0 })
    assertReportInvariants(analysis.report)
  })

  it('emits keyframe percentages, step-end hold, fill-mode, and group delays', () => {
    const { graph, page, button } = setup()
    writePlugin(graph, button.id, ANIMATIONS_PLUGIN_KEY, {
      version: 1,
      animations: [
        {
          id: 'pulse',
          name: 'Pulse',
          durationMs: 600,
          easing: 'easeInOut',
          playMode: 'once',
          keyframes: [
            { offsetMs: 150, visual: { opacity: 0.2 } },
            { offsetMs: 600, visual: { opacity: 1 } }
          ]
        },
        {
          id: 'spin',
          name: 'Spin',
          durationMs: 400,
          playMode: 'loop',
          keyframes: [{ offsetMs: 0, visual: { rotation: 180 } }]
        }
      ],
      groups: [
        {
          id: 'combo',
          name: 'Combo',
          mode: 'sequence',
          items: [
            { animationId: 'pulse', delayMs: 50 },
            { animationId: 'spin', delayMs: 0 }
          ]
        }
      ]
    })
    writeInteractions(graph, button.id, [
      { id: 'play', trigger: 'click', action: { type: 'playAnimation', animationId: 'pulse' } },
      {
        id: 'combo-play',
        trigger: 'load',
        action: { type: 'playAnimation', animationId: 'combo', group: true }
      },
      {
        id: 'spin-play',
        trigger: 'afterDelay',
        delayMs: 100,
        action: { type: 'playAnimation', animationId: 'spin' }
      }
    ])

    const analysis = analyzePrototype(graph, page.id)
    const css = analysis.css.join('\n')
    expect(css).toContain('@keyframes op-anim-0 { 0% { animation-timing-function: step-end }')
    expect(css).toContain('25% { opacity: 0.2;')
    expect(css).toContain('100% { opacity: 1;')
    expect(css).toContain('animation-timing-function: ease-in-out')
    expect(css).toContain('animation: op-anim-0 600ms ease-in-out 0ms 1 forwards')
    expect(css).toContain('animation: op-anim-1 400ms linear 0ms infinite forwards')
    // Sequence group: pulse starts after its 50ms delay, spin chains after it.
    expect(css).toContain(
      'op-anim-0 600ms ease-in-out 50ms 1 forwards, op-anim-1 400ms linear 650ms 1 forwards'
    )
    expect(analysis.shim).toHaveLength(3)
    expect(analysis.shim.every((op) => op.kind === 'play')).toBe(true)
    expect(analysis.report.animations).toEqual({
      total: 3,
      exported: 3,
      approximate: 0,
      skipped: 0
    })
    assertReportInvariants(analysis.report)
  })

  it('routes every authored capability to an emitter with honest reporting', () => {
    const { graph, page, home, other, button } = setup()
    writePlugin(graph, button.id, STATE_PLUGIN_KEY, buttonModel())
    writeInteractions(graph, button.id, [
      { id: 'drag', trigger: 'drag', action: { type: 'setState', state: 'Pressed' } },
      {
        id: 'guarded',
        trigger: 'click',
        action: { type: 'setState', state: 'Pressed' },
        guard: { all: [{ variable: 'flag', op: 'eq', value: true }] }
      },
      { id: 'variant', trigger: 'press', action: { type: 'setVariant', variant: 'Size=Big' } },
      {
        id: 'overlay',
        trigger: 'hoverEnter',
        action: { type: 'openOverlay', overlayId: other.id }
      },
      {
        id: 'spring-go',
        trigger: 'load',
        action: { type: 'navigate', destinationId: other.id },
        transition: { kind: 'spring', spring: { mode: 'time', bounce: 0.3 } }
      },
      {
        id: 'leave-vars',
        trigger: 'hoverLeave',
        action: { type: 'setState', state: 'Base', setVars: { score: 3 } }
      }
    ])
    writeInteractions(graph, other.id, [
      {
        id: 'far-nav',
        trigger: 'afterDelay',
        delayMs: 10,
        action: { type: 'navigate', destinationId: button.id }
      },
      {
        id: 'ghost-nav',
        trigger: 'load',
        action: { type: 'navigate', destinationId: 'missing-node' }
      }
    ])
    writeInteractions(graph, home.id, [
      { id: 'first', trigger: 'click', action: { type: 'navigate', destinationId: other.id } },
      { id: 'second', trigger: 'click', action: { type: 'navigate', destinationId: other.id } }
    ])

    const analysis = analyzePrototype(graph, page.id)
    const css = analysis.css.join('\n')
    const shim = prototypeShim(analysis.shim, analysis.screens.find((s) => s.active)?.id ?? null)

    assertReportInvariants(analysis.report)
    // Only genuine data errors skip: setVariant authored on a non-instance,
    // a destination outside the export root, a missing node, a duplicate
    // trigger. Capability reasons (guard/spring/overlay/setVars/drag) never
    // appear as skipped.
    const skipped = analysis.report.issues.filter((issue) => issue.status === 'skipped')
    const reasons = new Set(skipped.map((issue) => issue.reason))
    expect(reasons).toEqual(
      new Set(['missing-target', 'destination-outside-root', 'duplicate-trigger'])
    )
    for (const forbidden of [
      'guard',
      'spring',
      'setVariant',
      'overlay',
      'setVars',
      'unsupported-trigger'
    ] as const) {
      expect(reasons).not.toContain(forbidden)
    }

    // Runtime artifacts for each capability.
    expect(shim).toContain('"trigger":"drag"')
    expect(shim).toContain('"guard"')
    expect(shim).toContain('"kind":"overlay-open"')
    expect(shim).toContain('"kind":"state"')
    expect(shim).toContain('"score"')
    expect(shim).toContain('pointerdown')
    // Spring navigate: fade crossfade timed by the sampled linear() curve.
    const screenRules = analysis.css.filter((rule) => rule.includes('data-op-screen'))
    expect(screenRules.join('\n')).toContain('linear(')
    // Hover leave with setVars routes through the runtime (CSS cannot write vars).
    expect(shim).toContain('"trigger":"leave"')
    // Non-instance setVariant is reported, never silently emitted.
    expect(shim).not.toContain('"kind":"variant"')
    expect(css).not.toContain('linear-gradient')
  })

  it('produces no shim source for CSS-only prototypes', () => {
    expect(prototypeShim([], null)).toBe('')
    const ops: PrototypeShimOp[] = [
      {
        kind: 'state',
        sel: '[data-open-pencil-node-id="a"]',
        state: 'X',
        screen: null,
        trigger: 'click',
        delay: 0
      }
    ]
    const source = prototypeShim(ops, null)
    expect(source).toContain('addEventListener')
    expect(source).toContain("setAttribute('data-op-state'")
  })
})

describe('prototype export — bundle assembly', () => {
  it('injects prototype CSS, the shim, screens, and seeds into standalone HTML', async () => {
    const { graph, page, other, button } = setup()
    writePlugin(graph, button.id, STATE_PLUGIN_KEY, buttonModel())
    writeInteractions(graph, button.id, [
      {
        id: 'go',
        trigger: 'click',
        action: { type: 'navigate', destinationId: other.id },
        transition: { kind: 'fade', durationMs: 300, easing: 'easeOut' }
      },
      { id: 'press', trigger: 'press', action: { type: 'setState', state: 'Pressed' } }
    ])

    const { bundle, report } = await exportPrototypeBundle(graph, { rootId: page.id })
    const entry = bundle.files.find((file) => file.path === bundle.entrypoint)
    expect(entry).toBeTruthy()
    const html = typeof entry?.content === 'string' ? entry.content : ''
    expect(html).toContain('<!doctype html>')
    expect(html).toContain('data-op-prototype')
    expect(html).toContain('data-op-screen=')
    expect(html).toContain('is-active')
    expect(html).toContain('data-op-state="Base"')
    expect(html).toContain('<script data-op-prototype>')
    expect(html).toContain('op-screen')
    // Injected prototype CSS must come after the generated stylesheet.
    const prototypeStyle = html.indexOf('data-op-prototype')
    const stageStyle = html.indexOf('.op-stage{')
    expect(prototypeStyle).toBeGreaterThan(stageStyle)
    assertReportInvariants(report)
    expect(report.interactions.total).toBe(2)
  })
})
