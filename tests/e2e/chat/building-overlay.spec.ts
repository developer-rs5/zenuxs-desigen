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
