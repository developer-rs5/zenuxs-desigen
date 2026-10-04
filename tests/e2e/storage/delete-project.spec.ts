import { expect, test } from '@playwright/test'

const RECENT_KEY = 'open-pencil:recent-documents'

test('deleting a project clears it from Home recents and the workspace list', async ({ page }) => {
  test.setTimeout(30_000)
  await page.addInitScript((key) => {
    localStorage.setItem(
      key,
      JSON.stringify([
        {
          id: 'storage:server-mongodb:doomed',
          kind: 'storage',
          providerId: 'server-mongodb',
          documentId: 'doomed',
          name: 'Doomed Design',
          updatedAt: '2026-01-01T00:00:00.000Z'
        }
      ])
    )
  }, RECENT_KEY)

  let deleted = false
  await page.route('**/api/documents', (route) => {
    if (route.request().method() !== 'GET') return route.fallback()
    return route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        documents: deleted
          ? []
          : [
              {
                documentId: 'doomed',
                ownerSub: 'test',
                title: 'Doomed Design',
                version: 1,
                updatedAt: '2026-01-01T00:00:00.000Z'
              }
            ]
      })
    })
  })
  await page.route('**/api/documents/doomed', (route) => {
    if (route.request().method() !== 'DELETE') return route.fallback()
    deleted = true
    return route.fulfill({ status: 204, body: '' })
  })

  await page.goto('/editor?recent-files')
  await expect(page.getByTestId('recent-files-home')).toBeVisible()
  // Recent files + workspace cloud both show the project.
  await expect(page.getByText('Doomed Design', { exact: true })).toHaveCount(2)

  // TopBar (and the Projects button) only render on a document tab.
  await page.getByTestId('home-new-document').click()
  await page.getByTestId('topbar-projects-button').click()
  await expect(page.getByText('Doomed Design', { exact: true })).toHaveCount(3)
  await page.getByRole('button', { name: 'Delete project' }).click()
  await page.getByRole('button', { name: 'Delete', exact: true }).click()
  await page.waitForResponse(
    (response) =>
      response.url().includes('/api/documents/doomed') && response.request().method() === 'DELETE'
  )

  await page.keyboard.press('Escape')
  await expect
    .poll(() => page.evaluate((key) => localStorage.getItem(key), RECENT_KEY))
    .not.toContain('doomed')
  await expect(page.getByText('Doomed Design', { exact: true })).toHaveCount(0)
})
