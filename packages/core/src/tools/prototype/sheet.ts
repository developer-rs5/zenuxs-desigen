import {
  readNodeInteractions,
  type PrototypeInteraction,
  type SceneNode
} from '@open-pencil/scene-graph'

import type { FigmaAPI } from '#core/figma-api'
import { defineTool } from '#core/tools/schema'

import { buildInteraction, writeInteractions, type TransitionArgs } from './helpers'

/**
 * Semantic overlay composition (spec §12/§42): one validated operation that
 * produces the overlay relationship, backdrop, enter/exit transitions, and
 * dismissal paths — sugar over the same pluginData mutations the inspector
 * edits. All interactions are built before any write so a rejected input
 * never leaves a partial document mutation. `create_bottom_sheet` is the
 * bottom-anchored slide-up form; `create_overlay` is the general relationship.
 */

type PendingWrite = { nodeId: string; interactions: PrototypeInteraction[] }
type OverlayPlan =
  | {
      writes: PendingWrite[]
      openedBy: string | null
      closeId: string | null
      outsideClose: 'added' | 'skipped' | 'none'
    }
  | { error: string }

/** Top-level screen containing a node (parent is the page), if any. */
function screenAncestor(figma: FigmaAPI, nodeId: string): string | null {
  let current: SceneNode | undefined = figma.graph.getNode(nodeId)
  while (current) {
    const parentId: string | null = current.parentId ?? null
    const parent: SceneNode | undefined = parentId ? figma.graph.getNode(parentId) : undefined
    if (!parent || parent.type === 'CANVAS') return current.id
    current = parent
  }
  return null
}

function hasClickInteractions(figma: FigmaAPI, nodeId: string): PrototypeInteraction[] {
  const node = figma.graph.getNode(nodeId)
  return node ? readNodeInteractions(node).filter((entry) => entry.trigger === 'click') : []
}

function hasCloseInteraction(figma: FigmaAPI, nodeId: string): boolean {
  return hasClickInteractions(figma, nodeId).some((entry) => entry.action.type === 'closeOverlay')
}

function validateOverlayArgs(
  overlay: SceneNode,
  backdrop: number,
  duration: number
): { error: string } | null {
  if (overlay.type === 'CANVAS') return { error: 'A page cannot be an overlay' }
  if (!Number.isFinite(backdrop) || backdrop < 0 || backdrop > 1) {
    return { error: 'backdrop_opacity must be between 0 and 1' }
  }
  if (!Number.isFinite(duration) || duration < 0 || duration > 120_000) {
    return { error: 'duration_ms must be between 0 and 120000' }
  }
  return null
}

/**
 * Build open/close/outside-dismiss interactions for one overlay relationship.
 * Pure planning — no graph writes, so callers keep the atomic outcome.
 */
function planOverlay(
  figma: FigmaAPI,
  overlay: SceneNode,
  options: {
    triggerNodeId: string | null
    backdrop: number
    openTransition: TransitionArgs
    closeTransition: TransitionArgs
    dismissOutside: boolean
  }
): OverlayPlan {
  const writes: PendingWrite[] = []
  const { triggerNodeId, backdrop, openTransition, closeTransition, dismissOutside } = options

  let openedBy: string | null = null
  if (triggerNodeId) {
    const alreadyOpen = hasClickInteractions(figma, triggerNodeId).some(
      (entry) => entry.action.type === 'openOverlay' && entry.action.overlayId === overlay.id
    )
    if (!alreadyOpen) {
      const built = buildInteraction(figma, triggerNodeId, {
        action: 'openOverlay',
        overlay_id: overlay.id,
        backdrop_opacity: backdrop,
        trigger: 'click',
        ...openTransition
      })
      if ('error' in built) return built
      const triggerNode = figma.graph.getNode(triggerNodeId)
      if (!triggerNode) return { error: `Trigger node "${triggerNodeId}" not found` }
      writes.push({
        nodeId: triggerNodeId,
        interactions: [...readNodeInteractions(triggerNode), built.interaction]
      })
      openedBy = built.interaction.id
    } else {
      openedBy = 'existing'
    }
  }

  let closeId: string | null = null
  if (!hasCloseInteraction(figma, overlay.id)) {
    const built = buildInteraction(figma, overlay.id, {
      action: 'closeOverlay',
      trigger: 'click',
      ...closeTransition
    })
    if ('error' in built) return built
    writes.push({
      nodeId: overlay.id,
      interactions: [...readNodeInteractions(overlay), built.interaction]
    })
    closeId = built.interaction.id
  } else {
    closeId = 'existing'
  }

  // Outside-tap dismissal: click → closeOverlay on the opener's screen is a
  // safe no-op while no overlay is open, but it needs a free click slot.
  let outsideClose: 'added' | 'skipped' | 'none' = 'none'
  if (triggerNodeId && dismissOutside) {
    const screenId = screenAncestor(figma, triggerNodeId)
    if (screenId && screenId !== triggerNodeId && screenId !== overlay.id) {
      if (hasClickInteractions(figma, screenId).length === 0) {
        const built = buildInteraction(figma, screenId, {
          action: 'closeOverlay',
          trigger: 'click',
          ...closeTransition
        })
        if ('error' in built) return built
        const screen = figma.graph.getNode(screenId)
        if (screen) {
          writes.push({
            nodeId: screenId,
            interactions: [...readNodeInteractions(screen), built.interaction]
          })
          outsideClose = 'added'
        }
      } else {
        outsideClose = 'skipped'
      }
    }
  }

  return { writes, openedBy, closeId, outsideClose }
}

function flushWrites(
  figma: FigmaAPI,
  writes: PendingWrite[]
): { added: number } | { error: string } {
  let added = 0
  for (const write of writes) {
    const error = writeInteractions(figma, write.nodeId, write.interactions)
    if (error) return { error }
    added += 1
  }
  return { added }
}

/** Resolve + validate the shared trigger-node argument. */
function resolveTrigger(
  figma: FigmaAPI,
  triggerArg: string | undefined,
  overlay: SceneNode,
  selfLabel: string
): { triggerNodeId: string | null } | { error: string } {
  if (!triggerArg) return { triggerNodeId: null }
  const triggerNode = figma.graph.getNode(triggerArg)
  if (!triggerNode) return { error: `Trigger node "${triggerArg}" not found` }
  if (triggerNode.id === overlay.id) {
    return { error: `Trigger node cannot be the ${selfLabel} itself` }
  }
  return { triggerNodeId: triggerNode.id }
}

/**
 * Generic overlay behavior (spec §16 `createOverlayBehavior`): backdrop +
 * enter/exit transition + dismissal wiring for any frame presented as an
 * overlay. `create_bottom_sheet` stays the bottom-anchored sugar form; this is
 * the general relationship (centered/positioned overlays, fade/slide/spring).
 */
export const createOverlayBehavior = defineTool({
  name: 'create_overlay',
  mutates: true,
  description:
    'Wire a frame as a modal overlay: optional opener click → openOverlay with backdrop and enter transition, dismissal click → closeOverlay. General-purpose alternative to create_bottom_sheet for dialogs/popovers.',
  params: {
    overlay_id: { type: 'string', description: 'Frame to present as the overlay', required: true },
    trigger_node_id: {
      type: 'string',
      description: 'Optional node whose click opens the overlay'
    },
    backdrop_opacity: {
      type: 'number',
      description: 'Backdrop dim 0–1 (default 0.3)',
      min: 0,
      max: 1
    },
    transition_kind: {
      type: 'string',
      description: 'Enter/exit transition: fade | slide | instant (default fade)'
    },
    direction: { type: 'string', description: 'Slide direction when transition_kind is slide' },
    duration_ms: {
      type: 'number',
      description: 'Transition duration in ms (default 250)',
      min: 0,
      max: 120_000
    },
    dismiss_on_backdrop: {
      type: 'boolean',
      description: 'Add click → closeOverlay on the opener screen for outside-tap dismissal'
    }
  },
  execute: (figma, args) => {
    const overlay = figma.graph.getNode(args.overlay_id)
    if (!overlay) return { error: `Overlay "${args.overlay_id}" not found` }

    const backdrop = args.backdrop_opacity ?? 0.3
    const kind = args.transition_kind ?? 'fade'
    if (kind !== 'fade' && kind !== 'slide' && kind !== 'instant') {
      return { error: 'transition_kind must be fade, slide, or instant' }
    }
    const direction = args.direction ?? 'up'
    if (!['up', 'down', 'left', 'right'].includes(direction)) {
      return { error: 'direction must be up, down, left, or right' }
    }
    const duration = args.duration_ms ?? 250
    const invalid = validateOverlayArgs(overlay, backdrop, duration)
    if (invalid) return invalid

    const trigger = resolveTrigger(figma, args.trigger_node_id, overlay, 'overlay')
    if ('error' in trigger) return trigger

    const plan = planOverlay(figma, overlay, {
      triggerNodeId: trigger.triggerNodeId,
      backdrop,
      openTransition: { transition: kind, direction, duration_ms: duration, easing: 'easeOut' },
      closeTransition: { transition: kind, direction, duration_ms: duration, easing: 'easeOut' },
      dismissOutside: args.dismiss_on_backdrop === true
    })
    if ('error' in plan) return plan
    const flushed = flushWrites(figma, plan.writes)
    if ('error' in flushed) return flushed

    return {
      overlay: overlay.id,
      opened_by: plan.openedBy,
      close: plan.closeId,
      outside_close: plan.outsideClose,
      transition: kind,
      added: flushed.added
    }
  }
})

export const createBottomSheet = defineTool({
  name: 'create_bottom_sheet',
  mutates: true,
  description:
    'Turn a frame into a bottom sheet: optional opener click → openOverlay with slide-up and backdrop, dismiss via click → closeOverlay on the sheet (and outside-tap on the screen when possible). Semantic sugar over create_interaction.',
  params: {
    sheet_id: {
      type: 'string',
      description: 'Frame to present as the bottom sheet',
      required: true
    },
    trigger_node_id: {
      type: 'string',
      description: 'Optional node whose click opens the sheet'
    },
    backdrop_opacity: {
      type: 'number',
      description: 'Backdrop dim 0–1 (default 0.3)',
      min: 0,
      max: 1
    },
    duration_ms: {
      type: 'number',
      description: 'Slide duration in ms (default 300)',
      min: 0,
      max: 120_000
    }
  },
  execute: (figma, args) => {
    const sheet = figma.graph.getNode(args.sheet_id)
    if (!sheet) return { error: `Sheet "${args.sheet_id}" not found` }

    const backdrop = args.backdrop_opacity ?? 0.3
    const duration = args.duration_ms ?? 300
    const invalid = validateOverlayArgs(sheet, backdrop, duration)
    if (invalid) {
      return { error: invalid.error.replace('an overlay', 'a bottom sheet') }
    }

    const trigger = resolveTrigger(figma, args.trigger_node_id, sheet, 'sheet')
    if ('error' in trigger) return trigger

    const plan = planOverlay(figma, sheet, {
      triggerNodeId: trigger.triggerNodeId,
      backdrop,
      openTransition: { transition: 'slide', direction: 'up', duration_ms: duration },
      closeTransition: { transition: 'slide', direction: 'down', duration_ms: duration },
      dismissOutside: true
    })
    if ('error' in plan) return plan
    const flushed = flushWrites(figma, plan.writes)
    if ('error' in flushed) return flushed

    return {
      sheet: sheet.id,
      opened_by: plan.openedBy,
      close: plan.closeId,
      outside_close: plan.outsideClose,
      added: flushed.added
    }
  }
})
