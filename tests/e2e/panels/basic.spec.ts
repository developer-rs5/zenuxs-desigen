import { expect, test, useEditorSetup } from '#tests/e2e/fixtures'
import { expectDefined } from '#tests/helpers/assert'

const editor = useEditorSetup('/editor')

test('layers panel resize increases width', async () => {
  const panel = editor.page.getByTestId('layers-panel')
  const before = await panel.boundingBox()
  expect(before).not.toBeNull()

  const handle = editor.page.getByTestId('left-splitter-handle')
  const handleBox = await handle.boundingBox()
  expect(handleBox).not.toBeNull()

  const handleBounds = expectDefined(handleBox, 'splitter handle bounds')
  const beforeBounds = expectDefined(before, 'layers panel bounds')
  const cx = handleBounds.x + handleBounds.width / 2
  const cy = handleBounds.y + handleBounds.height / 2

  await editor.page.mouse.move(cx, cy)
  await editor.page.mouse.down()
  await editor.page.mouse.move(cx + 80, cy, { steps: 10 })
  await editor.page.mouse.up()
  await editor.canvas.waitForRender()

  const after = expectDefined(await panel.boundingBox(), 'resized layers panel bounds')
  expect(after.width).toBeGreaterThan(beforeBounds.width + 40)
  editor.canvas.assertNoErrors()
})

test('panel width persists after page reload', async () => {
  // Allow Reka's auto-save debounce to flush before recording the width
  await editor.page.waitForTimeout(300)
  const recordedWidth = expectDefined(
    await editor.page.getByTestId('layers-panel').boundingBox(),
    'persisted layers panel bounds'
  ).width

  // Reloading while the never-persisted Untitled tab is in the session makes initTabsSession
  // restore it, 404 on the missing document and drop the tab onto the home tab. Clear the tab
  // session first so the reload boots the same fresh document tab state this file starts in;
  // the splitter layout itself is what has to survive the reload.
  await editor.page.evaluate(() => {
    // oxlint-disable-next-line open-pencil/no-direct-storage-access -- browser-context script cannot import the src storage module (same precedent as restore.spec.ts)
    localStorage.removeItem('zenuxs:tabs:session')
  })
  await editor.page.reload()
  await editor.canvas.waitForInit()

  const layersPanel = editor.page.getByTestId('layers-panel')
  await expect(layersPanel).toBeVisible()
  const after = expectDefined(await layersPanel.boundingBox(), 'reloaded layers panel bounds')
  expect(Math.abs(after.width - recordedWidth)).toBeLessThanOrEqual(2)
  editor.canvas.assertNoErrors()
})

test('Cmd+Backslash hides panels', async () => {
  await editor.page.keyboard.press('ControlOrMeta+\\')
  await editor.canvas.waitForRender()

  await expect(editor.page.getByTestId('layers-panel')).not.toBeVisible()
  editor.canvas.assertNoErrors()
})

test('Cmd+Backslash shows panels again', async () => {
  await editor.page.keyboard.press('ControlOrMeta+\\')
  await editor.canvas.waitForRender()

  await expect(editor.page.getByTestId('layers-panel')).toBeVisible()
  editor.canvas.assertNoErrors()
})
