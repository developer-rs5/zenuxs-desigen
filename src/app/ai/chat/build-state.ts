import { ref } from 'vue'

import type { AIWorkRect } from './live-build'

/**
 * Shared flag for "AI is actively building" — true while the chat request is
 * submitted or streaming. Canvas overlays watch this without importing the
 * heavier chat session graph.
 */
export const chatBuilding = ref(false)

export interface AIPendingWork {
  /** Monotonic counter so watchers fire on every operation, even same-rect. */
  seq: number
  rect: AIWorkRect
  nodeId: string | null
}

/**
 * World-space region of the mutating tool operation currently executing.
 * Set before the mutation runs (so the canvas can highlight where the AI is
 * about to work) and cleared when the operation settles. Only tool hooks write
 * this; the overlay keeps the last known region as a lingering highlight.
 */
export const aiPendingWork = ref<AIPendingWork | null>(null)

let workSeq = 0

export function setAIPendingWork(work: Omit<AIPendingWork, 'seq'>): void {
  aiPendingWork.value = { ...work, seq: ++workSeq }
}

export function clearAIPendingWork(): void {
  aiPendingWork.value = null
}
