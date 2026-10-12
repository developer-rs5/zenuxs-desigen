import type {
  PrototypeAnimation,
  PrototypeAnimationGroup,
  PrototypeAnimations,
  PrototypeStateVisual
} from '@open-pencil/scene-graph'
import { findAnimation, findAnimationGroup } from '@open-pencil/scene-graph'

import { easingProgress } from './motion'
import { lerpVisual } from './visuals'

/**
 * Deterministic keyframe/sequence/parallel evaluation (spec §3 keyframe
 * timelines). Plans are pure data built once when a playback starts; every
 * visual comes from elapsed time alone, so ticks are replayable.
 *
 * Group items all target the node carrying the animations plugin key. Inside
 * a group each animation runs exactly once (`playMode: 'loop'` only applies
 * to standalone playback) — ponytail: looping groups add when a scenario
 * needs them.
 */

export interface KeyframeItem {
  animation: PrototypeAnimation
  /** Offsets relative to the playback start. */
  startMs: number
  endMs: number
}

export interface KeyframePlay {
  nodeId: string
  items: KeyframeItem[]
  startedAt: number
  /** End of the plan; `repeat` loops over this window. */
  totalMs: number
  repeat: boolean
}

/**
 * Visual for one animation at `elapsedMs`: hold empty before the first
 * keyframe, ease between neighbours, hold the last keyframe after it.
 * Unordered raw keyframes degrade to "last passed neighbour wins" — the
 * authoring tools reject out-of-order writes.
 */
export function keyframeVisual(
  animation: PrototypeAnimation,
  elapsedMs: number,
  base?: PrototypeStateVisual
): PrototypeStateVisual {
  const frames = animation.keyframes
  const first = frames.at(0)
  if (!first) return {}
  const time = Math.max(0, elapsedMs)
  if (time < first.offsetMs) return {}
  for (let i = 0; i < frames.length - 1; i++) {
    const current = frames[i]
    const next = frames.at(i + 1)
    if (!next || time >= next.offsetMs) continue
    const span = next.offsetMs - current.offsetMs
    const linear = span <= 0 ? 1 : (time - current.offsetMs) / span
    const easing = current.easing ?? animation.easing ?? 'linear'
    return lerpVisual(current.visual, next.visual, easingProgress(easing, linear), base)
  }
  return frames.at(-1)?.visual ?? {}
}

/** Build a playback plan for one animation or group; null when unresolved. */
export function planPlayback(
  nodeId: string,
  container: PrototypeAnimations | null,
  targetId: string,
  preferGroup: boolean,
  startedAt: number
): KeyframePlay | null {
  const animation = preferGroup ? null : findAnimation(container, targetId)
  if (animation) {
    const duration = animation.durationMs
    return {
      nodeId,
      items: [{ animation, startMs: 0, endMs: duration }],
      startedAt,
      totalMs: duration,
      repeat: animation.playMode === 'loop' && duration > 0
    }
  }
  const group = findAnimationGroup(container, targetId)
  if (!group) return null
  const resolved = resolveGroupItems(container, group)
  if (resolved.length === 0) return null
  return {
    nodeId,
    items: resolved,
    startedAt,
    totalMs: Math.max(...resolved.map((item) => item.endMs)),
    repeat: false
  }
}

/** Sequence chains each item after the previous; parallel honors per-item delays. */
function resolveGroupItems(
  container: PrototypeAnimations | null,
  group: PrototypeAnimationGroup
): KeyframeItem[] {
  const items: KeyframeItem[] = []
  let cursor = 0
  for (const entry of group.items) {
    const animation = findAnimation(container, entry.animationId)
    if (!animation) continue
    const delay = entry.delayMs ?? 0
    if (group.mode === 'sequence') {
      const startMs = cursor + delay
      const endMs = startMs + animation.durationMs
      cursor = endMs
      items.push({ animation, startMs, endMs })
    } else {
      items.push({ animation, startMs: delay, endMs: delay + animation.durationMs })
    }
  }
  return items.sort((a, b) => a.startMs - b.startMs)
}

/** Visual of a running plan at absolute time `nowMs` (null before it starts). */
export function playVisual(
  play: KeyframePlay,
  nowMs: number,
  base?: PrototypeStateVisual
): PrototypeStateVisual | null {
  const localTime = localElapsed(play, nowMs)
  let active: PrototypeStateVisual | null = null
  for (const item of play.items) {
    if (localTime < item.startMs) break
    active = keyframeVisual(item.animation, localTime - item.startMs, base)
    if (localTime < item.endMs) break
  }
  return active
}

/** True once every item has run to its end (looping plans never finish). */
export function playSettled(play: KeyframePlay, nowMs: number): boolean {
  if (play.repeat) return false
  return nowMs - play.startedAt >= play.totalMs
}

/** Final visual a finished plan settles into. */
export function playFinalVisual(
  play: KeyframePlay,
  base?: PrototypeStateVisual
): PrototypeStateVisual {
  const last = play.items.at(-1)
  if (!last) return {}
  return keyframeVisual(last.animation, last.animation.durationMs, base)
}

function localElapsed(play: KeyframePlay, nowMs: number): number {
  const elapsed = nowMs - play.startedAt
  if (play.repeat && play.totalMs > 0) return elapsed % play.totalMs
  return Math.max(0, elapsed)
}
