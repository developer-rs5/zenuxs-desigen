import { expect, test } from '#tests/helpers/chat/fixture'

test('magic box and canvas live-building overlay show while the AI responds', async ({
  configuredChat: chat
}) => {
  await chat.submit('Slow build please')
  await expect(chat.page.getByTestId('chat-magic-building')).toBeVisible()
  await expect(chat.page.getByTestId('canvas-ai-build-overlay')).toBeVisible()
  await expect(chat.assistantMessage()).toContainText('mock response')
  await expect(chat.page.getByTestId('chat-magic-building')).toHaveCount(0)
  await expect(chat.page.getByTestId('canvas-ai-build-overlay')).toHaveCount(0)
})

test('live-building overlay tracks real canvas mutations', async ({ configuredChat: chat }) => {
  await chat.submit('Slow build please')
  await expect(chat.page.getByTestId('canvas-ai-build-overlay')).toBeVisible()

  // Simulate the real mutation lifecycle: the AI creates a frame, then a
  // navbar-sized child that covers the navbar skeleton slot.
  await chat.page.evaluate(() => {
    const store = window.openPencil.getStore()
    const frame = store.graph.createNode('FRAME', store.state.currentPageId, {
      name: 'AI Frame',
      x: 100,
      y: 100,
      width: 800,
      height: 600
    })
    store.graph.createNode('RECTANGLE', frame.id, {
      name: 'Navbar',
      x: 32,
      y: 36,
      width: 736,
      height: 60
    })
  })

  await expect(chat.page.getByTestId('canvas-ai-build-cursor')).toBeVisible()
  await expect(chat.page.getByTestId('canvas-ai-work-region')).toBeVisible()
  await expect(
    chat.page.getByTestId('canvas-ai-skeleton').locator('.ai-build-block[data-covered="false"]')
  ).toHaveCount(4)

  await expect(chat.assistantMessage()).toContainText('mock response')
  await expect(chat.page.getByTestId('canvas-ai-build-overlay')).toHaveCount(0)
})

test('live-building overlay tracks modification of an existing design', async ({
  configuredChat: chat
}) => {
  const frameId = await chat.page.evaluate(() => {
    const store = window.openPencil.getStore()
    const frame = store.graph.createNode('FRAME', store.state.currentPageId, {
      name: 'Existing Dashboard',
      x: 50,
      y: 50,
      width: 600,
      height: 400
    })
    return frame.id
  })

  await chat.submit('Slow build please')
  await expect(chat.page.getByTestId('canvas-ai-build-overlay')).toBeVisible()

  // The AI restyles the existing frame instead of rebuilding it.
  await chat.page.evaluate((id) => {
    const store = window.openPencil.getStore()
    store.graph.updateNode(id, { name: 'Existing Dashboard v2' })
  }, frameId)

  await expect(chat.page.getByTestId('canvas-ai-build-cursor')).toBeVisible()
  await expect(chat.page.getByTestId('canvas-ai-work-region')).toBeVisible()
  // The pre-existing design is never covered by a build skeleton.
  await expect(chat.page.getByTestId('canvas-ai-skeleton')).toHaveCount(0)

  await expect(chat.assistantMessage()).toContainText('mock response')
  await expect(chat.page.getByTestId('canvas-ai-build-overlay')).toHaveCount(0)
})
