import type { SceneGraph, SceneNode } from '@open-pencil/scene-graph'
import type { Color } from '@open-pencil/scene-graph/primitives'

export const CONTAINER_TYPES = new Set(['FRAME', 'COMPONENT', 'INSTANCE'])

export const BUTTON_MAX_WIDTH = 200
export const BUTTON_MAX_HEIGHT = 50
export const BUTTON_MIN_HEIGHT = 28
export const BUTTON_MIN_RADIUS = 2
/** Smallest target a finger can hit reliably (spec §56 responsible defaults). */
export const MIN_TOUCH_TARGET = 44

/**
 * Nearest ancestor with an opaque solid fill. With `bailOnCover` the walk
 * stops (null) when an image/gradient would cover that fill — contrast
 * against a photo cannot be measured honestly (spec §55).
 */
function walkBackground(node: SceneNode, graph: SceneGraph, bailOnCover: boolean): Color | null {
  let current = node.parentId ? graph.getNode(node.parentId) : null
  while (current) {
    if (
      bailOnCover &&
      current.fills.some((f) => f.visible && f.opacity > 0.5 && f.type !== 'SOLID')
    ) {
      return null
    }
    const solidFill = current.fills.find((f) => f.visible && f.type === 'SOLID' && f.opacity > 0.5)
    if (solidFill) return solidFill.color
    current = current.parentId ? graph.getNode(current.parentId) : null
  }
  return null
}

export function findAncestorBackground(node: SceneNode, graph: SceneGraph): Color | null {
  return walkBackground(node, graph, false)
}

/** Background contrast is actually measured against (spec §55) — see walkBackground. */
export function findMeasuredBackground(node: SceneNode, graph: SceneGraph): Color | null {
  return walkBackground(node, graph, true)
}

export function looksLikeButton(node: SceneNode): boolean {
  if (!CONTAINER_TYPES.has(node.type)) return false
  if (
    node.width > BUTTON_MAX_WIDTH ||
    node.height > BUTTON_MAX_HEIGHT ||
    node.height < BUTTON_MIN_HEIGHT
  )
    return false
  if (node.fills.length === 0 && node.strokes.length === 0) return false
  if (node.cornerRadius < BUTTON_MIN_RADIUS) return false
  return node.childIds.length > 0
}
