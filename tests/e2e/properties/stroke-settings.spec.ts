import { expect, test } from '@playwright/test'

import { CanvasHelper } from '#tests/helpers/canvas'

for (const theme of ['light', 'dark']) {
  test(`stroke settings editing and dismissal in ${theme}`, async ({ page }) => {
    // Set the persisted theme before the app boots: the runtime
    // `await import('/src/app/shell/theme.ts')` path intermittently dies with
    // "Resulting promise was garbage collected" (Chromium collects the awaited
    // promise even after it settles). `useAppTheme` reads this key at module
    // init, so boot-time localStorage gives the same applied theme with a
    // fully synchronous evaluate below.
    await page.addInitScript((mode) => {
      // oxlint-disable-next-line open-pencil/no-direct-storage-access -- browser-context init script cannot import the src storage module (same precedent as delete-project.spec.ts / restore.spec.ts)
      window.localStorage.setItem('open-pencil:theme', mode)
    }, theme)
    await page.goto('/editor?test')
    await new CanvasHelper(page).waitForInit()
    await expect.poll(() => page.evaluate(() => document.documentElement.dataset.theme)).toBe(theme)
    const ids = await page.evaluate(() => {
      const editor = window.openPencil?.getStore?.()
      if (!editor) throw new Error('Editor unavailable')
      const id = editor.createShape('RECTANGLE', 100, 100, 180, 120)
      const line = editor.createShape('LINE', 100, 300, 180, 0)
      for (const target of [id, line])
        editor.updateNode(target, {
          strokes: [
            {
              color: { r: 0, g: 0, b: 0, a: 1 },
              weight: 2,
              opacity: 1,
              visible: true,
              align: 'CENTER'
            }
          ]
        })
      editor.select([id])
      return { id, line }
    })
    const section = page.getByRole('region', { name: 'Stroke', exact: true })
    await expect(section).toHaveScreenshot(`stroke-main-${theme}.png`)
    const trigger = section.getByRole('button', { name: 'Stroke settings' })
    await trigger.click()
    const dialog = page.getByRole('dialog', { name: 'Stroke settings' })
    await dialog.getByRole('switch', { name: 'Dashed stroke' }).click()
    const dash = dialog.getByRole('spinbutton', { name: 'Dash', exact: true })
    await dash.focus()
    await dash.fill('10')
    await dash.press('Enter')
    await expect
      .poll(() =>
        page.evaluate(
          (id) => window.openPencil?.getStore?.().graph.getNode(id)?.strokes[0].dashPattern?.[0],
          ids.id
        )
      )
      .toBe(10)
    await expect(dialog).toHaveScreenshot(`stroke-dashed-${theme}.png`)
    await page.keyboard.press('Escape')
    await expect(dialog).toHaveCount(0)
    await expect(trigger).toBeFocused()
    await trigger.click()
    await page.evaluate((id) => window.openPencil?.getStore?.().select([id]), ids.line)
    await dialog.getByRole('button', { name: 'Round cap', exact: true }).click()
    await expect
      .poll(() =>
        page.evaluate(
          (id) => window.openPencil?.getStore?.().graph.getNode(id)?.strokeCap,
          ids.line
        )
      )
      .toBe('ROUND')
    await expect
      .poll(() =>
        page.evaluate((id) => window.openPencil?.getStore?.().graph.getNode(id)?.strokeCap, ids.id)
      )
      .toBe('NONE')
    await expect(dialog).toHaveScreenshot(`stroke-line-${theme}.png`)
  })
}
