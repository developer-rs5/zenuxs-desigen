import * as v from 'valibot'

import type { SceneNode } from './types'

/**
 * Prototype / interaction / state / motion document data.
 *
 * Stored as `open-pencil` pluginData JSON (the established document escape
 * hatch): interactions and state models live on their source node, flow
 * metadata on the document root. Everything round-trips through .fig and the
 * server without kiwi schema changes.
 *
 * Concepts stay distinct (spec §4): an interaction has a trigger, an action,
 * and an optional transition; motion (transition timing) is never merged into
 * the action, and component state is not a prototype flow.
 */

export const PROTOTYPE_PLUGIN_ID = 'open-pencil'
export const INTERACTIONS_PLUGIN_KEY = 'interactions'
export const STATE_PLUGIN_KEY = 'prototypeState'
export const PROTOTYPE_DOC_PLUGIN_KEY = 'prototype'
export const ANIMATIONS_PLUGIN_KEY = 'prototypeAnimations'

export const PROTOTYPE_SCHEMA_VERSION = 1

const duration = v.pipe(v.number(), v.minValue(0), v.maxValue(120_000))

export const EasingSchema = v.picklist(['linear', 'ease', 'easeIn', 'easeOut', 'easeInOut'])
export type PrototypeEasing = v.InferOutput<typeof EasingSchema>

export const SpringConfigSchema = v.object({
  mode: v.picklist(['time', 'physics']),
  bounce: v.optional(v.number()),
  stiffness: v.optional(v.number()),
  damping: v.optional(v.number()),
  mass: v.optional(v.number())
})
export type PrototypeSpring = v.InferOutput<typeof SpringConfigSchema>

/** How a visual change happens over time. Evaluation lives in the runtime; this is pure data. */
export const TransitionSchema = v.union([
  v.object({ kind: v.literal('instant') }),
  v.object({
    kind: v.literal('fade'),
    durationMs: duration,
    easing: EasingSchema
  }),
  v.object({
    kind: v.literal('slide'),
    direction: v.picklist(['left', 'right', 'up', 'down']),
    durationMs: duration,
    easing: EasingSchema
  }),
  v.object({
    kind: v.literal('spring'),
    spring: SpringConfigSchema,
    durationMs: v.optional(duration)
  })
])
export type PrototypeTransition = v.InferOutput<typeof TransitionSchema>

export const PrototypeTriggerSchema = v.picklist([
  'load',
  'afterDelay',
  'click',
  'press',
  'release',
  'hoverEnter',
  'hoverLeave',
  'drag',
  'scroll',
  'longPress'
])
export type PrototypeTrigger = v.InferOutput<typeof PrototypeTriggerSchema>

/** Primitive values prototype state variables and guard conditions accept. */
export const PrototypeVarValueSchema = v.union([v.number(), v.string(), v.boolean()])
export type PrototypeVarValue = v.InferOutput<typeof PrototypeVarValueSchema>

export const GUARD_MAX_CONDITIONS = 16
export const STATE_VARS_MAX_KEYS = 32

export const ConditionSchema = v.object({
  variable: v.pipe(v.string(), v.minLength(1), v.maxLength(64)),
  op: v.picklist(['eq', 'neq', 'gt', 'lt', 'gte', 'lte']),
  value: PrototypeVarValueSchema
})
export type PrototypeCondition = v.InferOutput<typeof ConditionSchema>

/** All conditions must hold or the interaction never fires (deterministic). */
export const PrototypeGuardSchema = v.object({
  all: v.pipe(v.array(ConditionSchema), v.minLength(1), v.maxLength(GUARD_MAX_CONDITIONS))
})
export type PrototypeGuard = v.InferOutput<typeof PrototypeGuardSchema>

const varsRecord = v.pipe(
  v.record(v.string(), PrototypeVarValueSchema),
  v.maxEntries(STATE_VARS_MAX_KEYS)
)

export const PrototypeActionSchema = v.union([
  v.object({ type: v.literal('navigate'), destinationId: v.string() }),
  v.object({
    type: v.literal('openOverlay'),
    overlayId: v.string(),
    backdropOpacity: v.optional(v.pipe(v.number(), v.minValue(0), v.maxValue(1)))
  }),
  v.object({ type: v.literal('closeOverlay') }),
  v.object({
    type: v.literal('setState'),
    state: v.string(),
    /** Variable writes applied atomically with the state change. */
    setVars: v.optional(varsRecord)
  }),
  v.object({
    type: v.literal('playAnimation'),
    animationId: v.string(),
    /** True when animationId names an AnimationGroup instead of one animation. */
    group: v.optional(v.boolean())
  }),
  v.object({
    type: v.literal('setVariant'),
    /** `Name=Value[,Name=Value]` pairs matched against the component set variants. */
    variant: v.pipe(v.string(), v.minLength(1), v.maxLength(256))
  })
])
export type PrototypeAction = v.InferOutput<typeof PrototypeActionSchema>

/** What happens when the user does something (spec §4). */
export const PrototypeInteractionSchema = v.object({
  id: v.string(),
  trigger: PrototypeTriggerSchema,
  delayMs: v.optional(duration),
  action: PrototypeActionSchema,
  transition: v.optional(TransitionSchema),
  guard: v.optional(PrototypeGuardSchema)
})
export type PrototypeInteraction = v.InferOutput<typeof PrototypeInteractionSchema>

/**
 * Render-time visual values for a named component state or keyframe
 * (never mutates the document).
 *
 * Scale/opacity/translate are deltas from the authored node. Rotation is an
 * additional rotation in degrees, blur an additional blur radius. Width,
 * height, cornerRadius, and fill are absolute targets resolved against the
 * authored node at evaluation time.
 */
export const PrototypeStateVisualSchema = v.object({
  scale: v.optional(v.number()),
  opacity: v.optional(v.number()),
  translateX: v.optional(v.number()),
  translateY: v.optional(v.number()),
  rotation: v.optional(v.number()),
  width: v.optional(v.pipe(v.number(), v.minValue(0))),
  height: v.optional(v.pipe(v.number(), v.minValue(0))),
  cornerRadius: v.optional(v.pipe(v.number(), v.minValue(0))),
  fill: v.optional(v.pipe(v.string(), v.minLength(1), v.maxLength(64))),
  blur: v.optional(v.pipe(v.number(), v.minValue(0)))
})
export type PrototypeStateVisual = v.InferOutput<typeof PrototypeStateVisualSchema>

export const PrototypeStateDefinitionSchema = v.object({
  name: v.pipe(v.string(), v.minLength(1), v.maxLength(64)),
  visual: PrototypeStateVisualSchema,
  transition: v.optional(TransitionSchema)
})
export type PrototypeStateDefinition = v.InferOutput<typeof PrototypeStateDefinitionSchema>

export const PrototypeStateModelSchema = v.object({
  version: v.number(),
  initial: v.string(),
  states: v.pipe(v.array(PrototypeStateDefinitionSchema), v.minLength(1), v.maxLength(64)),
  /** Initial prototype variable values guards evaluate against. */
  vars: v.optional(varsRecord)
})
export type PrototypeStateModel = v.InferOutput<typeof PrototypeStateModelSchema>

/** One ordered motion sample inside an animation (spec §3 keyframe timelines). */
export const KeyframeSchema = v.object({
  offsetMs: duration,
  visual: PrototypeStateVisualSchema,
  easing: v.optional(EasingSchema)
})
export type PrototypeKeyframe = v.InferOutput<typeof KeyframeSchema>

export const ANIMATIONS_MAX_COUNT = 64
export const GROUPS_MAX_COUNT = 32

/** A named keyframe timeline that animates the node carrying this plugin key. */
export const AnimationSchema = v.object({
  id: v.pipe(v.string(), v.minLength(1), v.maxLength(64)),
  name: v.pipe(v.string(), v.minLength(1), v.maxLength(64)),
  durationMs: duration,
  keyframes: v.pipe(v.array(KeyframeSchema), v.minLength(1), v.maxLength(64)),
  playMode: v.picklist(['once', 'loop']),
  easing: v.optional(EasingSchema)
})
export type PrototypeAnimation = v.InferOutput<typeof AnimationSchema>

export const AnimationGroupSchema = v.object({
  id: v.pipe(v.string(), v.minLength(1), v.maxLength(64)),
  name: v.pipe(v.string(), v.minLength(1), v.maxLength(64)),
  items: v.pipe(
    v.array(
      v.object({
        animationId: v.string(),
        delayMs: v.optional(duration)
      })
    ),
    v.minLength(1),
    v.maxLength(GROUPS_MAX_COUNT)
  ),
  mode: v.picklist(['sequence', 'parallel'])
})
export type PrototypeAnimationGroup = v.InferOutput<typeof AnimationGroupSchema>

/**
 * Node-local animation library stored beside interactions under its own
 * plugin key. Ids are node-local strings, so .fig round-trips need no id
 * remap (pluginData survives verbatim).
 */
export const PrototypeAnimationsSchema = v.object({
  version: v.number(),
  animations: v.optional(v.pipe(v.array(AnimationSchema), v.maxLength(ANIMATIONS_MAX_COUNT))),
  groups: v.optional(v.pipe(v.array(AnimationGroupSchema), v.maxLength(GROUPS_MAX_COUNT)))
})
export type PrototypeAnimations = v.InferOutput<typeof PrototypeAnimationsSchema>

export const PrototypeFlowSchema = v.object({
  id: v.string(),
  name: v.pipe(v.string(), v.minLength(1), v.maxLength(128)),
  startNodeId: v.string()
})
export type PrototypeFlow = v.InferOutput<typeof PrototypeFlowSchema>

/** Document-level prototype metadata stored on the root node. */
export const PrototypeDocumentSchema = v.object({
  version: v.number(),
  flows: v.pipe(v.array(PrototypeFlowSchema), v.maxLength(64)),
  /** Flow that present/preview starts from; falls back to flows[0]. */
  activeFlowId: v.optional(v.string())
})
export type PrototypeDocument = v.InferOutput<typeof PrototypeDocumentSchema>

function readPluginJSON(node: SceneNode, key: string): unknown {
  const raw = node.pluginData.find(
    (entry) => entry.pluginId === PROTOTYPE_PLUGIN_ID && entry.key === key
  )?.value
  if (raw === undefined) return null
  try {
    return JSON.parse(raw) as unknown
  } catch {
    // Malformed data must never crash reads: treat as absent (spec §25).
    return null
  }
}

function parseWith<T>(schema: v.GenericSchema<T>, input: unknown): T | null {
  if (input === null) return null
  const result = v.safeParse(schema, input)
  return result.success ? result.output : null
}

export function readNodeInteractions(node: SceneNode): PrototypeInteraction[] {
  return (
    parseWith(v.array(PrototypeInteractionSchema), readPluginJSON(node, INTERACTIONS_PLUGIN_KEY)) ??
    []
  )
}

export function readNodeStateModel(node: SceneNode): PrototypeStateModel | null {
  return parseWith(PrototypeStateModelSchema, readPluginJSON(node, STATE_PLUGIN_KEY))
}

export function readPrototypeDocument(node: SceneNode): PrototypeDocument | null {
  return parseWith(PrototypeDocumentSchema, readPluginJSON(node, PROTOTYPE_DOC_PLUGIN_KEY))
}

export function readNodeAnimations(node: SceneNode): PrototypeAnimations | null {
  return parseWith(PrototypeAnimationsSchema, readPluginJSON(node, ANIMATIONS_PLUGIN_KEY))
}

export function findAnimation(
  container: PrototypeAnimations | null,
  id: string
): PrototypeAnimation | null {
  return container?.animations?.find((animation) => animation.id === id) ?? null
}

export function findAnimationGroup(
  container: PrototypeAnimations | null,
  id: string
): PrototypeAnimationGroup | null {
  return container?.groups?.find((group) => group.id === id) ?? null
}

/** The flow preview should start from: active flow when valid, else the first. */
export function activeFlow(doc: PrototypeDocument | null): PrototypeFlow | null {
  if (!doc || doc.flows.length === 0) return null
  const active = doc.activeFlowId
    ? (doc.flows.find((flow) => flow.id === doc.activeFlowId) ?? null)
    : null
  return active ?? doc.flows[0]
}

export function serializePluginValue(value: unknown): string {
  return JSON.stringify(value)
}

/**
 * Rewrite embedded node ids inside a serialized prototype pluginData value.
 * SceneNode ids are not stable across .fig export/import (import derives ids
 * from kiwi GUIDs), so export maps flow starts and navigate/overlay
 * destinations through `resolveId`; unknown ids pass through unchanged and
 * invalid JSON is returned as-is.
 * ponytail: files saved before this remap may carry stale ids and need
 * re-authoring once.
 */
export function remapPrototypePluginValue(
  key: string,
  value: string,
  resolveId: (nodeId: string) => string
): string {
  if (key === PROTOTYPE_DOC_PLUGIN_KEY) {
    try {
      // Untrusted JSON: `flows` may be absent even though a full document has it.
      const parsed = JSON.parse(value) as Partial<PrototypeDocument>
      for (const flow of parsed.flows ?? []) {
        flow.startNodeId = resolveId(flow.startNodeId)
      }
      return JSON.stringify(parsed)
    } catch {
      return value
    }
  }
  if (key === INTERACTIONS_PLUGIN_KEY) {
    try {
      const parsed = JSON.parse(value) as unknown
      if (!Array.isArray(parsed)) return value
      for (const entry of parsed) {
        if (!entry || typeof entry !== 'object') continue
        const action = (entry as { action?: unknown }).action
        if (!action || typeof action !== 'object') continue
        const target = action as { destinationId?: string; overlayId?: string }
        if (typeof target.destinationId === 'string')
          target.destinationId = resolveId(target.destinationId)
        if (typeof target.overlayId === 'string') target.overlayId = resolveId(target.overlayId)
      }
      return JSON.stringify(parsed)
    } catch {
      return value
    }
  }
  return value
}
