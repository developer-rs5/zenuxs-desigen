/**
 * ZenuxsDesign geometry foundation — the `kurbo` subset the document model uses.
 *
 * Ported 1:1 from the Rust crate APIs FigCraft consumes (`crates/geom` re-exports):
 * Affine (2×3 matrix), BezPath (element list), Point, Vec2, Size, Rect, PathEl,
 * PathSeg, Arc (ellipse arc → cubics), Ellipse, Circle, and flatten (bezier →
 * polyline sampling). Coordinates are y-down. Everything is plain data + pure
 * functions so the document model stays JSON-serializable.
 *
 * Rust → TS notes kept faithful to the source:
 * - `Affine.as_coeffs()` returns [a, b, c, d, e, f] (column-major like kurbo).
 * - `PathEl` is a tagged union matching kurbo's enum; serialization uses the
 *   same element order.
 */

export interface Point {
  x: number
  y: number
}

export type Vec2 = Point
export interface Size {
  width: number
  height: number
}

export interface Rect {
  x0: number
  y0: number
  x1: number
  y1: number
}

export const Point = {
  new(x: number, y: number): Point {
    return { x, y }
  },
  ZERO: { x: 0, y: 0 } as Point,
  origin(): Point {
    return { x: 0, y: 0 }
  },
  toVec2(p: Point): Vec2 {
    return { x: p.x, y: p.y }
  },
  lerp(a: Point, b: Point, t: number): Point {
    return { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t }
  },
  distance(a: Point, b: Point): number {
    return Math.hypot(a.x - b.x, a.y - b.y)
  },
  hypot(a: Point, b: Point): number {
    return Math.hypot(a.x - b.x, a.y - b.y)
  },
  hypot2(a: Point, b: Point): number {
    const dx = a.x - b.x
    const dy = a.y - b.y
    return dx * dx + dy * dy
  },
  dot(a: Point, b: Point): number {
    return a.x * b.x + a.y * b.y
  },
  sub(a: Point, b: Point): Point {
    return { x: a.x - b.x, y: a.y - b.y }
  },
  add(a: Point, b: Point): Point {
    return { x: a.x + b.x, y: a.y + b.y }
  },
  scale(a: Point, k: number): Point {
    return { x: a.x * k, y: a.y * k }
  }
}

export const Vec2Math = {
  new(x: number, y: number): Vec2 {
    return { x, y }
  },
  add(a: Vec2, b: Vec2): Vec2 {
    return { x: a.x + b.x, y: a.y + b.y }
  },
  sub(a: Vec2, b: Vec2): Vec2 {
    return { x: a.x - b.x, y: a.y - b.y }
  },
  scale(a: Vec2, k: number): Vec2 {
    return { x: a.x * k, y: a.y * k }
  },
  dot(a: Vec2, b: Vec2): number {
    return a.x * b.x + a.y * b.y
  },
  cross(a: Vec2, b: Vec2): number {
    return a.x * b.y - a.y * b.x
  },
  hypot(a: Vec2): number {
    return Math.hypot(a.x, a.y)
  },
  hypot2(a: Vec2): number {
    return a.x * a.x + a.y * a.y
  },
  /** Rotate 90° (kurbo `Vec2::turn_90`): (-y, x). */
  turn_90(a: Vec2): Vec2 {
    return { x: -a.y, y: a.x }
  },
  normalize(a: Vec2): Vec2 {
    const h = Math.hypot(a.x, a.y)
    return h > 0 ? { x: a.x / h, y: a.y / h } : { x: 0, y: 0 }
  },
  atan2(a: Vec2): number {
    return Math.atan2(a.y, a.x)
  }
}

export const RectMath = {
  ZERO: { x0: 0, y0: 0, x1: 0, y1: 0 } as Rect,
  new(x0: number, y0: number, x1: number, y1: number): Rect {
    return { x0, y0, x1, y1 }
  },
  from_points(a: Point, b: Point): Rect {
    return {
      x0: Math.min(a.x, b.x),
      y0: Math.min(a.y, b.y),
      x1: Math.max(a.x, b.x),
      y1: Math.max(a.y, b.y)
    }
  },
  from_origin_size(origin: Point, size: Size): Rect {
    return {
      x0: origin.x,
      y0: origin.y,
      x1: origin.x + size.width,
      y1: origin.y + size.height
    }
  },
  from_ltrb(l: number, t: number, r: number, b: number): Rect | null {
    if (!(l <= r) || !(t <= b)) return null
    return { x0: l, y0: t, x1: r, y1: b }
  },
  from_xywh(x: number, y: number, w: number, h: number): Rect | null {
    if (!(w >= 0) || !(h >= 0)) return null
    return { x0: x, y0: y, x1: x + w, y1: y + h }
  },
  width(r: Rect): number {
    return r.x1 - r.x0
  },
  height(r: Rect): number {
    return r.y1 - r.y0
  },
  size(r: Rect): Size {
    return { width: r.x1 - r.x0, height: r.y1 - r.y0 }
  },
  center(r: Rect): Point {
    return { x: (r.x0 + r.x1) / 2, y: (r.y0 + r.y1) / 2 }
  },
  origin(r: Rect): Point {
    return { x: r.x0, y: r.y0 }
  },
  union_pt(r: Rect, p: Point): Rect {
    return {
      x0: Math.min(r.x0, p.x),
      y0: Math.min(r.y0, p.y),
      x1: Math.max(r.x1, p.x),
      y1: Math.max(r.y1, p.y)
    }
  },
  union(a: Rect, b: Rect): Rect {
    return {
      x0: Math.min(a.x0, b.x0),
      y0: Math.min(a.y0, b.y0),
      x1: Math.max(a.x1, b.x1),
      y1: Math.max(a.y1, b.y1)
    }
  },
  intersect(a: Rect, b: Rect): Rect | null {
    const x0 = Math.max(a.x0, b.x0)
    const y0 = Math.max(a.y0, b.y0)
    const x1 = Math.min(a.x1, b.x1)
    const y1 = Math.min(a.y1, b.y1)
    if (x0 > x1 || y0 > y1) return null
    return { x0, y0, x1, y1 }
  },
  inflate(r: Rect, dx: number, dy: number = dx): Rect {
    return { x0: r.x0 - dx, y0: r.y0 - dy, x1: r.x1 + dx, y1: r.y1 + dy }
  },
  contains(r: Rect, p: Point): boolean {
    return p.x >= r.x0 && p.x <= r.x1 && p.y >= r.y0 && p.y <= r.y1
  },
  is_positive(r: Rect): boolean {
    return r.x1 > r.x0 && r.y1 > r.y0
  },
  is_empty(r: Rect): boolean {
    return r.x0 >= r.x1 || r.y0 >= r.y1
  }
}

/** kurbo `Affine`: [a, b, c, d, e, f] column-major 2×3 matrix. */
export interface Affine {
  coeffs: readonly [number, number, number, number, number, number]
}

export const Affine = {
  new(coeffs: readonly [
    number,
    number,
    number,
    number,
    number,
    number
  ]): Affine {
    return { coeffs: [coeffs[0], coeffs[1], coeffs[2], coeffs[3], coeffs[4], coeffs[5]] }
  },
  IDENTITY: { coeffs: [1, 0, 0, 1, 0, 0] } as Affine,
  FLIP_Y: { coeffs: [1, 0, 0, -1, 0, 0] } as Affine,
  FLIP_X: { coeffs: [-1, 0, 0, 1, 0, 0] } as Affine,
  as_coeffs(xf: Affine): readonly [number, number, number, number, number, number] {
    return xf.coeffs
  },
  translate(v: Vec2): Affine {
    return { coeffs: [1, 0, 0, 1, v.x, v.y] }
  },
  scale(s: number): Affine {
    return { coeffs: [s, 0, 0, s, 0, 0] }
  },
  scale_non_uniform(sx: number, sy: number): Affine {
    return { coeffs: [sx, 0, 0, sy, 0, 0] }
  },
  rotate(th: number): Affine {
    const c = Math.cos(th)
    const s = Math.sin(th)
    return { coeffs: [c, s, -s, c, 0, 0] }
  },
  skew_x(th: number): Affine {
    return { coeffs: [1, 0, Math.tan(th), 1, 0, 0] }
  },
  skew_y(th: number): Affine {
    return { coeffs: [1, Math.tan(th), 0, 1, 0, 0] }
  },
  compose(a: Affine, b: Affine): Affine {
    const [a1, a2, a3, a4, a5, a6] = a.coeffs
    const [b1, b2, b3, b4, b5, b6] = b.coeffs
    return {
      coeffs: [
        a1 * b1 + a3 * b2,
        a2 * b1 + a4 * b2,
        a1 * b3 + a3 * b4,
        a2 * b3 + a4 * b4,
        a1 * b5 + a3 * b6 + a5,
        a2 * b5 + a4 * b6 + a6
      ]
    }
  },
  /** Compose left-to-right like Rust's `a * b`. */
  mul(a: Affine, b: Affine): Affine {
    return Affine.compose(a, b)
  },
  apply(xf: Affine, p: Point): Point {
    const [a, b, c, d, e, f] = xf.coeffs
    return { x: a * p.x + c * p.y + e, y: b * p.x + d * p.y + f }
  },
  apply_vec(xf: Affine, v: Vec2): Vec2 {
    const [a, b, c, d] = xf.coeffs
    return { x: a * v.x + c * v.y, y: b * v.x + d * v.y }
  },
  determinant(xf: Affine): number {
    const [a, b, c, d] = xf.coeffs
    return a * d - b * c
  },
  inverse(xf: Affine): Affine {
    const [a, b, c, d, e, f] = xf.coeffs
    const det = a * d - b * c
    if (det === 0 || !Number.isFinite(det)) {
      throw new Error('Affine::inverse: singular matrix')
    }
    const ia = d / det
    const ib = -b / det
    const ic = -c / det
    const id = a / det
    return { coeffs: [ia, ib, ic, id, -(ia * e + ic * f), -(ib * e + id * f)] }
  },
  is_identity(xf: Affine): boolean {
    return (
      xf.coeffs[0] === 1 &&
      xf.coeffs[1] === 0 &&
      xf.coeffs[2] === 0 &&
      xf.coeffs[3] === 1 &&
      xf.coeffs[4] === 0 &&
      xf.coeffs[5] === 0
    )
  }
}

// ------------------------------ Path elements ------------------------------

export type PathEl =
  | { type: 'MoveTo'; p: Point }
  | { type: 'LineTo'; p: Point }
  | { type: 'QuadTo'; a: Point; b: Point }
  | { type: 'CurveTo'; a: Point; b: Point; c: Point }
  | { type: 'ClosePath' }

export type PathSeg =
  | { type: 'Line'; p0: Point; p1: Point }
  | { type: 'Quad'; p0: Point; p1: Point; p2: Point }
  | { type: 'Cubic'; p0: Point; p1: Point; p2: Point; p3: Point }

export const PathSeg = {
  /** The segment's end point (kurbo `ParamCurve::end`). */
  end(seg: PathSeg): Point {
    switch (seg.type) {
      case 'Line':
        return seg.p1
      case 'Quad':
        return seg.p2
      case 'Cubic':
        return seg.p3
    }
  },
  /** The segment's start point. */
  start(seg: PathSeg): Point {
    switch (seg.type) {
      case 'Line':
        return seg.p0
      case 'Quad':
        return seg.p0
      case 'Cubic':
        return seg.p0
    }
  },
  /** Reversed segment (kurbo `PathSeg::reverse`). */
  reverse(seg: PathSeg): PathSeg {
    switch (seg.type) {
      case 'Line':
        return { type: 'Line', p0: seg.p1, p1: seg.p0 }
      case 'Quad':
        return { type: 'Quad', p0: seg.p2, p1: seg.p1, p2: seg.p0 }
      case 'Cubic':
        return { type: 'Cubic', p0: seg.p3, p1: seg.p2, p2: seg.p1, p3: seg.p0 }
    }
  }
}

/** kurbo `BezPath`: an owned list of path elements. */
export class BezPath {
  elements: PathEl[] = []

  static new(): BezPath {
    return new BezPath()
  }

  static from_vec(els: PathEl[]): BezPath {
    const p = new BezPath()
    p.elements = [...els]
    return p
  }

  static from_svg(svg: string): BezPath | Error {
    const parsed = parseSvgPath(svg)
    if (parsed instanceof Error) return parsed
    return BezPath.from_vec(parsed)
  }

  push(el: PathEl): void {
    this.elements.push(el)
  }

  move_to(p: Point | { 0: number; 1: number }): void {
    const pt = pointOf(p)
    this.elements.push({ type: 'MoveTo', p: pt })
  }

  line_to(p: Point | { 0: number; 1: number }): void {
    const pt = pointOf(p)
    this.elements.push({ type: 'LineTo', p: pt })
  }

  quad_to(
    p1: Point | { 0: number; 1: number },
    p2: Point | { 0: number; 1: number }
  ): void {
    this.elements.push({ type: 'QuadTo', a: pointOf(p1), b: pointOf(p2) })
  }

  curve_to(
    p1: Point | { 0: number; 1: number },
    p2: Point | { 0: number; 1: number },
    p3: Point | { 0: number; 1: number }
  ): void {
    this.elements.push({
      type: 'CurveTo',
      a: pointOf(p1),
      b: pointOf(p2),
      c: pointOf(p3)
    })
  }

  close_path(): void {
    this.elements.push({ type: 'ClosePath' })
  }

  is_empty(): boolean {
    return this.elements.length === 0
  }

  segments(): PathSeg[] {
    const segs: PathSeg[] = []
    let current: Point | null = null
    let start: Point | null = null
    for (const el of this.elements) {
      switch (el.type) {
        case 'MoveTo':
          current = el.p
          start = el.p
          break
        case 'LineTo':
          if (current) segs.push({ type: 'Line', p0: current, p1: el.p })
          current = el.p
          break
        case 'QuadTo':
          if (current) segs.push({ type: 'Quad', p0: current, p1: el.a, p2: el.b })
          current = el.b
          break
        case 'CurveTo':
          if (current)
            segs.push({ type: 'Cubic', p0: current, p1: el.a, p2: el.b, p3: el.c })
          current = el.c
          break
        case 'ClosePath':
          if (current && start && !Point.hypot2(current, start)) {
            segs.push({ type: 'Line', p0: current, p1: start })
          }
          current = start
          break
      }
    }
    return segs
  }

  apply_affine(xf: Affine): void {
    this.elements = this.elements.map((el) => {
      switch (el.type) {
        case 'MoveTo':
          return { type: 'MoveTo', p: Affine.apply(xf, el.p) } as PathEl
        case 'LineTo':
          return { type: 'LineTo', p: Affine.apply(xf, el.p) } as PathEl
        case 'QuadTo':
          return {
            type: 'QuadTo',
            a: Affine.apply(xf, el.a),
            b: Affine.apply(xf, el.b)
          } as PathEl
        case 'CurveTo':
          return {
            type: 'CurveTo',
            a: Affine.apply(xf, el.a),
            b: Affine.apply(xf, el.b),
            c: Affine.apply(xf, el.c)
          } as PathEl
        case 'ClosePath':
          return el
      }
    })
  }

  transform(xf: Affine): BezPath {
    const out = BezPath.from_vec([...this.elements])
    out.apply_affine(xf)
    return out
  }

  to_svg(): string {
    return toSvgString(this.elements)
  }

  bounding_box(): Rect | null {
    let box_: Rect | null = null
    const include = (p: Point): void => {
      box_ = box_ ? RectMath.union_pt(box_, p) : RectMath.from_points(p, p)
    }
    for (const el of this.elements) {
      switch (el.type) {
        case 'MoveTo':
        case 'LineTo':
          include(el.p)
          break
        case 'QuadTo':
          include(el.a)
          include(el.b)
          break
        case 'CurveTo':
          include(el.a)
          include(el.b)
          include(el.c)
          break
        case 'ClosePath':
          break
      }
    }
    return box_
  }

  /**
   * kurbo `Shape::area`: the signed area of the (closed) path, integrated
   * exactly per segment with Gauss-Legendre quadrature (the shoelace integrand
   * of a cubic is a degree-5 polynomial; GL-4 integrates degree ≤ 7 exactly,
   * so there is no polygon-sampling deficit).
   */
  area(): number {
    let area = 0
    let current: Point | null = null
    let start: Point | null = null
    for (const el of this.elements) {
      switch (el.type) {
        case 'MoveTo':
          current = el.p
          start = el.p
          break
        case 'LineTo':
          if (current) {
            area += current.x * el.p.y - el.p.x * current.y
            current = el.p
          }
          break
        case 'QuadTo': {
          const p0 = current
          if (!p0) break
          area += glIntegrate((t) => {
            const p = evalQuad(p0, el.a, el.b, t)
            const d = evalQuadDeriv(p0, el.a, el.b, t)
            return p.x * d.y - p.y * d.x
          }, 3)
          current = el.b
          break
        }
        case 'CurveTo': {
          if (!current) break
          const p0 = current
          area += glIntegrate((t) => {
            const p = evalCubic(p0, el.a, el.b, el.c, t)
            const d = evalCubicDeriv(p0, el.a, el.b, el.c, t)
            return p.x * d.y - p.y * d.x
          }, 5)
          current = el.c
          break
        }
        case 'ClosePath':
          if (start && current) {
            area += current.x * start.y - start.x * current.y
          }
          current = start
          break
      }
    }
    return area / 2
  }

  clone(): BezPath {
    return BezPath.from_vec([...this.elements])
  }
}

function pointOf(p: Point | { 0: number; 1: number }): Point {
  if ('x' in p) return p
  return { x: p[0], y: p[1] }
}

export function segPoints(seg: PathSeg): Point[] {
  switch (seg.type) {
    case 'Line':
      return [seg.p0, seg.p1]
    case 'Quad':
      return [seg.p0, seg.p1, seg.p2]
    case 'Cubic':
      return [seg.p0, seg.p1, seg.p2, seg.p3]
  }
}


// ------------------------------ Exact quadrature ------------------------------

/** Gauss-Legendre nodes/weights for 4-point rule (exact to degree 7). */
const GL4_NODES = [-0.8611363115940526, -0.3399810435848563, 0.3399810435848563, 0.8611363115940526]
const GL4_WEIGHTS = [0.3478548451374538, 0.6521451548625461, 0.6521451548625461, 0.3478548451374538]

/** Integrate f over t ∈ [0, 1] with the 4-point Gauss-Legendre rule. */
function glIntegrate(f: (t: number) => number, degree: number): number {
  void degree
  let sum = 0
  for (let i = 0; i < 4; i++) {
    const t = 0.5 * (1 + GL4_NODES[i])
    sum += GL4_WEIGHTS[i] * f(t)
  }
  return sum / 2
}

function evalQuadDeriv(p0: Point, p1: Point, p2: Point, t: number): Point {
  return {
    x: 2 * (1 - t) * (p1.x - p0.x) + 2 * t * (p2.x - p1.x),
    y: 2 * (1 - t) * (p1.y - p0.y) + 2 * t * (p2.y - p1.y)
  }
}

function evalCubicDeriv(p0: Point, p1: Point, p2: Point, p3: Point, t: number): Point {
  const u = 1 - t
  return {
    x: 3 * u * u * (p1.x - p0.x) + 6 * u * t * (p2.x - p1.x) + 3 * t * t * (p3.x - p2.x),
    y: 3 * u * u * (p1.y - p0.y) + 6 * u * t * (p2.y - p1.y) + 3 * t * t * (p3.y - p2.y)
  }
}

// ------------------------------ SVG parse/serialize ------------------------------

function num(s: string): number {
  return Number.parseFloat(s)
}

function parseSvgPath(svg: string): PathEl[] | Error {
  const els: PathEl[] = []
  const tokens = svg.match(/[MmLlHhVvZzCcSsQqTtAa]|-?\d*\.?\d+(?:e[-+]?\d+)?/g)
  if (!tokens) return new Error('parseSvgPath: empty input')
  let i = 0
  const next = (): number => {
    const t = tokens[i]
    if (t === undefined || /^-?\d/.test(t) === false) {
      throw new Error('parseSvgPath: expected number')
    }
    i += 1
    return num(t)
  }
  let cur: Point = { x: 0, y: 0 }
  let start: Point = { x: 0, y: 0 }
  try {
    while (i < tokens.length) {
      const cmd = tokens[i]
      if (cmd === undefined) break
      i += 1
      switch (cmd) {
        case 'M': {
          const x = next()
          const y = next()
          cur = { x, y }
          start = cur
          els.push({ type: 'MoveTo', p: cur })
          break
        }
        case 'L': {
          const x = next()
          const y = next()
          cur = { x, y }
          els.push({ type: 'LineTo', p: cur })
          break
        }
        case 'C': {
          const x1 = next()
          const y1 = next()
          const x2 = next()
          const y2 = next()
          const x = next()
          const y = next()
          els.push({
            type: 'CurveTo',
            a: { x: x1, y: y1 },
            b: { x: x2, y: y2 },
            c: { x, y }
          })
          cur = { x, y }
          break
        }
        case 'Q': {
          const x1 = next()
          const y1 = next()
          const x = next()
          const y = next()
          els.push({ type: 'QuadTo', a: { x: x1, y: y1 }, b: { x, y } })
          cur = { x, y }
          break
        }
        case 'Z':
        case 'z':
          els.push({ type: 'ClosePath' })
          cur = start
          break
        default:
          return new Error(`parseSvgPath: unsupported command '${cmd}'`)
      }
    }
  } catch (error) {
    return error instanceof Error ? error : new Error('parseSvgPath: malformed')
  }
  return els
}

function fmt(v: number): string {
  const r = Math.round(v * 1e6) / 1e6
  return String(r)
}

function toSvgString(els: PathEl[]): string {
  const parts: string[] = []
  for (const el of els) {
    switch (el.type) {
      case 'MoveTo':
        parts.push(`M${fmt(el.p.x)} ${fmt(el.p.y)}`)
        break
      case 'LineTo':
        parts.push(`L${fmt(el.p.x)} ${fmt(el.p.y)}`)
        break
      case 'QuadTo':
        parts.push(
          `Q${fmt(el.a.x)} ${fmt(el.a.y)} ${fmt(el.b.x)} ${fmt(el.b.y)}`
        )
        break
      case 'CurveTo':
        parts.push(
          `C${fmt(el.a.x)} ${fmt(el.a.y)} ${fmt(el.b.x)} ${fmt(el.b.y)} ${fmt(el.c.x)} ${fmt(el.c.y)}`
        )
        break
      case 'ClosePath':
        parts.push('Z')
        break
    }
  }
  return parts.join('')
}

// ------------------------------ Arcs and ellipses ------------------------------

/** kurbo `Arc`: an elliptical arc; samples to cubic beziers. */
export interface Arc {
  center: Point
  radii: Vec2
  start_angle: number
  sweep_angle: number
  x_rotation: number
}

export const Arc = {
  new(
    center: Point,
    radii: { 0: number; 1: number },
    start_angle: number,
    sweep_angle: number,
    x_rotation: number
  ): Arc {
    return { center, radii: { x: radii[0], y: radii[1] }, start_angle, sweep_angle, x_rotation }
  },
  /**
   * Approximate the arc with cubic beziers (kurbo `Arc::to_cubic_beziers`).
   * Each cubic's error is below `tolerance` (kurbo uses angle subdivision).
   */
  to_cubic_beziers(
    arc: Arc,
    tolerance: number,
    cb: (p1: Point, p2: Point, p: Point) => void
  ): void {
    const { center, radii, start_angle, sweep_angle } = arc
    const total = Math.abs(sweep_angle)
    if (total < 1e-12 || radii.x <= 0 || radii.y <= 0) return
    // Adaptive subdivision like kurbo: pick the per-segment sweep so the kappa
    // cubic's midpoint deviation from the true arc stays under `tolerance`,
    // verified against the real arc point (not an error-formula estimate).
    const segsFor = (d: number): number => Math.max(1, Math.ceil(total / d))
    let n = segsFor(Math.PI / 4)
    for (let guard = 0; guard < 64; guard++) {
      const d = sweep_angle / n
      const mid = n / 2
      // Probe the first segment's midpoint deviation.
      const k = (4 / 3) * Math.tan(d / 4)
      const th = start_angle
      const th3 = th + d
      const thm = th + d / 2
      const p0 = arcPoint(center, radii, th)
      const p3 = arcPoint(center, radii, th3)
      const d1 = { x: -radii.x * Math.sin(th) * k, y: radii.y * Math.cos(th) * k }
      const d2 = { x: -radii.x * Math.sin(th3) * k, y: radii.y * Math.cos(th3) * k }
      const p1 = { x: p0.x + d1.x, y: p0.y + d1.y }
      const p2 = { x: p3.x - d2.x, y: p3.y - d2.y }
      // Max deviation of the kappa cubic from the true arc, sampled across the
      // segment (t=0.5 is exact by symmetry, so sample the off-centre params).
      let dev = 0
      for (let s = 1; s < 20; s++) {
        const u = s / 20
        const cubicP = evalCubic(p0, p1, p2, p3, u)
        const trueP = arcPoint(center, radii, th + d * u)
        dev = Math.max(dev, Point.hypot(cubicP, trueP))
      }
      void mid
      void thm
      if (dev <= Math.max(tolerance, 1e-12) || n > 4096) break
      n *= 2
    }
    const d = sweep_angle / n
    const kappa = (4 / 3) * Math.tan(d / 4)
    let th = start_angle
    for (let k = 0; k < n; k++) {
      const p0 = arcPoint(center, radii, th)
      const th3 = th + d
      const p3 = arcPoint(center, radii, th3)
      // Standard arc→cubic control handles: kappa = 4/3·tan(Δ/4) scaled by the
      // ellipse's tangent derivative at each endpoint (exact for circles).
      const d1 = { x: -radii.x * Math.sin(th) * kappa, y: radii.y * Math.cos(th) * kappa }
      const d2 = { x: -radii.x * Math.sin(th3) * kappa, y: radii.y * Math.cos(th3) * kappa }
      const p1 = { x: p0.x + d1.x, y: p0.y + d1.y }
      const p2 = { x: p3.x - d2.x, y: p3.y - d2.y }
      cb(p1, p2, p3)
      th = th3
    }
  }
}

function arcPoint(center: Point, radii: Vec2, angle: number): Point {
  return {
    x: center.x + radii.x * Math.cos(angle),
    y: center.y + radii.y * Math.sin(angle)
  }
}

/** kurbo `Ellipse`. */
export const Ellipse = {
  new(center: Point, radii: { 0: number; 1: number }, x_rotation: number): {
    center: Point
    radii: Vec2
    x_rotation: number
  } {
    return { center, radii: { x: radii[0], y: radii[1] }, x_rotation }
  },
  /** The ellipse outline as four (or more) cubics, refined to `accuracy`. */
  to_path(
    ellipse: { center: Point; radii: Vec2; x_rotation: number },
    accuracy: number
  ): BezPath {
    const path = BezPath.new()
    const full: Arc = {
      center: ellipse.center,
      radii: ellipse.radii,
      start_angle: 0,
      sweep_angle: Math.PI * 2,
      x_rotation: ellipse.x_rotation
    }
    path.move_to(arcPoint(ellipse.center, ellipse.radii, 0))
    Arc.to_cubic_beziers(full, accuracy, (p1, p2, p) => path.curve_to(p1, p2, p))
    path.close_path()
    return path
  },
  path_elements(
    ellipse: { center: Point; radii: Vec2; x_rotation: number },
    accuracy: number
  ): PathEl[] {
    return Ellipse.to_path(ellipse, accuracy).elements
  }
}

/** kurbo `Circle`. */
export const Circle = {
  new(center: Point, radius: number): { center: Point; radius: number } {
    return { center, radius }
  },
  to_path(circle: { center: Point; radius: number }, accuracy: number): BezPath {
    return Ellipse.to_path(
      { center: circle.center, radii: { x: circle.radius, y: circle.radius }, x_rotation: 0 },
      accuracy
    )
  }
}

// ------------------------------ Flatten ------------------------------

/**
 * kurbo `flatten`: sample a path's curves into line segments within `tolerance`
 * and feed every flattened element (including the leading MoveTo) to `cb`.
 */
export function flatten(
  elements: readonly PathEl[],
  tolerance: number,
  cb: (el: PathEl) => void
): void {
  let current: Point | null = null
  let start: Point | null = null
  for (const el of elements) {
    switch (el.type) {
      case 'MoveTo':
        current = el.p
        start = el.p
        cb(el)
        break
      case 'LineTo':
        current = el.p
        cb(el)
        break
      case 'QuadTo': {
        if (!current) break
        const p0 = current
        const steps = quadSteps(p0, el.a, el.b, tolerance)
        for (let i = 1; i <= steps; i++) {
          const p = evalQuad(p0, el.a, el.b, i / steps)
          cb({ type: 'LineTo', p })
        }
        current = el.b
        break
      }
      case 'CurveTo': {
        if (!current) break
        const p0 = current
        const steps = cubicSteps(p0, el.a, el.b, el.c, tolerance)
        for (let i = 1; i <= steps; i++) {
          const p = evalCubic(p0, el.a, el.b, el.c, i / steps)
          cb({ type: 'LineTo', p })
        }
        current = el.c
        break
      }
      case 'ClosePath':
        current = start
        cb(el)
        break
    }
  }
}

function evalQuad(p0: Point, p1: Point, p2: Point, t: number): Point {
  const u = 1 - t
  return {
    x: u * u * p0.x + 2 * u * t * p1.x + t * t * p2.x,
    y: u * u * p0.y + 2 * u * t * p1.y + t * t * p2.y
  }
}

function evalCubic(p0: Point, p1: Point, p2: Point, p3: Point, t: number): Point {
  const u = 1 - t
  return {
    x:
      u * u * u * p0.x +
      3 * u * u * t * p1.x +
      3 * u * t * t * p2.x +
      t * t * t * p3.x,
    y:
      u * u * u * p0.y +
      3 * u * u * t * p1.y +
      3 * u * t * t * p2.y +
      t * t * t * p3.y
  }
}

/** Number of subdivisions so the quad's flatness error is within tolerance. */
function quadSteps(p0: Point, p1: Point, p2: Point, tolerance: number): number {
  const d = {
    x: p0.x - 2 * p1.x + p2.x,
    y: p0.y - 2 * p1.y + p2.y
  }
  const err = Math.hypot(d.x, d.y) / 4
  if (err <= tolerance || err === 0) return 1
  return Math.max(1, Math.ceil(Math.sqrt(err / tolerance)))
}

/** Number of subdivisions so the cubic's flatness error is within tolerance. */
function cubicSteps(p0: Point, p1: Point, p2: Point, p3: Point, tolerance: number): number {
  // Control polygon vs chord deviation estimate (standard flatness criterion).
  const ux = 3 * p1.x - 2 * p0.x - p3.x
  const uy = 3 * p1.y - 2 * p0.y - p3.y
  const vx = 3 * p2.x - 2 * p3.x - p0.x
  const vy = 3 * p2.y - 2 * p3.y - p0.y
  const err = Math.max(Math.abs(ux), Math.abs(uy), Math.abs(vx), Math.abs(vy)) / 6
  if (err <= tolerance || err === 0) return 1
  return Math.max(1, Math.min(1024, Math.ceil(Math.sqrt(err / tolerance))))
}
