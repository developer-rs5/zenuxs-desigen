import { describe, expect, test } from 'bun:test'

import type { UIMessage } from 'ai'

import { UndoManager } from '@open-pencil/scene-graph/undo'

import {
  clearMessageCheckpoints,
  dropMessageCheckpoints,
  hasMessageCheckpoint,
  messageCheckpoint,
  recordMessageCheckpoint
} from '@/app/ai/chat/history/checkpoints'
import { revertUserMessage } from '@/app/ai/chat/history/revert'

function userMessage(id: string, text: string): UIMessage {
  return { id, role: 'user', parts: [{ type: 'text', text }] }
}

function assistantMessage(id: string, text: string): UIMessage {
  return { id, role: 'assistant', parts: [{ type: 'text', text }] }
}

function undoEntry(label: string, apply: () => void, revert: () => void) {
  return { label, forward: apply, inverse: revert }
}

describe('chat message checkpoints', () => {
  test('record/has/drop round-trip', () => {
    clearMessageCheckpoints()
    expect(hasMessageCheckpoint('m1')).toBe(false)
    recordMessageCheckpoint('m1', 3)
    expect(messageCheckpoint('m1')).toBe(3)
    expect(hasMessageCheckpoint('m1')).toBe(true)
    dropMessageCheckpoints(['m1'])
    expect(messageCheckpoint('m1')).toBe(null)
  })
})

describe('revertUserMessage', () => {
  test('undoes canvas edits, truncates the tail, restores the draft', async () => {
    clearMessageCheckpoints()
    let applied = 0
    const undo = new UndoManager()
    const editor = {
      undo,
      undoAction: () => {
        undo.undo()
      }
    }
    const first = userMessage('u1', 'Make a hero')
    const reply = assistantMessage('a1', 'Done')
    const second = userMessage('u2', 'Make it blue')
    const reply2 = assistantMessage('a2', 'Done')

    recordMessageCheckpoint('u1', undo.depth)
    undo.push(
      undoEntry(
        'ai-edit-1',
        () => (applied += 1),
        () => (applied -= 1)
      )
    )
    applied += 1
    recordMessageCheckpoint('u2', undo.depth)
    undo.push(
      undoEntry(
        'ai-edit-2',
        () => (applied += 10),
        () => (applied -= 10)
      )
    )
    applied += 10
    expect(applied).toBe(11)

    const chat = { messages: [first, reply, second, reply2], stop: async () => undefined }
    let draft = ''
    let flushed = 0
    const reverted = await revertUserMessage('u1', {
      chat,
      editor,
      flush: async () => {
        flushed += 1
      },
      restoreDraft: (text) => {
        draft = text
      }
    })

    expect(reverted).toBe(true)
    expect(applied).toBe(0)
    expect(chat.messages.map((message) => message.id)).toEqual([])
    expect(draft).toBe('Make a hero')
    expect(flushed).toBe(1)
    expect(hasMessageCheckpoint('u1')).toBe(false)
    expect(hasMessageCheckpoint('u2')).toBe(false)
  })

  test('rejects unknown ids, assistant messages, and missing checkpoints', async () => {
    clearMessageCheckpoints()
    const undo = new UndoManager()
    const editor = {
      undo,
      undoAction: () => {
        undo.undo()
      }
    }
    const chat = {
      messages: [userMessage('u1', 'Hello'), assistantMessage('a1', 'Hi')],
      stop: async () => undefined
    }
    const target = {
      chat,
      editor,
      flush: async () => undefined,
      restoreDraft: () => undefined
    }
    expect(await revertUserMessage('missing', target)).toBe(false)
    expect(await revertUserMessage('a1', target)).toBe(false)
    // u1 is a user message but was never sent through the checkpoint recorder.
    expect(await revertUserMessage('u1', target)).toBe(false)
    expect(chat.messages.length).toBe(2)
  })
})
