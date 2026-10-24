/**
 * Gradient width-handle tests (converted 1:1 from FigCraft
 * `crates/color/src/gradient_tests.rs`).
 */

import { describe, expect, test } from 'bun:test'

import { Color, Gradient, type Gradient as GradientT } from './lib'

/** The axis and the width handle's direction in a `w`×`h` box, as screen vectors. */
function axes(g: GradientT, w: number, h: number): [[number, number], [number, number]] {
  const d = (p: [number, number]): [number, number] => [
    (p[0] - g.from[0]) * w,
    (p[1] - g.from[1]) * h
  ]
  return [d(g.to), d(g.width)]
}

function square(g: GradientT, w: number, h: number): boolean {
  const [a, k] = axes(g, w, h)
  const dot = a[0] * k[0] + a[1] * k[1]
  const cross = a[0] * k[1] - a[1] * k[0]
  return Math.abs(dot) < 1e-9 && Math.abs(cross) > 1e-9
}

describe('color gradient width handle', () => {
  test('the_default_linear_gradient_runs_top_to_bottom_with_square_bands', () => {
    const g = Gradient.defaultFor('linear', Color.BLACK)
    expect(g.from).toEqual([0.5, 0])
    expect(g.to).toEqual([0.5, 1])
    for (const [w, h] of [
      [120, 80],
      [80, 120],
      [1, 1]
    ]) {
      expect(square(g, w, h)).toBe(true)
    }
  })

  test('moving_an_end_keeps_the_bands_square', () => {
    const g = Gradient.defaultFor('linear', Color.BLACK)
    g.from = [0.2, 0.1]
    g.to = [0.8, 0.9]
    Gradient.squareLinearWidth(g, 200, 100)
    expect(square(g, 200, 100)).toBe(true)
    // Degenerate boxes fall back to the unit box and still square.
    Gradient.squareLinearWidth(g, 0, 0)
    expect(square(g, 1, 1)).toBe(true)
  })
})
