import type { Page } from '@playwright/test'

import { expect, test } from '#tests/e2e/fixtures'
import { expectDefined } from '#tests/helpers/assert'
import { CanvasHelper } from '#tests/helpers/canvas'
import { getSelectedNode } from '#tests/helpers/store'

// The editor home (recent files) has no canvas yet, so bring the page up
// manually and wait for the canvas only after opening the document tab.
let page: Page
let canvas: CanvasHelper

test.describe.configure({ mode: 'serial' })

test.beforeAll(async ({ browser }) => {
  page = await browser.newPage()
  // The boot-time /api/auth/session probe 401s without a login and Chrome
  // logs a resource error for it. Attach the error collector only after the
  // probe settles, or a slow backend makes assertNoErrors flake.
  const sessionProbe = page
    .waitForResponse((r) => r.url().includes('/api/auth/session'), { timeout: 5_000 })
    .catch(() => undefined)
  await page.goto('/editor?recent-files')
  await sessionProbe
  await page.waitForTimeout(250)
  canvas = new CanvasHelper(page)
  await page.getByTestId('recent-files-home').waitFor({ timeout: 30_000 })
})

test.afterAll(async () => {
  await page?.close()
})

export interface SavedPayload {
  figBase64: string
  size: number
  updatedAt: string
}

async function pluginValue(nodeId: string, key: string) {
  return page.evaluate(
    ({ nodeId, key }) => {
      const store = window.openPencil?.getStore?.()
      if (!store) throw new Error('OpenPencil store not initialized')
      const node = store.graph.getNode(nodeId)
      const entry = node?.pluginData.find((e) => e.pluginId === 'open-pencil' && e.key === key)
      return entry ? (JSON.parse(entry.value) as unknown) : null
    },
    { nodeId, key }
  )
}

test('prototype authoring survives cloud save → refresh → reopen', async () => {
  test.setTimeout(90_000)

  // In-memory MongoDB stand-in: POST saves fig bytes, GET serves them back.
  const saved = new Map<string, SavedPayload>()
  await page.route('**/api/documents**', async (route) => {
    const request = route.request()
    const url = new URL(request.url())
    if (request.method() === 'POST') {
      const body = request.postDataJSON() as {
        documentId: string
        payload: SavedPayload
      }
      saved.set(body.documentId, body.payload)
      await route.fulfill({ status: 200, contentType: 'application/json', body: '{"ok":true}' })
      return
    }
    if (request.method() === 'GET' && url.pathname !== '/api/documents') {
      const id = decodeURIComponent(url.pathname.split('/').pop() ?? '')
      const payload = saved.get(id)
      if (!payload) {
        await route.fulfill({
          status: 404,
          contentType: 'application/json',
          body: JSON.stringify({ error: 'not found' })
        })
        return
      }
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ document: { documentId: id, title: 'Prototype Cloud', payload } })
      })
      return
    }
    if (request.method() === 'GET') {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ documents: [] })
      })
      return
    }
    await route.fallback()
  })

  // New document tab (gets a storage binding → autosaves to the mocked API).
  await page.getByTestId('home-new-document').click()
  await canvas.waitForInit()
  await canvas.waitForRender()

  await canvas.selectTool('frame')
  await canvas.drag(40, 40, 340, 240)
  await canvas.waitForRender()
  const frame = expectDefined(await getSelectedNode(page), 'frame')
  expect(frame.type).toBe('FRAME')

  const section = page.getByRole('region', { name: 'Prototype', exact: true })
  await section.getByRole('button', { name: 'Set as flow start' }).click()
  await canvas.waitForRender()
  await section.locator('[data-property="add-interaction"]').click()
  await canvas.waitForRender()
  await expect(section.locator('[data-property="interaction"]')).toHaveCount(1)

  const authored = expectDefined(
    (await pluginValue(frame.id, 'interactions')) as Array<{
      action: { destinationId: string }
    }> | null,
    'authored interactions'
  )
  expect(authored[0]?.action.destinationId).toBe(frame.id)

  // Autosave debounces 3s after the last scene change; wait for the POST.
  await expect.poll(() => saved.size, { timeout: 20_000 }).toBeGreaterThan(0)

  // Refresh: the session tab reopens and rehydrates from the saved fig bytes.
  await page.reload()
  await canvas.waitForInit()

  const restoredHandle = await page.waitForFunction(
    () => {
      const store = window.openPencil?.getStore?.()
      if (!store) return null
      const page = store.graph.getNode(store.state.currentPageId)
      return page?.childIds.find((id) => store.graph.getNode(id)?.type === 'FRAME') ?? null
    },
    undefined,
    { timeout: 30_000 }
  )
  const restoredFrameId = expectDefined(
    (await restoredHandle.jsonValue()) as string,
    'restored frame'
  )

  // Re-inspect through the panel.
  const target = await page.evaluate((id) => {
    const store = window.openPencil?.getStore?.()
    if (!store) throw new Error('OpenPencil store not initialized')
    const n = store.graph.getNode(id)
    if (!n) throw new Error(`missing node ${id}`)
    const abs = store.graph.getAbsolutePosition(id)
    return {
      x: (abs.x + n.width / 2) * store.state.zoom + store.state.panX,
      y: (abs.y + n.height / 2) * store.state.zoom + store.state.panY
    }
  }, restoredFrameId)
  const elementBox = await page.getByTestId('canvas-element').boundingBox()
  if (!elementBox) throw new Error('canvas element has no bounding box')
  await page.mouse.click(elementBox.x + target.x, elementBox.y + target.y)
  await page.waitForFunction((id) => {
    const store = window.openPencil?.getStore?.()
    return store?.state.selectedIds.has(id) === true
  }, restoredFrameId)

  const restoredSection = page.getByRole('region', { name: 'Prototype', exact: true })
  await expect(restoredSection.locator('[data-property="interaction"]')).toHaveCount(1)
  await expect(restoredSection.getByText('Starts flow')).toBeVisible()

  const reloaded = expectDefined(
    (await pluginValue(restoredFrameId, 'interactions')) as Array<{
      trigger: string
      action: { type: string; destinationId: string }
    }> | null,
    'reloaded interactions'
  )
  expect(reloaded).toHaveLength(1)
  expect(reloaded[0]?.trigger).toBe('click')
  // The fig round-trip mints node ids; the destination must resolve to the
  // restored frame, not a stale pre-save id.
  expect(reloaded[0]?.action.destinationId).toBe(restoredFrameId)

  const flow = (await page.evaluate(() => {
    const store = window.openPencil?.getStore?.()
    if (!store) throw new Error('OpenPencil store not initialized')
    const root = store.graph.getNode(store.graph.rootId)
    const entry = root?.pluginData.find(
      (e) => e.pluginId === 'open-pencil' && e.key === 'prototype'
    )
    return entry ? (JSON.parse(entry.value) as { flows?: Array<{ startNodeId: string }> }) : null
  })) as { flows?: Array<{ startNodeId: string }> } | null
  expect(flow?.flows?.[0]?.startNodeId).toBe(restoredFrameId)

  // Behavior still runs from the persisted flow entry.
  await page.getByTestId('prototype-present-button').click()
  await page.waitForFunction(
    (id) => {
      const store = window.openPencil?.getStore?.()
      const preview = store?.state.prototypePreview
      return preview != null && preview.drawIds.includes(id)
    },
    restoredFrameId,
    { timeout: 10_000 }
  )
  await page.getByTestId('prototype-present-button').click()
  await page.waitForFunction(() => {
    const store = window.openPencil?.getStore?.()
    return store?.state.prototypePreview == null
  })

  canvas.assertNoErrors()
})
