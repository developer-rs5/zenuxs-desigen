/**
 * Vector faces: triangulated region faces for anti-aliased region fills, and
 * an interior point per face. (Converted 1:1 from FigCraft
 * `crates/doc/src/vector_faces.rs` — the core `Face` model and interior point.)
 */

import { Point, type Point as P } from '@zenuxs/geom'

/** One triangulated face of a filled region. */
export interface Face {
  /** The triangle's vertices, in order. */
  points: [P, P, P]
}

export const Face = {
  /** A point strictly inside the triangle (its centroid; corners excluded). */
  interiorPoint(f: Face): P | null {
    const [a, b, c] = f.points
    const cx = (a.x + b.x + c.x) / 3
    const cy = (a.y + b.y + c.y) / 3
    // Degenerate triangle: no interior.
    const area2 = (b.x - a.x) * (c.y - a.y) - (b.y - a.y) * (c.x - a.x)
    if (Math.abs(area2) < 1e-12) return null
    return Point.new(cx, cy)
  },

  area(f: Face): number {
    const [a, b, c] = f.points
    return Math.abs((b.x - a.x) * (c.y - a.y) - (b.y - a.y) * (c.x - a.x)) / 2
  }
}

/** Fan-triangulate a closed polygon (assumed convex after region cutting). */
export function triangulateFan(points: P[]): Face[] {
  const faces: Face[] = []
  for (let i = 1; i < points.length - 1; i++) {
    const a = points[0]
    const b = points[i]
    const c = points[i + 1]
    if (a && b && c) faces.push({ points: [a, b, c] })
  }
  return faces
}
