import type { SceneGraph, SceneNode } from '@open-pencil/scene-graph'

import type { PrototypeNodeVisual } from './visuals'

export interface SmartAnimatePair {
  fromId: string
  toId: string
}

/**
 * Builds the hierarchical name path from the frame root down to the target node.
 * Used as the primary identity key for Smart Animate layer matching (spec §8 / FigCraft).
 */
export function namePath(graph: SceneGraph, rootId: string, nodeId: string): string | null {
  const parts: string[] = []
  let currentId: string | null = nodeId
  for (let i = 0; i < 1024 && currentId; i++) {
    if (currentId === rootId) {
      parts.reverse()
      return parts.join('\u001f')
    }
    const node: SceneNode | undefined = graph.getNode(currentId)
    if (!node) return null
    parts.push(node.name)
    currentId = node.parentId ?? null
  }
  return null
}

/**
 * Pairs up layers between outgoing and incoming screens by matching name paths.
 * Multiple layers sharing a name path pair up in sibling order.
 */
export function matchLayers(
  fromGraph: SceneGraph,
  fromRootId: string,
  toGraph: SceneGraph,
  toRootId: string
): SmartAnimatePair[] {
  const pool = new Map<string, string[]>()

  function collectFrom(id: string) {
    const node = fromGraph.getNode(id)
    if (!node) return
    for (const childId of node.childIds) {
      const path = namePath(fromGraph, fromRootId, childId)
      if (path) {
        const list = pool.get(path) ?? []
        list.push(childId)
        pool.set(path, list)
      }
      collectFrom(childId)
    }
  }
  collectFrom(fromRootId)

  const pairs: SmartAnimatePair[] = []

  function collectTo(id: string) {
    const node = toGraph.getNode(id)
    if (!node) return
    for (const childId of node.childIds) {
      const path = namePath(toGraph, toRootId, childId)
      if (path) {
        const queue = pool.get(path)
        if (queue && queue.length > 0) {
          const fromId = queue.shift()!
          pairs.push({ fromId, toId: childId })
        }
      }
      collectTo(childId)
    }
  }
  collectTo(toRootId)

  return pairs
}

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t
}

export interface DecomposedTransform {
  cx: number
  cy: number
  rotation: number
  scaleX: number
  scaleY: number
}

/**
 * Decomposes an absolute bounding box and rotation into center, rotation, and scales.
 */
export function decomposeNode(node: SceneNode): DecomposedTransform {
  const rad = ((node.rotation ?? 0) * Math.PI) / 180
  const cx = node.x + node.width / 2
  const cy = node.y + node.height / 2
  return {
    cx,
    cy,
    rotation: rad,
    scaleX: 1,
    scaleY: 1
  }
}

/**
 * Interpolates two transforms smoothly taking the shortest arc for angle differences.
 */
export function lerpTransformDecomposed(
  from: DecomposedTransform,
  to: DecomposedTransform,
  t: number
): { cx: number; cy: number; rotation: number; scaleX: number; scaleY: number } {
  let da = to.rotation - from.rotation
  while (da > Math.PI) da -= 2 * Math.PI
  while (da < -Math.PI) da += 2 * Math.PI

  return {
    cx: lerp(from.cx, to.cx, t),
    cy: lerp(from.cy, to.cy, t),
    rotation: from.rotation + da * t,
    scaleX: lerp(from.scaleX, to.scaleX, t),
    scaleY: lerp(from.scaleY, to.scaleY, t)
  }
}

/**
 * Computes Smart Animate visual overrides for all participating layers.
 * Returns a map of nodeId -> PrototypeNodeVisual at eased progress t.
 */
export function computeSmartAnimateVisuals(
  fromGraph: SceneGraph,
  fromRootId: string,
  toGraph: SceneGraph,
  toRootId: string,
  t: number
): Map<string, PrototypeNodeVisual> {
  const visuals = new Map<string, PrototypeNodeVisual>()
  const clampedT = Math.min(1, Math.max(0, t))
  const pairs = matchLayers(fromGraph, fromRootId, toGraph, toRootId)

  const pairedTo = new Set(pairs.map((p) => p.toId))
  const pairedFrom = new Set(pairs.map((p) => p.fromId))

  // Matched pairs: smoothly interpolate position, dimensions, rotation, corner radius, opacity
  for (const { fromId, toId } of pairs) {
    const fromNode = fromGraph.getNode(fromId)
    const toNode = toGraph.getNode(toId)
    if (!fromNode || !toNode) continue

    const dFrom = decomposeNode(fromNode)
    const dTo = decomposeNode(toNode)
    const interp = lerpTransformDecomposed(dFrom, dTo, t)

    const w = Math.max(0, lerp(fromNode.width, toNode.width, t))
    const h = Math.max(0, lerp(fromNode.height, toNode.height, t))

    // Visual delta relative to destination node's authored properties
    const deltaX = interp.cx - w / 2 - toNode.x
    const deltaY = interp.cy - h / 2 - toNode.y
    const rotDeg = ((interp.rotation - ((toNode.rotation ?? 0) * Math.PI) / 180) * 180) / Math.PI

    const fromRadius = fromNode.cornerRadius ?? 0
    const toRadius = toNode.cornerRadius ?? 0
    const cornerRadius = Math.max(0, lerp(fromRadius, toRadius, t))

    const fromOpacity = fromNode.opacity ?? 1
    const toOpacity = toNode.opacity ?? 1
    const opacity = Math.min(1, Math.max(0, lerp(fromOpacity, toOpacity, clampedT)))

    visuals.set(toId, {
      translateX: deltaX,
      translateY: deltaY,
      width: w,
      height: h,
      rotation: rotDeg,
      cornerRadius,
      opacity
    })
  }

  // Layers only in incoming screen: fade in
  function fadeInUnmatched(id: string) {
    const node = toGraph.getNode(id)
    if (!node) return
    if (!pairedTo.has(id)) {
      visuals.set(id, {
        opacity: (node.opacity ?? 1) * clampedT
      })
    }
    for (const childId of node.childIds) fadeInUnmatched(childId)
  }
  fadeInUnmatched(toRootId)

  // Layers only in outgoing screen: fade out
  function fadeOutUnmatched(id: string) {
    const node = fromGraph.getNode(id)
    if (!node) return
    if (!pairedFrom.has(id)) {
      visuals.set(id, {
        opacity: (node.opacity ?? 1) * (1 - clampedT)
      })
    }
    for (const childId of node.childIds) fadeOutUnmatched(childId)
  }
  fadeOutUnmatched(fromRootId)

  return visuals
}
