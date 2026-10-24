import type { SceneGraph } from '@open-pencil/scene-graph'

export const DECAY_DRAG = 2.5
export const DECAY_WHEEL = 8.0
export const SPRING_CRITICAL = 16.0
export const FLING_STOP = 6.0
export const COAST_MIN = 40.0
export const RUBBER_PTS = 240.0

/**
 * Asymptotic rubber-banding beyond scroll bounds (spec / FigCraft).
 */
export function rubberBand(over: number, limit: number = RUBBER_PTS): number {
  if (limit <= 0) return 0
  return limit * (1 - 1 / ((0.55 * Math.abs(over)) / limit + 1))
}

/**
 * Clamps coordinate with rubber-banding when dragged past boundary.
 */
export function applyRubberBand(x: number, maxRange: number, limit: number = RUBBER_PTS): number {
  if (x < 0) return -rubberBand(-x, limit)
  if (x > maxRange) return maxRange + rubberBand(x - maxRange, limit)
  return x
}

export interface FlingStepResult {
  pos: number
  vel: number
  done: boolean
}

/**
 * One axis of a fling after dt seconds: exactly integrates exponential decay
 * inside range [0, r] or critically damped spring pullback when outside range.
 * Independent of framerate due to sub-step integration.
 */
export function flingAxis(
  x: number,
  v: number,
  r: number,
  dt: number,
  decay: number = DECAY_DRAG,
  bounce: boolean = true
): FlingStepResult {
  if (
    !Number.isFinite(x) ||
    !Number.isFinite(v) ||
    !Number.isFinite(r) ||
    !Number.isFinite(dt) ||
    decay <= 0 ||
    r <= 0
  ) {
    const clamped =
      Number.isFinite(r) && Number.isFinite(x) ? Math.min(Math.max(0, x), Math.max(0, r)) : 0
    return { pos: clamped, vel: 0, done: true }
  }

  const clampedDt = Math.min(1.0, Math.max(0, dt))
  const steps = Math.min(64, Math.max(1, Math.ceil(clampedDt * 240.0)))
  const h = clampedDt / steps
  let curX = x
  let curV = Math.min(1e6, Math.max(-1e6, v))

  for (let i = 0; i < steps; i++) {
    if (curX >= 0.0 && curX <= r) {
      const e = Math.exp(-decay * h)
      curX += (curV * (1.0 - e)) / decay
      curV *= e
      if (Math.abs(curV) < FLING_STOP) {
        return { pos: curX, vel: 0, done: true }
      }
    } else if (bounce) {
      const end = Math.min(Math.max(0.0, curX), r)
      const d = curX - end
      const e = Math.exp(-SPRING_CRITICAL * h)
      const c = curV + SPRING_CRITICAL * d
      curX = end + (d + c * h) * e
      curV = (curV - SPRING_CRITICAL * c * h) * e
      if (Math.abs(curX - end) < 0.5 && Math.abs(curV) < 4.0 * FLING_STOP) {
        return { pos: end, vel: 0, done: true }
      }
    } else {
      curX = Math.min(Math.max(0.0, curX), r)
      return { pos: curX, vel: 0, done: true }
    }
  }

  return { pos: curX, vel: curV, done: false }
}

/**
 * Computes the maximum scrollable bounds for content inside a frame.
 */
export function calculateScrollRange(
  graph: SceneGraph,
  frameId: string,
  viewportWidth?: number,
  viewportHeight?: number
): { maxX: number; maxY: number } {
  const frame = graph.getNode(frameId)
  if (!frame) return { maxX: 0, maxY: 0 }

  let maxX = 0
  let maxY = 0

  for (const childId of frame.childIds) {
    const child = graph.getNode(childId)
    if (!child || !child.visible) continue
    maxX = Math.max(maxX, child.x + child.width)
    maxY = Math.max(maxY, child.y + child.height)
  }

  const vw = viewportWidth ?? frame.width
  const vh = viewportHeight ?? frame.height

  return {
    maxX: Math.max(0, maxX - vw),
    maxY: Math.max(0, maxY - vh)
  }
}
