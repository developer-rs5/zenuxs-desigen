import { expect, test } from '@playwright/test'

import { CanvasHelper } from '#tests/helpers/canvas'
import { runPaletteCommand } from '#tests/helpers/palette'

test.beforeEach(async ({ page }) => {
  // These specs reload two or three times; a fresh editor boot alone can take
  // several seconds, so give each test room beyond the 15s default.
  test.setTimeout(30_000)
  // The persisted tab session restores a document that never exists on the
  // test backend, so reload drops to the Home tab where the editor chrome
  // (settings trigger, canvas) is not rendered. Clearing the session makes
  // every load start from a fresh editor document instead.
  await page.addInitScript(() => {
    // oxlint-disable-next-line open-pencil/no-direct-storage-access -- browser-context init script cannot import the src storage module
    localStorage.removeItem('zenuxs:tabs:session')
  })
})

test('language can be changed from General settings and persists', async ({ page }) => {
  await page.goto('/editor?test')
  const canvas = new CanvasHelper(page)
  await canvas.waitForInit()

  await page.getByTestId('app-settings-trigger').click()
  await page.getByTestId('settings-language').click()
  await page.getByRole('option', { name: 'Русский' }).click()
  await expect(page.getByTestId('app-settings-dialog')).toContainText('Настройки')

  await page.reload()
  await canvas.waitForInit()
  await page.getByTestId('app-settings-trigger').click()
  await expect(page.getByTestId('settings-language')).toContainText('Русский')

  await page.getByTestId('settings-language').click()
  await page.getByRole('option', { name: 'English' }).click()
  await expect(page.getByTestId('app-settings-dialog')).toContainText('Settings')
})

test('general snapping preferences persist and apply to editor sessions', async ({ page }) => {
  await page.goto('/editor?test')
  const canvas = new CanvasHelper(page)
  await canvas.waitForInit()

  await page.getByTestId('app-settings-trigger').click()
  await expect(page.getByTestId('settings-general-panel')).toBeVisible()
  const geometry = page.getByRole('switch', { name: 'Snap to geometry' })
  const objects = page.getByRole('switch', { name: 'Snap to objects' })
  const pixelGrid = page.getByRole('switch', { name: 'Snap to pixel grid' })
  await expect(geometry).toBeChecked()
  await expect(objects).toBeChecked()
  await expect(pixelGrid).toBeChecked()

  await geometry.click()
  await objects.click()
  await pixelGrid.click()
  await expect
    .poll(() =>
      page.evaluate(() => window.openPencil?.getStore?.().state.snappingPreferences ?? null)
    )
    .toEqual({ geometry: false, objects: false, pixelGrid: false })

  await page.getByTestId('app-settings-done').click()
  await page.reload()
  await canvas.waitForInit()
  await page.getByTestId('app-settings-trigger').click()
  await expect(geometry).not.toBeChecked()
  await expect(objects).not.toBeChecked()
  await expect(pixelGrid).not.toBeChecked()
  await expect(
    page.evaluate(() => window.openPencil?.getStore?.().state.snappingPreferences ?? null)
  ).resolves.toEqual({ geometry: false, objects: false, pixelGrid: false })

  await geometry.click()
  await objects.click()
  await pixelGrid.click()
})

test('progressive tiled rendering preference persists and URL overrides take precedence', async ({
  page
}) => {
  await page.goto('/editor?test')
  const canvas = new CanvasHelper(page)
  await canvas.waitForInit()

  await page.getByTestId('app-settings-trigger').click()
  const tiled = page.getByRole('switch', { name: 'Progressive tiled canvas rendering' })
  await expect(tiled).not.toBeChecked()
  await tiled.click()
  await expect(page.getByText(/Reload .+ to apply this change\./)).toBeVisible()

  await page.reload()
  await canvas.waitForInit()
  await page.getByTestId('app-settings-trigger').click()
  await expect(tiled).toBeChecked()
  await expect(
    page.evaluate(() =>
      window.openPencil
        ?.getStore?.()
        .canvasRenderers.some(
          (renderer) => renderer.tracksSceneSettlement && renderer.tiledSceneEnabled
        )
    )
  ).resolves.toBe(true)

  await page.goto('/editor?test&renderer=retained')
  await canvas.waitForInit()
  await page.getByTestId('app-settings-trigger').click()
  await expect(tiled).toBeChecked()
  await expect(
    page.getByText(/current session renderer is controlled by a URL override/i)
  ).toBeVisible()
  await expect(
    page.evaluate(() =>
      window.openPencil
        ?.getStore?.()
        .canvasRenderers.every(
          (renderer) => !renderer.tracksSceneSettlement || !renderer.tiledSceneEnabled
        )
    )
  ).resolves.toBe(true)

  await tiled.click()
})

test('Preferences menu snapping controls use the same preferences', async ({ page }) => {
  await page.goto('/editor?test')
  const canvas = new CanvasHelper(page)
  await canvas.waitForInit()

  // The View menubar was removed; its Preferences commands surface in the
  // command palette instead. Assert the shared state through Settings.
  const geometry = page.getByRole('switch', { name: 'Snap to geometry' })
  const objects = page.getByRole('switch', { name: 'Snap to objects' })
  const pixelGrid = page.getByRole('switch', { name: 'Snap to pixel grid' })
  await page.getByTestId('app-settings-trigger').click()
  await expect(geometry).toBeChecked()
  await expect(objects).toBeChecked()
  await expect(pixelGrid).toBeChecked()
  await page.getByTestId('app-settings-done').click()

  await runPaletteCommand(page, 'Snap to objects', 'Snap to objects')

  await page.getByTestId('app-settings-trigger').click()
  await expect(objects).not.toBeChecked()
  await expect(geometry).toBeChecked()
  await expect(pixelGrid).toBeChecked()
  await objects.click()
  await expect(objects).toBeChecked()
})

test('settings shortcut preserves the last visited section', async ({ page }) => {
  await page.goto('/editor?test')
  const canvas = new CanvasHelper(page)
  await canvas.waitForInit()

  await page.getByTestId('app-settings-trigger').click()
  await page.getByTestId('settings-section-media').click()
  await page.getByTestId('app-settings-done').click()

  await page.keyboard.press(process.platform === 'darwin' ? 'ControlOrMeta+,' : 'Control+,')
  await expect(page.getByTestId('settings-media-panel')).toBeVisible()
})
