import { expect, test } from 'bun:test'

import type { UIMessage } from 'ai'

import { resumableTransport } from '@/app/ai/chat/history/continuation'

test('continuation omits unfinished tool calls without altering the saved transcript', async () => {
  const messages: UIMessage[] = [
    {
      id: 'partial',
      role: 'assistant',
      parts: [
        { type: 'text', text: 'Working on it' },
        { type: 'tool-edit', toolCallId: 'pending', state: 'input-available', input: {} },
        {
          type: 'tool-read',
          toolCallId: 'finished',
          state: 'output-available',
          input: {},
          output: {}
        }
      ]
    }
  ]
  let sent: UIMessage[] = []
  const transport = resumableTransport({
    reconnectToStream: async () => null,
    sendMessages: async (options) => {
      sent = options.messages
      return new ReadableStream({
        start(controller) {
          controller.close()
        }
      })
    }
  })
  await transport.sendMessages({
    chatId: 'chat',
    trigger: 'submit-message',
    messageId: undefined,
    messages
  })
  expect(sent[0]?.parts).toHaveLength(2)
  expect(messages[0]?.parts).toHaveLength(3)
  expect(
    sent[0]?.parts.some((part) => 'toolCallId' in part && part.toolCallId === 'finished')
  ).toBe(true)
})

test('continuation rewrites colliding tool-call ids across turns', async () => {
  // AI SDK history stores one state-based part per tool call; the provider
  // conversion derives the paired tool_use/tool_result from that same part.
  const messages: UIMessage[] = [
    {
      id: 'turn1',
      role: 'assistant',
      parts: [
        {
          type: 'tool-edit',
          toolCallId: 'call_27886',
          state: 'output-available',
          input: {},
          output: {}
        }
      ]
    },
    { id: 'user1', role: 'user', parts: [{ type: 'text', text: 'next' }] },
    {
      id: 'turn2',
      role: 'assistant',
      parts: [
        {
          type: 'tool-read',
          toolCallId: 'call_27886',
          state: 'output-available',
          input: {},
          output: {}
        }
      ]
    }
  ]
  let sent: UIMessage[] = []
  const transport = resumableTransport({
    reconnectToStream: async () => null,
    sendMessages: async (options) => {
      sent = options.messages
      return new ReadableStream({
        start(controller) {
          controller.close()
        }
      })
    }
  })
  await transport.sendMessages({
    chatId: 'chat',
    trigger: 'submit-message',
    messageId: undefined,
    messages
  })
  const ids = sent
    .flatMap((message) => message.parts)
    .filter((part) => 'toolCallId' in part)
    .map((part) => (part as { toolCallId: string }).toolCallId)
  expect(ids).toEqual(['call_27886', 'call_27886-dedup'])
})
