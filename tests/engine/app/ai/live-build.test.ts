import { describe, expect, test } from 'bun:test'

import {
  SKELETON_MAX_CHILDREN,
  SKELETON_SLOTS,
  coveredSlots,
  rectCenter,
  resolveAIWorkRect,
  slotRects
} from '@/app/ai/chat/live-build'

const frame = { x: 100, y: 50, width: 800, height: 600 }

describe('resolveAIWorkRect', () => {
  test('prefers existing target bounds', () => {
    const target = { x: 10, y: 20, width: 30, height: 40 }
    expect(resolveAIWorkRect({ x: 0, y: 0, width: 1, height: 1 }, target, null)).toEqual(target)
  })

  test('derives creation rect from args offset by parent position', () => {
    const rect = resolveAIWorkRect({ x: 10, y: 20, width: 100, height: 50 }, null, {
      x: 200,
      y: 300
    })
    expect(rect).toEqual({ x: 210, y: 320, width: 100, height: 50 })
  })

  test('ignores args without a complete rect', () => {
    expect(resolveAIWorkRect({ id: '1:2' }, null, null)).toBeNull()
    expect(resolveAIWorkRect({ x: 0, y: 0, width: 10, height: Number.NaN }, null, null)).toBeNull()
  })
})

describe('skeleton slots', () => {
  test('maps slot fractions onto the frame world rect', () => {
    const slots = slotRects(frame)
    expect(slots).toHaveLength(SKELETON_SLOTS.length)
    expect(slots[0]).toEqual({
      x: frame.x + 0.04 * frame.width,
      y: frame.y + 0.06 * frame.height,
      width: 0.92 * frame.width,
      height: 0.1 * frame.height
    })
  })

  test('all slots uncovered in an empty frame', () => {
    expect(coveredSlots(slotRects(frame), [])).toEqual([false, false, false, false, false])
  })

  test('slot hides once real children cover half of it', () => {
    const slots = slotRects(frame)
    const navbar = slots[0]
    const partial = { ...navbar, width: navbar.width * 0.49 }
    expect(coveredSlots(slots, [partial])).toEqual([false, false, false, false, false])
    expect(coveredSlots(slots, [navbar])).toEqual([true, false, false, false, false])
  })

  test('slot far from any child stays visible', () => {
    const slots = slotRects(frame)
    const elsewhere = { x: 5000, y: 5000, width: 100, height: 100 }
    expect(coveredSlots(slots, [elsewhere]).every((covered) => !covered)).toBe(true)
  })

  test('skeleton population cap is a positive child count', () => {
    expect(SKELETON_MAX_CHILDREN).toBeGreaterThan(SKELETON_SLOTS.length)
  })
})

describe('rectCenter', () => {
  test('centers the work region for the AI cursor', () => {
    expect(rectCenter(frame)).toEqual({ x: 500, y: 350 })
  })
})
