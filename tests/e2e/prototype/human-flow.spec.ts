import { expect, test, useEditorSetup } from '#tests/e2e/fixtures'
import { expectDefined } from '#tests/helpers/assert'
import { ChatHarness } from '#tests/helpers/chat/harness'
import { propertySection } from '#tests/helpers/properties'
import { injectPrototypeAIToolsTransport } from '#tests/helpers/prototype/ai-chat'
import { clickNodeInPlayer, closePlayer } from '#tests/helpers/prototype/player'
import { getSelectedNode } from '#tests/helpers/store'

// §26 human-like journey: author → preview → manual edit → ask AI to modify →
// verify (panel + undo) → AI rejects invalid input → AI creates states.
// Serial: later tests build on the flow test 1 authored.
const editor = useEditorSetup('/demo')

interface InteractionRecord {
  id: string
  trigger: string
  delayMs?: number
  action: { type: string; destinationId?: string; state?: string }
  transition?: { kind?: string; direction?: string; durationMs?: number }
}

interface StateModelRecord {
  initial?: string
  states?: Array<{ name: string }>
}

async function pluginValue<T>(nodeId: string, key: string): Promise<T | null> {
  return editor.page.evaluate<T | null>(
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

/** Select via the store: canvas coordinates drift after Present's zoomToBounds. */
async function selectViaStore(nodeId: string) {
  await editor.page.evaluate((id) => {
    const store = window.openPencil?.getStore?.()
    if (!store) throw new Error('OpenPencil store not initialized')
    store.select([id])
  }, nodeId)
  await editor.canvas.waitForRender()
}

async function rename(nodes: Array<{ id: string; name: string }>) {
  await editor.page.evaluate((items) => {
    const store = window.openPencil?.getStore?.()
    if (!store) throw new Error('OpenPencil store not initialized')
    for (const item of items) {
      const node = store.graph.getNode(item.id)
      if (!node) throw new Error(`missing node ${item.id}`)
      store.graph.updateNode(item.id, { name: item.name })
    }
  }, nodes)
  await editor.canvas.waitForRender()
}

type PanelCombo = 'Trigger' | 'Transition' | 'Direction'

async function selectOption(name: PanelCombo, option: string) {
  const section = propertySection(editor.page, 'Prototype')
  const row = section.locator('[data-property="interaction"]').first()
  await row.getByRole('combobox', { name }).click()
  await editor.page.getByRole('option', { name: option, exact: true }).click()
  await editor.canvas.waitForRender()
}

async function setDuration(ms: number) {
  const section = propertySection(editor.page, 'Prototype')
  const field = section.locator('[data-property="interaction-0-duration"]')
  await field.click()
  const input = field.getByRole('spinbutton')
  await input.fill(String(ms))
  await input.press('Enter')
  await editor.canvas.waitForRender()
}

let splashId = ''

test('designer authors a splash → home onboarding flow, previews it, and re-edits it', async () => {
  test.setTimeout(60_000)
  await editor.canvas.clearCanvas()

  await editor.canvas.selectTool('frame')
  await editor.canvas.drag(40, 40, 340, 280)
  await editor.canvas.waitForRender()
  const splash = expectDefined(await getSelectedNode(editor.page), 'splash frame')

  await editor.canvas.selectTool('frame')
  await editor.canvas.drag(400, 40, 700, 280)
  await editor.canvas.waitForRender()
  const home = expectDefined(await getSelectedNode(editor.page), 'home frame')

  await rename([
    { id: splash.id, name: 'Splash' },
    { id: home.id, name: 'Home' }
  ])
  splashId = splash.id

  // Splash is the flow start; On load → Navigate to Home, Fade 500ms.
  // (Explicit flow start matters: /demo's own frames stay on the page — the
  // Linux `Meta+a` select-all is a no-op — so the first-FRAME fallback would
  // start the preview on a demo shape whose OnLoad never navigates.)
  await selectViaStore(splash.id)
  await propertySection(editor.page, 'Prototype')
    .getByRole('button', { name: 'Set as flow start' })
    .click()
  await editor.canvas.waitForRender()
  await propertySection(editor.page, 'Prototype')
    .locator('[data-property="add-interaction"]')
    .click()
  await editor.canvas.waitForRender()
  await selectOption('Trigger', 'On load')

  const section = propertySection(editor.page, 'Prototype')
  await section.getByRole('combobox', { name: 'Destination' }).click()
  await editor.page.getByRole('option', { name: 'Home', exact: true }).click()
  await editor.canvas.waitForRender()
  await setDuration(500)

  let list = expectDefined(
    await pluginValue<InteractionRecord[]>(splash.id, 'interactions'),
    'interactions'
  )
  expect(list).toHaveLength(1)
  expect(list[0]).toMatchObject({
    trigger: 'load',
    action: { type: 'navigate', destinationId: home.id },
    transition: { kind: 'fade', durationMs: 500 }
  })
  const flow = (await editor.page.evaluate(() => {
    const store = window.openPencil?.getStore?.()
    if (!store) throw new Error('OpenPencil store not initialized')
    const root = store.graph.getNode(store.graph.rootId)
    const entry = root?.pluginData.find(
      (e) => e.pluginId === 'open-pencil' && e.key === 'prototype'
    )
    return entry ? (JSON.parse(entry.value) as { flows?: Array<{ startNodeId: string }> }) : null
  })) as { flows?: Array<{ startNodeId: string }> } | null
  expect(flow?.flows?.[0]?.startNodeId).toBe(splash.id)

  // Preview: On load fires at start → fades into Home.
  await editor.page.getByTestId('prototype-present-button').click()
  await editor.page.waitForFunction(
    (id) => {
      const store = window.openPencil?.getStore?.()
      const preview = store?.state.prototypePreview
      return preview != null && preview.drawIds.length === 1 && preview.drawIds[0] === id
    },
    home.id,
    { timeout: 10_000 }
  )
  await closePlayer(editor.page)

  // Manual re-edit: 500 → 800ms.
  await selectViaStore(splash.id)
  await setDuration(800)
  list = expectDefined(
    await pluginValue<InteractionRecord[]>(splash.id, 'interactions'),
    'interactions after edit'
  )
  expect(list[0]?.transition).toMatchObject({ kind: 'fade', durationMs: 800 })

  editor.canvas.assertNoErrors()
})

test('asking AI to modify the flow runs real prototype tools with undo and panel sync', async () => {
  test.setTimeout(60_000)
  const harness = new ChatHarness(editor.page)
  await injectPrototypeAIToolsTransport(editor.page)
  await harness.configureOpenRouter('sk-or-test-key-12345')

  const prompt = 'Change the splash transition to slide up over 400ms'
  await harness.submit(prompt)

  // The modification lands through the AI tool path (validation + undo entry).
  await editor.page.waitForFunction(
    (id) => {
      const store = window.openPencil?.getStore?.()
      const node = store?.graph.getNode(id)
      const entry = node?.pluginData.find(
        (e) => e.pluginId === 'open-pencil' && e.key === 'interactions'
      )
      if (!entry) return false
      const parsed = JSON.parse(entry.value) as InteractionRecord[]
      return (
        parsed[0]?.transition?.kind === 'slide' &&
        parsed[0]?.transition?.direction === 'up' &&
        parsed[0]?.transition?.durationMs === 400
      )
    },
    splashId,
    { timeout: 15_000 }
  )
  // The model received what the designer typed (the app may append a
  // "Referenced nodes" selection context after the prompt text).
  expect(
    await editor.page.evaluate(() => document.documentElement.dataset.lastChatRequest)
  ).toContain(prompt)
  await expect(harness.assistantMessage()).toContainText('slide', { timeout: 15_000 })

  // The panel re-inspects the modified interaction.
  await harness.designTab.click()
  await selectViaStore(splashId)
  const section = propertySection(editor.page, 'Prototype')
  await expect(section.getByRole('combobox', { name: 'Transition' })).toContainText('Slide')
  await expect(section.getByRole('combobox', { name: 'Direction' })).toContainText('Up')

  // One undo reverts the whole AI action (pushUndoEntry snapshot).
  await editor.page.keyboard.press('ControlOrMeta+z')
  await editor.page.waitForFunction(
    (id) => {
      const store = window.openPencil?.getStore?.()
      const node = store?.graph.getNode(id)
      const entry = node?.pluginData.find(
        (e) => e.pluginId === 'open-pencil' && e.key === 'interactions'
      )
      if (!entry) return false
      const parsed = JSON.parse(entry.value) as InteractionRecord[]
      return parsed[0]?.transition?.kind === 'fade' && parsed[0]?.transition?.durationMs === 800
    },
    splashId,
    { timeout: 5_000 }
  )

  editor.canvas.assertNoErrors()
})

test('AI rejects an invalid transition and creates loading/success/error states', async () => {
  test.setTimeout(60_000)
  const harness = new ChatHarness(editor.page)

  // Invalid input: the tool reports the error and the document stays untouched.
  await harness.chatTab.click()
  await harness.submit('Use a wobble transition instead')
  await editor.page.waitForFunction(
    () => document.documentElement.dataset.aiToolOutput?.includes('Invalid transition') ?? false,
    undefined,
    { timeout: 15_000 }
  )
  await expect(harness.assistantMessage()).toContainText('Could not apply', { timeout: 15_000 })
  const afterInvalid = expectDefined(
    await pluginValue<InteractionRecord[]>(splashId, 'interactions'),
    'interactions after invalid AI edit'
  )
  expect(afterInvalid[0]?.transition).toMatchObject({ kind: 'fade', durationMs: 800 })

  // Create named states through the AI tool path.
  await harness.designTab.click()
  await selectViaStore(splashId)
  await harness.chatTab.click()
  await harness.submit('Add loading, success and error states')
  await editor.page.waitForFunction(
    (id) => {
      const store = window.openPencil?.getStore?.()
      const node = store?.graph.getNode(id)
      const entry = node?.pluginData.find(
        (e) => e.pluginId === 'open-pencil' && e.key === 'prototypeState'
      )
      if (!entry) return false
      const parsed = JSON.parse(entry.value) as StateModelRecord
      const names = new Set((parsed.states ?? []).map((s) => s.name))
      return names.has('loading') && names.has('success') && names.has('error')
    },
    splashId,
    { timeout: 15_000 }
  )
  await expect(harness.assistantMessage()).toContainText('loading', { timeout: 15_000 })

  // The panel shows all three states.
  await harness.designTab.click()
  const section = propertySection(editor.page, 'Prototype')
  await expect(section.locator('[data-property="prototype-state"]')).toHaveCount(3)
  await expect(section.locator('[data-property="state-0-name"]')).toHaveValue('loading')
  await expect(section.locator('[data-property="state-1-name"]')).toHaveValue('success')
  await expect(section.locator('[data-property="state-2-name"]')).toHaveValue('error')

  editor.canvas.assertNoErrors()
})

test('card carousel advances with a horizontal slide transition', async () => {
  test.setTimeout(60_000)
  await editor.canvas.selectTool('frame')
  await editor.canvas.drag(40, 340, 300, 520)
  await editor.canvas.waitForRender()
  const cardA = expectDefined(await getSelectedNode(editor.page), 'card A')

  await editor.canvas.selectTool('frame')
  await editor.canvas.drag(340, 340, 600, 520)
  await editor.canvas.waitForRender()
  const cardB = expectDefined(await getSelectedNode(editor.page), 'card B')

  await rename([
    { id: cardA.id, name: 'Card A' },
    { id: cardB.id, name: 'Card B' }
  ])

  // Card A is the flow entry; click advances with a left slide.
  await selectViaStore(cardA.id)
  const section = propertySection(editor.page, 'Prototype')
  await section.getByRole('button', { name: 'Set as flow start' }).click()
  await editor.canvas.waitForRender()
  await section.locator('[data-property="add-interaction"]').click()
  await editor.canvas.waitForRender()
  await section.getByRole('combobox', { name: 'Destination' }).click()
  await editor.page.getByRole('option', { name: 'Card B', exact: true }).click()
  await editor.canvas.waitForRender()
  await selectOption('Transition', 'Slide')
  await selectOption('Direction', 'Left')

  const list = expectDefined(
    await pluginValue<InteractionRecord[]>(cardA.id, 'interactions'),
    'carousel interactions'
  )
  expect(list[0]).toMatchObject({
    trigger: 'click',
    action: { type: 'navigate', destinationId: cardB.id },
    transition: { kind: 'slide', direction: 'left' }
  })

  // Preview: start on Card A, advance to Card B.
  await editor.page.getByTestId('prototype-present-button').click()
  await editor.page.waitForFunction(
    (id) => {
      const store = window.openPencil?.getStore?.()
      const preview = store?.state.prototypePreview
      return preview != null && preview.drawIds.length === 1 && preview.drawIds[0] === id
    },
    cardA.id,
    { timeout: 10_000 }
  )
  await clickNodeInPlayer(editor.page, cardA.id)
  await editor.page.waitForFunction(
    (id) => {
      const store = window.openPencil?.getStore?.()
      const preview = store?.state.prototypePreview
      return preview != null && preview.drawIds.length === 1 && preview.drawIds[0] === id
    },
    cardB.id,
    { timeout: 10_000 }
  )
  await closePlayer(editor.page)

  editor.canvas.assertNoErrors()
})
