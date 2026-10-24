/**
 * ZenuxsDesign geometry — tests (converted 1:1 from FigCraft `crates/geom/src/tests.rs`).
 */

import { describe, expect, test } from 'bun:test'

import { BezPath, Affine, Point } from './kurbo'
import {
  ellipse,
  polygon_points,
  reverse_subpaths,
  rounded_polygon,
  rounded_rect,
  star_points
} from './lib'
import {
  from_position_rotation,
  rotation_degrees,
  set_rotation_about_center,
  translation,
  is_flipped
} from './transform'

const PI = Math.PI
const TAU = 2 * Math.PI

function area(p: BezPath): number {
  return Math.abs(p.area())
}

describe('geom shapes', () => {
  test('plain_rect_area', () => {
    const p = rounded_rect(100, 50, [0, 0, 0, 0], 0)
    expect(Math.abs(area(p) - 5000)).toBeLessThan(1e-6)
  })

  test('rounded_rect_area_matches_circle_corners', () => {
    const r = 10
    const p = rounded_rect(100, 50, [r, r, r, r], 0)
    const expected = 5000 - 4 * r * r + PI * r * r
    expect(Math.abs(area(p) - expected)).toBeLessThan(0.5)
  })

  test('full_radius_is_capsule_and_bounds_hold', () => {
    const p = rounded_rect(100, 40, [1000, 1000, 1000, 1000], 0)
    const b = p.bounding_box()
    expect(b).not.toBeNull()
    if (!b) return
    expect(Math.abs(RectW(b) - 100)).toBeLessThan(1e-6)
    expect(Math.abs(RectH(b) - 40)).toBeLessThan(1e-6)
  })

  test('smoothing_stays_in_bounds_and_reduces_area_less_than_sharp', () => {
    for (const s of [0, 0.3, 0.6, 1.0]) {
      const p = rounded_rect(200, 120, [24, 0, 40, 8], s)
      const b = p.bounding_box()
      expect(b).not.toBeNull()
      if (!b) continue
      expect(b.x0).toBeGreaterThanOrEqual(-1e-6)
      expect(b.y0).toBeGreaterThanOrEqual(-1e-6)
      expect(b.x1).toBeLessThanOrEqual(200 + 1e-6)
      expect(b.y1).toBeLessThanOrEqual(120 + 1e-6)
      expect(area(p)).toBeLessThan(200 * 120)
    }
    // More smoothing removes more area at the same radius.
    const a0 = area(rounded_rect(200, 200, [40, 40, 40, 40], 0))
    const a1 = area(rounded_rect(200, 200, [40, 40, 40, 40], 1))
    expect(a1).toBeLessThan(a0)
  })

  test('degenerate_inputs_dont_panic', () => {
    rounded_rect(NaN, -1, [Infinity, Infinity, Infinity, Infinity], NaN)
    rounded_rect(0, 0, [5, 5, 5, 5], 0.5)
    polygon_points(0, 0, 0)
    star_points(10, 10, 1, -3)
    rounded_polygon([], 4)
    rounded_polygon([Point.new(0, 0), Point.new(0, 0), Point.new(0, 0)], 4)
    ellipse(NaN, 10, NaN, 100, 2)
  })

  test('polygon_first_vertex_top_center', () => {
    const pts = polygon_points(100, 100, 3)
    expect(pts.length).toBe(3)
    expect(Math.abs(pts[0].x - 50)).toBeLessThan(1e-9)
    expect(Math.abs(pts[0].y)).toBeLessThan(1e-9)
  })

  test('star_has_twice_the_points', () => {
    expect(star_points(100, 100, 5, 0.38).length).toBe(10)
  })

  test('rounded_polygon_shrinks_area', () => {
    const pts = polygon_points(100, 100, 6)
    const sharp = area(rounded_polygon(pts, 0))
    const round = area(rounded_polygon(pts, 10))
    expect(round).toBeLessThan(sharp)
    expect(round).toBeGreaterThan(sharp * 0.8)
  })

  test('ellipse_ring_area', () => {
    const full = area(ellipse(100, 100, 0, TAU, 0))
    expect(Math.abs(full - PI * 2500)).toBeLessThan(2)
    const ring = ellipse(100, 100, 0, TAU, 0.5)
    // Winding area of a ring with a reversed inner contour: outer - inner.
    const a = Math.abs(ring.area())
    expect(Math.abs(a - PI * (2500 - 625))).toBeLessThan(5)
    const half = area(ellipse(100, 100, 0, PI, 0))
    expect(Math.abs(half - PI * 1250)).toBeLessThan(2)
  })
})

describe('geom transforms', () => {
  test('rotation_roundtrip', () => {
    for (const deg of [0, 30, -45, 90, 179]) {
      const xf = from_position_rotation(10, 20, deg)
      expect(Math.abs(rotation_degrees(xf) - deg)).toBeLessThan(1e-9)
      expect(translation(xf).x).toBe(10)
      expect(translation(xf).y).toBe(20)
    }
  })

  test('set_rotation_keeps_center', () => {
    const xf = from_position_rotation(10, 20, 0)
    const r = set_rotation_about_center(xf, 100, 50, 90)
    const c0 = Affine.apply(xf, Point.new(50, 25))
    const c1 = Affine.apply(r, Point.new(50, 25))
    expect(Point.hypot(c0, c1)).toBeLessThan(1e-9)
    expect(Math.abs(rotation_degrees(r) - 90)).toBeLessThan(1e-9)
    // A flipped box stays flipped and reads back the rotation set, whichever way it was flipped.
    for (const flip of [Affine.FLIP_X, Affine.FLIP_Y]) {
      for (const deg of [0, 30, -120]) {
        const rr = set_rotation_about_center(Affine.mul(xf, flip), 100, 50, deg)
        expect(is_flipped(rr)).toBe(true)
        expect(Math.abs(rotation_degrees(rr) - deg)).toBeLessThan(1e-9)
        const expectC = Affine.apply(Affine.mul(xf, flip), Point.new(50, 25))
        const gotC = Affine.apply(rr, Point.new(50, 25))
        expect(Point.hypot(expectC, gotC)).toBeLessThan(1e-9)
      }
    }
  })

  test('reverse_subpaths_preserves_open_and_closed', () => {
    const open = BezPath.new()
    open.move_to({ x: 0, y: 0 })
    open.line_to({ x: 10, y: 0 })
    open.line_to({ x: 10, y: 10 })
    const r = reverse_subpaths(open)
    expect(r.elements.some((e) => e.type === 'ClosePath')).toBe(false)

    const closed = open.clone()
    closed.close_path()
    const rc = reverse_subpaths(closed)
    expect(rc.elements.at(-1)?.type).toBe('ClosePath')
  })
})

function RectW(r: { x0: number; x1: number }): number {
  return r.x1 - r.x0
}

function RectH(r: { y0: number; y1: number }): number {
  return r.y1 - r.y0
}
