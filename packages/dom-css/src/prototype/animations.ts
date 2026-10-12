import type { PrototypeAnimation, PrototypeStateVisual, SceneNode } from '@open-pencil/scene-graph'
import { findAnimation, readNodeAnimations } from '@open-pencil/scene-graph'

import { record, type NodeContext, type WalkContext } from './context'
import {
  keyframeBlock,
  keyframesRule,
  resolvedVisual,
  visualCSS,
  type AnimationTiming,
  type PrototypeCSSProperty
} from './css'
import {
  bumpCount,
  easingToCSS,
  type PrototypeExportIssue,
  type PrototypeExportStatus
} from './support'

/**
 * `@keyframes` emission: every anchor frame resolves against the authored
 * node (preview's base), the property channel set is the union across
 * frames so component-wise interpolation stays clean, and per-frame timing
 * mirrors `keyframeVisual`'s `frame.easing ?? animation.easing ?? 'linear'`.
 */

export interface EmittedAnimation {
  name: string
  status: PrototypeExportStatus
  emittedAs?: string
}

export function emitAnimation(
  ctx: WalkContext,
  node: SceneNode,
  animation: PrototypeAnimation,
  local: NodeContext
): EmittedAnimation {
  const name = `op-anim-${ctx.animSeq}`
  ctx.animSeq += 1
  const frames = [...animation.keyframes].sort((a, b) => a.offsetMs - b.offsetMs)
  const resolvedFrames = frames.map((frame) => resolvedVisual(node, frame.visual))
  const { only, status, emittedAs } = animationChannels(ctx, node, animation, local, resolvedFrames)

  const blocks: string[] = []
  const firstOffset = frames[0]?.offsetMs ?? 0
  // Preview holds the base before the first keyframe; step-end reproduces it.
  if (firstOffset > 0) blocks.push('0% { animation-timing-function: step-end }')
  const duration = animation.durationMs
  for (let index = 0; index < frames.length; index++) {
    const frame = frames[index]
    const visual = resolvedFrames[index]
    const percent = duration > 0 ? (frame.offsetMs / duration) * 100 : 0
    const timing = easingToCSS(frame.easing ?? animation.easing ?? 'linear')
    blocks.push(keyframeBlock(percent, visualCSS(node, visual, only).declarations, timing))
  }
  ctx.css.push(keyframesRule(name, blocks))

  const entry: Omit<PrototypeExportIssue, 'nodeId' | 'nodeName'> = {
    feature: 'animation',
    detail: `animation "${animation.name}" → @keyframes ${name} (${frames.length} frames, ${duration}ms)`,
    status
  }
  if (emittedAs) entry.emittedAs = emittedAs
  record(ctx, node.id, node.name, entry)
  bumpCount(ctx.report.animations, status)
  return { name, status, emittedAs }
}

/** Union of expressible channels; fill/filter are withheld when parity gaps exist. */
function animationChannels(
  ctx: WalkContext,
  node: SceneNode,
  animation: PrototypeAnimation,
  local: NodeContext,
  resolvedFrames: readonly PrototypeStateVisual[]
): { only: ReadonlySet<PrototypeCSSProperty>; status: PrototypeExportStatus; emittedAs?: string } {
  const full = resolvedFrames.map((visual) => visualCSS(node, visual))
  const union = new Set<PrototypeCSSProperty>()
  for (const entry of full) {
    for (const property of entry.properties) union.add(property)
  }
  let status: PrototypeExportStatus = 'exported'
  let emittedAs: string | undefined
  if (full.some((entry) => entry.unsupported)) {
    union.delete('background-color')
    status = 'exported-approximate'
    emittedAs = '@keyframes without the fill channel'
    record(ctx, node.id, node.name, {
      feature: 'visual',
      detail: `animation "${animation.name}" keyframe fill is not a solid color`,
      status: 'skipped',
      reason: 'fill'
    })
  }
  if (local.authoredBlur > 0) {
    union.delete('filter')
    if (resolvedFrames.some((visual) => visual.blur !== 0)) local.blurGap = true
  }
  return { only: union, status, emittedAs }
}

interface ResolvableGroup {
  items: ReadonlyArray<{ animationId: string; delayMs?: number }>
  mode: 'sequence' | 'parallel'
}

export interface ResolvedGroupTimings {
  timings: AnimationTiming[]
  resolved: number
  total: number
}

/**
 * Group playback entries with cumulative delays: sequence chains each item
 * after the previous one, parallel honors per-item delays — the same shape
 * `resolveGroupItems` plans in `packages/core/src/prototype/keyframes.ts`.
 */
export function groupAnimationTimings(
  node: SceneNode,
  group: ResolvableGroup,
  names: ReadonlyMap<string, string>
): ResolvedGroupTimings {
  const container = readNodeAnimations(node)
  const timings: AnimationTiming[] = []
  let cursor = 0
  let resolved = 0
  for (const item of group.items) {
    const animation = container ? findAnimation(container, item.animationId) : null
    if (!animation) continue
    const name = names.get(animation.id)
    if (!name) continue
    const delay = item.delayMs ?? 0
    const startMs = group.mode === 'sequence' ? cursor + delay : delay
    timings.push({
      name,
      durationMs: animation.durationMs,
      timing: easingToCSS(animation.easing ?? 'linear'),
      delayMs: startMs,
      loop: false
    })
    cursor = group.mode === 'sequence' ? startMs + animation.durationMs : cursor
    resolved += 1
  }
  return { timings, resolved, total: group.items.length }
}
