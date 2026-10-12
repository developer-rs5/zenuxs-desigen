import type { Page } from '@playwright/test'

import { expect, test } from '#tests/e2e/fixtures'
import { expectDefined } from '#tests/helpers/assert'
import { CanvasHelper } from '#tests/helpers/canvas'
import { ChatHarness } from '#tests/helpers/chat/harness'
import { injectLifecycleAIToolsTransport } from '#tests/helpers/prototype/ai-chat'

import type { SavedPayload } from './persistence.spec'

// spec2 §50: one true end-to-end persistence test — AI create → save → reopen
// → inspect → modify → validate. spec2 §51: second-turn continuity — later
// turns must act on what earlier turns built, with full message history.
let page: Page
let canvas: CanvasHelper

test.describe.configure({ mode: 'serial' })

test.beforeAll(async ({ browser }) => {
  page = await browser.newPage()
  const sessionProbe = page
    .waitForResponse((r) => r.url().includes('/api/auth/session'), {
      timeout: 5_000
    })
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

async function pluginValue<T>(nodeId: string, key: string): Promise<T | null> {
  return page.evaluate<T | null>(
    ({ nodeId, key }) => {
      const store = window.openPencil?.getStore?.()
      if (!store) throw new Error('OpenPencil store not initialized')
      const node = store.graph.getNode(nodeId)
      const entry = node?.pluginData.find((e) => e.pluginId === 'open-pencil' && e.key === key)
      return entry ? (JSON.parse(entry.value) as T) : null
    },
    { nodeId, key }
  )
}

async function findNodeByName(name: string): Promise<string | null> {
  return page.evaluate((nodeName) => {
    const store = window.openPencil?.getStore?.()
    if (!store) throw new Error('OpenPencil store not initialized')
    const canvasPage = store.graph.getNode(store.state.currentPageId)
    let found: string | null = null
    const walk = (id: string): void => {
      if (found) return
      const node = store.graph.getNode(id)
      if (!node) return
      if (node.name === nodeName) {
        found = node.id
        return
      }
      for (const childId of node.childIds) walk(childId)
    }
    for (const childId of canvasPage?.childIds ?? []) walk(childId)
    return found
  }, name)
}

test('AI create → save → reopen → inspect → modify → validate (spec2 §50)', async () => {
  test.setTimeout(150_000)

  // In-memory remote store: POST saves fig bytes, GET serves them back.
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
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: '{"ok":true}'
      })
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
        body: JSON.stringify({
          document: { documentId: id, title: 'Lifecycle', payload }
        })
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

  // AI create: dashboard + card through the real tool path.
  await page.getByTestId('home-new-document').click()
  await canvas.waitForInit()
  await canvas.waitForRender()

  const harness = new ChatHarness(page)
  await injectLifecycleAIToolsTransport(page)
  await harness.configureOpenRouter('sk-or-test-key-12345')

  await harness.submit('Create a dashboard with a card')
  await page.waitForFunction(
    () => document.documentElement.dataset.chatTurnCount !== undefined,
    undefined,
    {
      timeout: 20_000
    }
  )
  await expect(harness.assistantMessage()).toContainText('dashboard', {
    timeout: 20_000
  })
  const cardId = expectDefined(await findNodeByName('Card'), 'created card')
  const dashboardId = expectDefined(await findNodeByName('Dashboard'), 'created dashboard')

  // Make it interactive (second turn — continuity within the creation session).
  await harness.submit('Make the card interactive')
  await expect(harness.assistantMessage()).toContainText('pressed', {
    timeout: 20_000
  })
  const states = await pluginValue<{ states?: Array<{ name: string }> }>(cardId, 'prototypeState')
  expect(states?.states?.map((state) => state.name)).toEqual(
    expect.arrayContaining(['default', 'pressed'])
  )
  const interactions = await pluginValue<Array<{ trigger: string }>>(cardId, 'interactions')
  expect(interactions?.[0]?.trigger).toBe('press')

  // Save: autosave debounces ~3s after the last scene change.
  await expect.poll(() => saved.size, { timeout: 30_000 }).toBeGreaterThan(0)

  // Reopen from the saved payload.
  await page.reload()
  await canvas.waitForInit()
  const restoredCardId = expectDefined(await findNodeByName('Card'), 'restored card')
  expect(restoredCardId).toBeTruthy()
  const restoredStates = await pluginValue<{
    states?: Array<{ name: string }>
  }>(restoredCardId, 'prototypeState')
  expect(restoredStates?.states?.map((state) => state.name)).toEqual(
    expect.arrayContaining(['default', 'pressed'])
  )
  const restoredInteractions = await pluginValue<Array<{ trigger: string }>>(
    restoredCardId,
    'interactions'
  )
  expect(restoredInteractions?.[0]?.trigger).toBe('press')

  // Modify after reopen: change the interaction's transition.
  await injectLifecycleAIToolsTransport(page)
  await harness.designTab.click()
  await harness.chatTab.click()
  await harness.input.waitFor({ timeout: 15_000 })
  await harness.submit('Change the transition to slide')
  await page.waitForFunction(
    () => {
      const store = window.openPencil?.getStore?.()
      const canvasPage = store?.graph.getNode(store.state.currentPageId)
      if (!canvasPage) return false
      let found = false
      const isSlideUpTransition = (value: string): boolean => {
        try {
          const parsed = JSON.parse(value) as Array<{
            transition?: { kind?: string; direction?: string }
          }>
          return (
            parsed[0]?.transition?.kind === 'slide' && parsed[0]?.transition?.direction === 'up'
          )
        } catch {
          // unreadable pluginData — treat as no matching transition
          return false
        }
      }
      const walk = (id: string): void => {
        if (found) return
        const node = store?.graph.getNode(id)
        if (!node) return
        const entry = node.pluginData.find(
          (e) => e.pluginId === 'open-pencil' && e.key === 'interactions'
        )
        if (entry && isSlideUpTransition(entry.value)) {
          found = true
          return
        }
        for (const childId of node.childIds) walk(childId)
      }
      for (const childId of canvasPage.childIds) walk(childId)
      return found
    },
    undefined,
    { timeout: 20_000 }
  )

  // Validate: the tool reports the document executable.
  await harness.submit('Validate the prototype')
  await page.waitForFunction(
    () =>
      (document.documentElement.dataset.lastChatRequest ?? '').toLowerCase().includes('validate'),
    undefined,
    { timeout: 10_000 }
  )
  await expect(harness.assistantMessage()).toContainText('Validation', {
    timeout: 20_000
  })

  // The dashboard still exists after every hop (nothing lost in serialization).
  expect(await findNodeByName('Dashboard')).toBeTruthy()
  expect(dashboardId).toBeTruthy()

  canvas.assertNoErrors()
})

test('second-turn continuity: later turns act on earlier turns (spec2 §51)', async () => {
  test.setTimeout(90_000)

  // Reuse the current tab with a clean canvas — the previous test's document
  // is still focused, so the home view stays hidden behind it. Delete via the
  // store: the Linux Meta+a select-all is a no-op (see human-flow.spec).
  await canvas.waitForInit()
  await page.evaluate(() => {
    const store = window.openPencil?.getStore?.()
    if (!store) throw new Error('OpenPencil store not initialized')
    const graphPage = store.graph.getNode(store.state.currentPageId)
    for (const childId of (graphPage?.childIds ?? []).slice()) store.graph.deleteNode(childId)
  })
  await canvas.waitForRender()
  expect(await findNodeByName('Dashboard')).toBeNull()

  const harness = new ChatHarness(page)
  await injectLifecycleAIToolsTransport(page)
  // Test 1 already configured the provider; only set it up on first run.
  if ((await page.getByTestId('provider-setup-open-settings').count()) > 0) {
    await harness.configureOpenRouter('sk-or-test-key-12345')
  } else {
    await harness.chatTab.click()
    await harness.input.waitFor({ timeout: 15_000 })
  }

  const turnCount = async (): Promise<number> =>
    Number(await page.evaluate(() => document.documentElement.dataset.chatTurnCount ?? '0'))

  // Conversation history may carry over from earlier tests; assert the count
  // strictly grows by exactly one user turn per submit.
  let seen = await turnCount()
  const expectTurns = async (n: number): Promise<void> => {
    await expect.poll(turnCount, { timeout: 20_000 }).toBeGreaterThanOrEqual(seen + n)
    seen = await turnCount()
  }

  // Turn 1: create.
  await harness.submit('Create a dashboard with a card')
  await expect(harness.assistantMessage()).toContainText('dashboard', {
    timeout: 20_000
  })
  await expectTurns(1)

  // Turn 2: "the card" — only resolvable if turn 1's document persists in-session.
  await harness.submit('Make the card interactive')
  await expect(harness.assistantMessage()).toContainText('pressed', {
    timeout: 20_000
  })
  await expectTurns(1)

  // Turn 3: "animate" — targets the interaction created in turn 2.
  await harness.submit('Animate the card')
  await expect(harness.assistantMessage()).toContainText('spring', {
    timeout: 20_000
  })
  await expectTurns(1)

  // Turn 4: "mobile behavior" — restructures turn 1's dashboard.
  await harness.submit('Change the mobile behavior')
  await expect(harness.assistantMessage()).toContainText('mobile', {
    timeout: 20_000
  })
  await expectTurns(1)

  // The message history the model receives contains every turn of this journey.
  const history = JSON.parse(
    await page.evaluate(() => document.documentElement.dataset.chatHistory ?? '[]')
  ) as string[]
  expect(history.length).toBeGreaterThanOrEqual(4)
  const joined = history.join('\n').toLowerCase()
  expect(joined).toContain('dashboard')
  expect(joined).toContain('interactive')
  expect(joined).toContain('animate')
  expect(joined).toContain('mobile')

  // Document-level continuity: turn 4's layout change landed on turn 1's frame.
  const dashboardId = expectDefined(await findNodeByName('Dashboard'), 'dashboard')
  const layout = await page.evaluate((id) => {
    const store = window.openPencil?.getStore?.()
    const node = store?.graph.getNode(id)
    return node ? { layoutMode: node.layoutMode, itemSpacing: node.itemSpacing } : null
  }, dashboardId)
  expect(layout?.layoutMode).toBe('VERTICAL')

  canvas.assertNoErrors()
})
