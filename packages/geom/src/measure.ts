/**
 * Paths measured by length: subpaths flattened into polylines with the length
 * along them, for anything placed along a path (variable width strokes, text
 * on a path). (Converted 1:1 from FigCraft `crates/geom/src/measure.rs`.)
 */

import { BezPath, Point, Vec2Math, type Vec2 } from './kurbo'
import { flatten } from './kurbo'

/** Flattening tolerance (local units). */
export const FLATTEN_TOL = 0.05
/** The most flattened points a path is measured with; longer paths are refused. */
export const MAX_SAMPLES = 40_000

/** Every coordinate is finite and of a sane magnitude. */
export function finite_path(path: BezPath): boolean {
  const ok = (p: Point): boolean =>
    Number.isFinite(p.x) &&
    Number.isFinite(p.y) &&
    Math.abs(p.x) < 1e9 &&
    Math.abs(p.y) < 1e9
  return path.elements.every((el) => {
    switch (el.type) {
      case 'MoveTo':
      case 'LineTo':
        return ok(el.p)
      case 'QuadTo':
        return ok(el.a) && ok(el.b)
      case 'CurveTo':
        return ok(el.a) && ok(el.b) && ok(el.c)
      case 'ClosePath':
        return true
    }
  })
}

/**
 * One subpath flattened, with the length along it at each point. A closed
 * subpath ends on its start point.
 */
export class Polyline {
  points: Point[] = []
  /** Cumulative length at each point (starts at 0). */
  lengths: number[] = []
  closed = false

  length(): number {
    return this.lengths.at(-1) ?? 0
  }

  push(p: Point): void {
    const last = this.points.at(-1)
    if (!last) {
      this.points.push(p)
      this.lengths.push(0)
      return
    }
    const d = Point.hypot(p, last)
    if (d > 1e-9) {
      this.points.push(p)
      this.lengths.push(this.length() + d)
    }
  }

  /** The point at `t` (0..1 by length) and the unit normal there (the direction turned 90°). */
  at(t: number): [Point, Vec2] | null {
    const len = this.length()
    if (len <= 1e-9 || !Number.isFinite(t)) {
      return null
    }
    const s = Math.min(1, Math.max(0, t)) * len
    let i = 1
    while (i < this.lengths.length && this.lengths[i] <= s) i += 1
    i = Math.min(Math.max(i, 1), Math.max(1, this.points.length - 1))
    const a = this.points[i - 1]
    const b = this.points[i]
    const la = this.lengths[i - 1]
    const lb = this.lengths[i]
    if (!a || !b || la === undefined || lb === undefined) return null
    const u = lb - la > 1e-12 ? Math.min(1, Math.max(0, (s - la) / (lb - la))) : 0
    const d = Point.sub(b, a)
    const n = Vec2Math.scale(Vec2Math.turn_90(d), 1 / Math.max(1e-12, Vec2Math.hypot(d)))
    return [Point.lerp(a, b, u), n]
  }

  /** The nearest point to `p`: (t by length, distance). */
  nearest(p: Point): [number, number] | null {
    const len = this.length()
    if (len <= 1e-9) {
      return null
    }
    let best: [number, number] | null = null
    for (let i = 0; i < this.points.length - 1; i++) {
      const a = this.points[i]
      const b = this.points[i + 1]
      if (!a || !b) continue
      const d = Point.sub(b, a)
      const l2 = Point.hypot2(a, b)
      const u = l2 > 1e-18 ? Math.min(1, Math.max(0, Point.dot(Point.sub(p, a), d) / l2)) : 0
      const proj = Point.lerp(a, b, u)
      const dist = Point.hypot(proj, p)
      if (best === null || dist < best[1]) {
        const s = (this.lengths[i] ?? 0) + u * Math.sqrt(l2)
        best = [s / len, dist]
      }
    }
    return best
  }
}

/**
 * Every subpath of `path` flattened. `null` when the path has invalid
 * coordinates or is too long to work with.
 */
export function polylines(path: BezPath): Polyline[] | null {
  return polylines_with_limit(path, MAX_SAMPLES)
}

/**
 * `polylines` with an explicit sample budget, so tests can use a small one.
 *
 * The budget is enforced *while* flattening, not after it (issue #204): the
 * input element count is checked up front, each curve is flattened on its own,
 * and flattening stops as soon as the budget is exceeded. An over-budget path
 * therefore costs at most one extra segment of flattening work and never
 * materialises more than `limit` retained points, instead of building the
 * complete flattened result only to throw it away.
 */
export function polylines_with_limit(path: BezPath, limit: number): Polyline[] | null {
  if (!finite_path(path)) {
    return null
  }
  // Every element contributes at least one flattened sample, so a path with
  // more elements than the budget can be refused without flattening anything.
  if (path.elements.length > limit) {
    return null
  }
  const out: Polyline[] = []
  let cur = new Polyline()
  let start = Point.new(0, 0)
  let pen = Point.new(0, 0)
  let count = 0
  const finish = (): void => {
    // Rust: std::mem::take(cur) — push the current polyline (if it has a
    // segment) into the output and start a fresh one.
    const done = cur
    if (done.points.length >= 2) {
      out.push(done)
    }
    cur = new Polyline()
  }
  for (const el of path.elements) {
    if (count > limit) {
      return null
    }
    switch (el.type) {
      case 'MoveTo':
        count += 1
        finish()
        start = el.p
        pen = el.p
        cur.push(el.p)
        break
      case 'LineTo':
        count += 1
        if (cur.points.length === 0) {
          cur.push(start)
        }
        cur.push(el.p)
        pen = el.p
        break
      case 'QuadTo':
      case 'CurveTo': {
        const end = el.type === 'QuadTo' ? el.b : el.c
        // Flatten this one segment on its own, so an over-budget curve aborts
        // here instead of after the whole path has been flattened.
        const seg_start = pen
        let over = false
        flatten([{ type: 'MoveTo', p: seg_start }, el], FLATTEN_TOL, (fel) => {
          if (over) return
          if (fel.type === 'LineTo') {
            count += 1
            if (count > limit) {
              over = true
              return
            }
            if (cur.points.length === 0) {
              cur.push(seg_start)
            }
            cur.push(fel.p)
          }
        })
        if (over) {
          return null
        }
        pen = end
        break
      }
      case 'ClosePath':
        count += 1
        cur.push(start)
        cur.closed = cur.points.length >= 3
        pen = start
        finish()
        break
    }
  }
  finish()
  return count <= limit ? out : null
}
