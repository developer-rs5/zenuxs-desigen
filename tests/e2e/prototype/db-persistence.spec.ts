import type { Page } from '@playwright/test'

import { expect, test } from '#tests/e2e/fixtures'
import { expectDefined } from '#tests/helpers/assert'
import { CanvasHelper } from '#tests/helpers/canvas'
import { getSelectedNode } from '#tests/helpers/store'

// §21 database chain, unmocked: frontend action → POST /api/documents →
// backend validation → MongoDB write → response → reload → session restore →
// GET rehydrate → panel re-inspect → Present runs the persisted flow.
let page: Page
let canvas: CanvasHelper

interface SavedPost {
  documentId: string
  status: number
}

const savedPosts: SavedPost[] = []

test.describe.configure({ mode: 'serial' })

test.beforeAll(async ({ browser }) => {
  page = await browser.newPage()

  page.on('response', (response) => {
    if (response.request().method() !== 'POST' || !response.url().includes('/api/documents')) {
      return
    }
    try {
      const body = response.request().postDataJSON() as { documentId?: string } | null
      if (body?.documentId) {
        savedPosts.push({ documentId: body.documentId, status: response.status() })
      }
    } catch {
      // non-JSON body — not a document save
      console.debug('ignoring non-JSON save body')
    }
  })

  // The boot-time /api/auth/session probe 401s without a login and Chrome
  // logs a resource error for it. Attach the error collector only after the
  // probe settles, or a slow backend makes assertNoErrors flake.
  const sessionProbe = page
    .waitForResponse((r) => r.url().includes('/api/auth/session'), { timeout: 5_000 })
    .catch(() => undefined)
  await page.goto('/editor?recent-files')
  await sessionProbe
  // Fresh context → the app auto-provisions a guest session so local work is
  // backed by MongoDB. Wait for its cookie before authoring.
  await page
    .waitForResponse(
      (r) => r.url().includes('/api/auth/guest') && r.request().method() === 'POST',
      { timeout: 10_000 }
    )
    .catch(() => undefined)
  await page.waitForTimeout(250)
  canvas = new CanvasHelper(page)
  await page.getByTestId('recent-files-home').waitFor({ timeout: 30_000 })
})

test.afterAll(async () => {
  await page?.close()
})

interface InteractionRecord {
  trigger: string
  action: { type: string; destinationId: string }
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

test('prototype authoring survives a real backend save → reload → reopen → run', async () => {
  test.setTimeout(120_000)

  // New document tab (gets a storage binding → autosaves to the real backend).
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
    (await pluginValue(frame.id, 'interactions')) as InteractionRecord[] | null,
    'authored interactions'
  )
  expect(authored[0]?.action.destinationId).toBe(frame.id)

  // Backend validation + DB write: real POST /api/documents answers 200.
  await expect
    .poll(() => savedPosts.filter((post) => post.status === 200).length, { timeout: 30_000 })
    .toBeGreaterThan(0)
  const documentId = savedPosts.find((post) => post.status === 200)?.documentId
  if (!documentId) throw new Error('no saved document id')

  // Independent read-back: session-scoped GET serves the stored payload.
  const read = await page.request.get(`/api/documents/${encodeURIComponent(documentId)}`)
  expect(read.status()).toBe(200)
  const body = (await read.json()) as {
    success?: boolean
    document?: { payload?: unknown }
  }
  expect(body.success).toBe(true)
  expect(JSON.stringify(body.document?.payload ?? '').length).toBeGreaterThan(100)

  // Reload: the session tab reopens. Restore reads the local-first cache
  // seeded by the save (the remote bytes are proven by the read-back above).
  await page.reload()
  await canvas.waitForInit()

  const restoredHandle = await page.waitForFunction(
    () => {
      const store = window.openPencil?.getStore?.()
      if (!store) return null
      const graphPage = store.graph.getNode(store.state.currentPageId)
      return graphPage?.childIds.find((id) => store.graph.getNode(id)?.type === 'FRAME') ?? null
    },
    undefined,
    { timeout: 30_000 }
  )
  const restoredFrameId = expectDefined(
    (await restoredHandle.jsonValue()) as string,
    'restored frame'
  )

  // Re-inspect through the panel (select via store; viewport drifts on reload).
  await page.evaluate((id) => {
    const store = window.openPencil?.getStore?.()
    if (!store) throw new Error('OpenPencil store not initialized')
    store.select([id])
  }, restoredFrameId)
  await canvas.waitForRender()

  const restoredSection = page.getByRole('region', { name: 'Prototype', exact: true })
  await expect(restoredSection.locator('[data-property="interaction"]')).toHaveCount(1)
  await expect(restoredSection.getByText('Starts flow')).toBeVisible()

  const reloaded = expectDefined(
    (await pluginValue(restoredFrameId, 'interactions')) as InteractionRecord[] | null,
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

  // Run it again from the persisted flow entry.
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

  // Cleanup through the app's own authenticated path (CSRF + session cookie).
  const deleteResult = await page.evaluate(async (id) => {
    const path = '/src/app/storage/remote-server.ts'
    const mod = await import(path)
    try {
      await mod.deleteRemoteDocument(id)
      return 'deleted'
    } catch (error) {
      return `failed: ${error instanceof Error ? error.message : String(error)}`
    }
  }, documentId)
  expect(deleteResult).toBe('deleted')

  canvas.assertNoErrors()
})
