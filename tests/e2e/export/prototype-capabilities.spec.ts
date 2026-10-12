import { exportPrototypeBundle } from '@open-pencil/dom-css'
import {
  INTERACTIONS_PLUGIN_KEY,
  PROTOTYPE_PLUGIN_ID,
  STATE_PLUGIN_KEY,
  SceneGraph,
  serializePluginValue,
  type PrototypeInteraction
} from '@open-pencil/scene-graph'

import { expect, test } from '../fixtures'

/**
 * Every prototype capability executed end-to-end in a real browser: the
 * authored graph is exported, the generated HTML runs, a real mouse performs
 * the interaction, and the visible result is asserted against the same
 * fixture values the preview-parity engine test pins
 * (`tests/engine/dom-css/prototype-preview-parity.test.ts`).
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

/** Shared three-state model; `vars` seeds prototype variables when armed. */
function buttonModel(vars?: Record<string, boolean>) {
  return {
    version: 1,
    initial: 'Base',
    states: [
      { name: 'Base', visual: {} },
      { name: 'Dim', visual: { opacity: 0.25 } },
      { name: 'Other', visual: { opacity: 0.75 } }
    ],
    ...(vars ? { vars } : {})
  }
}

interface Fixture {
  graph: SceneGraph
  pageId: string
  screenId: string
  buttonId: string
}

function setup(withVars = false): Fixture {
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
  button.fills = [{ type: 'SOLID', color: { r: 0.2, g: 0.5, b: 0.95, a: 1 } }]
  writePlugin(
    graph,
    button.id,
    STATE_PLUGIN_KEY,
    buttonModel(withVars ? { flag: false } : undefined)
  )
  return { graph, pageId: page.id, screenId: screen.id, buttonId: button.id }
}

function interact(graph: SceneGraph, nodeId: string, interactions: PrototypeInteraction[]): void {
  writePlugin(graph, nodeId, INTERACTIONS_PLUGIN_KEY, interactions)
}

async function htmlFor(graph: SceneGraph, rootId: string): Promise<string> {
  const { bundle } = await exportPrototypeBundle(graph, { rootId })
  const entry = bundle.files.find((file) => file.path === bundle.entrypoint)
  if (!entry || typeof entry.content !== 'string') throw new Error('missing HTML entrypoint')
  return entry.content
}

function selectorFor(nodeId: string): string {
  return `[data-open-pencil-node-id="${nodeId}"]`
}

// --- spring ------------------------------------------------------------------

test('spring transition runs on the sampled linear() curve and lands exactly', async ({ page }) => {
  const { graph, pageId, buttonId } = setup()
  interact(graph, buttonId, [
    {
      id: 'spring-dim',
      trigger: 'click',
      action: { type: 'setState', state: 'Dim' },
      transition: { kind: 'spring', spring: { mode: 'time', bounce: 0.35 }, durationMs: 400 }
    }
  ])
  const html = await htmlFor(graph, pageId)
  expect(html).toContain('linear(')
  expect(html).not.toContain('cubic-bezier')

  await page.setContent(html)
  await page.waitForTimeout(600)
  const selector = selectorFor(buttonId)
  const timing = await page
    .locator(selector)
    .evaluate((el) => getComputedStyle(el).transitionTimingFunction)
  expect(timing).toContain('linear(')

  const samples = await page.evaluate(async (sel) => {
    const element = document.querySelector(sel)
    if (!element) return null
    ;(element as HTMLElement).click()
    const values: number[] = []
    const timer = setInterval(() => {
      values.push(Number(getComputedStyle(element).opacity))
    }, 16)
    await new Promise<void>((resolve) => {
      setTimeout(resolve, 550)
    })
    clearInterval(timer)
    return values
  }, selector)
  expect(samples).not.toBeNull()
  if (!samples) return
  expect(samples.length).toBeGreaterThan(8)
  // Mid-flight strictly between the endpoints; the final value settles on
  // the authored target — the same clamped curve preview lerps along.
  const between = samples.filter((value) => value > 0.25 && value < 1)
  expect(between.length).toBeGreaterThan(0)
  expect(samples.at(-1)).toBeCloseTo(0.25, 1)
})

// --- drag --------------------------------------------------------------------

test('drag fires at pointerdown, tracks the pointer, settles, and eats the click', async ({
  page
}) => {
  const { graph, pageId, buttonId } = setup()
  interact(graph, buttonId, [
    { id: 'drag-dim', trigger: 'drag', action: { type: 'setState', state: 'Dim' } },
    { id: 'click-other', trigger: 'click', action: { type: 'setState', state: 'Other' } }
  ])
  const html = await htmlFor(graph, pageId)
  const selector = selectorFor(buttonId)
  await page.setContent(html)
  await page.waitForTimeout(400)

  const box = await page.locator(selector).boundingBox()
  expect(box).not.toBeNull()
  if (!box) return
  const cx = box.x + box.width / 2
  const cy = box.y + box.height / 2

  // Preview runs the drag interaction at pointer DOWN: state flips immediately.
  await page.mouse.move(cx, cy)
  await page.mouse.down()
  await expect(page.locator(selector)).toHaveAttribute('data-op-state', 'Dim')

  // Live tracking: the node follows the pointer via the independent
  // `translate` property (composes with the state `transform`).
  await page.mouse.move(cx + 40, cy + 10, { steps: 5 })
  await expect
    .poll(() => page.locator(selector).evaluate((el) => (el as HTMLElement).style.translate))
    .toBe('40px 10px')

  // Settle keeps the offset, and a drag that moved consumes the following
  // click — the click → Other interaction must NOT run.
  await page.mouse.up()
  await page.waitForTimeout(100)
  await expect(page.locator(selector)).toHaveCSS('translate', '40px 10px')
  await expect(page.locator(selector)).toHaveAttribute('data-op-state', 'Dim')

  // A fresh click without movement runs both interactions in order
  // (press-time drag action, then click) and lands on Other.
  await page.mouse.move(cx, cy)
  await page.mouse.down()
  await page.mouse.up()
  await expect(page.locator(selector)).toHaveAttribute('data-op-state', 'Other')
})

// --- scroll ------------------------------------------------------------------

test('scroll dispatches on nonzero wheel delta and ignores zero delta', async ({ page }) => {
  const { graph, pageId, buttonId } = setup()
  interact(graph, buttonId, [
    { id: 'wheel-dim', trigger: 'scroll', action: { type: 'setState', state: 'Dim' } }
  ])
  const html = await htmlFor(graph, pageId)
  const selector = selectorFor(buttonId)
  await page.setContent(html)
  await page.waitForTimeout(400)

  // deltaY === 0 must not dispatch (preview gates on deltaY too).
  await page.locator(selector).evaluate((el) => {
    el.dispatchEvent(new WheelEvent('wheel', { deltaY: 0, bubbles: true }))
  })
  await page.waitForTimeout(100)
  await expect(page.locator(selector)).toHaveAttribute('data-op-state', 'Base')

  await page.mouse.move(400, 300)
  await page.mouse.wheel(0, 120)
  await expect(page.locator(selector)).toHaveAttribute('data-op-state', 'Dim')
})

// --- long press -------------------------------------------------------------

test('long press fires after the 500ms preview threshold, a tap never fires it', async ({
  page
}) => {
  const { graph, pageId, buttonId } = setup()
  interact(graph, buttonId, [
    { id: 'hold-dim', trigger: 'longPress', action: { type: 'setState', state: 'Dim' } }
  ])
  const html = await htmlFor(graph, pageId)
  expect(html).toContain('var lpMs=500')
  const selector = selectorFor(buttonId)
  await page.setContent(html)
  await page.waitForTimeout(400)

  // Quick tap: released well before the threshold → no fire.
  await page.mouse.move(400, 300)
  await page.mouse.down()
  await page.waitForTimeout(80)
  await page.mouse.up()
  await page.waitForTimeout(150)
  await expect(page.locator(selector)).toHaveAttribute('data-op-state', 'Base')

  // Hold past 500ms: fires while the pointer is still down.
  await page.mouse.down()
  await expect(page.locator(selector)).toHaveAttribute('data-op-state', 'Dim', {
    timeout: 2000
  })
  await page.mouse.up()
})

// --- guards + setVars -------------------------------------------------------

test('guards evaluate seeded vars at fire time and setVars unlocks the guarded action', async ({
  page
}) => {
  const { graph, pageId, buttonId } = setup(true)
  interact(graph, buttonId, [
    {
      id: 'click-arm',
      trigger: 'click',
      action: { type: 'setState', state: 'Dim', setVars: { flag: true } }
    },
    {
      id: 'press-guarded',
      trigger: 'press',
      action: { type: 'setState', state: 'Other' },
      guard: { all: [{ variable: 'flag', op: 'eq', value: true }] }
    }
  ])
  const html = await htmlFor(graph, pageId)
  expect(html).toContain('"seedVars"')
  expect(html).toContain('"flag"')
  const selector = selectorFor(buttonId)
  await page.setContent(html)
  await page.waitForTimeout(400)

  // Seed flag=false → the guarded press fails closed while held.
  await page.mouse.move(400, 300)
  await page.mouse.down()
  await expect(page.locator(selector)).toHaveAttribute('data-op-state', 'Base')
  // Releasing synthesizes a click: the arming interaction writes flag=true
  // atomically with the Dim state.
  await page.mouse.up()
  await expect(page.locator(selector)).toHaveAttribute('data-op-state', 'Dim')

  // Now the guard holds: press → Other.
  await page.mouse.down()
  await expect(page.locator(selector)).toHaveAttribute('data-op-state', 'Other')
  await page.mouse.up()
})

// --- setVariant -------------------------------------------------------------

test('setVariant swaps instance children and root styling to the sibling variant', async ({
  page
}) => {
  const graph = new SceneGraph()
  const pageNode = graph.getPages()[0]
  const screen = graph.createNode('FRAME', pageNode.id, {
    name: 'Screen',
    width: 800,
    height: 600
  })
  const set = graph.createNode('COMPONENT_SET', pageNode.id, {
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
  const smallChild = graph.createNode('RECTANGLE', small.id, {
    name: 'SmallFill',
    x: 0,
    y: 0,
    width: 120,
    height: 60
  })
  smallChild.fills = [
    { type: 'SOLID', color: { r: 0.1, g: 0.2, b: 0.9, a: 1 }, opacity: 1, visible: true }
  ]
  const largeChild = graph.createNode('RECTANGLE', large.id, {
    name: 'LargeFill',
    x: 0,
    y: 0,
    width: 240,
    height: 60
  })
  largeChild.fills = [
    { type: 'SOLID', color: { r: 0.1, g: 0.8, b: 0.2, a: 1 }, opacity: 1, visible: true }
  ]
  const instance =
    graph.createInstance(small.id, screen.id, { x: 300, y: 270 }) ??
    (() => {
      throw new Error('expected instance')
    })()
  interact(graph, instance.id, [
    { id: 'swap', trigger: 'click', action: { type: 'setVariant', variant: 'Size=Large' } }
  ])

  const html = await htmlFor(graph, pageNode.id)
  // Template for the target variant ships inert inside the instance.
  expect(html).toContain(`template data-op-variant-for="${large.id}"`)
  // Root style rule for the variant exists in the prototype stylesheet.
  expect(html).toContain(`[data-op-variant="${large.id}"]`)

  const instanceSel = selectorFor(instance.id)
  await page.setContent(html)
  await page.waitForTimeout(400)
  // Before the swap: Small dimensions, template content not rendered.
  await expect(page.locator(instanceSel)).toHaveCSS('width', '120px')
  expect(
    await page
      .locator(instanceSel)
      .evaluate(
        (el, id) => Boolean(el.querySelector(`[data-open-pencil-node-id="${id}"]`)),
        largeChild.id
      )
  ).toBe(false)

  await page.locator(instanceSel).click()
  // Swap: variant attribute set, root style follows the Large component,
  // children replaced with the Large subtree (green fill, 240px).
  await expect(page.locator(instanceSel)).toHaveAttribute('data-op-variant', large.id)
  await expect(page.locator(instanceSel)).toHaveCSS('width', '240px')
  const swapped = await page.locator(instanceSel).evaluate((el, id) => {
    const child = el.querySelector(`[data-open-pencil-node-id="${id}"]`)
    return child ? getComputedStyle(child).backgroundColor : null
  }, largeChild.id)
  expect(swapped).toBe('rgb(26, 204, 51)')
})

// --- overlays ----------------------------------------------------------------

test('openOverlay shows the frame above a dim backdrop; closeOverlay pops it', async ({ page }) => {
  const graph = new SceneGraph()
  const pageNode = graph.getPages()[0]
  const screen = graph.createNode('FRAME', pageNode.id, {
    name: 'Screen',
    width: 800,
    height: 600
  })
  const button = graph.createNode('RECTANGLE', screen.id, {
    name: 'Button',
    x: 50,
    y: 50,
    width: 120,
    height: 48
  })
  button.fills = [{ type: 'SOLID', color: { r: 0.2, g: 0.5, b: 0.95, a: 1 } }]
  // Authored fully off-canvas to the right → preview centers it horizontally.
  const overlay = graph.createNode('FRAME', pageNode.id, {
    name: 'Overlay',
    x: 900,
    y: 50,
    width: 200,
    height: 120
  })
  overlay.fills = [{ type: 'SOLID', color: { r: 1, g: 1, b: 1, a: 1 } }]
  interact(graph, button.id, [
    {
      id: 'open',
      trigger: 'click',
      action: { type: 'openOverlay', overlayId: overlay.id, backdropOpacity: 0.4 },
      transition: { kind: 'fade', durationMs: 300, easing: 'easeOut' }
    }
  ])
  interact(graph, overlay.id, [{ id: 'close', trigger: 'click', action: { type: 'closeOverlay' } }])

  const html = await htmlFor(graph, pageNode.id)
  expect(html).toContain('.op-backdrop')
  expect(html).toContain(`data-op-overlay="${overlay.id}"`)
  const overlaySel = selectorFor(overlay.id)
  await page.setContent(html)
  await page.waitForTimeout(400)

  // Hidden until opened.
  await expect(page.locator(overlaySel)).toHaveCSS('visibility', 'hidden')

  await page.mouse.click(110, 74)
  // Open: visible, centered over the screen (preview off-canvas rule),
  // faded in by the authored transition.
  await expect(page.locator(overlaySel)).toHaveClass(/is-open/)
  await expect(page.locator(overlaySel)).toHaveCSS('visibility', 'visible')
  await expect(page.locator(overlaySel)).toHaveCSS('left', '300px')
  await expect(page.locator(overlaySel)).toHaveCSS('opacity', '1')
  const backdrop = page.locator('.op-backdrop')
  await expect(backdrop).toHaveCSS('opacity', '0.4')
  await expect(backdrop).toHaveCSS('width', '800px')

  // Close pops the topmost overlay and drops the backdrop.
  await page.locator(overlaySel).click()
  await expect(page.locator(overlaySel)).not.toHaveClass(/is-open/)
  await expect(backdrop).toHaveCSS('opacity', '0')
})

test('slide overlay enters from below and slides back out on close', async ({ page }) => {
  const graph = new SceneGraph()
  const pageNode = graph.getPages()[0]
  const screen = graph.createNode('FRAME', pageNode.id, {
    name: 'Screen',
    width: 800,
    height: 600
  })
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
  const sheet = graph.createNode('FRAME', pageNode.id, {
    name: 'Sheet',
    x: 100,
    y: 120,
    width: 400,
    height: 300
  })
  sheet.fills = [{ type: 'SOLID', color: { r: 1, g: 1, b: 1, a: 1 }, opacity: 1, visible: true }]
  interact(graph, button.id, [
    {
      id: 'open',
      trigger: 'click',
      action: { type: 'openOverlay', overlayId: sheet.id },
      transition: { kind: 'slide', direction: 'up', durationMs: 300, easing: 'easeOut' }
    }
  ])
  interact(graph, sheet.id, [{ id: 'close', trigger: 'click', action: { type: 'closeOverlay' } }])

  const html = await htmlFor(graph, pageNode.id)
  const sheetSel = selectorFor(sheet.id)
  await page.setContent(html)
  await page.waitForTimeout(400)

  await page.mouse.click(110, 74)
  // Open: starts below (slideStart = 600 - 120 = 480) then rests at 0.
  await expect(page.locator(sheetSel)).toHaveCSS('transform', 'matrix(1, 0, 0, 1, 0, 0)')
  await expect(page.locator(sheetSel)).toHaveClass(/is-open/)

  // Close with the reused open timing: the overlay slides back down while
  // fading (stack entry carries the slide offset).
  await page.locator(sheetSel).click()
  await expect(page.locator(sheetSel)).not.toHaveClass(/is-open/)
  const midClose = await page.locator(sheetSel).evaluate((el) => getComputedStyle(el).transform)
  expect(midClose).not.toBe('none')
  await page.waitForTimeout(450)
  await expect(page.locator(sheetSel)).toHaveCSS('visibility', 'hidden')
})
