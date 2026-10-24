/**
 * ZenuxsDesign geometry (converted 1:1 from FigCraft `crates/geom/src/lib.rs`).
 *
 * Re-exports the geometry foundation and adds the shape builders a design tool
 * needs: rectangles with independent corner radii and corner smoothing (the
 * "squircle" continuous-curvature corner), regular polygons and stars (with
 * rounded vertices), and ellipse arcs / rings. Coordinates are y-down.
 */

import {
  Affine,
  Arc,
  BezPath,
  Circle,
  Ellipse,
  Point,
  RectMath,
  Vec2Math,
  flatten,
  PathSeg,
  type PathEl,
  type Rect,
  type Vec2
} from './kurbo'

export { Affine, Arc, BezPath, Circle, Ellipse, Point, RectMath, Vec2Math, flatten, PathSeg }
export type { PathEl, Rect, Vec2 }

const FRAC_PI_2 = Math.PI / 2
const PI = Math.PI
const TAU = 2 * Math.PI

/** Corner radii in clockwise order from the top-left: `[tl, tr, br, bl]`. */
export type Radii = [number, number, number, number]

function finite(v: number): number {
  return Number.isFinite(v) ? v : 0
}

function clamp(v: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, v))
}

/**
 * A rectangle path at the origin with per-corner radii and corner smoothing
 * (0..=1, Figma's "Corner smoothing"; 0.6 is the iOS look).
 *
 * Radii are clamped so adjacent corners never overlap; when smoothing doesn't
 * fit, it is reduced first, then the radius.
 */
export function rounded_rect(width: number, height: number, radii: Radii, smoothing: number): BezPath {
  const w = finite(width).valueOf()
  const h = finite(height)
  const path = BezPath.new()
  const wv = Math.max(0, w)
  const hv = Math.max(0, h)
  if (wv <= 0 && hv <= 0) {
    return path
  }
  const s = clamp(finite(smoothing), 0, 1)
  const max_r = Math.min(wv, hv) / 2
  const rs: Radii = [
    clamp(finite(radii[0]), 0, max_r),
    clamp(finite(radii[1]), 0, max_r),
    clamp(finite(radii[2]), 0, max_r),
    clamp(finite(radii[3]), 0, max_r)
  ]
  if (rs.every((r) => r <= 0)) {
    path.move_to({ x: 0, y: 0 })
    path.line_to({ x: wv, y: 0 })
    path.line_to({ x: wv, y: hv })
    path.line_to({ x: 0, y: hv })
    path.close_path()
    return path
  }
  // Corners clockwise starting top-right, each: (corner, incoming edge direction, outgoing).
  const corners: Array<[Point, Vec2, Vec2, number]> = [
    [Point.new(wv, 0), Vec2Math.new(1, 0), Vec2Math.new(0, 1), rs[1]],
    [Point.new(wv, hv), Vec2Math.new(0, 1), Vec2Math.new(-1, 0), rs[2]],
    [Point.new(0, hv), Vec2Math.new(-1, 0), Vec2Math.new(0, -1), rs[3]],
    [Point.new(0, 0), Vec2Math.new(0, -1), Vec2Math.new(1, 0), rs[0]]
  ]
  const first = corner_profile(rs[0], s, max_r)
  // Start on the top edge just after the top-left corner.
  path.move_to({ x: first.p, y: 0 })
  for (const [c, din, dout, r] of corners) {
    const prof = corner_profile(r, s, max_r)
    append_corner(path, c, din, dout, prof)
  }
  path.close_path()
  return path
}

/** The smoothed-corner profile along one corner (lengths measured from the corner point). */
interface CornerProfile {
  r: number
  /** Total length the corner occupies along each edge. */
  p: number
  a: number
  b: number
  c: number
  d: number
}

function corner_profile(r0: number, smoothing: number, max_p: number): CornerProfile {
  let r = Math.max(0, r0)
  if (r <= 0) {
    return { r: 0, p: 0, a: 0, b: 0, c: 0, d: 0 }
  }
  let s = smoothing
  // Reduce smoothing first when the smoothed corner doesn't fit along the edge.
  if ((1 + s) * r > max_p) {
    s = clamp(max_p / r - 1, 0, s)
  }
  r = Math.min(r, max_p)
  const p = Math.min((1 + s) * r, max_p)
  const arc_measure = 90 * (1 - s)
  const arc_section_length = Math.sin(((arc_measure / 2) * Math.PI) / 180) * r * Math.SQRT2
  const angle_alpha = (90 - arc_measure) / 2
  const p3_to_p4 = r * Math.tan(((angle_alpha / 2) * Math.PI) / 180)
  const angle_beta = 45 * s
  const c = p3_to_p4 * Math.cos((angle_beta * Math.PI) / 180)
  const d = c * Math.tan((angle_beta * Math.PI) / 180)
  const b = Math.max((p - arc_section_length - c - d) / 3, 0)
  const a = 2 * b
  return { r, p, a, b, c, d }
}

function append_corner(path: BezPath, corner: Point, din: Vec2, dout: Vec2, prof: CornerProfile): void {
  // position = corner - back * din + side * dout
  const at = (back: number, side: number): Point => ({
    x: corner.x - din.x * back + dout.x * side,
    y: corner.y - din.y * back + dout.y * side
  })
  if (prof.r <= 0) {
    path.line_to(corner)
    return
  }
  const { r, p, a, b, c, d } = prof
  const start = at(p, 0)
  path.line_to(start)
  const p3 = at(p - a - b - c, d)
  if (a + b + c > 1e-9) {
    path.curve_to(at(p - a, 0), at(p - a - b, 0), p3)
  }
  const p4 = at(d, p - a - b - c)
  const center = at(r, r)
  const a0 = Math.atan2(p3.y - center.y, p3.x - center.x)
  const a1 = Math.atan2(p4.y - center.y, p4.x - center.x)
  let sweep = a1 - a0
  while (sweep <= -PI) {
    sweep += TAU
  }
  while (sweep > PI) {
    sweep -= TAU
  }
  if (Math.abs(sweep) > 1e-9) {
    const arc = Arc.new(center, [r, r], a0, sweep, 0)
    Arc.to_cubic_beziers(arc, 0.01, (p1, p2, p) => path.curve_to(p1, p2, p))
  }
  const end = at(0, p)
  if (a + b + c > 1e-9) {
    path.curve_to(at(0, p - a - b), at(0, p - a), end)
  } else {
    path.line_to(end)
  }
}

/**
 * The vertices of a regular polygon with `count` sides inscribed in the
 * `width`×`height` box, first vertex at the top centre (Figma's polygon).
 */
export function polygon_points(width: number, height: number, count: number): Point[] {
  const n = clamp(count, 3, 120)
  const rx = finite(width) / 2
  const ry = finite(height) / 2
  const out: Point[] = []
  for (let i = 0; i < n; i++) {
    const t = -FRAC_PI_2 + (TAU * i) / n
    out.push(Point.new(rx + rx * Math.cos(t), ry + ry * Math.sin(t)))
  }
  return out
}

/** The vertices of a star with `count` points and `inner_ratio` (0..1) inner radius. */
export function star_points(width: number, height: number, count: number, inner_ratio: number): Point[] {
  const n = clamp(count, 3, 120)
  const k = clamp(finite(inner_ratio), 0.001, 1)
  const rx = finite(width) / 2
  const ry = finite(height) / 2
  const out: Point[] = []
  for (let i = 0; i < n * 2; i++) {
    const t = -FRAC_PI_2 + (PI * i) / n
    const f = i % 2 === 0 ? 1 : k
    out.push(Point.new(rx + rx * f * Math.cos(t), ry + ry * f * Math.sin(t)))
  }
  return out
}

/**
 * A closed polygon through `points` with every vertex rounded by `radius`
 * (clamped so arcs fit).
 */
export function rounded_polygon(points: readonly Point[], radius0: number): BezPath {
  const path = BezPath.new()
  const n = points.length
  if (n < 2) {
    return path
  }
  const radius = Math.max(0, finite(radius0))
  if (radius <= 0 || n < 3) {
    points.forEach((p, i) => {
      if (i === 0) {
        path.move_to(p)
      } else {
        path.line_to(p)
      }
    })
    path.close_path()
    return path
  }
  // For each vertex: the tangent points on its two edges and the bezier between them.
  const corners: Array<[Point, Point, Point, Point]> = []
  for (let i = 0; i < n; i++) {
    const prev = points[(i + n - 1) % n]
    const cur = points[i]
    const next = points[(i + 1) % n]
    if (!prev || !cur || !next) continue
    const v1 = Point.sub(prev, cur)
    const v2 = Point.sub(next, cur)
    const l1 = Vec2Math.hypot(v1)
    const l2 = Vec2Math.hypot(v2)
    if (l1 < 1e-9 || l2 < 1e-9) {
      corners.push([cur, cur, cur, cur])
      continue
    }
    const u1 = Vec2Math.scale(v1, 1 / l1)
    const u2 = Vec2Math.scale(v2, 1 / l2)
    const cos = clamp(Vec2Math.dot(u1, u2), -1, 1)
    const angle = Math.acos(cos)
    if (angle < 1e-6 || PI - angle < 1e-6) {
      corners.push([cur, cur, cur, cur])
      continue
    }
    let t = radius / Math.tan(angle / 2)
    const max_t = Math.min(l1, l2) / 2
    let r = radius
    if (t > max_t) {
      r = (r * max_t) / t
      t = max_t
    }
    const a = Point.add(cur, Vec2Math.scale(u1, t))
    const b = Point.add(cur, Vec2Math.scale(u2, t))
    // Cubic arc approximation: handle length k*r with k = 4/3 tan(theta/4), theta = PI - angle.
    const theta = PI - angle
    const k = (4 / 3) * Math.tan(theta / 4) * r
    const c1 = Point.sub(a, Vec2Math.scale(u1, k))
    const c2 = Point.sub(b, Vec2Math.scale(u2, k))
    corners.push([a, c1, c2, b])
  }
  corners.forEach(([a, c1, c2, b], i) => {
    if (i === 0) {
      path.move_to(a)
    } else {
      path.line_to(a)
    }
    path.curve_to(c1, c2, b)
  })
  path.close_path()
  return path
}

/**
 * An ellipse in the `width`×`height` box; with arc data, a pie/arc/ring:
 * `start` and `sweep` in radians (clockwise from 3 o'clock, y-down) and
 * `inner` radius ratio 0..1.
 */
export function ellipse(width: number, height: number, start: number, sweep0: number, inner0: number): BezPath {
  const rx = Math.max(0, finite(width)) / 2
  const ry = Math.max(0, finite(height)) / 2
  const c = Point.new(rx, ry)
  const sweep = clamp(finite(sweep0), -TAU, TAU)
  const startA = finite(start)
  const inner = clamp(finite(inner0), 0, 1)
  const full = Math.abs(sweep) >= TAU - 1e-9
  const path = BezPath.new()
  if (full && inner <= 0) {
    return Ellipse.to_path(Ellipse.new(c, [rx, ry], 0), 0.01)
  }
  if (full) {
    // A ring: outer clockwise, inner counter-clockwise.
    path.elements.push(...Ellipse.path_elements(Ellipse.new(c, [rx, ry], 0), 0.01))
    const inner_path = Ellipse.to_path(Ellipse.new(c, [rx * inner, ry * inner], 0), 0.01)
    path.elements.push(...reverse_subpaths(inner_path).elements)
    return path
  }
  const outer = Arc.new(c, [rx, ry], startA, sweep, 0)
  path.move_to({
    x: c.x + rx * Math.cos(startA),
    y: c.y + ry * Math.sin(startA)
  })
  Arc.to_cubic_beziers(outer, 0.01, (p1, p2, p) => path.curve_to(p1, p2, p))
  if (inner > 0) {
    const end = startA + sweep
    path.line_to({
      x: c.x + rx * inner * Math.cos(end),
      y: c.y + ry * inner * Math.sin(end)
    })
    const back = Arc.new(c, [rx * inner, ry * inner], end, -sweep, 0)
    Arc.to_cubic_beziers(back, 0.01, (p1, p2, p) => path.curve_to(p1, p2, p))
  } else {
    path.line_to(c)
  }
  path.close_path()
  return path
}

/** Reverse every subpath of a path (kurbo trait helper `ReverseSubpaths`). */
export function reverse_subpaths(path: BezPath): BezPath {
  const out = BezPath.new()
  for (const seg_path of split_subpaths(path)) {
    const segs = seg_path.segments()
    const last = segs.at(-1)
    if (!last) continue
    out.move_to(PathSeg.end(last))
    for (const s of [...segs].reverse()) {
      const rev = PathSeg.reverse(s)
      switch (rev.type) {
        case 'Line':
          out.line_to(rev.p1)
          break
        case 'Quad':
          out.quad_to(rev.p1, rev.p2)
          break
        case 'Cubic':
          out.curve_to(rev.p1, rev.p2, rev.p3)
          break
      }
    }
    if (seg_path.elements.at(-1)?.type === 'ClosePath') {
      out.close_path()
    }
  }
  return out
}

/** Split a path into its subpaths. */
export function split_subpaths(path: BezPath): BezPath[] {
  const out: BezPath[] = []
  let cur = BezPath.new()
  for (const el of path.elements) {
    if (el.type === 'MoveTo' && !cur.is_empty()) {
      out.push(cur)
      cur = BezPath.new()
    }
    cur.push(el)
  }
  if (!cur.is_empty()) {
    out.push(cur)
  }
  return out
}

/** Bounding box of a set of points (null when empty). */
export function points_bounds(points: Iterable<Point>): Rect | null {
  const it = points[Symbol.iterator]()
  const firstResult = it.next()
  if (firstResult.done) return null
  let r = RectMath.from_points(firstResult.value, firstResult.value)
  let next = it.next()
  while (!next.done) {
    r = RectMath.union_pt(r, next.value)
    next = it.next()
  }
  return r
}

/** The axis-aligned bounds of `rect` after `xf`. */
export function transform_rect_bbox(xf: Affine, rect: Rect): Rect {
  const pts: Point[] = [
    Point.new(rect.x0, rect.y0),
    Point.new(rect.x1, rect.y0),
    Point.new(rect.x1, rect.y1),
    Point.new(rect.x0, rect.y1)
  ].map((p) => Affine.apply(xf, p))
  return points_bounds(pts) ?? RectMath.ZERO
}
