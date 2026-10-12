import { expect, test } from '@playwright/test'

// Storybook runs on its own dev server (see playwright.config.ts webServer[1]).
test.use({ baseURL: 'http://localhost:6006' })

for (const theme of ['light', 'dark']) {
  test(`adjacent hovered layer does not overlap selected row in ${theme}`, async ({ page }) => {
    await page.goto(
      `/iframe.html?id=editor-layer-tree--virtualized&viewMode=story&globals=theme:${theme}`
    )
    await page.getByRole('treeitem').nth(1).hover()
    await expect(page.locator('#storybook-root')).toHaveScreenshot(
      `layer-tree-adjacent-hover-${theme}.png`
    )
  })
}
