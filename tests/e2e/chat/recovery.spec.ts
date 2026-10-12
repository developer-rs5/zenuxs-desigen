import { CanvasHelper } from '#tests/helpers/canvas'
import { test, expect } from '#tests/helpers/chat/fixture'
import { injectMockChatTransport } from '#tests/helpers/chat/transport'

test('recovering an unsaved document restores its selected conversation automatically', async ({
  configuredChat: chat,
  page
}) => {
  test.setTimeout(45_000)
  // Recovery copies are opt-in (Settings → Preserve unsaved work) and default to off
  // since e247e443; seed the persisted preference the toggle writes.
  await page.addInitScript(() => {
    // oxlint-disable-next-line open-pencil/no-direct-storage-access
    localStorage.setItem(
      'open-pencil:preferences:v1',
      JSON.stringify({ recovery: { enabled: true } })
    )
  })
  // Reload so the preference is live for this document's recovery controller, and drop
  // the tab session: restoring it 404s on the never-saved server document and falls
  // back to the home tab.
  await page.evaluate(() => {
    // oxlint-disable-next-line open-pencil/no-direct-storage-access
    localStorage.removeItem('zenuxs:tabs:session')
  })
  await page.reload()
  await new CanvasHelper(page).waitForInit()
  // The mock transport is installed with a one-shot evaluate, so re-install it once the
  // app is booted again after the reload that activates the recovery preference.
  await injectMockChatTransport(page)
  await chat.chatTab.click()
  await page.evaluate(async () => {
    const editor = window.openPencil?.getStore?.()
    if (!editor) throw new Error('Missing editor')
    // Every tab auto-binds to the storage provider (9dfd0290) and both a writable
    // source and autosave suppress (then undo) recovery identity: drop the binding,
    // turn autosave off, and the document stays genuinely unsaved — the state recovery
    // exists for.
    editor.setDocumentSource('Untitled', 'fig')
    editor.state.autosaveEnabled = false
    editor.createShape('RECTANGLE', 100, 100, 200, 100)
    await editor.persistRecoveryNow()
  })
  await chat.submit('Conversation belonging to recovered document')
  await expect(chat.assistantMessage()).toBeVisible()
  // Switching conversations forces a durable flush; choose the original before reload.
  await page.getByRole('button', { name: 'New chat', exact: true }).click()
  await page.getByRole('button', { name: 'Conversation history', exact: true }).click()
  await page
    .getByRole('button', { name: 'Conversation belonging to recovered document', exact: true })
    .click()
  await page.reload()
  await new CanvasHelper(page).waitForInit()
  // The reloaded tab auto-binds to the storage provider again, and chatDocumentId
  // prefers that binding over the recovery identity the snapshot carries — dropping it
  // keeps the restored document addressing the same conversation as before the reload.
  await page.evaluate(() => {
    const editor = window.openPencil?.getStore?.()
    if (!editor) throw new Error('Missing editor')
    // chatDocumentId prefers the auto-rebound storage binding over the recovery
    // identity the snapshot carries, and autosave re-binds right after the restore.
    editor.state.autosaveEnabled = false
    editor.setDocumentSource('Untitled', 'fig')
  })
  await expect(page.getByRole('alertdialog', { name: 'Recover unsaved work' })).toBeVisible()
  await page.getByRole('button', { name: 'Restore', exact: true }).click()
  await chat.chatTab.click()
  await expect(chat.userMessage()).toContainText('Conversation belonging to recovered document')
  await expect(chat.assistantMessage()).toBeVisible()
  await expect(
    page.getByRole('button', { name: 'Conversation history', exact: true })
  ).toContainText('Conversation belonging to recovered document')
})
