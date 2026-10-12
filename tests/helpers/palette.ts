import { expect, type Page } from '@playwright/test'

/**
 * Command palette helpers. The menubar (Shell/AppMenu.vue) was removed around
 * `02deb986`; every menu command now surfaces through the palette
 * (CommandPalette.vue, groups from useAppMenu) opened with Ctrl/Cmd+K.
 */
export function paletteShortcut(): string {
  return process.platform === 'darwin' ? 'ControlOrMeta+KeyK' : 'Control+KeyK'
}

export async function openPalette(page: Page) {
  await page.keyboard.press(paletteShortcut())
  const palette = page.getByRole('dialog', { name: 'Command palette' })
  await expect(palette).toBeVisible()
  return palette
}

export async function closePalette(page: Page) {
  await page.keyboard.press('Escape')
  await expect(page.getByRole('dialog', { name: 'Command palette' })).not.toBeVisible()
}

/** Open the palette and filter it to a query, ready for option selection. */
export async function searchPalette(page: Page, query: string) {
  const palette = await openPalette(page)
  await palette.getByRole('searchbox', { name: 'Search commands' }).fill(query)
  return palette
}

/**
 * Run the top-ranked command for a query. Option accessible names include
 * their shortcut (e.g. "Copy Ctrl C"), so exact-label matching is unreliable;
 * the search ranking puts the exact command first — the same result a person
 * gets from type-and-Enter. The expected label still guards the ranking.
 */
export async function runPaletteCommand(page: Page, query: string, expected: string | RegExp) {
  const palette = await searchPalette(page, query)
  const first = palette.getByRole('option').first()
  await expect(first).toContainText(expected)
  await first.click()
}
