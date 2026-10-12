import { parse } from 'culori'
import * as v from 'valibot'

import {
  readNodeStateModel,
  serializePluginValue,
  STATE_PLUGIN_KEY,
  PrototypeVarValueSchema,
  type PrototypeStateModel,
  type PrototypeStateVisual,
  type PrototypeTransition
} from '@open-pencil/scene-graph'

import type { FigmaAPI } from '#core/figma-api'
import { defineTool } from '#core/tools/schema'

import {
  readTransition,
  transitionParams,
  visualParams,
  type TransitionArgs,
  type VisualFieldArgs
} from './helpers'

/** Transition params present means "write a state transition"; none leaves it untouched. */
function stateTransition(
  args: TransitionArgs
): { transition?: PrototypeTransition } | { error: string } {
  const provided =
    args.transition !== undefined ||
    args.duration_ms !== undefined ||
    args.easing !== undefined ||
    args.direction !== undefined ||
    args.spring_bounce !== undefined
  if (!provided) return {}
  const built = readTransition(args)
  if ('error' in built) return built
  return { transition: built.transition }
}

const VARS_ERROR = 'vars must be JSON like {"open":true,"count":2}'

/**
 * `vars` is declared as a JSON string, but models also send `""` or `"{}"`
 * when they mean "no variables" — `JSON.parse('')` throws, the tool errors, and
 * the model reports a generic "vars invalid" complaint instead of recovering.
 * Treat the empty shapes as unset; only genuinely malformed input errors.
 */
function parseVars(
  input: string | undefined
): { vars?: Record<string, v.InferOutput<typeof PrototypeVarValueSchema>> } | { error: string } {
  if (input === undefined) return {}
  const trimmed = input.trim()
  if (trimmed === '' || trimmed === '{}') return {}
  let raw: unknown
  try {
    raw = JSON.parse(input) as unknown
  } catch {
    return { error: VARS_ERROR }
  }
  const result = v.safeParse(
    v.pipe(v.record(v.string(), PrototypeVarValueSchema), v.maxEntries(32)),
    raw
  )
  if (!result.success) return { error: `${VARS_ERROR} (max 32 keys)` }
  return { vars: result.output }
}

export const createState = defineTool({
  name: 'create_state',
  mutates: true,
  description:
    'Create the component-state model on a node (or add a named state to an existing model). States hold visual values like hover/pressed scale and opacity; optional transition is that state’s fallback motion, vars seed prototype variables guards read.',
  params: {
    node_id: { type: 'string', description: 'Node to attach states to', required: true },
    state_name: { type: 'string', description: 'State name (default "default", max 64 chars)' },
    vars: {
      type: 'string',
      description: 'Optional JSON prototype variables, e.g. {"open":false} (max 32 keys)'
    },
    ...transitionParams
  },
  execute: (figma, args) => {
    const raw = figma.graph.getNode(args.node_id)
    if (!raw) return { error: `Node "${args.node_id}" not found` }
    const name = (args.state_name ?? 'default').trim()
    if (!name || name.length > 64) return { error: 'state_name must be 1–64 characters' }
    const varsResult = parseVars(args.vars)
    if ('error' in varsResult) return varsResult
    const transitionResult = stateTransition(args)
    if ('error' in transitionResult) return transitionResult

    const definition = {
      name,
      visual: {},
      ...(transitionResult.transition ? { transition: transitionResult.transition } : {})
    }
    const model = readNodeStateModel(raw)
    if (model) {
      if (model.states.some((s) => s.name === name)) {
        if (!varsResult.vars && !transitionResult.transition) {
          return {
            node_id: args.node_id,
            state_name: name,
            already_exists: true,
            states: model.states.map((s) => s.name)
          }
        }
      }
      const states = model.states.some((s) => s.name === name)
        ? model.states.map((state) =>
            state.name === name && transitionResult.transition
              ? { ...state, transition: transitionResult.transition }
              : state
          )
        : [...model.states, definition]
      const next: PrototypeStateModel = {
        ...model,
        states,
        ...(varsResult.vars ? { vars: { ...model.vars, ...varsResult.vars } } : {})
      }
      figma.getNodeById(args.node_id)?.setPluginData(STATE_PLUGIN_KEY, serializePluginValue(next))
      return { node_id: args.node_id, state_name: name, states: next.states.map((s) => s.name) }
    }
    const created: PrototypeStateModel = {
      version: 1,
      initial: name,
      states: [definition],
      ...(varsResult.vars ? { vars: varsResult.vars } : {})
    }
    figma.getNodeById(args.node_id)?.setPluginData(STATE_PLUGIN_KEY, serializePluginValue(created))
    return { node_id: args.node_id, state_name: name, initial: name, states: [name] }
  }
})

/** Shared lookup: node exists → has a state model → named state exists. */
function requireState(
  figma: FigmaAPI,
  nodeId: string,
  stateName: string
): { model: PrototypeStateModel; index: number } | { error: string } {
  const raw = figma.graph.getNode(nodeId)
  if (!raw) return { error: `Node "${nodeId}" not found` }
  const model = readNodeStateModel(raw)
  if (!model) return { error: `Node "${nodeId}" has no state model — call create_state first` }
  const index = model.states.findIndex((state) => state.name === stateName)
  if (index === -1) {
    const names = model.states.map((state) => state.name).join(', ')
    return { error: `State "${stateName}" not found. Available: ${names}` }
  }
  return { model, index }
}

export const applyState = defineTool({
  name: 'apply_state',
  mutates: true,
  description:
    'Set the current (initial) state of a node’s state model — e.g. "the button starts pressed". Runtime state changes still happen through setState interactions; this chooses the resting state and persists it.',
  params: {
    node_id: { type: 'string', description: 'Node owning the state model', required: true },
    state_name: {
      type: 'string',
      description: 'Existing state to apply as initial',
      required: true
    }
  },
  execute: (figma, args) => {
    const found = requireState(figma, args.node_id, args.state_name)
    if ('error' in found) return found
    const next: PrototypeStateModel = { ...found.model, initial: args.state_name }
    figma.getNodeById(args.node_id)?.setPluginData(STATE_PLUGIN_KEY, serializePluginValue(next))
    return {
      node_id: args.node_id,
      initial: args.state_name,
      states: found.model.states.map((state) => state.name)
    }
  }
})

/** True when the request carries at least one writable visual field. */
function hasVisualField(args: VisualFieldArgs): boolean {
  return (
    args.scale !== undefined ||
    args.opacity !== undefined ||
    args.translate_x !== undefined ||
    args.translate_y !== undefined ||
    args.rotation !== undefined ||
    args.width !== undefined ||
    args.height !== undefined ||
    args.corner_radius !== undefined ||
    args.fill !== undefined ||
    args.blur !== undefined
  )
}

function fillError(fill: string): string | null {
  return parse(fill) ? null : `fill "${fill}" is not a valid CSS color`
}

/** Range-check and copy each provided field onto `visual`; error on the first bad value. */
function applyStateVisualFields(
  visual: PrototypeStateVisual,
  args: VisualFieldArgs
): PrototypeStateVisual | { error: string } {
  const {
    scale,
    opacity,
    translate_x,
    translate_y,
    rotation,
    width,
    height,
    corner_radius,
    fill,
    blur
  } = args
  if (scale !== undefined) {
    if (!Number.isFinite(scale) || scale <= 0 || scale > 10)
      return { error: 'scale must be in (0–10]' }
    visual.scale = scale
  }
  if (opacity !== undefined) {
    if (!Number.isFinite(opacity) || opacity < 0 || opacity > 1) {
      return { error: 'opacity must be between 0 and 1' }
    }
    visual.opacity = opacity
  }
  if (translate_x !== undefined) visual.translateX = translate_x
  if (translate_y !== undefined) visual.translateY = translate_y
  if (rotation !== undefined) {
    if (!Number.isFinite(rotation)) return { error: 'rotation must be a finite number' }
    visual.rotation = rotation
  }
  for (const [label, value, field] of [
    ['width', width, 'width'],
    ['height', height, 'height'],
    ['corner_radius', corner_radius, 'cornerRadius'],
    ['blur', blur, 'blur']
  ] as const) {
    if (value === undefined) continue
    if (!Number.isFinite(value) || value < 0) return { error: `${label} must be ≥ 0` }
    visual[field] = value
  }
  if (fill !== undefined) {
    const error = fillError(fill)
    if (error !== null) return { error }
    visual.fill = fill
  }
  return visual
}

/**
 * Validate one `set_state_visual` request onto a copy of the state's current
 * visual: at least one field, then per-field ranges, then fill parse.
 */
function mergeStateVisual(
  existing: PrototypeStateVisual | undefined,
  args: VisualFieldArgs
): { visual: PrototypeStateVisual } | { error: string } {
  if (!hasVisualField(args)) {
    return {
      error:
        'Provide at least one of scale, opacity, translate_x, translate_y, rotation, width, height, corner_radius, fill, blur'
    }
  }
  const applied = applyStateVisualFields({ ...existing }, args)
  return 'error' in applied ? applied : { visual: applied }
}

export const setStateVisual = defineTool({
  name: 'set_state_visual',
  mutates: true,
  description:
    'Set visual values (scale/opacity/translate/rotation/size/cornerRadius/fill/blur) for one named state on a node — e.g. pressed = scale 0.96. Requires create_state first.',
  params: {
    node_id: { type: 'string', description: 'Node owning the state model', required: true },
    state_name: { type: 'string', description: 'Existing state name', required: true },
    ...visualParams,
    ...transitionParams
  },
  execute: (figma, args) => {
    const found = requireState(figma, args.node_id, args.state_name)
    if ('error' in found) return found
    const { model, index } = found

    const existing = model.states.at(index)
    if (!existing) return { error: `State "${args.state_name}" not found` }
    const merged = mergeStateVisual(existing.visual, args)
    if ('error' in merged) return merged
    const { visual } = merged

    const transitionResult = stateTransition(args)
    if ('error' in transitionResult) return transitionResult

    const next: PrototypeStateModel = {
      ...model,
      states: model.states.map((state, i) =>
        i === index
          ? {
              ...state,
              visual,
              ...(transitionResult.transition ? { transition: transitionResult.transition } : {})
            }
          : state
      )
    }
    figma.getNodeById(args.node_id)?.setPluginData(STATE_PLUGIN_KEY, serializePluginValue(next))
    return { node_id: args.node_id, state_name: args.state_name, visual }
  }
})
