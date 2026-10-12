import { describe, expect, test } from 'bun:test'

import {
  SPRING_DEFAULT_DURATION_MS,
  easingProgress,
  lerpNumber,
  springProgress,
  transitionDurationMs,
  transitionProgress,
  type PrototypeTransition
} from '#core/prototype/motion'

describe('easingProgress', () => {
  test('holds endpoints exactly for every curve', () => {
    for (const easing of ['linear', 'ease', 'easeIn', 'easeOut', 'easeInOut'] as const) {
      expect(easingProgress(easing, 0)).toBe(0)
      expect(easingProgress(easing, 1)).toBe(1)
      expect(easingProgress(easing, -1)).toBe(0)
      expect(easingProgress(easing, 2)).toBe(1)
    }
  })

  test('easeOut finishes faster than linear mid-way', () => {
    expect(easingProgress('easeOut', 0.5)).toBeGreaterThan(0.5)
    expect(easingProgress('easeIn', 0.5)).toBeLessThan(0.5)
    expect(easingProgress('linear', 0.5)).toBe(0.5)
  })

  test('is monotonic across sampled progress', () => {
    let previous = -1
    for (let p = 0; p <= 1.0001; p += 0.05) {
      const value = easingProgress('easeInOut', p)
      expect(value).toBeGreaterThanOrEqual(previous)
      previous = value
    }
  })
})

describe('springProgress', () => {
  test('clamps endpoints to exactly 0 and 1', () => {
    expect(springProgress({ mode: 'time', bounce: 0.4 }, 0)).toBe(0)
    expect(springProgress({ mode: 'time', bounce: 0.4 }, 1)).toBe(1)
    expect(springProgress({ mode: 'physics', stiffness: 100, damping: 10, mass: 1 }, 1)).toBe(1)
  })

  test('time mode with bounce overshoots then settles', () => {
    let overshooted = false
    for (let p = 0.05; p < 1; p += 0.05) {
      if (springProgress({ mode: 'time', bounce: 0.5 }, p) > 1) overshooted = true
    }
    expect(overshooted).toBe(true)
  })

  test('zero bounce never overshoots', () => {
    for (let p = 0; p <= 1.0001; p += 0.05) {
      expect(springProgress({ mode: 'time', bounce: 0 }, p)).toBeLessThanOrEqual(1)
    }
  })

  test('over-damped physics spring stays monotonic', () => {
    const cfg = { mode: 'physics', stiffness: 100, damping: 60, mass: 1 } as const
    let previous = -1
    for (let p = 0; p <= 1.0001; p += 0.05) {
      const value = springProgress(cfg, p)
      expect(value).toBeGreaterThanOrEqual(previous)
      expect(value).toBeLessThanOrEqual(1)
      previous = value
    }
  })

  test('survives hostile input without NaN', () => {
    expect(
      springProgress({ mode: 'physics', stiffness: -5, damping: -1, mass: 0 }, 0.5)
    ).not.toBeNaN()
    expect(springProgress({ mode: 'time', bounce: 99 }, 0.5)).not.toBeNaN()
  })
})

describe('transition progress', () => {
  const fade: PrototypeTransition = { kind: 'fade', durationMs: 500, easing: 'easeOut' }
  const spring: PrototypeTransition = { kind: 'spring', spring: { mode: 'time', bounce: 0.3 } }

  test('instant transitions are always finished', () => {
    expect(transitionDurationMs({ kind: 'instant' })).toBe(0)
    expect(transitionProgress({ kind: 'instant' }, 0)).toBe(1)
  })

  test('fade completes at its duration and defaults spring duration', () => {
    expect(transitionDurationMs(fade)).toBe(500)
    expect(transitionDurationMs(spring)).toBe(SPRING_DEFAULT_DURATION_MS)
    expect(transitionProgress(fade, 0)).toBe(0)
    expect(transitionProgress(fade, 250)).toBeGreaterThan(0)
    expect(transitionProgress(fade, 250)).toBeLessThan(1)
    expect(transitionProgress(fade, 500)).toBe(1)
    expect(transitionProgress(fade, 9999)).toBe(1)
  })

  test('spring transition reaches exactly 1 at the end', () => {
    expect(transitionProgress(spring, 0)).toBe(0)
    expect(transitionProgress(spring, SPRING_DEFAULT_DURATION_MS)).toBe(1)
  })
})

test('lerpNumber clamps t to the unit interval', () => {
  expect(lerpNumber(10, 20, 0.5)).toBe(15)
  expect(lerpNumber(10, 20, -1)).toBe(10)
  expect(lerpNumber(10, 20, 2)).toBe(20)
})
