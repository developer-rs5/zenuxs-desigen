/**
 * Comments: pinned notes with reply threads, stored in the file.
 * (Converted 1:1 from FigCraft `crates/doc/src/comments.rs`.)
 */

import type { NodeId } from './ids'
import type { Document } from './lib'

/** An emoji reaction on a message and who left it. */
export interface Reaction {
  emoji: string
  users: string[]
}

/** One message in a comment thread (the first one, or a reply). */
export interface Message {
  author: string
  text: string
  /** Unix seconds. */
  created: number
  /** When the text was last edited (Unix seconds; 0: never). */
  edited?: number
  reactions: Reaction[]
}

/** A reply in a comment thread. */
export type Reply = Message

export const Message = {
  new(author: string, text: string, created: number): Message {
    return { author, text, created, reactions: [] }
  },

  reacted(m: Message, emoji: string, user: string): boolean {
    return m.reactions.some((r) => r.emoji === emoji && r.users.includes(user))
  },

  /** Add `user`'s `emoji` reaction, or take it back (`on`: null toggles). True when it changed. */
  react(m: Message, emoji: string, user: string, on: boolean | null): boolean {
    const want = on ?? !Message.reacted(m, emoji, user)
    if (want === Message.reacted(m, emoji, user)) return false
    const at = m.reactions.findIndex((r) => r.emoji === emoji)
    if (at >= 0 && want) {
      m.reactions[at].users.push(user)
    } else if (at >= 0) {
      m.reactions[at].users = m.reactions[at].users.filter((u) => u !== user)
      if (m.reactions[at].users.length === 0) m.reactions.splice(at, 1)
    } else if (want) {
      m.reactions.push({ emoji, users: [user] })
    }
    return true
  }
}

/** A comment pinned to a point on a page, optionally anchored to a node. */
export interface Comment {
  id: number
  page: NodeId
  /** Page coordinates, or the offset in the anchor's local space when `anchor` is set. */
  x: number
  y: number
  anchor?: NodeId | null
  /** The message that starts the thread (its fields sit on the comment itself in the file). */
  author: string
  text: string
  created: number
  edited?: number
  reactions: Reaction[]
  resolved: boolean
  replies: Message[]
  /** Who has read the thread as it is now. null (old files): read by everyone. */
  read_by?: string[] | null
}

export const Comment = {
  /**
   * Where the pin sits on its page (anchored comments follow their node).
   * Requires the caller to supply the anchor's page transform (2×3 coeffs).
   */
  position(c: Comment, doc: Document): [number, number] {
    if (c.anchor !== null && c.anchor !== undefined) {
      const a = doc.node(c.anchor)
      if (a) {
        const xf = a.transform.coeffs
        return [xf[0] * c.x + xf[2] * c.y + xf[4], xf[1] * c.x + xf[3] * c.y + xf[5]]
      }
    }
    return [c.x, c.y]
  },

  /** The messages in order: the first one, then the replies. */
  messages(c: Comment): Message[] {
    const first: Message = {
      author: c.author,
      text: c.text,
      created: c.created,
      reactions: c.reactions,
      ...(c.edited ? { edited: c.edited } : {})
    }
    return [first, ...c.replies]
  },

  /** A message by thread index (0: the first message, 1…: the replies). */
  message(c: Comment, index: number): Message | null {
    if (index === 0) {
      return Comment.messages(c)[0] ?? null
    }
    return c.replies[index - 1] ?? null
  },

  /** A message by thread index, for editing (mutates the thread). */
  message_mut(c: Comment, index: number): Message | null {
    if (index === 0) {
      return c as unknown as Message
    }
    return c.replies[index - 1] ?? null
  },

  /** When the thread last had a new message (Unix seconds). */
  lastActivity(c: Comment): number {
    return Comment.messages(c).reduce((m, x) => Math.max(m, x.created), 0)
  },

  /** Everyone in the thread, in order of first appearance. */
  participants(c: Comment): string[] {
    const out: string[] = []
    for (const m of Comment.messages(c)) {
      if (!out.includes(m.author)) out.push(m.author)
    }
    return out
  }
}
