/**
 * ZenuxsDesign geometry measure tests (converted 1:1 from the inline test
 * module in FigCraft `crates/geom/src/measure.rs`).
 */

import { describe, expect, test } from 'bun:test'

import { BezPath } from './kurbo'
import { polylines_with_limit, polylines, MAX_SAMPLES, type Polyline } from './measure'

function line_path(n: number): BezPath {
  const p = BezPath.new()
  p.move_to({ x: 0, y: 0 })
  for (let i = 1; i <= n; i++) {
    p.line_to({ x: i, y: 0 })
  }
  return p
}

describe('geom measure', () => {
  test('normal_open_and_closed_paths_are_preserved', () => {
    const open = polylines_with_limit(line_path(3), 100)
    expect(open).not.toBeNull()
    if (!open) return
    expect(open.length).toBe(1)
    expect(open[0].points.length).toBe(4)
    expect(Math.abs(open[0].length() - 3)).toBeLessThan(1e-9)
    expect(open[0].closed).toBe(false)

    const square = BezPath.new()
    square.move_to({ x: 0, y: 0 })
    square.line_to({ x: 10, y: 0 })
    square.line_to({ x: 10, y: 10 })
    square.line_to({ x: 0, y: 10 })
    square.close_path()
    const closed = polylines_with_limit(square, 100)
    expect(closed).not.toBeNull()
    if (!closed) return
    expect(closed.length).toBe(1)
    expect(closed[0].closed).toBe(true)
    expect(Math.abs(closed[0].length() - 40)).toBeLessThan(1e-9)
  })

  test('over_budget_line_path_is_refused', () => {
    // 51 elements against a budget of 10: refused by the up-front element check.
    expect(polylines_with_limit(line_path(50), 10)).toBeNull()
  })

  test('over_budget_curve_path_is_refused_early', () => {
    // One big cubic flattens to far more than 8 samples at FLATTEN_TOL; the
    // per-segment flattening must trip the budget and refuse the path.
    const p = BezPath.new()
    p.move_to({ x: 0, y: 0 })
    p.curve_to({ x: 0, y: 1000 }, { x: 1000, y: 1000 }, { x: 1000, y: 0 })
    expect(polylines_with_limit(p, 8)).toBeNull()
    // The same curve is accepted with the production budget.
    expect(polylines(p)).not.toBeNull()
  })

  test('curve_endpoints_and_length_still_measure', () => {
    const p = BezPath.new()
    p.move_to({ x: 0, y: 0 })
    p.curve_to({ x: 0, y: 100 }, { x: 100, y: 100 }, { x: 100, y: 0 })
    const lines = polylines(p)
    expect(lines).not.toBeNull()
    if (!lines) return
    expect(lines.length).toBe(1)
    const first = lines[0].points[0]
    const last = lines[0].points.at(-1)
    expect(first?.x).toBe(0)
    expect(first?.y).toBe(0)
    expect(last?.x).toBe(100)
    expect(last?.y).toBe(0)
    // The flattened curve is longer than its chord and shorter than its control polygon.
    expect(lines[0].length()).toBeGreaterThan(100)
    expect(lines[0].length()).toBeLessThan(300)
  })

  test('production_budget_is_exported_unchanged', () => {
    expect(MAX_SAMPLES).toBe(40_000)
    void (null as unknown as Polyline | null)
  })
})
