import { shallowReactive } from 'vue'

/**
 * Per-user-message canvas checkpoints.
 *
 * When a user message is sent, the current undo-stack depth is recorded. A
 * later "undo from this message" pops the stack back to that depth, which
 * reverts exactly the AI tool edits (plus any manual edits made after the
 * message — the stack is linear, so those go too).
 *
 * Checkpoints are intentionally in-memory: the undo stack itself does not
 * survive reload, so a depth recorded in a previous session is meaningless.
 * Messages without a checkpoint simply offer no undo/edit actions.
 *
 * Reactive so transcript action buttons appear once the send records them.
 */
const depths = shallowReactive(new Map<string, number>())

export function recordMessageCheckpoint(messageId: string, depth: number): void {
  depths.set(messageId, depth)
}

export function messageCheckpoint(messageId: string): number | null {
  return depths.get(messageId) ?? null
}

export function hasMessageCheckpoint(messageId: string): boolean {
  return depths.has(messageId)
}

export function dropMessageCheckpoints(messageIds: Iterable<string>): void {
  for (const id of messageIds) depths.delete(id)
}

export function clearMessageCheckpoints(): void {
  depths.clear()
}
