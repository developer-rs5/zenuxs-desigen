import { describe, expect, test } from 'bun:test'

import { easingProgress, PhysicalSpring, transitionFramePlacement } from '@open-pencil/core'

describe('Physical springs and easings', () => {
  test('physical spring settles cleanly at 1.0', () => {
    const spring = new PhysicalSpring(1.0, 100.0, 15.0)
    expect(spring.at(0.0)).toBeCloseTo(0.0, 4)
    expect(spring.at(1.0)).toBe(1.0)
    expect(spring.settle).toBeGreaterThan(0.1)
  })

  test('evaluates back easings with anticipated overshoot', () => {
    const easeInBackMid = easingProgress('easeInBack', 0.2)
    // EaseInBack goes negative before launching forward
    expect(easeInBackMid).toBeLessThan(0)

    const easeOutBackLate = easingProgress('easeOutBack', 0.8)
    // EaseOutBack exceeds 1 before settling
    expect(easeOutBackLate).toBeGreaterThan(0.8)
  })

  test('transition frame placements calculate directional offsets and z-order', () => {
    const moveInLeft = transitionFramePlacement(
      { kind: 'moveIn', direction: 'left', durationMs: 300 },
      0.5
    )
    expect(moveInLeft.toOffset[0]).toBeCloseTo(0.5, 2)
    expect(moveInLeft.fromOnTop).toBe(false)

    const moveOutLeft = transitionFramePlacement(
      { kind: 'moveOut', direction: 'left', durationMs: 300 },
      0.5
    )
    expect(moveOutLeft.fromOffset[0]).toBeCloseTo(-0.5, 2)
    expect(moveOutLeft.fromOnTop).toBe(true)

    const pushRight = transitionFramePlacement(
      { kind: 'push', direction: 'right', durationMs: 300 },
      0.5
    )
    expect(pushRight.fromOffset[0]).toBeCloseTo(0.5, 2)
    expect(pushRight.toOffset[0]).toBeCloseTo(-0.5, 2)
  })
})
