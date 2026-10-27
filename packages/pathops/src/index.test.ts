/**
 * Pathops tests (ported from the core cases of FigCraft
 * `crates/pathops/src/lib.rs` tests).
 */

import { describe, expect, test } from 'bun:test'

import { BezPath } from '@zenuxs/geom'

import { union, subtract, intersect, exclude, strokeOutline, healBezierHandles } from './index'

function square(x: number, y: number, size: number): BezPath {
  const p = BezPath.new()
  p.move_to({ x, y })
  p.line_to({ x: x + size, y })
  p.line_to({ x: x + size, y: y + size })
  p.line_to({ x, y: y + size })
  p.close_path()
  return p
}

function area(p: BezPath): number {
  return Math.abs(p.area())
}

describe('pathops boolean operations', () => {
  test('union_of_disjoint_squares_keeps_both_areas', () => {
    const a = square(0, 0, 100)
    const b = square(200, 0, 100)
    const u = union(a, b)
    expect(area(u)).toBeGreaterThan(19900)
  })

  test('union_of_overlapping_squares_is_less_than_sum', () => {
    const a = square(0, 0, 100)
    const b = square(50, 0, 100)
    const sum = area(a) + area(b)
    const u = area(union(a, b))
    expect(u).toBeLessThan(sum)
    expect(u).toBeGreaterThan(10000)
  })

  test('subtract_removes_the_overlap', () => {
    const a = square(0, 0, 100)
    const b = square(50, 0, 100)
    const d = area(subtract(a, b))
    // A's area minus the 50×100 overlap.
    expect(d).toBeCloseTo(10000 - 5000, -2)
  })

  test('intersect_keeps_the_overlap', () => {
    const a = square(0, 0, 100)
    const b = square(50, 0, 100)
    const i = area(intersect(a, b))
    expect(i).toBeCloseTo(5000, -2)
  })

  test('exclude_is_union_minus_intersection', () => {
    const a = square(0, 0, 100)
    const b = square(50, 0, 100)
    const x = area(exclude(a, b))
    const u = area(union(a, b))
    const i = area(intersect(a, b))
    expect(x).toBeCloseTo(u - i, -2)
  })

  test('disjoint_intersect_is_empty', () => {
    const a = square(0, 0, 100)
    const b = square(500, 500, 100)
    expect(area(intersect(a, b))).toBeCloseTo(0, -1)
  })
})

describe('pathops stroke outline', () => {
  test('line_stroke_ribbon_area', () => {
    const line = BezPath.new()
    line.move_to({ x: 0, y: 0 })
    line.line_to({ x: 100, y: 0 })
    const outline = strokeOutline(line, 10)
    expect(area(outline)).toBeCloseTo(1000, -1)
  })

  test('heal_handles_computes_smooth_transition', () => {
    const a = { x: 0, y: 0 }
    const p = { x: 50, y: 25 }
    const b = { x: 100, y: 0 }
    const result = healBezierHandles(p, a, b)
    expect(result.ta[0]).toBeGreaterThan(0)
    expect(result.tb[0]).toBeLessThan(0)
  })

  test('heal_handles_curve_passes_through_deleted_point', () => {
    const a = { x: 0, y: 0 }
    const p = { x: 50, y: 50 }
    const b = { x: 100, y: 0 }
    const { ta, tb } = healBezierHandles(p, a, b, [10, 30], [0, 0])
    const t = 0.5
    const u = 1 - t
    const x =
      u * u * u * a.x +
      3 * u * u * t * (a.x + ta[0]) +
      3 * u * t * t * (b.x + tb[0]) +
      t * t * t * b.x
    const y =
      u * u * u * a.y +
      3 * u * u * t * (a.y + ta[1]) +
      3 * u * t * t * (b.y + tb[1]) +
      t * t * t * b.y
    expect(x).toBeCloseTo(p.x, 6)
    expect(y).toBeCloseTo(p.y, 6)
  })
})
