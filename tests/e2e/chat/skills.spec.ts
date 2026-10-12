import { expect, test, useEditorSetup } from '#tests/e2e/fixtures'
import { ChatHarness } from '#tests/helpers/chat/harness'
import { injectMockChatTransport } from '#tests/helpers/chat/transport'
import { propertySection } from '#tests/helpers/properties'
import { injectBottomSheetAIToolsTransport } from '#tests/helpers/prototype/ai-chat'

// §9/§76: skill routing is observable end-to-end — slash and NL both reach the
// real model request with skill knowledge, the visible message stays raw, and
// a routed semantic operation runs through the real tool path with undo and
// panel sync. Serial: later tests reuse the harness/chat state.
const editor = useEditorSetup('/demo')

interface InteractionRecord {
  trigger: string
  action: { type: string; overlayId?: string }
  transition?: { kind?: string; direction?: string }
}

async function activeSkills(): Promise<string> {
  return editor.page.evaluate(() => document.documentElement.dataset.activeSkills ?? '')
}

async function assistantCount(): Promise<number> {
  return editor.page.getByTestId('chat-message-assistant').count()
}

async function lastChatRequest(): Promise<string> {
  return editor.page.evaluate(() => document.documentElement.dataset.lastChatRequest ?? '')
}

async function interactionsOf(nodeId: string): Promise<InteractionRecord[]> {
  return editor.page.evaluate((id) => {
    const store = window.openPencil?.getStore?.()
    if (!store) throw new Error('OpenPencil store not initialized')
    const node = store.graph.getNode(id)
    const entry = node?.pluginData.find(
      (e) => e.pluginId === 'open-pencil' && e.key === 'interactions'
    )
    return entry ? (JSON.parse(entry.value) as InteractionRecord[]) : []
  }, nodeId)
}

async function selectViaStore(nodeId: string) {
  await editor.page.evaluate((id) => {
    const store = window.openPencil?.getStore?.()
    if (!store) throw new Error('OpenPencil store not initialized')
    store.select([id])
  }, nodeId)
  await editor.canvas.waitForRender()
}

test('a natural-language prompt ships skill knowledge in the real request, raw text stays visible', async () => {
  test.setTimeout(60_000)
  const harness = new ChatHarness(editor.page)
  await injectMockChatTransport(editor.page)
  await harness.configureOpenRouter('sk-or-test-key-12345')

  const prompt = 'Turn this menu into a bottom sheet'
  const before = await assistantCount()
  await harness.submit(prompt)
  await expect(editor.page.getByTestId('chat-message-assistant')).toHaveCount(before + 1, {
    timeout: 15_000
  })

  const request = await lastChatRequest()
  expect(request).toContain('[Design skills activated for this request]')
  expect(request).toContain('### prototype.bottom-sheet')
  expect(request).toContain('### prototype.overlay')
  expect(request).toContain('### prototype.navigation')

  const skills = await activeSkills()
  expect(skills.split(',')).toEqual(
    expect.arrayContaining([
      'prototype.navigation',
      'prototype.overlay',
      'motion.slide',
      'prototype.bottom-sheet'
    ])
  )

  // §19: the designer sees what they typed — never the internal skill block.
  await expect(harness.userMessage()).toHaveText(prompt)
  editor.canvas.assertNoErrors()
})

test('slash commands resolve through the same engine as natural language', async () => {
  test.setTimeout(60_000)
  const harness = new ChatHarness(editor.page)

  const prompt = '/motion create a dashboard'
  const before = await assistantCount()
  await harness.submit(prompt)
  await expect(editor.page.getByTestId('chat-message-assistant')).toHaveCount(before + 1, {
    timeout: 15_000
  })

  const skills = (await activeSkills()).split(',')
  for (const id of [
    'motion.fade',
    'motion.slide',
    'motion.spring',
    'motion.stagger',
    'design.dashboard'
  ]) {
    expect(skills).toContain(id)
  }

  const request = await lastChatRequest()
  expect(request).toContain('### design.dashboard')
  expect(request).toContain('### motion.spring')

  // Display text keeps the raw slash command, not the appended context.
  await expect(harness.userMessage()).toHaveText(prompt)
  editor.canvas.assertNoErrors()
})

test('a plain request sends no skill block and clears the observable', async () => {
  test.setTimeout(60_000)
  const harness = new ChatHarness(editor.page)

  const before = await assistantCount()
  await harness.submit('Hello there')
  await expect(editor.page.getByTestId('chat-message-assistant')).toHaveCount(before + 1, {
    timeout: 15_000
  })

  expect(await activeSkills()).toBe('')
  expect(await lastChatRequest()).not.toContain('[Design skills activated for this request]')
  editor.canvas.assertNoErrors()
})

test('routed bottom-sheet request creates the composition through real tools, then undoes', async () => {
  test.setTimeout(60_000)
  const harness = new ChatHarness(editor.page)
  await injectBottomSheetAIToolsTransport(editor.page)

  // Screen + button trigger + Sheet frame, built deterministically in the store.
  const ids = await editor.page.evaluate(() => {
    const store = window.openPencil?.getStore?.()
    if (!store) throw new Error('OpenPencil store not initialized')
    const screenId = store.createShape('FRAME', 40, 40, 320, 260)
    const buttonId = store.createShape('RECTANGLE', 80, 220, 120, 48)
    const sheetId = store.createShape('FRAME', 40, 420, 320, 200)
    if (!screenId || !buttonId || !sheetId) throw new Error('setup shape failed')
    store.graph.reparentNode(buttonId, screenId)
    store.updateNode(buttonId, { x: 40, y: 180 })
    store.updateNode(screenId, { name: 'Screen' })
    store.updateNode(buttonId, { name: 'Button' })
    store.updateNode(sheetId, { name: 'Sheet' })
    store.select([buttonId])
    store.requestRender()
    return { screenId, buttonId, sheetId }
  })
  await editor.canvas.waitForRender()

  const before = await assistantCount()
  await harness.submit('Turn this menu into a bottom sheet')
  await expect(editor.page.getByTestId('chat-message-assistant')).toHaveCount(before + 1, {
    timeout: 15_000
  })

  // The routed request carried the skill knowledge block.
  expect(await lastChatRequest()).toContain('### prototype.bottom-sheet')

  // Opener, dismiss, and outside-tap all landed.
  await editor.page.waitForFunction(
    ({ buttonId, sheetId }) => {
      const store = window.openPencil?.getStore?.()
      if (!store) return false
      const read = (id: string) => {
        const node = store.graph.getNode(id)
        const entry = node?.pluginData.find(
          (e) => e.pluginId === 'open-pencil' && e.key === 'interactions'
        )
        return entry ? (JSON.parse(entry.value) as InteractionRecord[]) : []
      }
      const button = read(buttonId)[0]
      const sheet = read(sheetId)[0]
      return (
        button?.action.type === 'openOverlay' &&
        button?.transition?.direction === 'up' &&
        sheet?.action.type === 'closeOverlay'
      )
    },
    { buttonId: ids.buttonId, sheetId: ids.sheetId },
    { timeout: 15_000 }
  )
  const screenInteractions = await interactionsOf(ids.screenId)
  expect(screenInteractions[0]?.action.type).toBe('closeOverlay')

  // Panel reflects the button's opener interaction.
  await harness.designTab.click()
  await selectViaStore(ids.buttonId)
  const section = propertySection(editor.page, 'Prototype')
  const row = section.locator('[data-property="interaction"]').first()
  await expect(row).toBeVisible()
  await expect(row.getByRole('combobox', { name: 'Trigger' })).toContainText('On click')

  // One undo reverts the whole AI operation (single createAITools entry).
  await editor.page.keyboard.press('ControlOrMeta+z')
  await editor.page.waitForFunction(
    ({ buttonId, sheetId, screenId }) => {
      const store = window.openPencil?.getStore?.()
      if (!store) return false
      const count = (id: string) => {
        const node = store.graph.getNode(id)
        const entry = node?.pluginData.find(
          (e) => e.pluginId === 'open-pencil' && e.key === 'interactions'
        )
        if (!entry) return 0
        return (JSON.parse(entry.value) as InteractionRecord[]).length
      }
      return count(buttonId) === 0 && count(sheetId) === 0 && count(screenId) === 0
    },
    { buttonId: ids.buttonId, sheetId: ids.sheetId, screenId: ids.screenId },
    { timeout: 5_000 }
  )

  editor.canvas.assertNoErrors()
})
