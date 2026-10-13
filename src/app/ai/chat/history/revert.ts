import type { Chat } from '@ai-sdk/vue'
import { isTextUIPart, type UIMessage } from 'ai'

import { deleteMessageAttachments } from '@/app/ai/attachment/presentation/store'
import { dropMessageCheckpoints, messageCheckpoint } from '@/app/ai/chat/history/checkpoints'
import { deleteVisibleMessageText, visibleUserMessageText } from '@/app/ai/chat/presentation'
import type { getActiveEditorStore } from '@/app/editor/active-store'

type EditorStore = ReturnType<typeof getActiveEditorStore>
type LiveChat = Pick<Chat<UIMessage>, 'messages' | 'stop'>
type RevertEditor = Pick<EditorStore, 'undo' | 'undoAction'>

export interface RevertTarget {
  chat: LiveChat
  editor: RevertEditor
  flush: () => Promise<void>
  /** Puts the reverted prompt back into the composer. */
  restoreDraft: (text: string) => void
}

function userText(message: UIMessage): string {
  return message.parts
    .filter(isTextUIPart)
    .map((part) => part.text)
    .join('')
}

/**
 * Reverts a user message: canvas changes from that message through the end
 * of the transcript are undone, the message and everything after it is
 * dropped from the transcript, and the message text is restored to the
 * composer for editing and resending.
 *
 * Returns false when there is nothing to revert (unknown id, non-user
 * message, or no checkpoint recorded — e.g. a restored session whose undo
 * stack is gone).
 */
export async function revertUserMessage(messageId: string, target: RevertTarget): Promise<boolean> {
  const message = target.chat.messages.find((entry) => entry.id === messageId)
  if (message?.role !== 'user') return false
  const checkpoint = messageCheckpoint(messageId)
  if (checkpoint === null) return false

  await target.chat.stop().catch(() => undefined)

  // Pop AI tool edits (and any later manual edits — the stack is linear)
  // back to the depth recorded when this message was sent.
  while (target.editor.undo.depth > checkpoint) {
    target.editor.undoAction()
  }

  const index = target.chat.messages.indexOf(message)
  const removed = target.chat.messages.slice(index)
  target.chat.messages = target.chat.messages.slice(0, index)
  for (const entry of removed) {
    deleteVisibleMessageText(entry.id)
    deleteMessageAttachments(entry.id)
  }
  dropMessageCheckpoints(removed.map((entry) => entry.id))

  target.restoreDraft(visibleUserMessageText(message.id, userText(message)))
  await target.flush().catch(() => undefined)
  return true
}
