import { describe, expect, test } from 'bun:test'

import {
  computeNoodleCurve,
  sampleCubicBezier
} from '@open-pencil/core/canvas/overlays/prototype-connections'

describe('Prototype canvas noodle connections', () => {
  test('computes smooth cubic bezier curve exiting facing side', () => {
    // Source on left, destination on right
    const src = { x: 0, y: 0, width: 100, height: 50 }
    const dest = { x: 300, y: 100, width: 200, height: 150 }

    const pts = computeNoodleCurve(src, dest)
    expect(pts.length).toBe(4)

    // P0 starts at right-center of src: (100, 25)
    expect(pts[0].x).toBe(100)
    expect(pts[0].y).toBe(25)

    // P3 ends at left-center of dest: (300, 175)
    expect(pts[3].x).toBe(300)
    expect(pts[3].y).toBe(175)

    // Tangent vectors should be horizontal
    expect(pts[1].y).toBe(pts[0].y)
    expect(pts[2].y).toBe(pts[3].y)
    expect(pts[1].x).toBeGreaterThan(pts[0].x)
    expect(pts[2].x).toBeLessThan(pts[3].x)
  })

  test('computes curve exiting left when destination is on the left', () => {
    const src = { x: 300, y: 100, width: 200, height: 150 }
    const dest = { x: 0, y: 0, width: 100, height: 50 }

    const pts = computeNoodleCurve(src, dest)
    // P0 starts at left-center of src: (300, 175)
    expect(pts[0].x).toBe(300)
    expect(pts[0].y).toBe(175)

    // P3 ends at right-center of dest: (100, 25)
    expect(pts[3].x).toBe(100)
    expect(pts[3].y).toBe(25)
  })

  test('samples cubic bezier points along parametric t in [0, 1]', () => {
    const src = { x: 0, y: 0, width: 100, height: 100 }
    const dest = { x: 200, y: 200, width: 100, height: 100 }
    const pts = computeNoodleCurve(src, dest)

    const start = sampleCubicBezier(pts, 0)
    const mid = sampleCubicBezier(pts, 0.5)
    const end = sampleCubicBezier(pts, 1)

    expect(start.x).toBe(pts[0].x)
    expect(start.y).toBe(pts[0].y)
    expect(end.x).toBe(pts[3].x)
    expect(end.y).toBe(pts[3].y)
    expect(mid.x).toBeGreaterThan(start.x)
    expect(mid.x).toBeLessThan(end.x)
  })
})
