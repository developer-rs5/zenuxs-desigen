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
 * Executes generated prototype HTML in a real browser: click-driven state
 * changes must animate mid-flight, pure-CSS hover must work without any
 * script, and withheld (unsupported) features must produce no behavior.
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
}

function setupGraph(interactions: PrototypeInteraction[]) {
  const graph = new SceneGraph()
  const page = graph.getPages()[0]
  const screen = graph.createNode('FRAME', page.id, {
    name: 'Screen',
    width: 400,
    height: 300
  })
  const button = graph.createNode('RECTANGLE', screen.id, {
    name: 'Button',
    x: 50,
    y: 50,
    width: 100,
    height: 40
  })
  button.fills = [{ type: 'SOLID', color: { r: 0.2, g: 0.5, b: 0.95, a: 1 } }]
  writePlugin(graph, button.id, STATE_PLUGIN_KEY, BUTTON_MODEL)
  writePlugin(graph, button.id, INTERACTIONS_PLUGIN_KEY, interactions)
  return { graph, page, button }
}

async function htmlFor(interactions: PrototypeInteraction[]): Promise<{
  html: string
  buttonId: string
  report: Awaited<ReturnType<typeof exportPrototypeBundle>>['report']
}> {
  const { graph, page, button } = setupGraph(interactions)
  const { bundle, report } = await exportPrototypeBundle(graph, { rootId: page.id })
  const entry = bundle.files.find((file) => file.path === bundle.entrypoint)
  if (!entry || typeof entry.content !== 'string') throw new Error('missing HTML entrypoint')
  return { html: entry.content, buttonId: button.id, report }
}

function selectorFor(buttonId: string): string {
  return `[data-open-pencil-node-id="${buttonId}"]`
}

test('click → setState with fade animates opacity strictly between endpoints', async ({ page }) => {
  const { html, buttonId } = await htmlFor([
    {
      id: 'click-dim',
      trigger: 'click',
      action: { type: 'setState', state: 'Dim' },
      transition: { kind: 'fade', durationMs: 400, easing: 'easeOut' }
    }
  ])
  await page.setContent(html)
  // A freshly-loaded document briefly starves its animation clock; give it a
  // moment so the transition actually runs while we sample.
  await page.waitForTimeout(600)

  const samples = await page.evaluate(async (selector) => {
    const element = document.querySelector(selector)
    if (!element) return null
    const before = Number(getComputedStyle(element).opacity)
    ;(element as HTMLElement).click()
    const values: number[] = []
    const timer = setInterval(() => {
      values.push(Number(getComputedStyle(element).opacity))
    }, 16)
    await new Promise<void>((resolve) => {
      setTimeout(resolve, 250)
    })
    clearInterval(timer)
    return { before, values }
  }, selectorFor(buttonId))

  expect(samples).not.toBeNull()
  if (!samples) return
  expect(samples.before).toBe(1)
  expect(samples.values.length).toBeGreaterThan(3)

  // Mid-flight values sit strictly between the endpoints and move toward 0.25.
  const between = samples.values.filter((value) => value > 0.25 && value < 1)
  expect(between.length).toBeGreaterThan(0)
  expect(samples.values.at(-1)).toBeLessThan(samples.values[0])
  expect(samples.values.at(-1)).toBeGreaterThan(0.25)
  for (let index = 1; index < samples.values.length; index++) {
    expect(samples.values[index]).toBeLessThanOrEqual(samples.values[index - 1] + 1e-6)
  }
})

test('hover → setState works from pure CSS with no script in the bundle', async ({ page }) => {
  const { html, buttonId, report } = await htmlFor([
    { id: 'hover-dim', trigger: 'hoverEnter', action: { type: 'setState', state: 'Dim' } }
  ])
  expect(html).not.toContain('<script')
  // No hoverLeave pair: the revert target diverges from preview's sticky
  // state, so the interaction is disclosed as approximate rather than exact.
  expect(report.interactions.approximate).toBe(1)
  expect(report.interactions.exported).toBe(0)

  await page.setContent(html)
  const selector = selectorFor(buttonId)
  await expect(page.locator(selector)).toHaveCSS('opacity', '1')
  await page.hover(selector)
  await expect(page.locator(selector)).toHaveCSS('opacity', '0.25')
  await page.hover('body')
  await expect(page.locator(selector)).toHaveCSS('opacity', '1')
})

test('drag, guards, and spring run in the exported runtime', async ({ page }) => {
  const { html, buttonId, report } = await htmlFor([
    { id: 'drag-dim', trigger: 'drag', action: { type: 'setState', state: 'Dim' } },
    {
      id: 'guarded',
      trigger: 'click',
      action: { type: 'setState', state: 'Other' },
      guard: { all: [{ variable: 'flag', op: 'eq', value: true }] }
    },
    {
      id: 'springy',
      trigger: 'load',
      action: { type: 'setState', state: 'Dim' },
      transition: { kind: 'spring', spring: { mode: 'physics' } }
    }
  ])

  const reasons = new Set(
    report.issues.filter((issue) => issue.status === 'skipped').map((issue) => issue.reason)
  )
  // Nothing capability-related skips anymore.
  expect(reasons.has('unsupported-trigger')).toBe(false)
  expect(reasons.has('guard')).toBe(false)
  expect(reasons.has('spring')).toBe(false)
  expect(html).toContain('pointerdown')
  expect(html).toContain('guardOk')
  // Spring samples into linear(); never a plain eased curve.
  expect(html).toContain('linear(')
  expect(html).not.toContain('cubic-bezier')

  await page.setContent(html)
  const selector = selectorFor(buttonId)
  await page.waitForTimeout(600)
  // Spring load setState landed (mid-flight or settled) below the base value.
  const afterLoad = Number(
    await page.locator(selector).evaluate((el) => getComputedStyle(el).opacity)
  )
  expect(afterLoad).toBeLessThan(1)
  // The guarded click never fires: `flag` is missing → fail closed.
  await page.locator(selector).click()
  const state = await page.locator(selector).getAttribute('data-op-state')
  expect(state).toBe('Dim')
})
