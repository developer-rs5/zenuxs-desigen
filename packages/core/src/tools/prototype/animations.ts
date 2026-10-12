import { parse } from 'culori'
import * as v from 'valibot'

import {
  ANIMATIONS_PLUGIN_KEY,
  AnimationGroupSchema,
  readNodeAnimations,
  serializePluginValue,
  type PrototypeAnimation,
  type PrototypeAnimations,
  type PrototypeAnimationGroup,
  type PrototypeKeyframe,
  type PrototypeStateVisual
} from '@open-pencil/scene-graph'

import type { FigmaAPI } from '#core/figma-api'
import { defineTool } from '#core/tools/schema'

import { EASINGS, MAX_DURATION_MS, visualParams, type VisualFieldArgs } from './helpers'

/**
 * Keyframe animation authoring (spec §3/§16 `createAnimation`/`addKeyframe`).
 * All writes go through one container read→mutate→write so a rejected input
 * never leaves a partial `prototypeAnimations` payload behind.
 */

const PLAY_MODES = ['once', 'loop']

function writeAnimations(
  figma: FigmaAPI,
  nodeId: string,
  container: PrototypeAnimations
): string | null {
  const node = figma.getNodeById(nodeId)
  if (!node) return `Node "${nodeId}" not found`
  node.setPluginData(ANIMATIONS_PLUGIN_KEY, serializePluginValue(container))
  return null
}

function containerFor(figma: FigmaAPI, nodeId: string): PrototypeAnimations | { error: string } {
  const raw = figma.graph.getNode(nodeId)
  if (!raw) return { error: `Node "${nodeId}" not found` }
  return readNodeAnimations(raw) ?? { version: 1, animations: [], groups: [] }
}

/** Range-check the numeric keyframe fields; null means the field is valid/absent. */
function keyframeNumberError(args: VisualFieldArgs): string | null {
  if (
    args.scale !== undefined &&
    (!Number.isFinite(args.scale) || args.scale <= 0 || args.scale > 10)
  ) {
    return 'scale must be in (0–10]'
  }
  if (
    args.opacity !== undefined &&
    (!Number.isFinite(args.opacity) || args.opacity < 0 || args.opacity > 1)
  ) {
    return 'opacity must be between 0 and 1'
  }
  for (const [label, value] of [
    ['width', args.width],
    ['height', args.height],
    ['corner_radius', args.corner_radius],
    ['blur', args.blur]
  ] as const) {
    if (value !== undefined && (!Number.isFinite(value) || value < 0)) return `${label} must be ≥ 0`
  }
  return null
}

/** Build a keyframe visual from flat params; null fields stay absent. */
function buildVisual(args: VisualFieldArgs): { visual: PrototypeStateVisual } | { error: string } {
  const numberError = keyframeNumberError(args)
  if (numberError !== null) return { error: numberError }
  if (args.fill !== undefined && !parse(args.fill)) {
    return { error: `fill "${args.fill}" is not a valid CSS color` }
  }

  const visual: PrototypeStateVisual = {}
  const set = (key: keyof PrototypeStateVisual, value: number | string | undefined): void => {
    if (value !== undefined) (visual as Record<string, number | string>)[key] = value
  }
  set('scale', args.scale)
  set('opacity', args.opacity)
  set('translateX', args.translate_x)
  set('translateY', args.translate_y)
  set('rotation', args.rotation)
  set('width', args.width)
  set('height', args.height)
  set('cornerRadius', args.corner_radius)
  set('fill', args.fill)
  set('blur', args.blur)
  if (Object.keys(visual).length === 0) {
    return { error: 'Provide at least one keyframe visual field (scale, opacity, translate, …)' }
  }
  return { visual }
}

/** Validate `create_animation` timeline params; errors are user-facing messages. */
function animationParamsError(args: {
  duration_ms?: number
  play_mode?: string
  easing?: string
}): string | null {
  const duration = args.duration_ms ?? 300
  if (!Number.isFinite(duration) || duration < 0 || duration > MAX_DURATION_MS) {
    return `duration_ms must be between 0 and ${MAX_DURATION_MS}`
  }
  if (args.play_mode !== undefined && !PLAY_MODES.includes(args.play_mode)) {
    return `Invalid play_mode "${args.play_mode}"`
  }
  if (args.easing !== undefined && !EASINGS.includes(args.easing)) {
    return `Invalid easing "${args.easing}"`
  }
  return null
}

/** Assemble (or refresh) the animation record for `create_animation`. */
function upsertAnimation(
  container: PrototypeAnimations,
  args: {
    name?: string
    animation_id?: string
    duration_ms?: number
    play_mode?: string
    easing?: string
  }
):
  | { animation: PrototypeAnimation; animations: PrototypeAnimation[]; created: boolean }
  | { error: string } {
  const animations = [...(container.animations ?? [])]
  const id = args.animation_id?.trim() || crypto.randomUUID()
  const index = animations.findIndex((animation) => animation.id === id)
  const existing = index !== -1 ? animations[index] : undefined
  const name = (args.name ?? existing?.name ?? 'Animation').trim() || 'Animation'
  const easing = args.easing
  const next: PrototypeAnimation = {
    id,
    name: name.slice(0, 64),
    durationMs: args.duration_ms ?? existing?.durationMs ?? 300,
    // Seeded first keyframe = the authored look, so playback starts in place.
    keyframes: existing?.keyframes ?? [{ offsetMs: 0, visual: {} }],
    playMode: (args.play_mode ?? existing?.playMode ?? 'once') as PrototypeAnimation['playMode'],
    ...(easing ? { easing: easing as PrototypeAnimation['easing'] } : {})
  }
  if (index !== -1) animations[index] = next
  else animations.push(next)
  if (animations.length > 64) return { error: 'A node supports at most 64 animations' }
  return { animation: next, animations, created: index === -1 }
}

export const createAnimation = defineTool({
  name: 'create_animation',
  mutates: true,
  description:
    'Create (or update) a keyframe animation on a node: a named timeline of visual keyframes played by playAnimation interactions. Seeds a first keyframe at 0 ms holding the authored look.',
  params: {
    node_id: { type: 'string', description: 'Node that owns the animation', required: true },
    name: { type: 'string', description: 'Animation name (1–64 chars)' },
    animation_id: { type: 'string', description: 'Reuse an id to update an existing animation' },
    duration_ms: {
      type: 'number',
      description: 'Timeline duration in ms (default 300)',
      min: 0,
      max: MAX_DURATION_MS
    },
    play_mode: { type: 'string', description: 'once (default) or loop', enum: PLAY_MODES },
    easing: { type: 'string', description: 'Default easing between keyframes', enum: EASINGS }
  },
  execute: (figma, args) => {
    const container = containerFor(figma, args.node_id)
    if ('error' in container) return container
    const paramError = animationParamsError(args)
    if (paramError !== null) return { error: paramError }

    const built = upsertAnimation(container, args)
    if ('error' in built) return built

    const updated: PrototypeAnimations = { ...container, animations: built.animations }
    const writeError = writeAnimations(figma, args.node_id, updated)
    if (writeError) return { error: writeError }
    return {
      node_id: args.node_id,
      animation_id: built.animation.id,
      keyframes: built.animation.keyframes.length,
      created: built.created
    }
  }
})

export const addKeyframe = defineTool({
  name: 'add_keyframe',
  mutates: true,
  description:
    'Append an ordered keyframe to an animation (create_animation first). Offsets are strictly increasing; duplicates are rejected so keyframe order stays valid.',
  params: {
    node_id: { type: 'string', description: 'Node owning the animation', required: true },
    animation_id: { type: 'string', description: 'Animation id', required: true },
    offset_ms: {
      type: 'number',
      description: 'Position on the timeline (0–120000 ms)',
      required: true,
      min: 0,
      max: MAX_DURATION_MS
    },
    easing: { type: 'string', description: 'Segment easing entering this keyframe', enum: EASINGS },
    ...visualParams
  },
  execute: (figma, args) => {
    const container = containerFor(figma, args.node_id)
    if ('error' in container) return container
    const animations = [...(container.animations ?? [])]
    const index = animations.findIndex((animation) => animation.id === args.animation_id)
    if (index === -1) {
      const ids = animations.map((animation) => animation.id).join(', ') || 'none'
      return { error: `Animation "${args.animation_id}" not found. Present: ${ids}` }
    }
    const visualResult = buildVisual(args)
    if ('error' in visualResult) return visualResult
    if (args.easing !== undefined && !EASINGS.includes(args.easing)) {
      return { error: `Invalid easing "${args.easing}"` }
    }
    const offset = args.offset_ms
    if (!Number.isFinite(offset) || offset < 0 || offset > MAX_DURATION_MS) {
      return { error: `offset_ms must be between 0 and ${MAX_DURATION_MS}` }
    }

    const animation = animations.at(index)
    if (!animation) return { error: `Animation "${args.animation_id}" not found` }
    if (animation.keyframes.some((keyframe) => keyframe.offsetMs === offset)) {
      return { error: `A keyframe already exists at ${offset} ms` }
    }
    if (animation.keyframes.length >= 64)
      return { error: 'An animation supports at most 64 keyframes' }
    const keyframe: PrototypeKeyframe = {
      offsetMs: offset,
      visual: visualResult.visual,
      ...(args.easing ? { easing: args.easing as PrototypeKeyframe['easing'] } : {})
    }
    const keyframes = [...animation.keyframes, keyframe].sort((a, b) => a.offsetMs - b.offsetMs)
    animations[index] = { ...animation, keyframes }

    const writeError = writeAnimations(figma, args.node_id, { ...container, animations })
    if (writeError) return { error: writeError }
    return {
      node_id: args.node_id,
      animation_id: animation.id,
      offset_ms: offset,
      keyframes: keyframes.length
    }
  }
})

export const createAnimationGroup = defineTool({
  name: 'create_animation_group',
  mutates: true,
  description:
    'Group animations on a node for sequence (chained delays) or parallel (concurrent) playback, referenced by playAnimation with group=true.',
  params: {
    node_id: { type: 'string', description: 'Node that owns the group', required: true },
    name: { type: 'string', description: 'Group name (1–64 chars)' },
    group_id: { type: 'string', description: 'Reuse an id to update an existing group' },
    mode: {
      type: 'string',
      description: 'sequence (default) or parallel',
      enum: ['sequence', 'parallel']
    },
    items: {
      type: 'string',
      description:
        'JSON items: [{"animationId":"anim-1","delayMs":100}] (1–32 entries, ids from create_animation)'
    }
  },
  execute: (figma, args) => {
    const container = containerFor(figma, args.node_id)
    if ('error' in container) return container
    let raw: unknown
    try {
      raw = JSON.parse(args.items ?? '[]') as unknown
    } catch {
      return { error: 'items must be JSON like [{"animationId":"anim-1","delayMs":100}]' }
    }
    const parsed = v.safeParse(AnimationGroupSchema, {
      id: args.group_id?.trim() || crypto.randomUUID(),
      name: (args.name ?? 'Group').trim() || 'Group',
      mode: args.mode ?? 'sequence',
      items: raw
    })
    if (!parsed.success) {
      return { error: 'items must be JSON like [{"animationId":"anim-1","delayMs":100}] (max 32)' }
    }
    const group: PrototypeAnimationGroup = parsed.output
    const known = new Set((container.animations ?? []).map((animation) => animation.id))
    const missing = group.items.filter((item) => !known.has(item.animationId))
    if (missing.length > 0) {
      const ids = missing.map((item) => item.animationId).join(', ')
      return { error: `Unknown animation id(s): ${ids}. Call create_animation first.` }
    }

    const groups = [...(container.groups ?? [])]
    const index = groups.findIndex((entry) => entry.id === group.id)
    if (index !== -1) groups[index] = group
    else {
      if (groups.length >= 32) return { error: 'A node supports at most 32 animation groups' }
      groups.push(group)
    }
    const writeError = writeAnimations(figma, args.node_id, { ...container, groups })
    if (writeError) return { error: writeError }
    return {
      node_id: args.node_id,
      group_id: group.id,
      mode: group.mode,
      items: group.items.length,
      created: index === -1
    }
  }
})
