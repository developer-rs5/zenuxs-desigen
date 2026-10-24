/**
 * Pathops tests (ported from the core cases of FigCraft
 * `crates/pathops/src/lib.rs` tests).
 */

import { describe, expect, test } from 'bun:test'

import { BezPath } from '@zenuxs/geom'
import { binary, union, subtract, intersect, exclude, strokeOutline } from './index'

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
})
