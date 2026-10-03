import type { Page } from '@playwright/test'
import { expect, test } from '@playwright/test'

import { CanvasHelper } from '#tests/helpers/canvas'

const PNG_1X1 =
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg=='

async function openEditor(page: Page): Promise<void> {
  await page.goto('/editor')
  await new CanvasHelper(page).waitForInit()
}

async function putImageInClipboard(page: Page): Promise<void> {
  await page.evaluate(async (base64) => {
    const bytes = Uint8Array.from(atob(base64), (c) => c.charCodeAt(0))
    const blob = new Blob([bytes], { type: 'image/png' })
    await navigator.clipboard.write([new ClipboardItem({ 'image/png': blob })])
  }, PNG_1X1)
}

async function putImageHTMLInClipboard(page: Page): Promise<void> {
  await page.evaluate(async (base64) => {
    const html = `<img src="data:image/png;base64,${base64}" alt="pasted">`
    await navigator.clipboard.write([
      new ClipboardItem({ 'text/html': new Blob([html], { type: 'text/html' }) })
    ])
  }, PNG_1X1)
}

function imageNodeCount(page: Page): Promise<number> {
  return page.evaluate(() => {
    const store = window.openPencil?.getStore?.()
    if (!store) throw new Error('OpenPencil store not initialized')
    return store.graph
      .getChildren(store.state.currentPageId)
      .filter(
        (node) =>
          'fills' in node &&
          Array.isArray(node.fills) &&
          node.fills.some((fill) => fill.type === 'IMAGE')
      ).length
  })
}

test.beforeEach(async ({ page, context }) => {
  await context.grantPermissions(['clipboard-read', 'clipboard-write'], {
    origin: 'http://localhost:1420'
  })
  await openEditor(page)
})

test('Ctrl+V pastes an image from the system clipboard', async ({ page }) => {
  await putImageInClipboard(page)
  await page.locator('[data-test-id="canvas-element"]').click({ position: { x: 300, y: 300 } })
  await page.keyboard.press('Control+V')
  await expect.poll(() => imageNodeCount(page)).toBe(1)
})

test('Ctrl+V pastes an image from clipboard HTML data URI', async ({ page }) => {
  await putImageHTMLInClipboard(page)
  await page.locator('[data-test-id="canvas-element"]').click({ position: { x: 300, y: 300 } })
  await page.keyboard.press('Control+V')
  await expect.poll(() => imageNodeCount(page)).toBe(1)
})

test('context menu paste inserts an image from the system clipboard', async ({ page }) => {
  await putImageInClipboard(page)
  await page.locator('[data-test-id="canvas-element"]').click({
    position: { x: 300, y: 300 },
    button: 'right'
  })
  await page.getByTestId('context-paste').click()
  await expect.poll(() => imageNodeCount(page)).toBe(1)
})
