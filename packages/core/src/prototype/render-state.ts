import type {
  PrototypeStateVisual,
  PrototypeTransition,
  SceneGraph,
  SceneNode
} from '@open-pencil/scene-graph'
import type { Rect } from '@open-pencil/scene-graph/primitives'

import { playVisual, type KeyframePlay } from './keyframes'
import { transitionDurationMs, transitionProgress } from './motion'
import { computeSmartAnimateVisuals } from './smart-animate'
import { transitionFramePlacement } from './transitions'
import {
  isIdentityVisual,
  lerpVisual,
  mergeVisual,
  visualBase,
  type PrototypeNodeVisual
} from './visuals'

/**
 * Per-frame render-state composition (spec §8): pure projection of the
 * runtime's ephemeral overlay data into draw order and per-node visuals.
 * Nothing here mutates the graph or the runtime — every input is passed in,
 * so the renderer-facing math stays deterministic and unit-testable.
 */

export interface PrototypeRenderState {
  /** Node ids in draw order: outgoing screen, current screen, then overlays. */
  drawIds: string[]
  /** 0–1 dim behind open overlays; 0 when none. */
  backdropOpacity: number
  /** Current screen bounds in world space; backdrop dims exactly this rect. */
  screenRect: Rect | null
  /** Index into drawIds where overlays start (backdrop draws between). */
  overlayStartIndex: number
  nodeVisuals: ReadonlyMap<string, PrototypeNodeVisual>
}

/** In-flight screen change; the outgoing screen keeps drawing until it settles. */
export interface ScreenTransition {
  fromId: string
  toId: string
  transition: PrototypeTransition
  startedAt: number
}

export interface OverlayEntry {
  nodeId: string
  backdropOpacity: number
  transition: PrototypeTransition
  openedAt: number
  closing: boolean
  closeAt: number | null
}

/** One state-to-state tween driving a node's visual delta. */
export interface VisualAnimation {
  nodeId: string
  from: PrototypeStateVisual
  to: PrototypeStateVisual
  transition: PrototypeTransition
  startedAt: number
}

/** `afterDelay` interaction still owed a future tick. */
export interface PendingTimer {
  nodeId: string
  interactionId: string
  dueAt: number
}

/** Live drag tracking state; the accumulated offset settles on release. */
export interface ActiveDrag {
  nodeId: string
  dx: number
  dy: number
}

export function screenRectOf(graph: SceneGraph, id: string): Rect | null {
  const node = graph.getNode(id)
  if (!node) return null
  return { x: node.x, y: node.y, width: node.width, height: node.height }
}

export interface RenderStateInput {
  graph: SceneGraph
  screenId: string
  stateVisuals: ReadonlyMap<string, PrototypeStateVisual>
  screenTransition: ScreenTransition | null
  overlays: readonly OverlayEntry[]
  animations: readonly VisualAnimation[]
  keyframePlays: readonly KeyframePlay[]
  drag: ActiveDrag | null
  nowMs: number
}

/** Settled/animating state visuals first; screen visuals merge on top. */
function collectNodeVisuals(
  input: RenderStateInput,
  nodeVisuals: Map<string, PrototypeNodeVisual>
): void {
  const { graph, animations, drag, keyframePlays, nowMs, stateVisuals } = input
  for (const [nodeId, visual] of stateVisuals) {
    if (!isIdentityVisual(visual)) nodeVisuals.set(nodeId, visual)
  }
  for (const play of keyframePlays) {
    const visual = playVisual(play, nowMs, visualBase(graph, play.nodeId))
    if (visual && !isIdentityVisual(visual)) nodeVisuals.set(play.nodeId, visual)
  }
  for (const animation of animations) {
    const progress = transitionProgress(animation.transition, nowMs - animation.startedAt)
    const visual = lerpVisual(
      animation.from,
      animation.to,
      progress,
      visualBase(graph, animation.nodeId)
    )
    if (!isIdentityVisual(visual)) nodeVisuals.set(animation.nodeId, visual)
  }
  if (drag) {
    const settled = nodeVisuals.get(drag.nodeId) ?? {}
    const visual = mergeVisual(settled, {
      translateX: drag.dx,
      translateY: drag.dy
    })
    if (!isIdentityVisual(visual)) nodeVisuals.set(drag.nodeId, visual)
  }
}

/** Outgoing/current screen plus their transition frames; returns the screen rect. */
function collectScreenVisuals(
  input: RenderStateInput,
  drawIds: string[],
  nodeVisuals: Map<string, PrototypeNodeVisual>
): Rect | null {
  const screenTransition = input.screenTransition
  const screen = screenRectOf(input.graph, input.screenId)
  if (!screenTransition) {
    drawIds.push(input.screenId)
    return screen
  }
  const { fromId, toId, transition, startedAt } = screenTransition
  const progress = transitionProgress(transition, input.nowMs - startedAt)
  const fromRect = screenRectOf(input.graph, fromId)
  const toRect = screenRectOf(input.graph, toId)
  const width = toRect?.width ?? fromRect?.width ?? 0
  const height = toRect?.height ?? fromRect?.height ?? 0

  if (transition.kind === 'smartAnimate') {
    const smartVisuals = computeSmartAnimateVisuals(
      input.graph,
      fromId,
      input.graph,
      toId,
      progress
    )
    for (const [id, visual] of smartVisuals) {
      nodeVisuals.set(id, mergeVisual(nodeVisuals.get(id) ?? {}, visual))
    }
    drawIds.push(fromId, toId)
    return screen
  }

  const placement = transitionFramePlacement(transition, progress)

  nodeVisuals.set(
    toId,
    mergeVisual(nodeVisuals.get(toId) ?? {}, {
      translateX: placement.toOffset[0] * width,
      translateY: placement.toOffset[1] * height,
      opacity: placement.toAlpha
    })
  )

  nodeVisuals.set(
    fromId,
    mergeVisual(nodeVisuals.get(fromId) ?? {}, {
      translateX: placement.fromOffset[0] * width,
      translateY: placement.fromOffset[1] * height,
      opacity: placement.fromAlpha
    })
  )

  if (placement.fromOnTop) {
    drawIds.push(toId, fromId)
  } else {
    drawIds.push(fromId, toId)
  }
  return screen
}

/** Overlay progress: closing maps through the close start, opening through openedAt. */
function overlayVisibility(entry: OverlayEntry, nowMs: number): { open: number; close: number } {
  const open = transitionProgress(entry.transition, nowMs - entry.openedAt)
  const close = entry.closing
    ? transitionProgress(entry.transition, nowMs - (entry.closeAt ?? nowMs))
    : 0
  return { open, close }
}

function overlayVisual(
  entry: OverlayEntry,
  node: SceneNode,
  screen: Rect | null,
  nowMs: number
): { visual: PrototypeNodeVisual; visibility: number } {
  const { open: openProgress, close: closeProgress } = overlayVisibility(entry, nowMs)
  const visibility = entry.closing
    ? Math.min(1, Math.max(0, 1 - closeProgress))
    : Math.min(1, Math.max(0, openProgress))

  let visual: PrototypeNodeVisual = {}
  if (transitionDurationMs(entry.transition) > 0) {
    if (entry.transition.kind === 'slide' && screen) {
      // Slide starts with the overlay fully below the screen bottom.
      const startOffset = screen.y + screen.height - node.y
      visual.translateY = entry.closing
        ? closeProgress * startOffset
        : (1 - Math.min(1, openProgress)) * startOffset
    } else if (entry.transition.kind === 'fade') {
      visual.opacity = visibility
    } else {
      visual.opacity = visibility
    }
    // Non-identity marker so closed-progress overlays stay drawable.
    if (visual.opacity === undefined && visual.translateY === undefined) visual.opacity = visibility
  }

  if (
    screen &&
    (node.x + node.width <= screen.x ||
      node.x >= screen.x + screen.width ||
      node.y + node.height <= screen.y ||
      node.y >= screen.y + screen.height)
  ) {
    // Overlay designed off-canvas: center it over the screen.
    visual = mergeVisual(visual, {
      translateX: screen.x + (screen.width - node.width) / 2 - node.x
    })
  }
  return { visual, visibility }
}

/** Overlays after the screen: each contributes a draw id and the dim backdrop. */
function collectOverlays(
  input: RenderStateInput,
  drawIds: string[],
  nodeVisuals: Map<string, PrototypeNodeVisual>
): number {
  const screen = screenRectOf(input.graph, input.screenId)
  let backdropOpacity = 0
  for (const entry of input.overlays) {
    const node = input.graph.getNode(entry.nodeId)
    if (!node) continue
    const { visual, visibility } = overlayVisual(entry, node, screen, input.nowMs)
    if (!isIdentityVisual(visual)) nodeVisuals.set(entry.nodeId, visual)
    backdropOpacity = entry.backdropOpacity * visibility
    drawIds.push(entry.nodeId)
  }
  return backdropOpacity
}

/** Project the runtime's frame into draw order and per-node visuals. */
export function composeRenderState(input: RenderStateInput): PrototypeRenderState {
  const nodeVisuals = new Map<string, PrototypeNodeVisual>()
  const drawIds: string[] = []
  collectNodeVisuals(input, nodeVisuals)
  const screen = collectScreenVisuals(input, drawIds, nodeVisuals)
  const overlayStartIndex = drawIds.length
  const backdropOpacity = collectOverlays(input, drawIds, nodeVisuals)
  return {
    drawIds,
    backdropOpacity,
    screenRect: screen ?? null,
    overlayStartIndex,
    nodeVisuals
  }
}
