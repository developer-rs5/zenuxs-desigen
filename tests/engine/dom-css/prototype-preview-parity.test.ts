import { describe, expect, test } from 'bun:test'

import { analyzePrototype, exportPrototypeBundle, prototypeShim } from '@open-pencil/dom-css'
import {
  INTERACTIONS_PLUGIN_KEY,
  PROTOTYPE_PLUGIN_ID,
  STATE_PLUGIN_KEY,
  SceneGraph,
  serializePluginValue,
  type PrototypeInteraction
} from '@open-pencil/scene-graph'

import { LONG_PRESS_THRESHOLD_MS } from '#core/editor/prototype/actions'
import { springProgress } from '#core/prototype/motion'
import { createPrototypeRuntime } from '#core/prototype/runtime'

/**
 * Preview ↔ export parity: for each capability, the exported artifacts must
 * encode exactly what the Zenuxs preview runtime (`createPrototypeRuntime`)
 * executes — same spring curve samples, same long-press threshold, same
 * guard/setVars semantics, same overlay placement math, same drag settle.
 * The browser-side execution of these artifacts is covered by
 * `tests/e2e/export/prototype-capabilities.spec.ts`.
 */

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

const BUTTON_MODEL = {
  version: 1,
  initial: 'Base',
  states: [
    { name: 'Base', visual: {} },
    { name: 'Dim', visual: { opacity: 0.25 } },
    { name: 'Other', visual: { opacity: 0.75 } }
  ]
} as const

function setup(vars?: Record<string, boolean | number | string>) {
  const graph = new SceneGraph()
  const page = graph.getPages()[0]
  const screen = graph.createNode('FRAME', page.id, { name: 'Screen', width: 800, height: 600 })
  const button = graph.createNode('RECTANGLE', screen.id, {
    name: 'Button',
    x: 300,
    y: 260,
    width: 200,
    height: 80
  })
  button.fills = [
    { type: 'SOLID', color: { r: 0.2, g: 0.5, b: 0.95, a: 1 }, opacity: 1, visible: true }
  ]
  const model = vars ? { ...BUTTON_MODEL, vars } : BUTTON_MODEL
  writePlugin(graph, button.id, STATE_PLUGIN_KEY, model)
  return { graph, pageId: page.id, screenId: screen.id, buttonId: button.id }
}

function interact(graph: SceneGraph, nodeId: string, interactions: PrototypeInteraction[]): void {
  writePlugin(graph, nodeId, INTERACTIONS_PLUGIN_KEY, interactions)
}

describe('prototype preview ↔ export parity', () => {
  test('spring samples the exact clamped curve preview lerps along', async () => {
    const spring = { mode: 'physics' as const, stiffness: 220, damping: 18, mass: 1 }
    const { graph, pageId, buttonId } = setup()
    interact(graph, buttonId, [
      {
        id: 'spring-dim',
        trigger: 'click',
        action: { type: 'setState', state: 'Dim' },
        transition: { kind: 'spring', spring, durationMs: 400 }
      }
    ])
    const { bundle } = await exportPrototypeBundle(graph, { rootId: pageId })
    const html = bundle.files.find((f) => f.path === bundle.entrypoint)?.content
    expect(typeof html).toBe('string')
    const match = (html as string).match(/400ms linear\(([^)]+)\)/)
    expect(match).not.toBeNull()
    const samples = (match?.[1] ?? '').split(',').map(Number)
    expect(samples).toHaveLength(65)
    for (let index = 0; index <= 64; index++) {
      const raw = springProgress(spring, index / 64)
      const clamped = Math.min(1, Math.max(0, raw))
      // The export samples the same function preview drives, at the same
      // normalized times, rounded to 4 decimals for CSS.
      expect(samples[index]).toBeCloseTo(clamped, 3)
    }
  })

  test('long-press threshold is pinned to the editor constant', async () => {
    expect(LONG_PRESS_THRESHOLD_MS).toBe(500)
    const { graph, pageId, buttonId } = setup()
    interact(graph, buttonId, [
      { id: 'hold', trigger: 'longPress', action: { type: 'setState', state: 'Dim' } }
    ])
    const { bundle } = await exportPrototypeBundle(graph, { rootId: pageId })
    const html = bundle.files.find((f) => f.path === bundle.entrypoint)?.content as string
    expect(html).toContain(`var lpMs=${LONG_PRESS_THRESHOLD_MS}`)
  })

  test('guards and setVars match preview runtime semantics exactly', () => {
    const { graph, screenId, buttonId } = setup({ flag: false })
    interact(graph, buttonId, [
      {
        id: 'arm',
        trigger: 'click',
        action: { type: 'setState', state: 'Dim', setVars: { flag: true } }
      },
      {
        id: 'guarded',
        trigger: 'press',
        action: { type: 'setState', state: 'Other' },
        guard: { all: [{ variable: 'flag', op: 'eq', value: true }] }
      }
    ])

    // Preview: seeded flag=false blocks the guarded press; the click's
    // setVars writes atomically and unlocks it.
    const runtime = createPrototypeRuntime(graph)
    runtime.start(0, screenId)
    runtime.pointerDown(buttonId, 0)
    let state = runtime.getRenderState()
    expect(state?.nodeVisuals.get(buttonId)?.opacity).toBeUndefined()
    runtime.pointerUp(buttonId, 10)
    runtime.click(buttonId, 10)
    runtime.tick(1000)
    state = runtime.getRenderState()
    expect(state?.nodeVisuals.get(buttonId)?.opacity).toBeCloseTo(0.25, 5)
    runtime.pointerDown(buttonId, 1000)
    runtime.tick(2000)
    state = runtime.getRenderState()
    expect(state?.nodeVisuals.get(buttonId)?.opacity).toBeCloseTo(0.75, 5)

    // Export: the same seed, conditions, and atomic write ride on the ops.
    const analysis = analyzePrototype(graph, graph.rootId)
    const armOp = analysis.shim.find((op) => op.trigger === 'click')
    const guardOp = analysis.shim.find((op) => op.trigger === 'press')
    expect(armOp).toMatchObject({ kind: 'state', state: 'Dim', vars: { flag: true } })
    expect(armOp && 'seedVars' in armOp ? armOp.seedVars : undefined).toEqual({ flag: false })
    expect(guardOp && 'guard' in guardOp ? guardOp.guard : undefined).toEqual([
      { variable: 'flag', op: 'eq', value: true }
    ])
    expect(analysis.report.interactions.skipped).toBe(0)
  })

  test('drag settle and click suppression mirror preview beginDrag/endDrag', async () => {
    const { graph, screenId, buttonId } = setup()
    interact(graph, buttonId, [
      { id: 'drag-dim', trigger: 'drag', action: { type: 'setState', state: 'Dim' } }
    ])

    // Preview: beginDrag runs the interaction at pointerdown, endDrag folds
    // the delta into settled translate, and a moved drag suppresses click.
    const runtime = createPrototypeRuntime(graph)
    runtime.start(0, screenId)
    runtime.beginDrag(buttonId, 0)
    let state = runtime.getRenderState()
    expect(state?.nodeVisuals.get(buttonId)?.opacity).toBeCloseTo(0.25, 5)
    runtime.updateDrag(40, 10, 16)
    state = runtime.getRenderState()
    expect(state?.nodeVisuals.get(buttonId)?.translateX).toBe(40)
    expect(state?.nodeVisuals.get(buttonId)?.translateY).toBe(10)
    runtime.endDrag(32)
    state = runtime.getRenderState()
    expect(state?.nodeVisuals.get(buttonId)?.translateX).toBe(40)

    // Export: the op fires on pointerdown (delegated drag trigger) and the
    // runtime tracks translate through the independent CSS property.
    const analysis = analyzePrototype(graph, graph.rootId)
    const dragOp = analysis.shim.find((op) => op.trigger === 'drag')
    expect(dragOp).toMatchObject({ kind: 'state', state: 'Dim' })
    const { bundle } = await exportPrototypeBundle(graph, { rootId: graph.rootId })
    const html = bundle.files.find((f) => f.path === bundle.entrypoint)?.content as string
    expect(html).toContain('"trigger":"drag"')
    expect(html).toContain("addEventListener('pointerdown'")
    // Click suppression after a moved drag is a runtime behavior: the flag
    // exists in the emitted shim (executed in the e2e suite).
    expect(html).toContain('suppressClick=true')
    void screenId
    void buttonId
  })

  test('overlay placement and backdrop match preview overlayVisual math', async () => {
    const graph = new SceneGraph()
    const page = graph.getPages()[0]
    const screen = graph.createNode('FRAME', page.id, { name: 'Screen', width: 800, height: 600 })
    const button = graph.createNode('RECTANGLE', screen.id, {
      name: 'Button',
      x: 50,
      y: 50,
      width: 120,
      height: 48
    })
    button.fills = [
      { type: 'SOLID', color: { r: 0.2, g: 0.5, b: 0.95, a: 1 }, opacity: 1, visible: true }
    ]
    const overlay = graph.createNode('FRAME', page.id, {
      name: 'Overlay',
      x: 900,
      y: 50,
      width: 200,
      height: 120
    })
    interact(graph, button.id, [
      {
        id: 'open',
        trigger: 'click',
        action: { type: 'openOverlay', overlayId: overlay.id, backdropOpacity: 0.4 },
        transition: { kind: 'fade', durationMs: 300, easing: 'easeOut' }
      }
    ])

    // Preview: overlay fully outside the screen → horizontally centered
    // (overlayVisual), backdrop default/author value, visibility fades with
    // the authored transition.
    const runtime = createPrototypeRuntime(graph)
    runtime.start(0, screen.id)
    runtime.click(button.id, 0)
    // Mid-fade the backdrop carries authored × visibility; fully open it is
    // exactly the authored opacity.
    runtime.tick(1000)
    const state = runtime.getRenderState()
    expect(state?.backdropOpacity).toBe(0.4)
    const expectedCenterX = screen.x + (screen.width - overlay.width) / 2 - overlay.x
    const nodeVisual = state?.nodeVisuals.get(overlay.id)
    expect(nodeVisual?.translateX).toBeCloseTo(expectedCenterX, 5)

    // Export: ox/oy encode the same placement relative to the screen origin.
    const analysis = analyzePrototype(graph, page.id)
    const openOp = analysis.shim.find((op) => op.kind === 'overlay-open')
    expect(openOp && openOp.kind === 'overlay-open' ? openOp.backdrop : undefined).toBe(0.4)
    const relativeCenterX = (screen.width - overlay.width) / 2
    expect(openOp && openOp.kind === 'overlay-open' ? openOp.ox : undefined).toBeCloseTo(
      relativeCenterX,
      5
    )
    expect(openOp && openOp.kind === 'overlay-open' ? openOp.oy : undefined).toBe(50)
    // Off-canvas overlays are excluded from the screen list but force screen
    // structure so the backdrop can size against the active screen.
    expect(analysis.screens.map((s) => s.id)).toEqual([screen.id])
    expect(analysis.overlays.has(overlay.id)).toBe(true)
    expect(analysis.report.interactions.skipped).toBe(0)
  })

  test('setVariant resolves the same sibling component preview mutates', async () => {
    const graph = new SceneGraph()
    const page = graph.getPages()[0]
    const screen = graph.createNode('FRAME', page.id, { name: 'Screen', width: 800, height: 600 })
    const set = graph.createNode('COMPONENT_SET', page.id, {
      name: 'Card',
      componentPropertyDefinitions: [
        {
          id: 'variant:size',
          name: 'Size',
          type: 'VARIANT',
          defaultValue: 'Small',
          variantOptions: ['Small', 'Large']
        }
      ]
    })
    const small = graph.createNode('COMPONENT', set.id, {
      name: 'Size=Small',
      x: 0,
      y: 700,
      width: 120,
      height: 60,
      componentPropertyValues: { Size: 'Small' }
    })
    const large = graph.createNode('COMPONENT', set.id, {
      name: 'Size=Large',
      x: 140,
      y: 700,
      width: 240,
      height: 60,
      componentPropertyValues: { Size: 'Large' }
    })
    const instance = graph.createInstance(small.id, screen.id, { x: 300, y: 270 })
    if (!instance) throw new Error('expected instance')
    interact(graph, instance.id, [
      { id: 'swap', trigger: 'click', action: { type: 'setVariant', variant: 'Size=Large' } }
    ])

    // Preview: onMutate receives the instance and the authored spec; the
    // editor channel resolves it through resolveVariantComponentId.
    let mutated: { nodeId: string; variant: string } | null = null
    const runtime = createPrototypeRuntime(graph, {
      onMutate: (nodeId, variant) => {
        mutated = { nodeId, variant }
        return true
      }
    })
    runtime.start(0, screen.id)
    runtime.click(instance.id, 0)
    expect(mutated).toEqual({ nodeId: instance.id, variant: 'Size=Large' })
    expect(runtime.getWarnings()).toHaveLength(0)

    // Export resolves the spec to the same component at build time.
    const analysis = analyzePrototype(graph, page.id)
    const variantOp = analysis.shim.find((op) => op.kind === 'variant')
    expect(variantOp && variantOp.kind === 'variant' ? variantOp.variant : undefined).toBe(large.id)
    expect(variantOp && variantOp.kind === 'variant' ? variantOp.base : undefined).toBe(small.id)
    expect(analysis.variants.get(instance.id)?.map((entry) => entry.componentId)).toContain(
      large.id
    )
    expect(analysis.report.interactions.skipped).toBe(0)
  })

  test('slide overlays carry slideStart and subtree delay ops carry overlayOf', () => {
    const graph = new SceneGraph()
    const page = graph.getPages()[0]
    const screen = graph.createNode('FRAME', page.id, { name: 'Screen', width: 800, height: 600 })
    const button = graph.createNode('RECTANGLE', screen.id, {
      name: 'Button',
      x: 50,
      y: 50,
      width: 120,
      height: 48
    })
    button.fills = [
      { type: 'SOLID', color: { r: 0.2, g: 0.5, b: 0.95, a: 1 }, opacity: 1, visible: true }
    ]
    const overlay = graph.createNode('FRAME', page.id, {
      name: 'Sheet',
      x: 100,
      y: 120,
      width: 400,
      height: 300
    })
    const inner = graph.createNode('RECTANGLE', overlay.id, {
      name: 'Handle',
      x: 0,
      y: 0,
      width: 40,
      height: 8
    })
    interact(graph, button.id, [
      {
        id: 'open-slide',
        trigger: 'click',
        action: { type: 'openOverlay', overlayId: overlay.id },
        transition: { kind: 'slide', direction: 'up', durationMs: 300, easing: 'easeOut' }
      }
    ])
    // A delay op inside the overlay subtree re-runs on open (preview
    // scheduleTimers on the overlay subtree).
    interact(graph, inner.id, [
      {
        id: 'inner-delay',
        trigger: 'afterDelay',
        delayMs: 120,
        action: { type: 'setState', state: 'Dim' }
      }
    ])
    writePlugin(graph, inner.id, STATE_PLUGIN_KEY, BUTTON_MODEL)

    const analysis = analyzePrototype(graph, page.id)
    const openOp = analysis.shim.find((op) => op.kind === 'overlay-open')
    // Slide start = screen bottom minus overlay top (preview startOffset).
    expect(openOp && openOp.kind === 'overlay-open' ? openOp.slideStart : undefined).toBe(480)
    const delayOp = analysis.shim.find((op) => op.trigger === 'delay')
    expect(delayOp?.overlayOf).toBe(overlay.id)
    // Slide close resets transform via the stack entry; the shim reads
    // top.slide — asserted by the e2e slide close execution.
  })

  test('scroll gates on nonzero deltaY exactly like the preview runtime', () => {
    const { graph, screenId, buttonId } = setup()
    interact(graph, buttonId, [
      { id: 'wheel', trigger: 'scroll', action: { type: 'setState', state: 'Dim' } }
    ])
    const runtime = createPrototypeRuntime(graph)
    runtime.start(0, screenId)
    runtime.scroll(buttonId, 0, 0)
    expect(runtime.getRenderState()?.nodeVisuals.get(buttonId)?.opacity).toBeUndefined()
    runtime.scroll(buttonId, 120, 16)
    runtime.tick(1000)
    expect(runtime.getRenderState()?.nodeVisuals.get(buttonId)?.opacity).toBeCloseTo(0.25, 5)

    // Export: same gate, the scroll op reaches the runtime.
    const analysis = analyzePrototype(graph, graph.rootId)
    expect(analysis.shim.some((op) => op.trigger === 'scroll')).toBe(true)
  })

  test('shim source embeds the deltaY guard verbatim', async () => {
    const { graph, buttonId } = setup()
    interact(graph, buttonId, [
      { id: 'wheel', trigger: 'scroll', action: { type: 'setState', state: 'Dim' } }
    ])
    const analysis = analyzePrototype(graph, graph.rootId)
    const source = prototypeShim(analysis.shim, null)
    expect(source).toContain('if(e.deltaY===0)return;')
  })
})
