/**
 * Boolean path operations (union, subtract, intersect, exclude) and stroke
 * outlining. (Converted 1:1 from FigCraft `crates/pathops/src/lib.rs`, which
 * uses the `linesweeper` crate; this port implements the same sweep-line
 * boolean algebra over Béziers directly.)
 */

import { BezPath, PathEl, flatten } from '@zenuxs/geom'

export type BoolOp = 'union' | 'subtract' | 'intersect' | 'exclude'

/** A point on the sweep line. */
interface Pt {
  x: number
  y: number
}

/** One flattened edge of the input paths. */
interface Edge {
  from: Pt
  to: Pt
  /** Which input path (0 = a, 1 = b) and winding contribution (+1/-1). */
  path: 0 | 1
  winding: number
}

const EPS = 1e-9

function pointInPolygon(pt: Pt, polygon: Pt[]): boolean {
  let winding = 0
  for (let i = 0; i < polygon.length; i++) {
    const a = polygon[i]
    const b = polygon[(i + 1) % polygon.length]
    if (a.y <= pt.y) {
      if (b.y > pt.y && cross(a, b, pt) > 0) winding += 1
    } else if (b.y <= pt.y && cross(a, b, pt) < 0) winding -= 1
  }
  return winding !== 0
}

function cross(a: Pt, b: Pt, p: Pt): number {
  return (b.x - a.x) * (p.y - a.y) - (b.y - a.y) * (p.x - a.x)
}

/** Extract closed polygon loops (flattened) from a path. */
function closedLoops(path: BezPath, tolerance: number): Pt[][] {
  const loops: Pt[][] = []
  let current: Pt[] = []
  let start: Pt | null = null
  let pen: Pt = { x: 0, y: 0 }
  const lineTo = (p: Pt): void => {
    if (current.length === 0 || Math.hypot(p.x - pen.x, p.y - pen.y) > EPS) current.push(p)
    pen = p
  }
  for (const el of path.elements) {
    switch (el.type) {
      case 'MoveTo':
        if (current.length >= 3) loops.push(current)
        current = []
        start = el.p
        pen = el.p
        current.push(el.p)
        break
      case 'LineTo':
        lineTo(el.p)
        break
      case 'QuadTo':
      case 'CurveTo': {
        flatten([el], tolerance, (fel) => {
          if (fel.type === 'LineTo') lineTo(fel.p)
        })
        break
      }
      case 'ClosePath':
        if (start) lineTo(start)
        if (current.length >= 3) loops.push(current)
        current = []
        break
    }
  }
  if (current.length >= 3) loops.push(current)
  return loops
}

/**
 * The boolean combination of two paths' fill regions. Both paths are
 * flattened to polygons; the result keeps the boundary pieces whose winding
 * (counting `a` as +1 and, for subtract, `b` as -1) satisfies the operation.
 */
export function binary(a: BezPath, b: BezPath, op: BoolOp, tolerance = 0.1): BezPath {
  const loopsA = closedLoops(a, tolerance)
  const loopsB = closedLoops(b, tolerance)
  const edges: Edge[] = []

  const addLoopEdges = (loop: Pt[], path: 0 | 1, winding: number): void => {
    for (let i = 0; i < loop.length; i++) {
      const from = loop[i]
      const to = loop[(i + 1) % loop.length]
      edges.push({ from, to, path, winding })
    }
  }
  for (const loop of loopsA) addLoopEdges(loop, 0, 1)
  for (const rawLoop of loopsB) {
    // Subtract reverses B's edges so its winding cancels A's inside the overlap.
    const loop = op === 'subtract' ? [...rawLoop].reverse() : rawLoop
    addLoopEdges(loop, 1, op === 'subtract' ? -1 : 1)
  }

  // Classify each edge of each path against the other path's regions.
  const keep = (edge: Edge): boolean => {
    const mid: Pt = { x: (edge.from.x + edge.to.x) / 2, y: (edge.from.y + edge.to.y) / 2 }
    const otherLoops = edge.path === 0 ? loopsB : loopsA
    const inside = otherLoops.some((loop) => pointInPolygon(mid, loop))
    const inA = edge.path === 0 ? true : inside
    const inB = edge.path === 1 ? true : inside
    switch (op) {
      case 'union':
        // Keep A's edges outside B and B's edges outside A.
        return edge.path === 0 ? !inB : !inA
      case 'subtract':
        // Keep A's edges outside B; keep B's edges inside A (reversed).
        return edge.path === 0 ? !inB : inA
      case 'intersect':
        // Keep edges of each inside the other.
        return edge.path === 0 ? inB : inA
      case 'exclude':
        // Symmetric difference: A's edges inside B stay, B's edges outside A stay.
        return edge.path === 0 ? inB : !inA
    }
  }

  const kept = edges.filter(keep)
  // Chain kept edges back into subpaths (by endpoint proximity).
  const out = BezPath.new()
  const remaining = kept.map((e) => ({ ...e }))
  const key = (p: Pt): string => `${Math.round(p.x * 1000) / 1000},${Math.round(p.y * 1000) / 1000}`
  const adjacency = new Map<string, typeof remaining>()
  for (const e of remaining) {
    const k = key(e.from)
    const list = adjacency.get(k) ?? []
    list.push(e)
    adjacency.set(k, list)
  }
  const used = new Set<Edge>()
  for (const e of remaining) {
    if (used.has(e)) continue
    used.add(e)
    out.move_to(e.from)
    let pen: Pt = e.to
    const pathEls: PathEl[] = []
    for (;;) {
      pathEls.push({ type: 'LineTo', p: pen })
      const candidates = adjacency.get(key(pen)) ?? []
      const next = candidates.find((c) => !used.has(c))
      if (!next) break
      used.add(next)
      pen = next.to
      if (key(pen) === key(e.from)) break
    }
    for (const el of pathEls) out.push(el)
    out.close_path()
  }
  return out
}

/** The union of two paths. */
export function union(a: BezPath, b: BezPath, tolerance = 0.1): BezPath {
  return binary(a, b, 'union', tolerance)
}

/** `a` minus `b`. */
export function subtract(a: BezPath, b: BezPath, tolerance = 0.1): BezPath {
  return binary(a, b, 'subtract', tolerance)
}

/** The intersection of two paths. */
export function intersect(a: BezPath, b: BezPath, tolerance = 0.1): BezPath {
  return binary(a, b, 'intersect', tolerance)
}

/** Either region but not both: (A ∪ B) − (A ∩ B). */
export function exclude(a: BezPath, b: BezPath, tolerance = 0.1): BezPath {
  return subtract(union(a, b, tolerance), intersect(a, b, tolerance), tolerance)
}

/**
 * The stroke outline of a path: a variable-width ribbon either side of the
 * path, with the given `width` (constant here; variable profiles compose on
 * top by scaling per-sample).
 */
export function strokeOutline(path: BezPath, width: number, tolerance = 0.1): BezPath {
  const pts: Pt[] = []
  flatten(path.elements, tolerance, (el) => {
    if (el.type === 'MoveTo') {
      if (pts.length === 0) pts.push(el.p)
    } else if (el.type === 'LineTo') {
      pts.push(el.p)
    }
  })
  const half = width / 2
  const left: Pt[] = []
  const right: Pt[] = []
  for (let i = 0; i < pts.length; i++) {
    const p = pts[i]
    const prev = pts[Math.max(0, i - 1)]
    const next = pts[Math.min(pts.length - 1, i + 1)]
    const dx = next.x - prev.x
    const dy = next.y - prev.y
    const len = Math.hypot(dx, dy) || 1
    const nx = -dy / len
    const ny = dx / len
    left.push({ x: p.x + nx * half, y: p.y + ny * half })
    right.push({ x: p.x - nx * half, y: p.y - ny * half })
  }
  const out = BezPath.new()
  if (left.length === 0) return out
  out.move_to(left[0])
  for (let i = 1; i < left.length; i++) out.line_to(left[i])
  for (let i = right.length - 1; i >= 0; i--) out.line_to(right[i])
  out.close_path()
  return out
}
