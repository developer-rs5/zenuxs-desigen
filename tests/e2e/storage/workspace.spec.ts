import { readFileSync } from 'node:fs'

import { expect, test, type Page } from '@playwright/test'

import { CanvasHelper } from '#tests/helpers/canvas'

// 9dfd0290 switched the default provider to `server-mongodb`, which has no preference or
// credential fields, and left the S3 provider reachable only through the persisted provider
// preference (`activeStorageProviderID` is a `useLocalStorage` ref with no settings UI).
// Seed that preference — plus the complete S3 preferences the startup migration requires —
// so the panel renders its Endpoint/Bucket fields and the workspace stays on S3.
async function useS3StorageProvider(page: Page): Promise<void> {
  await page.addInitScript(() => {
    // oxlint-disable-next-line open-pencil/no-direct-storage-access -- browser-context init script cannot import the src storage module (same precedent as restore.spec.ts)
    localStorage.setItem('open-pencil:storage:provider', 's3-compatible')
    // oxlint-disable-next-line open-pencil/no-direct-storage-access -- browser-context init script cannot import the src storage module (same precedent as restore.spec.ts)
    localStorage.setItem(
      'open-pencil:storage:preferences',
      JSON.stringify({
        's3-compatible': {
          endpoint: 'https://s3.example.com',
          bucket: 'designs',
          region: ''
        }
      })
    )
  })
}

test('configured storage lists previews through ranges before opening the document', async ({
  page
}) => {
  // Decoding the 550KB fixture in the dev build alone takes ~9s (measured phase breakdown:
  // read 0.1s, decode 8.6s, prepare page 2s), so this end-to-end flow exceeds the 15s default.
  test.setTimeout(45_000)
  await useS3StorageProvider(page)
  const fixture = readFileSync('tests/fixtures/gold-preview.fig')
  let fullDocumentGets = 0
  let rangeGets = 0
  await page.route('https://s3.example.com/**', async (route) => {
    const url = new URL(route.request().url())
    if (url.searchParams.get('list-type') === '2') {
      await route.fulfill({
        contentType: 'application/xml',
        body: `<ListBucketResult>
          <IsTruncated>false</IsTruncated>
          <Contents>
            <Key>open_pencil_storage/canvases/remote-1.fig</Key>
            <LastModified>2026-01-02T03:04:05.000Z</LastModified>
            <Size>${fixture.byteLength}</Size>
          </Contents>
        </ListBucketResult>`
      })
      return
    }
    if (url.pathname.endsWith('/remote-1.meta.json')) {
      await route.fulfill({
        contentType: 'application/json',
        body: JSON.stringify({ name: 'Remote design', updatedAt: '2026-01-02T03:04:05.000Z' })
      })
      return
    }
    if (url.pathname.endsWith('/remote-1.fig') && route.request().headers().range) {
      const range = route.request().headers().range
      const explicit = range?.match(/^bytes=(\d+)-(\d+)$/)
      const suffix = range?.match(/^bytes=-(\d+)$/)
      let start: number
      let end: number
      if (explicit) {
        start = Number(explicit[1])
        end = Math.min(Number(explicit[2]), fixture.byteLength - 1)
      } else if (suffix) {
        const length = Math.min(Number(suffix[1]), fixture.byteLength)
        start = fixture.byteLength - length
        end = fixture.byteLength - 1
      } else {
        await route.fulfill({ status: 416 })
        return
      }
      if (!Number.isSafeInteger(start) || !Number.isSafeInteger(end) || start < 0 || end < start) {
        await route.fulfill({ status: 416 })
        return
      }
      await route.fulfill({
        status: 206,
        headers: {
          'Content-Range': `bytes ${start}-${end}/${fixture.byteLength}`
        },
        contentType: 'application/octet-stream',
        body: fixture.subarray(start, end + 1)
      })
      rangeGets++
      return
    }
    if (url.pathname.endsWith('/remote-1.fig') && route.request().method() === 'HEAD') {
      await route.fulfill({
        status: 200,
        headers: { 'Content-Length': String(fixture.byteLength) }
      })
      return
    }
    if (url.pathname.endsWith('/remote-1.fig')) {
      fullDocumentGets++
      await route.fulfill({ contentType: 'application/octet-stream', body: fixture })
      return
    }
    await route.fulfill({ status: 404 })
  })

  await page.goto('/storage?test')
  const canvas = new CanvasHelper(page)
  await canvas.waitForInit()
  await page.keyboard.press('ControlOrMeta+KeyN')
  await page.getByRole('button', { name: 'Settings' }).last().click()
  await page.getByTestId('settings-section-storage').click()
  await page.getByLabel('Endpoint').fill('https://s3.example.com')
  await page.getByLabel('Bucket').fill('designs')

  for (const [field, value] of [
    ['access-key-id', 'access-key'],
    ['secret-access-key', 'secret-key']
  ] as const) {
    const container = page.locator(`[data-credential="${field}"]`)
    await container.locator('input').fill(value)
    await container.getByRole('button', { name: 'Save' }).click()
  }

  await page.getByTestId('settings-storage-open-workspace').click()
  await expect(page.getByTestId('recent-files-home')).toBeVisible()
  await page.getByRole('button', { name: 'Refresh', exact: true }).click()
  const entry = page.getByRole('button', { name: /Remote design/ })
  await expect(entry).toBeVisible()
  const preview = entry.locator('img')
  await expect(preview).toBeVisible()
  await expect(preview).toHaveAttribute('src', /^blob:/)
  expect(rangeGets).toBe(3)
  expect(fullDocumentGets).toBe(0)

  await entry.click()
  // Documents now open as editor tabs and `/storage` redirects to `/editor` (src/router.ts), so
  // the workspace URL no longer changes on open; assert the document tab plus the editor route.
  await expect(page.getByTestId('tabbar-tab').filter({ hasText: 'Remote design' })).toBeVisible()
  await expect(page).toHaveURL(/\/editor$/)
  await canvas.waitForInit()
  await expect(page.getByText('Remote design').first()).toBeVisible()
  expect(fullDocumentGets).toBe(1)
})

test('storage workspace directs unconfigured users to Settings', async ({ page }) => {
  await useS3StorageProvider(page)
  await page.goto('/storage?test')
  await new CanvasHelper(page).waitForInit()
  await page.keyboard.press('ControlOrMeta+KeyN')

  await expect(page.getByTestId('recent-files-home')).toBeVisible()
  await expect(page.getByText('Configure storage before using this workspace.')).toBeVisible()
  await expect(page.getByRole('button', { name: 'New design', exact: true })).toBeEnabled()

  await page.getByRole('button', { name: 'Settings' }).last().click()
  await page.getByTestId('settings-section-storage').click()
  await expect(page.getByTestId('settings-storage-panel')).toBeVisible()
})
