import { expect, test } from '@playwright/test'

import { CanvasHelper } from '#tests/helpers/canvas'

test('pages and layers panels scroll inside splitter panes', async ({ page }) => {
  await page.goto('/editor')
  const canvas = new CanvasHelper(page)
  await canvas.waitForInit()
  canvas.errors.length = 0

  // addPage only queues an async prepare/commit page switch (atomic page preparation,
  // 6f563838), so the visible page settles after the loop instead of synchronously.
  const targetPageId = await page.evaluate(() => {
    const store = window.openPencil?.getStore?.()
    if (!store) throw new Error('OpenPencil store not initialized')
    let pageId = store.state.currentPageId
    for (let i = 0; i < 40; i++) pageId = store.addPage(`Page ${i + 2}`)
    return pageId
  })
  await expect
    .poll(() =>
      page.evaluate(() => {
        const store = window.openPencil?.getStore?.()
        if (!store) throw new Error('OpenPencil store not initialized')
        return store.state.currentPageId
      })
    )
    .toBe(targetPageId)

  await page.evaluate((pageId: string) => {
    const store = window.openPencil?.getStore?.()
    if (!store) throw new Error('OpenPencil store not initialized')
    for (let i = 0; i < 80; i++) {
      store.graph.createNode('RECTANGLE', pageId, {
        name: `Layer ${i + 1}`,
        x: i * 2,
        y: i * 2,
        width: 20,
        height: 20
      })
    }
    store.requestRender()
  }, targetPageId)
  await canvas.waitForRender()

  const pagesScroller = page.getByTestId('pages-scroll')
  const layersScroller = page.getByTestId('layers-scroll')

  await pagesScroller.evaluate((el) => {
    el.scrollTop = el.scrollHeight
  })
  await layersScroller.evaluate((el) => {
    el.scrollTop = el.scrollHeight
  })

  await expect.poll(() => pagesScroller.evaluate((el) => el.scrollTop)).toBeGreaterThan(0)
  await expect.poll(() => layersScroller.evaluate((el) => el.scrollTop)).toBeGreaterThan(0)
  canvas.assertNoErrors()
})
