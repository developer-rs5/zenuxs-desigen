import { readNodeInteractions } from '@open-pencil/scene-graph'
import type { SceneNode } from '@open-pencil/scene-graph'

import type { DescribeIssue } from './issues'
import { MIN_TOUCH_TARGET } from './shared'

/**
 * Accessibility checks that are honest for the document model (spec §55): only
 * what authored nodes can actually express — interaction target size and
 * interaction labels. Keyboard order, focus rings, and the runtime's
 * `prefers-reduced-motion` handling are not encoded on nodes, so they are not
 * faked here.
 */

/** Triggers activated directly by a finger — these need a 44×44 target. */
const ACTIVATION_TRIGGERS = new Set(['click', 'press', 'longPress'])

export function detectAccessibilityIssues(node: SceneNode, issues: DescribeIssue[]): void {
  const interactions = readNodeInteractions(node)
  if (interactions.length === 0) return

  const activated = interactions.some((interaction) => ACTIVATION_TRIGGERS.has(interaction.trigger))
  if (activated && (node.width < MIN_TOUCH_TARGET || node.height < MIN_TOUCH_TARGET)) {
    issues.push({
      message: `Interactive node "${node.name}" is ${node.width}×${node.height} — below the ${MIN_TOUCH_TARGET}×${MIN_TOUCH_TARGET} touch target minimum`,
      suggestion: `Grow the hit area to at least ${MIN_TOUCH_TARGET}×${MIN_TOUCH_TARGET}`
    })
  }

  if (node.type === 'TEXT' && node.text.trim().length === 0) {
    issues.push({
      message: `Text node "${node.name}" carries a prototype interaction but has no visible text to label it`,
      suggestion: 'Add label text, or move the interaction to a visible node'
    })
  }
}
