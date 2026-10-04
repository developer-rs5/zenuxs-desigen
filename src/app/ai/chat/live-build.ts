import type { Rect, Vector } from '@open-pencil/scene-graph/primitives'

/**
 * Pure geometry/state helpers for the live AI canvas-building overlay.
 * Kept free of Vue and editor imports so they stay unit-testable.
 */

export type AIWorkRect = Rect

export interface SkeletonSlot {
  /** Fraction of the frame's width/height, 0..1. */
  fx: number
  fy: number
  fw: number
  fh: number
}

/**
 * Placeholder layout inside a frame the AI is filling: navbar strip, sidebar,
 * hero, and two cards. Slots are covered by real children as they appear.
 */
export const SKELETON_SLOTS: readonly SkeletonSlot[] = [
  { fx: 0.04, fy: 0.06, fw: 0.92, fh: 0.1 },
  { fx: 0.04, fy: 0.22, fw: 0.22, fh: 0.72 },
  { fx: 0.3, fy: 0.22, fw: 0.66, fh: 0.34 },
  { fx: 0.3, fy: 0.62, fw: 0.31, fh: 0.32 },
  { fx: 0.65, fy: 0.62, fw: 0.31, fh: 0.32 }
]

/** Once a frame has this many children it reads as populated — drop the skeleton. */
export const SKELETON_MAX_CHILDREN = 6

/** Frames smaller than this (world px) skip the skeleton entirely. */
export const SKELETON_MIN_SIZE = 40

/** Fraction of a slot that must be covered before its placeholder hides. */
const SLOT_COVERAGE_THRESHOLD = 0.5

export function rectCenter(rect: AIWorkRect): Vector {
  return { x: rect.x + rect.width / 2, y: rect.y + rect.height / 2 }
}

/**
 * Resolve the world-space region a tool operation will affect:
 * existing target bounds win, otherwise creation args (x/y/width/height,
 * offset by the parent's absolute position).
 */
export function resolveAIWorkRect(
  args: Record<string, unknown>,
  targetBounds: AIWorkRect | null | undefined,
  parentAbs: Vector | null | undefined
): AIWorkRect | null {
  if (targetBounds) return targetBounds
  const { x, y, width, height } = args
  if (
    typeof x !== 'number' ||
    typeof y !== 'number' ||
    typeof width !== 'number' ||
    typeof height !== 'number' ||
    !Number.isFinite(x) ||
    !Number.isFinite(y) ||
    !Number.isFinite(width) ||
    !Number.isFinite(height)
  ) {
    return null
  }
  return {
    x: x + (parentAbs?.x ?? 0),
    y: y + (parentAbs?.y ?? 0),
    width,
    height
  }
}

/** Map skeleton slot fractions onto a frame's world-space rect. */
export function slotRects(frame: AIWorkRect): AIWorkRect[] {
  return SKELETON_SLOTS.map((slot) => ({
    x: frame.x + slot.fx * frame.width,
    y: frame.y + slot.fy * frame.height,
    width: slot.fw * frame.width,
    height: slot.fh * frame.height
  }))
}

function intersectionArea(a: AIWorkRect, b: AIWorkRect): number {
  const w = Math.min(a.x + a.width, b.x + b.width) - Math.max(a.x, b.x)
  const h = Math.min(a.y + a.height, b.y + b.height) - Math.max(a.y, b.y)
  return w > 0 && h > 0 ? w * h : 0
}

/**
 * Mark each slot covered when real children obscure at least half of it.
 * Children may overlap each other, so summed area can overcount — that only
 * hides a placeholder slightly early, never reveals content-covered space.
 */
export function coveredSlots(slots: AIWorkRect[], children: AIWorkRect[]): boolean[] {
  return slots.map((slot) => {
    const slotArea = slot.width * slot.height
    if (slotArea <= 0) return true
    let covered = 0
    for (const child of children) covered += intersectionArea(slot, child)
    return covered / slotArea >= SLOT_COVERAGE_THRESHOLD
  })
}
