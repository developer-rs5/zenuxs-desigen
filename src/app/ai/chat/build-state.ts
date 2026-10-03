import { ref } from 'vue'

/**
 * Shared flag for "AI is actively building" — true while the chat request is
 * submitted or streaming. Canvas overlays watch this without importing the
 * heavier chat session graph.
 */
export const chatBuilding = ref(false)
