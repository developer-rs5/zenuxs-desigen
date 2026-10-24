import { describe, expect, test } from 'bun:test'

import { applyRubberBand, flingAxis, rubberBand } from '@open-pencil/core'

describe('Physics scrolling and rubber-banding', () => {
  test('rubberBand decelerates asymptotically', () => {
    const b50 = rubberBand(50, 240)
    const b100 = rubberBand(100, 240)
    const b500 = rubberBand(500, 240)
    const b10000 = rubberBand(10000, 240)

    expect(b50).toBeGreaterThan(0)
    expect(b100).toBeGreaterThan(b50)
    expect(b500).toBeGreaterThan(b100)
    // Asymptotic bound is limit (240)
    expect(b10000).toBeLessThan(240)
  })

  test('applyRubberBand leaves in-bounds coordinates alone', () => {
    expect(applyRubberBand(50, 200)).toBe(50)
    expect(applyRubberBand(0, 200)).toBe(0)
    expect(applyRubberBand(200, 200)).toBe(200)
  })

  test('applyRubberBand bends past edges symmetrically', () => {
    const under = applyRubberBand(-50, 200)
    const over = applyRubberBand(250, 200)

    expect(under).toBeLessThan(0)
    expect(over).toBeGreaterThan(200)
    expect(Math.abs(under)).toBeCloseTo(over - 200, 4)
  })

  test('flingAxis decays inside range and returns rest state', () => {
    let x = 50
    let v = 500
    const r = 500
    for (let i = 0; i < 60; i++) {
      const step = flingAxis(x, v, r, 0.016, 2.5, true)
      x = step.pos
      v = step.vel
      if (step.done) break
    }
    // Velocity slowed down significantly
    expect(Math.abs(v)).toBeLessThan(500)
    expect(x).toBeGreaterThan(50)
    expect(x).toBeLessThanOrEqual(r)
  })
})
