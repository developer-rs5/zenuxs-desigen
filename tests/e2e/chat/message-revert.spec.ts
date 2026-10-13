import { expect, test, useEditorSetup } from '#tests/e2e/fixtures'
import { ChatHarness } from '#tests/helpers/chat/harness'
import { injectLifecycleAIToolsTransport } from '#tests/helpers/prototype/ai-chat'

// Per-message revert: a sent prompt records a canvas checkpoint, so undo
// reverts the AI edits made from that message onward, drops the transcript
// tail, and returns the prompt to the composer for editing and resending.
const editor = useEditorSetup('/demo')

async function canvasNodeCount(): Promise<number> {
  return editor.page.evaluate(() => {
    const store = window.openPencil?.getStore?.()
    if (!store) throw new Error('OpenPencil store not initialized')
    return store.graph.nodes.size
  })
}

test('undoing a sent message reverts its canvas changes, clears the tail, and restores the prompt', async () => {
  test.setTimeout(60_000)
  const harness = new ChatHarness(editor.page)
  await injectLifecycleAIToolsTransport(editor.page)
  await harness.configureOpenRouter('sk-or-test-key-12345')

  const before = await canvasNodeCount()
  const prompt = 'Build a dashboard with a card'
  await harness.submit(prompt)

  const userMessage = editor.page.getByTestId('chat-message-user').last()
  await expect(userMessage).toBeVisible()
  // Turn 1 runs the real `render` tool, so the canvas gained nodes.
  await expect.poll(canvasNodeCount, { timeout: 15_000 }).toBeGreaterThan(before)

  // Undo/Edit are offered on the user message that owns the checkpoint.
  const undo = userMessage.getByTestId('chat-undo-message')
  const edit = userMessage.getByTestId('chat-edit-message')
  await expect(undo).toBeVisible()
  await expect(edit).toBeVisible()
  // Visible means visible: an `opacity-0` hover-reveal is still "visible" to
  // Playwright, so assert the rendered opacity explicitly.
  await expect(undo).toHaveCSS('opacity', '1')
  await expect(edit).toHaveCSS('opacity', '1')

  await undo.click()

  // Canvas reverted back to the pre-prompt state.
  await expect.poll(canvasNodeCount, { timeout: 15_000 }).toBe(before)

  // Transcript tail removed — the reverted message is gone from the panel.
  await expect(editor.page.getByTestId('chat-message-user')).toHaveCount(0)
  await expect(editor.page.getByTestId('chat-message-assistant')).toHaveCount(0)

  // Prompt is back in the composer, ready to edit and resend.
  await expect(harness.input).toHaveValue(prompt)
})
