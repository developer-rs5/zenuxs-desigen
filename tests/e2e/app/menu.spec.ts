import { expect, test, useEditorSetup } from '#tests/e2e/fixtures'

const editor = useEditorSetup('/editor')

// The menubar (src/components/Shell/AppMenu.vue) was removed around 02deb986;
// the File/Edit/View/Object/Text/Arrange menu schema now surfaces through the
// command palette (src/components/commands/CommandPalette.vue, groups from
// useAppMenu). Open it the way the product does: Ctrl/Cmd+K.
function commandPaletteShortcut() {
  return process.platform === 'darwin' ? 'ControlOrMeta+KeyK' : 'Control+KeyK'
}

async function openPalette() {
  await editor.page.keyboard.press(commandPaletteShortcut())
  const palette = editor.page.getByRole('dialog', { name: 'Command palette' })
  await expect(palette).toBeVisible()
  return palette
}

async function closePalette() {
  await editor.page.keyboard.press('Escape')
  await expect(editor.page.getByRole('dialog', { name: 'Command palette' })).not.toBeVisible()
}

async function searchPalette(query: string) {
  const palette = await openPalette()
  await palette.getByRole('searchbox', { name: 'Search commands' }).fill(query)
  return palette
}

test('command palette exposes every menu group', async () => {
  const probes: [query: string, group: string][] = [
    ['', 'File'],
    ['undo', 'Edit'],
    ['zoom', 'View'],
    ['component', 'Object'],
    ['bold', 'Text'],
    ['align', 'Arrange']
  ]
  for (const [query, group] of probes) {
    const palette = query ? await searchPalette(query) : await openPalette()
    await expect(palette.getByText(group, { exact: true })).toBeVisible()
    await closePalette()
  }
})

test('File group lists its commands in the palette', async () => {
  const palette = await openPalette()

  const items = await palette.getByRole('option').allTextContents()
  expect(items.some((t) => t.includes('Open'))).toBe(true)
  expect(items.some((t) => t.includes('Open storage workspace'))).toBe(true)
  expect(items.some((t) => t.includes('Save'))).toBe(true)
  expect(items.some((t) => t.includes('Save as'))).toBe(true)

  await closePalette()
})

test('Edit group lists Undo, Redo, Delete, and Select all', async () => {
  const expectations: [query: string, name: string][] = [
    ['undo', 'Undo'],
    ['redo', 'Redo'],
    ['delete', 'Delete'],
    ['select all', 'Select all']
  ]
  for (const [query, name] of expectations) {
    const palette = await searchPalette(query)
    await expect(palette.getByRole('option', { name, exact: true })).toBeVisible()
    await closePalette()
  }
})

test('View group lists zoom commands', async () => {
  const palette = await searchPalette('zoom')

  const items = await palette.getByRole('option').allTextContents()
  expect(items.some((t) => t.includes('Zoom to fit'))).toBe(true)
  expect(items.some((t) => t.includes('Zoom in'))).toBe(true)
  expect(items.some((t) => t.includes('Zoom out'))).toBe(true)

  await closePalette()
})

test('Object group lists Group, Ungroup, and Component commands', async () => {
  const expectations: [query: string, name: string][] = [
    ['group', 'Group selection'],
    ['group', 'Ungroup'],
    ['component', 'Create component'],
    ['front', 'Bring to front'],
    ['back', 'Send to back']
  ]
  for (const [query, name] of expectations) {
    const palette = await searchPalette(query)
    await expect(palette.getByRole('option', { name, exact: true })).toBeVisible()
    await closePalette()
  }
})

function getStoreStateNumber(key: 'selectedIds' | 'zoom') {
  return editor.page.evaluate((stateKey) => {
    const store = window.openPencil?.getStore?.()
    if (!store) throw new Error('OpenPencil store not initialized')
    if (stateKey === 'selectedIds') return store.state.selectedIds.size
    return store.state.zoom
  }, key)
}

test('Delete is disabled in the palette without a selection and enabled with one', async () => {
  // The old menubar asserted this through the disabled "Move to page" entry.
  // "Move to page" no longer renders in the palette at all (buildEntry returns
  // it without a menuId and paletteEntries only emits menuId entries), and the
  // canvas context menu hides it instead of disabling it, so the same
  // selection-gated command state is asserted through Delete.
  let palette = await searchPalette('delete')
  await expect(palette.getByRole('option', { name: 'Delete', exact: true })).toHaveAttribute(
    'data-disabled'
  )
  await closePalette()

  await editor.canvas.drawRect(200, 200, 100, 100)
  palette = await searchPalette('delete')
  await expect(palette.getByRole('option', { name: 'Delete', exact: true })).not.toHaveAttribute(
    'data-disabled'
  )
  await closePalette()

  await editor.page.evaluate(() => {
    const store = window.openPencil?.getStore?.()
    if (!store) throw new Error('OpenPencil store not initialized')
    for (const id of store.state.selectedIds) store.graph.deleteNode(id)
    store.clearSelection()
    store.undo.clear()
  })
})

test('Undo via the command palette works', async () => {
  await editor.canvas.drawRect(200, 200, 100, 100)
  const beforeUndo = await getStoreStateNumber('selectedIds')
  expect(beforeUndo).toBe(1)

  const palette = await searchPalette('undo')
  await palette.getByRole('option', { name: 'Undo', exact: true }).click()
  await editor.canvas.waitForRender()

  const afterUndo = await getStoreStateNumber('selectedIds')
  expect(afterUndo).toBe(0)
})

test('Duplicate via the command palette works', async () => {
  await editor.canvas.drawRect(300, 300, 80, 80)

  const countBefore = await editor.page.evaluate(() => {
    const store = window.openPencil?.getStore?.()
    if (!store) throw new Error('OpenPencil store not initialized')
    return store.graph.getChildren(store.state.currentPageId).length
  })

  const palette = await searchPalette('duplicate')
  await palette.getByRole('option', { name: 'Duplicate', exact: true }).click()
  await editor.canvas.waitForRender()

  const countAfter = await editor.page.evaluate(() => {
    const store = window.openPencil?.getStore?.()
    if (!store) throw new Error('OpenPencil store not initialized')
    return store.graph.getChildren(store.state.currentPageId).length
  })

  expect(countAfter).toBe(countBefore + 1)
})

test('Zoom in and Zoom to fit via the command palette change the viewport', async () => {
  let palette = await searchPalette('zoom in')
  await palette.getByRole('option', { name: 'Zoom in' }).click()
  await editor.canvas.waitForRender()

  const zoomBefore = await getStoreStateNumber('zoom')
  expect(zoomBefore).toBeGreaterThan(1)

  palette = await searchPalette('zoom to fit')
  await palette.getByRole('option', { name: 'Zoom to fit', exact: true }).click()
  await editor.canvas.waitForRender()

  const zoomAfter = await getStoreStateNumber('zoom')
  expect(zoomAfter).not.toBe(zoomBefore)
})

test('Open storage workspace navigates from the command palette', async () => {
  const palette = await openPalette()
  await palette.getByRole('option', { name: 'Open storage workspace' }).click()

  // openStorageWorkspace pushes '/editor' (router.ts '/storage' redirects there).
  await expect(editor.page).toHaveURL(/\/editor$/)
  await expect(editor.page.getByTestId('recent-files-home')).toBeVisible()
  await expect(editor.page.getByRole('heading', { name: 'Storage workspace' })).toBeVisible()
})
