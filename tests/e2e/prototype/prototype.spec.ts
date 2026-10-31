import { expect, test, useEditorSetupWithClear } from '#tests/e2e/fixtures'
import { expectDefined } from '#tests/helpers/assert'
import { propertySection } from '#tests/helpers/properties'
import { clickNodeInPlayer, closePlayer } from '#tests/helpers/prototype/player'
import { getSelectedNode } from '#tests/helpers/store'

const editor = useEditorSetupWithClear('/demo')

interface InteractionRecord {
  trigger: string
  action: { type: string; destinationId?: string; overlayId?: string; backdropOpacity?: number }
  transition?: { kind: string }
}

interface StateModelRecord {
  initial: string
  states: Array<{ name: string; visual: { scale?: number; opacity?: number } }>
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

async function rootFlowStart(): Promise<string | null> {
  return editor.page.evaluate(() => {
    const store = window.openPencil?.getStore?.()
    if (!store) throw new Error('OpenPencil store not initialized')
    const root = store.graph.getNode(store.graph.rootId)
    const entry = root?.pluginData.find(
      (e) => e.pluginId === 'open-pencil' && e.key === 'prototype'
    )
    if (!entry) return null
    const doc = JSON.parse(entry.value) as { flows?: Array<{ startNodeId: string }> }
    return doc.flows?.[0]?.startNodeId ?? null
  })
}

// CanvasHelper.undo() sends Meta+z; $mod resolves to Control on Linux.
async function pressUndo() {
  await editor.page.keyboard.press('ControlOrMeta+z')
  await editor.canvas.waitForRender()
}

async function pressRedo() {
  await editor.page.keyboard.press('ControlOrMeta+Shift+z')
  await editor.canvas.waitForRender()
}

test('prototype section authors interactions and states with undo', async () => {
  await editor.canvas.drawRect(120, 120, 120, 80)
  const node = expectDefined(await getSelectedNode(editor.page), 'selected rect')

  const section = propertySection(editor.page, 'Prototype')
  await expect(section).toBeVisible()
  await expect(section.locator('[data-property="interaction"]')).toHaveCount(0)

  await section.locator('[data-property="add-interaction"]').click()
  await editor.canvas.waitForRender()
  await expect(section.locator('[data-property="interaction"]')).toHaveCount(1)

  let list = expectDefined(
    await pluginValue<InteractionRecord[]>(node.id, 'interactions'),
    'interactions'
  )
  expect(list).toHaveLength(1)
  expect(list[0]?.trigger).toBe('click')
  expect(list[0]?.action.type).toBe('navigate')
  expect(list[0]?.transition?.kind).toBe('fade')

  // Swap the action: openOverlay renders its extra fields.
  await section.getByRole('combobox', { name: 'Action' }).click()
  await editor.page.getByRole('option', { name: 'Open overlay', exact: true }).click()
  await editor.canvas.waitForRender()
  list = expectDefined(
    await pluginValue<InteractionRecord[]>(node.id, 'interactions'),
    'interactions'
  )
  expect(list[0]?.action).toMatchObject({ type: 'openOverlay', backdropOpacity: 0.3 })
  await expect(section.getByRole('combobox', { name: 'Overlay' })).toBeVisible()

  // Undo walks back through the authoring transactions.
  await pressUndo()
  list = expectDefined(
    await pluginValue<InteractionRecord[]>(node.id, 'interactions'),
    'interactions'
  )
  expect(list[0]?.action.type).toBe('navigate')
  await pressUndo()
  expect(await pluginValue(node.id, 'interactions')).toBeNull()
  await expect(section.locator('[data-property="interaction"]')).toHaveCount(0)
  await pressRedo()
  expect(await pluginValue(node.id, 'interactions')).not.toBeNull()

  // States: add → add → edit scale, all persisted through pluginData.
  await section.locator('[data-property="add-state"]').click()
  await editor.canvas.waitForRender()
  await expect(section.locator('[data-property="prototype-state"]')).toHaveCount(1)

  await section.locator('[data-property="add-state"]').click()
  await editor.canvas.waitForRender()
  await expect(section.locator('[data-property="prototype-state"]')).toHaveCount(2)

  const scaleField = section.locator('[data-property="state-0-scale"]')
  await scaleField.click()
  const scaleInput = scaleField.getByRole('spinbutton', { name: 'Scale' })
  await scaleInput.fill('0.8')
  await scaleInput.press('Enter')
  await editor.canvas.waitForRender()

  const model = expectDefined(
    await pluginValue<StateModelRecord>(node.id, 'prototypeState'),
    'state model'
  )
  expect(model.states).toHaveLength(2)
  expect(model.initial).toBe('default')
  expect(model.states[0]?.visual.scale).toBe(0.8)

  editor.canvas.assertNoErrors()
})

test('a frame can be marked as the flow start', async () => {
  await editor.canvas.selectTool('frame')
  await editor.canvas.drag(80, 80, 380, 280)
  await editor.canvas.waitForRender()
  const frame = expectDefined(await getSelectedNode(editor.page), 'selected frame')
  expect(frame.type).toBe('FRAME')

  const section = propertySection(editor.page, 'Prototype')
  await section.getByRole('button', { name: 'Set as flow start' }).click()
  await editor.canvas.waitForRender()

  await expect(section.getByText('Starts flow')).toBeVisible()
  await expect(section.getByRole('button', { name: 'Set as flow start' })).toHaveCount(0)
  expect(await rootFlowStart()).toBe(frame.id)

  editor.canvas.assertNoErrors()
})

test('present runs the prototype: enter, click-navigate, exit', async () => {
  await editor.canvas.selectTool('frame')
  await editor.canvas.drag(40, 40, 340, 240)
  await editor.canvas.waitForRender()
  const frameA = expectDefined(await getSelectedNode(editor.page), 'frame A')

  await editor.canvas.selectTool('frame')
  await editor.canvas.drag(380, 40, 680, 240)
  await editor.canvas.waitForRender()
  const frameB = expectDefined(await getSelectedNode(editor.page), 'frame B')

  // Frames default to the same name; rename them so the destination option
  // can be targeted unambiguously.
  const names = await editor.page.evaluate(
    (ids) => {
      const store = window.openPencil?.getStore?.()
      if (!store) throw new Error('OpenPencil store not initialized')
      return ids.map((id, index) => {
        const n = store.graph.getNode(id)
        if (!n) throw new Error(`missing node ${id}`)
        const name = index === 0 ? 'Proto Start' : 'Proto Target'
        store.graph.updateNode(id, { name })
        return name
      })
    },
    [frameA.id, frameB.id]
  )

  // Select frame A and author click → navigate to frame B.
  await editor.canvas.click(190, 140)
  await editor.page.waitForFunction((id) => {
    const store = window.openPencil?.getStore?.()
    return store?.state.selectedIds.has(id) === true
  }, frameA.id)

  const section = propertySection(editor.page, 'Prototype')
  // Pin the flow entry to frame A so presentation starts here even though
  // earlier tests (and demo content) have touched the root flow document.
  await section.getByRole('button', { name: 'Set as flow start' }).click()
  await editor.canvas.waitForRender()
  await section.locator('[data-property="add-interaction"]').click()
  await editor.canvas.waitForRender()
  await section.getByRole('combobox', { name: 'Destination' }).click()
  await editor.page.getByRole('option', { name: names[1], exact: true }).click()
  await editor.canvas.waitForRender()

  const authored = expectDefined(
    await pluginValue<InteractionRecord[]>(frameA.id, 'interactions'),
    'interactions'
  )
  expect(authored[0]?.action).toMatchObject({
    type: 'navigate',
    destinationId: frameB.id
  })

  // Enter presentation: preview state active, selection cleared.
  await editor.page.getByTestId('prototype-present-button').click()
  await editor.page.waitForFunction(() => {
    const store = window.openPencil?.getStore?.()
    return store?.state.prototypePreview != null
  })
  expect(
    await editor.page.evaluate(() => {
      const store = window.openPencil?.getStore?.()
      if (!store) throw new Error('OpenPencil store not initialized')
      return store.state.selectedIds.size
    })
  ).toBe(0)

  // Click frame A in the presentation surface → navigate to B.
  await clickNodeInPlayer(editor.page, frameA.id)

  await editor.page.waitForFunction(
    (id) => {
      const store = window.openPencil?.getStore?.()
      const preview = store?.state.prototypePreview
      return preview != null && preview.drawIds.length === 1 && preview.drawIds[0] === id
    },
    frameB.id,
    { timeout: 5000 }
  )

  // Exit presentation.
  await closePlayer(editor.page)

  editor.canvas.assertNoErrors()
})
