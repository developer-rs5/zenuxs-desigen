import * as v from 'valibot'

import {
  INTERACTIONS_PLUGIN_KEY,
  readNodeAnimations,
  readNodeInteractions,
  readNodeStateModel,
  resolveVariantComponentId,
  serializePluginValue,
  PrototypeGuardSchema,
  type PrototypeAction,
  type PrototypeEasing,
  type PrototypeGuard,
  type PrototypeInteraction,
  type PrototypeTransition
} from '@open-pencil/scene-graph'

import type { FigmaAPI } from '#core/figma-api'

/**
 * Shared param blocks and validated builders for the semantic prototype tools
 * (spec §16/§17). Pure helpers: every writer goes through `writeInteractions`
 * so a rejected input never leaves a partial document mutation.
 */

export const MAX_DURATION_MS = 120_000

export const TRIGGERS = [
  'load',
  'click',
  'press',
  'release',
  'hoverEnter',
  'hoverLeave',
  'afterDelay',
  'drag',
  'scroll',
  'longPress'
]
export const ACTIONS = [
  'navigate',
  'openOverlay',
  'closeOverlay',
  'setState',
  'playAnimation',
  'setVariant'
]
export const TRANSITIONS = ['instant', 'fade', 'slide', 'spring']
export const EASINGS = ['linear', 'ease', 'easeIn', 'easeOut', 'easeInOut']
export const DIRECTIONS = ['left', 'right', 'up', 'down']

export type ActionResult = { action: PrototypeAction } | { error: string }
export type TransitionResult = { transition: PrototypeTransition } | { error: string }

/** JSON-encoded guard (`{"all":[{"variable","op","value"}]}`) validated by schema. */
export function parseGuard(
  input: string | undefined
): { guard?: PrototypeGuard } | { error: string } {
  if (input === undefined) return {}
  // Models send `""` when they mean "no guard"; JSON.parse('') throws, so a
  // blank string would surface as a tool error the model cannot recover from.
  const trimmed = input.trim()
  if (trimmed === '' || trimmed === '{}') return {}
  let raw: unknown
  try {
    raw = JSON.parse(input) as unknown
  } catch {
    return { error: GUARD_FORMAT_ERROR }
  }
  const result = v.safeParse(PrototypeGuardSchema, raw)
  if (!result.success) return { error: GUARD_FORMAT_ERROR }
  return { guard: result.output }
}

const GUARD_FORMAT_ERROR =
  'guard must be JSON like {"all":[{"variable":"open","op":"eq","value":true}]}'

export function buildTransition(
  kind: string | undefined,
  durationMs: number | undefined,
  easing: string | undefined,
  direction: string | undefined,
  bounce: number | undefined
): TransitionResult {
  const k = kind ?? 'fade'
  if (k === 'instant') return { transition: { kind: 'instant' } }
  if (!TRANSITIONS.includes(k)) return { error: `Invalid transition "${kind}"` }

  const duration = durationMs ?? 300
  if (!Number.isFinite(duration) || duration < 0 || duration > MAX_DURATION_MS) {
    return { error: `duration_ms must be between 0 and ${MAX_DURATION_MS}` }
  }

  const ease = easing ?? 'easeOut'
  if (k !== 'spring' && !EASINGS.includes(ease)) {
    return { error: `Invalid easing "${easing}"` }
  }

  if (k === 'fade') {
    return {
      transition: { kind: 'fade', durationMs: duration, easing: ease as PrototypeEasing }
    }
  }
  if (k === 'slide') {
    const dir = direction ?? 'down'
    if (!DIRECTIONS.includes(dir)) return { error: `Invalid direction "${direction}"` }
    return {
      transition: {
        kind: 'slide',
        direction: dir as 'left' | 'right' | 'up' | 'down',
        durationMs: duration,
        easing: ease as PrototypeEasing
      }
    }
  }
  const b = bounce ?? 0.25
  if (!Number.isFinite(b) || b < 0 || b > 1)
    return { error: 'spring_bounce must be between 0 and 1' }
  return { transition: { kind: 'spring', spring: { mode: 'time', bounce: b } } }
}

export interface ActionArgs {
  action: string
  destination_id?: string
  overlay_id?: string
  backdrop_opacity?: number
  state?: string
  animation_id?: string
  group?: boolean
  variant?: string
}

/** One builder per action kind keeps each branch shallow and testable. */
function buildNavigate(figma: FigmaAPI, destination_id: string | undefined): ActionResult {
  if (!destination_id) return { error: 'destination_id is required for navigate' }
  if (!figma.graph.getNode(destination_id)) {
    return { error: `Destination "${destination_id}" not found` }
  }
  return { action: { type: 'navigate', destinationId: destination_id } }
}

function buildOpenOverlay(figma: FigmaAPI, args: ActionArgs): ActionResult {
  const { overlay_id, backdrop_opacity } = args
  if (!overlay_id) return { error: 'overlay_id is required for openOverlay' }
  if (!figma.graph.getNode(overlay_id)) return { error: `Overlay "${overlay_id}" not found` }
  const backdrop = backdrop_opacity ?? 0.3
  if (!Number.isFinite(backdrop) || backdrop < 0 || backdrop > 1) {
    return { error: 'backdrop_opacity must be between 0 and 1' }
  }
  return { action: { type: 'openOverlay', overlayId: overlay_id, backdropOpacity: backdrop } }
}

function buildPlayAnimation(args: ActionArgs): ActionResult {
  if (!args.animation_id?.trim()) return { error: 'animation_id is required for playAnimation' }
  const built: PrototypeAction = {
    type: 'playAnimation',
    animationId: args.animation_id.trim()
  }
  if (args.group === true) built.group = true
  return { action: built }
}

function buildSetVariant(args: ActionArgs): ActionResult {
  const variant = args.variant?.trim()
  if (!variant) return { error: 'variant is required for setVariant (e.g. "Size=Large")' }
  return { action: { type: 'setVariant', variant } }
}

function buildSetState(args: ActionArgs): ActionResult {
  if (!args.state?.trim()) return { error: 'state is required for setState' }
  return { action: { type: 'setState', state: args.state.trim() } }
}

export function buildAction(figma: FigmaAPI, args: ActionArgs): ActionResult {
  const { action } = args
  if (!ACTIONS.includes(action)) return { error: `Invalid action "${action}"` }
  if (action === 'navigate') return buildNavigate(figma, args.destination_id)
  if (action === 'openOverlay') return buildOpenOverlay(figma, args)
  if (action === 'closeOverlay') return { action: { type: 'closeOverlay' } }
  if (action === 'playAnimation') return buildPlayAnimation(args)
  if (action === 'setVariant') return buildSetVariant(args)
  return buildSetState(args)
}

export interface TransitionArgs {
  transition?: string
  duration_ms?: number
  easing?: string
  direction?: string
  spring_bounce?: number
}

export function readTransition(args: TransitionArgs): TransitionResult {
  return buildTransition(
    args.transition,
    args.duration_ms,
    args.easing,
    args.direction,
    args.spring_bounce
  )
}

/** Cross-check an action against the node's authored prototype payloads. */
function validateStateTarget(
  figma: FigmaAPI,
  nodeId: string,
  action: Extract<PrototypeAction, { type: 'setState' }>
): string | null {
  const raw = figma.graph.getNode(nodeId)
  const model = raw ? readNodeStateModel(raw) : null
  if (!model) {
    return `Node "${nodeId}" has no state model yet — call create_state first`
  }
  if (!model.states.some((s) => s.name === action.state)) {
    const names = model.states.map((s) => s.name).join(', ')
    return `State "${action.state}" not defined on node "${nodeId}". Available: ${names}`
  }
  return null
}

function validateAnimationTarget(
  figma: FigmaAPI,
  nodeId: string,
  action: Extract<PrototypeAction, { type: 'playAnimation' }>
): string | null {
  const raw = figma.graph.getNode(nodeId)
  const container = raw ? readNodeAnimations(raw) : null
  const isAnimation = container?.animations?.some((a) => a.id === action.animationId) ?? false
  const isGroup = container?.groups?.some((g) => g.id === action.animationId) ?? false
  if (action.group === true ? !isGroup : !isAnimation) {
    const ids =
      action.group === true
        ? container?.groups?.map((g) => g.id).join(', ') || 'none'
        : container?.animations?.map((a) => a.id).join(', ') || 'none'
    const kind = action.group === true ? 'animation group' : 'animation'
    return `${kind[0]?.toUpperCase()}${kind.slice(1)} "${action.animationId}" not found on node "${nodeId}". Present: ${ids}`
  }
  return null
}

function validateVariantTarget(
  figma: FigmaAPI,
  nodeId: string,
  action: Extract<PrototypeAction, { type: 'setVariant' }>
): string | null {
  const raw = figma.graph.getNode(nodeId)
  if (!raw) return `Node "${nodeId}" not found`
  if (raw.type !== 'INSTANCE') {
    return `setVariant needs an INSTANCE node; "${nodeId}" is ${raw.type}`
  }
  if (!resolveVariantComponentId(figma.graph, nodeId, action.variant)) {
    return `No variant matches "${action.variant}" on the component set of "${nodeId}"`
  }
  return null
}

export function validateActionTarget(
  figma: FigmaAPI,
  nodeId: string,
  action: PrototypeAction
): string | null {
  if (action.type === 'setState') return validateStateTarget(figma, nodeId, action)
  if (action.type === 'playAnimation') return validateAnimationTarget(figma, nodeId, action)
  if (action.type === 'setVariant') return validateVariantTarget(figma, nodeId, action)
  return null
}

/** Guards read prototype state variables; unknown names never fire. */
export function validateGuardVars(
  figma: FigmaAPI,
  nodeId: string,
  guard: PrototypeGuard
): string | null {
  const raw = figma.graph.getNode(nodeId)
  const model = raw ? readNodeStateModel(raw) : null
  if (!model) return `Node "${nodeId}" has no state model yet — call create_state first`
  const vars = model.vars ?? {}
  for (const condition of guard.all) {
    if (!(condition.variable in vars)) {
      const names = Object.keys(vars).join(', ') || 'none'
      return `Guard references unknown variable "${condition.variable}". Declared vars: ${names}`
    }
  }
  return null
}

export function writeInteractions(
  figma: FigmaAPI,
  nodeId: string,
  interactions: PrototypeInteraction[]
): string | null {
  const node = figma.getNodeById(nodeId)
  if (!node) return `Node "${nodeId}" not found`
  node.setPluginData(
    INTERACTIONS_PLUGIN_KEY,
    interactions.length > 0 ? serializePluginValue(interactions) : ''
  )
  return null
}

export function findInteraction(
  figma: FigmaAPI,
  nodeId: string,
  interactionId: string
): { interactions: PrototypeInteraction[]; index: number } | { error: string } {
  const raw = figma.graph.getNode(nodeId)
  if (!raw) return { error: `Node "${nodeId}" not found` }
  const interactions = readNodeInteractions(raw)
  const index = interactions.findIndex((i) => i.id === interactionId)
  if (index === -1) {
    const ids = interactions.map((i) => i.id).join(', ') || 'none'
    return {
      error: `Interaction "${interactionId}" not found on node "${nodeId}". Present: ${ids}`
    }
  }
  return { interactions, index }
}

/** Trigger param block shared by create/edit interaction tools. */
export const triggerParams = {
  trigger: {
    type: 'string' as const,
    description: 'Trigger event',
    enum: TRIGGERS,
    default: 'click'
  },
  delay_ms: {
    type: 'number' as const,
    description: 'Delay for trigger=afterDelay (0–120000 ms)',
    min: 0,
    max: MAX_DURATION_MS
  }
}

/** Action param block shared by create/edit interaction tools. */
export const actionParams = {
  action: {
    type: 'string' as const,
    description: 'Action type',
    enum: ACTIONS,
    required: true as const
  },
  destination_id: { type: 'string' as const, description: 'Target node for navigate' },
  overlay_id: { type: 'string' as const, description: 'Overlay node for openOverlay' },
  backdrop_opacity: {
    type: 'number' as const,
    description: 'Overlay backdrop opacity 0–1 (openOverlay)',
    min: 0,
    max: 1
  },
  state: { type: 'string' as const, description: 'State name for setState' },
  animation_id: {
    type: 'string' as const,
    description: 'Animation or animation group id (playAnimation)'
  },
  group: {
    type: 'boolean' as const,
    description: 'True when animation_id names an animation group (playAnimation)'
  },
  variant: {
    type: 'string' as const,
    description: 'Variant spec "Name=Value[,Name=Value]" (setVariant)'
  }
}

/** Guard param block (JSON `{"all":[...]}`) shared by interaction tools. */
export const guardParams = {
  guard: {
    type: 'string' as const,
    description:
      'Optional guard JSON: {"all":[{"variable":"open","op":"eq","value":true}]}; the interaction only fires when every condition holds'
  }
}

/** Transition param block shared by interaction tools. */
export const transitionParams = {
  transition: {
    type: 'string' as const,
    description: 'Transition kind (default fade)',
    enum: TRANSITIONS
  },
  duration_ms: {
    type: 'number' as const,
    description: 'Duration in ms (fade/slide, default 300)',
    min: 0,
    max: MAX_DURATION_MS
  },
  easing: { type: 'string' as const, description: 'Easing (fade/slide)', enum: EASINGS },
  direction: { type: 'string' as const, description: 'Slide direction', enum: DIRECTIONS },
  spring_bounce: {
    type: 'number' as const,
    description: 'Spring bounce 0–1 (spring, default 0.25)',
    min: 0,
    max: 1
  }
}

/** Visual-target fields accepted by state-visual and keyframe tool args. */
export interface VisualFieldArgs {
  scale?: number
  opacity?: number
  translate_x?: number
  translate_y?: number
  rotation?: number
  width?: number
  height?: number
  corner_radius?: number
  fill?: string
  blur?: number
}

/** Visual-target param block shared by state-visual and keyframe tools. */
export const visualParams = {
  scale: { type: 'number' as const, description: 'Scale factor (0–10]', min: 0, max: 10 },
  opacity: { type: 'number' as const, description: 'Opacity 0–1', min: 0, max: 1 },
  translate_x: { type: 'number' as const, description: 'Horizontal offset px' },
  translate_y: { type: 'number' as const, description: 'Vertical offset px' },
  rotation: { type: 'number' as const, description: 'Extra rotation in degrees' },
  width: { type: 'number' as const, description: 'Absolute target width px (≥ 0)', min: 0 },
  height: { type: 'number' as const, description: 'Absolute target height px (≥ 0)', min: 0 },
  corner_radius: {
    type: 'number' as const,
    description: 'Absolute corner radius px (≥ 0)',
    min: 0
  },
  fill: { type: 'string' as const, description: 'Absolute fill color (CSS)' },
  blur: { type: 'number' as const, description: 'Extra layer blur radius px (≥ 0)', min: 0 }
}

export function buildInteraction(
  figma: FigmaAPI,
  nodeId: string,
  args: ActionArgs & TransitionArgs & { trigger?: string; delay_ms?: number; guard?: string }
): { interaction: PrototypeInteraction } | { error: string } {
  const trigger = args.trigger ?? 'click'
  if (!TRIGGERS.includes(trigger)) return { error: `Invalid trigger "${args.trigger}"` }
  if (trigger === 'afterDelay') {
    if (args.delay_ms === undefined) {
      return { error: 'delay_ms is required when trigger=afterDelay' }
    }
    if (!Number.isFinite(args.delay_ms) || args.delay_ms < 0 || args.delay_ms > MAX_DURATION_MS) {
      return { error: `delay_ms must be between 0 and ${MAX_DURATION_MS}` }
    }
  }

  const actionResult = buildAction(figma, args)
  if ('error' in actionResult) return actionResult
  const targetError = validateActionTarget(figma, nodeId, actionResult.action)
  if (targetError) return { error: targetError }

  const transitionResult = readTransition(args)
  if ('error' in transitionResult) return transitionResult

  const guardResult = parseGuard(args.guard)
  if ('error' in guardResult) return guardResult
  if (guardResult.guard) {
    const guardError = validateGuardVars(figma, nodeId, guardResult.guard)
    if (guardError) return { error: guardError }
  }

  const interaction: PrototypeInteraction = {
    id: crypto.randomUUID(),
    trigger: trigger as PrototypeInteraction['trigger'],
    action: actionResult.action,
    transition: transitionResult.transition
  }
  if (args.delay_ms !== undefined && trigger === 'afterDelay') interaction.delayMs = args.delay_ms
  if (guardResult.guard) interaction.guard = guardResult.guard
  return { interaction }
}

export function walkSubtree(
  figma: FigmaAPI,
  rootId: string,
  visit: (nodeId: string) => void
): void {
  const node = figma.graph.getNode(rootId)
  if (!node) return
  visit(rootId)
  for (const childId of node.childIds) walkSubtree(figma, childId, visit)
}
