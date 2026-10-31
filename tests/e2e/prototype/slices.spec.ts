import { expect, test, useEditorSetupWithClear } from '#tests/e2e/fixtures'
import { expectDefined } from '#tests/helpers/assert'
import { propertySection } from '#tests/helpers/properties'
import { clickNodeInPlayer, closePlayer, hoverNodeInPlayer } from '#tests/helpers/prototype/player'
import { getSelectedNode } from '#tests/helpers/store'

const editor = useEditorSetupWithClear('/demo')

interface InteractionRecord {
  id: string
  trigger: string
  delayMs?: number
  action: { type: string; destinationId?: string; overlayId?: string; state?: string }
  transition?: { kind: string; direction?: string }
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

/** Draw-creation parents new nodes to the page; nest like other e2e specs do. */
async function ensureChild(childId: string, parentId: string) {
  await editor.page.evaluate(
    ({ childId, parentId }) => {
      const store = window.openPencil?.getStore?.()
      if (!store) throw new Error('OpenPencil store not initialized')
      const node = store.graph.getNode(childId)
      if (!node) throw new Error(`missing node ${childId}`)
      if (node.parentId !== parentId) store.graph.reparentNode(childId, parentId)
    },
    { childId, parentId }
  )
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

/** Pin absolute/relative positions so preview clicks stay inside the fitted viewport. */
async function place(nodes: Array<{ id: string; x: number; y: number }>) {
  await editor.page.evaluate((items) => {
    const store = window.openPencil?.getStore?.()
    if (!store) throw new Error('OpenPencil store not initialized')
    for (const item of items) {
      const node = store.graph.getNode(item.id)
      if (!node) throw new Error(`missing node ${item.id}`)
      store.graph.updateNode(item.id, { x: item.x, y: item.y })
    }
  }, nodes)
  await editor.canvas.waitForRender()
}

/** Select via the store: canvas-click coordinates drift with the viewport. */
async function selectViaStore(nodeId: string) {
  await editor.page.evaluate((id) => {
    const store = window.openPencil?.getStore?.()
    if (!store) throw new Error('OpenPencil store not initialized')
    store.select([id])
  }, nodeId)
  await editor.canvas.waitForRender()
}

async function setFlowStart() {
  const section = propertySection(editor.page, 'Prototype')
  await section.getByRole('button', { name: 'Set as flow start' }).click()
  await editor.canvas.waitForRender()
}

type PanelCombo = 'Trigger' | 'Action' | 'Overlay' | 'State' | 'Transition' | 'Direction'

async function selectOption(name: PanelCombo, option: string, index = 0) {
  const section = propertySection(editor.page, 'Prototype')
  const row = section.locator('[data-property="interaction"]').nth(index)
  await row.getByRole('combobox', { name }).click()
  await editor.page.getByRole('option', { name: option, exact: true }).click()
  await editor.canvas.waitForRender()
}

test('after delay trigger stores an explicit delay and rapid edits stay consistent', async () => {
  await editor.canvas.drawRect(60, 60, 200, 120)
  const rect = expectDefined(await getSelectedNode(editor.page), 'rect')
  const section = propertySection(editor.page, 'Prototype')

  // Rapid add: three quick clicks → three rows.
  await section.locator('[data-property="add-interaction"]').click()
  await section.locator('[data-property="add-interaction"]').click()
  await section.locator('[data-property="add-interaction"]').click()
  await editor.canvas.waitForRender()
  await expect(section.locator('[data-property="interaction"]')).toHaveCount(3)

  // Rapid undo×3 collapses to zero, redo×3 restores all three.
  for (let i = 0; i < 3; i++) await editor.page.keyboard.press('ControlOrMeta+z')
  await editor.canvas.waitForRender()
  expect(await pluginValue(rect.id, 'interactions')).toBeNull()

  for (let i = 0; i < 3; i++) await editor.page.keyboard.press('ControlOrMeta+Shift+z')
  await editor.canvas.waitForRender()
  let list = expectDefined(await pluginValue<InteractionRecord[]>(rect.id, 'interactions'), 'list')
  expect(list).toHaveLength(3)

  // Switching the trigger must materialize delayMs (validate_prototype
  // rejects afterDelay without one; the NumberField shows 500 as fallback).
  await selectOption('Trigger', 'After delay')
  list = expectDefined(await pluginValue<InteractionRecord[]>(rect.id, 'interactions'), 'list')
  expect(list[0]?.trigger).toBe('afterDelay')
  expect(list[0]?.delayMs).toBe(500)

  // Leaving the trigger clears the delay again.
  await selectOption('Trigger', 'On click')
  list = expectDefined(await pluginValue<InteractionRecord[]>(rect.id, 'interactions'), 'list')
  expect(list[0]?.trigger).toBe('click')
  expect(list[0]?.delayMs).toBeUndefined()

  editor.canvas.assertNoErrors()
})

test('garbage pluginData never breaks the panel or the editor', async () => {
  await editor.canvas.drawRect(80, 80, 220, 160)
  const rect = expectDefined(await getSelectedNode(editor.page), 'rect')
  const section = propertySection(editor.page, 'Prototype')

  const writeGarbage = async (value: string) => {
    await editor.page.evaluate(
      ({ nodeId, value }) => {
        const store = window.openPencil?.getStore?.()
        if (!store) throw new Error('OpenPencil store not initialized')
        const node = store.graph.getNode(nodeId)
        if (!node) throw new Error(`missing node ${nodeId}`)
        const rest = node.pluginData.filter(
          (e) => !(e.pluginId === 'open-pencil' && e.key === 'interactions')
        )
        store.graph.updateNode(nodeId, {
          pluginData: [...rest, { pluginId: 'open-pencil', key: 'interactions', value }]
        })
      },
      { nodeId: rect.id, value }
    )
    await editor.canvas.waitForRender()
  }

  // Not JSON at all.
  await writeGarbage('{{{not json')
  await expect(section).toBeVisible()
  await expect(section.locator('[data-property="interaction"]')).toHaveCount(0)

  // Valid JSON, invalid schema — valibot rejects it, panel treats it as absent.
  await writeGarbage(JSON.stringify([{ id: 'x', trigger: 'evil', action: { type: 'nope' } }]))
  await expect(section).toBeVisible()
  await expect(section.locator('[data-property="interaction"]')).toHaveCount(0)

  // The editor still works: author a real interaction after the garbage.
  await section.locator('[data-property="add-interaction"]').click()
  await editor.canvas.waitForRender()
  await expect(section.locator('[data-property="interaction"]')).toHaveCount(1)

  editor.canvas.assertNoErrors()
})

test('press scales the button and release springs it back', async () => {
  test.setTimeout(30_000)
  await editor.canvas.selectTool('frame')
  await editor.canvas.drag(40, 40, 340, 240)
  await editor.canvas.waitForRender()
  const frame = expectDefined(await getSelectedNode(editor.page), 'frame')

  await editor.canvas.selectTool('rectangle')
  await editor.canvas.drag(120, 120, 240, 170)
  await editor.canvas.waitForRender()
  const button = expectDefined(await getSelectedNode(editor.page), 'button')
  await ensureChild(button.id, frame.id)

  // Flow starts at the screen frame.
  await selectViaStore(frame.id)
  await setFlowStart()

  // Select the button and build default/pressed states.
  await selectViaStore(button.id)

  const section = propertySection(editor.page, 'Prototype')
  await section.locator('[data-property="add-state"]').click()
  await editor.canvas.waitForRender()
  await section.locator('[data-property="add-state"]').click()
  await editor.canvas.waitForRender()
  await expect(section.locator('[data-property="prototype-state"]')).toHaveCount(2)

  // Rename the second state to "pressed" and shrink it.
  const nameField = section.locator('[data-property="state-1-name"]')
  await nameField.fill('pressed')
  await nameField.press('Enter')
  await editor.canvas.waitForRender()

  const scaleField = section.locator('[data-property="state-1-scale"]')
  await scaleField.click()
  const scaleInput = scaleField.getByRole('spinbutton', { name: 'Scale' })
  await scaleInput.fill('0.96')
  await scaleInput.press('Enter')
  await editor.canvas.waitForRender()

  // press → setState(pressed, spring)
  await section.locator('[data-property="add-interaction"]').click()
  await editor.canvas.waitForRender()
  await selectOption('Trigger', 'On press')
  await selectOption('Action', 'Set state')
  await selectOption('State', 'pressed')
  await selectOption('Transition', 'Spring')

  // release → setState(default, spring)
  await section.locator('[data-property="add-interaction"]').click()
  await editor.canvas.waitForRender()
  await selectOption('Trigger', 'On release', 1)
  await selectOption('Action', 'Set state', 1)
  await selectOption('State', 'default', 1)
  await selectOption('Transition', 'Spring', 1)

  const list = expectDefined(
    await pluginValue<InteractionRecord[]>(button.id, 'interactions'),
    'interactions'
  )
  expect(list).toHaveLength(2)
  expect(list[0]).toMatchObject({
    trigger: 'press',
    action: { type: 'setState', state: 'pressed' }
  })
  expect(list[1]).toMatchObject({
    trigger: 'release',
    action: { type: 'setState', state: 'default' }
  })

  // Preview: hold the button down → it springs to scale 0.96.
  await editor.page.getByTestId('prototype-present-button').click()
  await editor.page.waitForFunction(() => {
    const store = window.openPencil?.getStore?.()
    return store?.state.prototypePreview != null
  })

  await hoverNodeInPlayer(editor.page, button.id)
  await editor.page.mouse.down()
  await editor.page.waitForFunction(
    (id) => {
      const store = window.openPencil?.getStore?.()
      const scale = store?.state.prototypePreview?.nodeVisuals.get(id)?.scale
      return scale !== undefined && Math.abs(scale - 0.96) < 0.015
    },
    button.id,
    { timeout: 5000 }
  )

  // Release → springs back to identity (visual entry disappears).
  await editor.page.mouse.up()
  await editor.page.waitForFunction(
    (id) => {
      const store = window.openPencil?.getStore?.()
      const preview = store?.state.prototypePreview
      if (!preview) return false
      const visual = preview.nodeVisuals.get(id)
      return visual === undefined || (visual.scale ?? 1) > 0.99
    },
    button.id,
    { timeout: 5000 }
  )

  await closePlayer(editor.page)

  editor.canvas.assertNoErrors()
})

test('bottom sheet slides up as an overlay and closes again', async () => {
  test.setTimeout(30_000)
  await editor.canvas.selectTool('frame')
  await editor.canvas.drag(40, 40, 340, 280)
  await editor.canvas.waitForRender()
  const main = expectDefined(await getSelectedNode(editor.page), 'main frame')

  await editor.canvas.selectTool('frame')
  await editor.canvas.drag(400, 300, 700, 520)
  await editor.canvas.waitForRender()
  const popup = expectDefined(await getSelectedNode(editor.page), 'sheet frame')

  await rename([
    { id: main.id, name: 'Sheet Main' },
    { id: popup.id, name: 'Sheet Popup' }
  ])

  // Open button inside the main screen.
  await editor.canvas.selectTool('rectangle')
  await editor.canvas.drag(140, 200, 240, 240)
  await editor.canvas.waitForRender()
  const openBtn = expectDefined(await getSelectedNode(editor.page), 'open button')
  await ensureChild(openBtn.id, main.id)

  await propertySection(editor.page, 'Prototype')
    .locator('[data-property="add-interaction"]')
    .click()
  await editor.canvas.waitForRender()
  await selectOption('Action', 'Open overlay')
  await selectOption('Overlay', 'Sheet Popup')
  await selectOption('Transition', 'Slide')
  await selectOption('Direction', 'Up')

  // Close button inside the sheet.
  await editor.canvas.selectTool('rectangle')
  await editor.canvas.drag(500, 460, 600, 500)
  await editor.canvas.waitForRender()
  const closeBtn = expectDefined(await getSelectedNode(editor.page), 'close button')
  await ensureChild(closeBtn.id, popup.id)

  // A prior test's Present leaves its zoom/pan behind, so drag-created frames
  // land at different world coords each run. Pin everything: zoomToBounds(main)
  // then centers the pinned layout, keeping every click target on-canvas.
  await place([
    { id: main.id, x: 40, y: 40 },
    { id: openBtn.id, x: 100, y: 160 },
    { id: popup.id, x: 160, y: 110 },
    { id: closeBtn.id, x: 40, y: 40 }
  ])

  await propertySection(editor.page, 'Prototype')
    .locator('[data-property="add-interaction"]')
    .click()
  await editor.canvas.waitForRender()
  await selectOption('Action', 'Close overlay')
  await selectOption('Transition', 'Slide')
  await selectOption('Direction', 'Up')

  const openList = expectDefined(
    await pluginValue<InteractionRecord[]>(openBtn.id, 'interactions'),
    'open interactions'
  )
  expect(openList[0]?.action).toMatchObject({ type: 'openOverlay', overlayId: popup.id })
  expect(openList[0]?.transition).toMatchObject({ kind: 'slide', direction: 'up' })

  const closeList = expectDefined(
    await pluginValue<InteractionRecord[]>(closeBtn.id, 'interactions'),
    'close interactions'
  )
  expect(closeList[0]?.action).toMatchObject({ type: 'closeOverlay' })
  expect(closeList[0]?.transition).toMatchObject({ kind: 'slide', direction: 'up' })

  // Flow starts on the main screen.
  await selectViaStore(main.id)
  await setFlowStart()

  await editor.page.getByTestId('prototype-present-button').click()
  await editor.page.waitForFunction(
    (id) => {
      const store = window.openPencil?.getStore?.()
      const preview = store?.state.prototypePreview
      return preview != null && preview.drawIds.includes(id)
    },
    main.id,
    { timeout: 5000 }
  )

  // Open: the sheet joins the draw list behind a backdrop.
  await clickNodeInPlayer(editor.page, openBtn.id)
  await editor.page.waitForFunction(
    ({ overlayId, mainId }) => {
      const store = window.openPencil?.getStore?.()
      const preview = store?.state.prototypePreview
      return (
        preview != null &&
        preview.drawIds.includes(overlayId) &&
        preview.overlayStartIndex > 0 &&
        preview.backdropOpacity > 0 &&
        preview.drawIds[0] === mainId
      )
    },
    { overlayId: popup.id, mainId: main.id },
    { timeout: 5000 }
  )

  // Close: only the main screen remains.
  await clickNodeInPlayer(editor.page, closeBtn.id)
  await editor.page.waitForFunction(
    (mainId) => {
      const store = window.openPencil?.getStore?.()
      const preview = store?.state.prototypePreview
      return preview != null && preview.drawIds.length === 1 && preview.drawIds[0] === mainId
    },
    main.id,
    { timeout: 5000 }
  )

  await closePlayer(editor.page)

  editor.canvas.assertNoErrors()
})

test('navigating to a deleted destination fails safely in preview', async () => {
  test.setTimeout(30_000)
  await editor.canvas.selectTool('frame')
  await editor.canvas.drag(40, 40, 340, 240)
  await editor.canvas.waitForRender()
  const start = expectDefined(await getSelectedNode(editor.page), 'start frame')

  await editor.canvas.selectTool('frame')
  await editor.canvas.drag(380, 40, 680, 240)
  await editor.canvas.waitForRender()
  const target = expectDefined(await getSelectedNode(editor.page), 'target frame')

  await rename([
    { id: start.id, name: 'Broken Start' },
    { id: target.id, name: 'Broken Target' }
  ])

  await selectViaStore(start.id)
  await setFlowStart()

  const section = propertySection(editor.page, 'Prototype')
  await section.locator('[data-property="add-interaction"]').click()
  await editor.canvas.waitForRender()
  await section.getByRole('combobox', { name: 'Destination' }).click()
  await editor.page.getByRole('option', { name: 'Broken Target', exact: true }).click()
  await editor.canvas.waitForRender()

  // Delete the destination out from under the interaction.
  await selectViaStore(target.id)
  await editor.canvas.deleteSelection()

  await editor.page.getByTestId('prototype-present-button').click()
  await editor.page.waitForFunction(
    (id) => {
      const store = window.openPencil?.getStore?.()
      const preview = store?.state.prototypePreview
      return preview != null && preview.drawIds.length === 1 && preview.drawIds[0] === id
    },
    start.id,
    { timeout: 5000 }
  )

  // Clicking must not navigate, crash, or change the screen.
  await clickNodeInPlayer(editor.page, start.id)
  await editor.page.waitForTimeout(300)
  expect(
    await editor.page.evaluate((id) => {
      const store = window.openPencil?.getStore?.()
      const preview = store?.state.prototypePreview
      return preview != null && preview.drawIds.length === 1 && preview.drawIds[0] === id
    }, start.id)
  ).toBe(true)

  await closePlayer(editor.page)

  editor.canvas.assertNoErrors()
})
