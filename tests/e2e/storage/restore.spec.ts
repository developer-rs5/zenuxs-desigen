import { expect, test } from '@playwright/test'

test('session restore drops a dead remote tab without an error toast', async ({ page }) => {
  await page.route('**/api/documents/**', (route) =>
    route.fulfill({
      status: 404,
      contentType: 'application/json',
      body: JSON.stringify({ error: 'Document not found' })
    })
  )
  await page.addInitScript(() => {
    localStorage.setItem(
      'zenuxs:tabs:session',
      JSON.stringify({
        activeId: 'dead-tab',
        tabs: [
          { id: 'dead-tab', kind: 'document', documentId: 'missing-doc', documentName: 'Untitled' }
        ]
      })
    )
  })

  await page.goto('/editor')

  // The dead entry is pruned from the persisted session (with the bug it stays
  // forever, so this wait times out), then no open-failure toast may appear.
  await page.waitForFunction(
    () => !(localStorage.getItem('zenuxs:tabs:session') ?? '').includes('missing-doc')
  )
  await expect(page.getByTestId('toast-item').filter({ hasText: 'Could not open' })).toHaveCount(0)
})
