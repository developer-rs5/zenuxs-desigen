import type { PrototypeInteraction, SceneNode, Vector } from '@open-pencil/scene-graph'

import {
  recordRuntimeFeatures,
  shimBase,
  type FinishInteraction,
  type NodeContext,
  type WalkContext
} from './context'
import { nodeSelector } from './css'
import { transitionTiming } from './support'

/**
 * Overlay open/close emission: first-wins base CSS + backdrop, placement
 * mirroring preview's `overlayVisual` (authored offset, horizontal centering
 * when the frame lies fully outside the screen), and shim ops carrying the
 * authored open/close timing.
 */

// --- overlays ---------------------------------------------------------------

export function processOverlayOpen(
  ctx: WalkContext,
  node: SceneNode,
  local: NodeContext,
  interaction: PrototypeInteraction,
  baseDetail: string,
  finish: FinishInteraction
): void {
  const action = interaction.action
  if (action.type !== 'openOverlay') return
  const target = ctx.graph.getNode(action.overlayId)
  if (!target) {
    finish('skipped', 'action', `${baseDetail} targets a node that does not exist`, {
      reason: 'missing-target'
    })
    return
  }
  if (!ctx.screenOf.has(action.overlayId)) {
    finish('skipped', 'action', `${baseDetail} leaves the export root`, {
      reason: 'destination-outside-root'
    })
    return
  }
  if (!local.screenId) {
    finish('skipped', 'action', `${baseDetail} opens outside any emitted screen`, {
      reason: 'destination-outside-root'
    })
    return
  }

  ctx.overlayIds.add(action.overlayId)
  emitOverlayCSS(ctx, action.overlayId, target)

  const placement = overlayPlacement(ctx, action.overlayId, target, local.screenId)
  const timing = transitionTiming(interaction.transition)
  const op = {
    kind: 'overlay-open' as const,
    overlay: action.overlayId,
    overlaySel: nodeSelector(action.overlayId),
    backdrop: action.backdropOpacity ?? 0.3,
    ox: placement.ox,
    oy: placement.oy,
    timing,
    ...shimBase(local, interaction, Boolean(interaction.guard)),
    ...(interaction.transition?.kind === 'slide'
      ? { slideStart: placement.screenHeight - placement.oy }
      : {})
  }
  ctx.shim.push(op)
  recordRuntimeFeatures(ctx, node, baseDetail, interaction)
  finish('exported', 'action', `${baseDetail} above the active screen`)
}

export function processOverlayClose(
  ctx: WalkContext,
  node: SceneNode,
  local: NodeContext,
  interaction: PrototypeInteraction,
  baseDetail: string,
  finish: FinishInteraction
): void {
  if (interaction.action.type !== 'closeOverlay') return
  const op = {
    kind: 'overlay-close' as const,
    ...shimBase(local, interaction, Boolean(interaction.guard)),
    ...(interaction.transition ? { timing: transitionTiming(interaction.transition) } : {})
  }
  ctx.shim.push(op)
  recordRuntimeFeatures(ctx, node, baseDetail, interaction)
  finish('exported', 'action', `${baseDetail} (pops the topmost overlay)`)
}

/** First-wins base CSS + backdrop for one overlay frame. */
function emitOverlayCSS(ctx: WalkContext, overlayId: string, target: SceneNode): void {
  if (ctx.overlayCssPushed.has(overlayId)) return
  ctx.overlayCssPushed.add(overlayId)
  if (ctx.overlayCssPushed.size === 1) {
    ctx.css.push(
      '.op-backdrop{position:absolute;left:0;top:0;width:0;height:0;background:#000;opacity:0;visibility:hidden;z-index:3;pointer-events:none;transition:none}'
    )
  }
  const opacity = String(Math.round(target.opacity * 1e4) / 1e4)
  ctx.css.push(
    `${nodeSelector(overlayId)}{position:absolute;visibility:hidden;opacity:0;z-index:4}`,
    `${nodeSelector(overlayId)}.is-open{visibility:visible;opacity:${opacity}}`
  )
}

interface OverlayPlacement {
  ox: number
  oy: number
  screenHeight: number
}

/**
 * Placement relative to the trigger screen, mirroring preview's
 * `overlayVisual`: authored offset, or horizontally centered when the frame
 * lies fully outside the screen bounds (preview centers only X).
 */
function overlayPlacement(
  ctx: WalkContext,
  overlayId: string,
  target: SceneNode,
  screenId: string
): OverlayPlacement {
  const screen = ctx.graph.getNode(screenId)
  const overlay = ctx.graph.getNode(overlayId)
  if (!screen || !overlay) return { ox: 0, oy: 0, screenHeight: 1 }
  const abs = absoluteTopLeft(ctx.graph, overlay)
  const screenAbs = absoluteTopLeft(ctx.graph, screen)
  let ox = round4(abs.x - screenAbs.x)
  const oy = round4(abs.y - screenAbs.y)
  const outside =
    ox + target.width <= 0 || ox >= screen.width || oy + target.height <= 0 || oy >= screen.height
  if (outside) ox = round4((screen.width - target.width) / 2)
  return { ox, oy, screenHeight: screen.height }
}

function round4(value: number): number {
  return Math.round(value * 1e4) / 1e4
}

/** Accumulate parent offsets for nested frames (screens are always root children). */
function absoluteTopLeft(
  graph: { getNode(id: string): SceneNode | undefined; rootId: string },
  node: SceneNode
): Vector {
  let x = node.x
  let y = node.y
  let current = node
  while (current.parentId && current.parentId !== graph.rootId) {
    const parent = graph.getNode(current.parentId)
    if (!parent || parent.type === 'CANVAS') break
    x += parent.x
    y += parent.y
    current = parent
  }
  return { x, y }
}
