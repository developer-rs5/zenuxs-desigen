/**
 * Shape geometry: the path of a shape node, hit testing and marquee selection.
 * (Converted 1:1 from FigCraft `crates/doc/src/geometry.rs` — the parts that
 * do not need a boolean-operations backend delegate to `pathops` at the engine
 * layer; here the paths and the pure selection logic live.)
 */

import { BezPath, RectMath, type Point as P, type Rect } from '@zenuxs/geom'
import { ellipse, polygon_points, rounded_polygon, rounded_rect, star_points } from '@zenuxs/geom'

import type { Document } from './lib'
import { Node, type NodeId } from './node'

/** The shape's own path in its local box (fills apply to it). */
export function shape_path(n: Node): BezPath | null {
  const w = n.width
  const h = n.height
  const c = n.corners
  const k = n.kind
  switch (k.type) {
    case 'rectangle':
    case 'frame':
    case 'component':
    case 'componentSet':
    case 'instance':
    case 'section':
      return rounded_rect(w, h, c.radii, c.smoothing)
    case 'slice':
      return rounded_rect(w, h, [0, 0, 0, 0], 0)
    case 'ellipse':
      return ellipse(w, h, k.start, k.sweep, k.inner)
    case 'polygon':
      return rounded_polygon(polygon_points(w, h, k.count), c.radii[0])
    case 'star':
      return rounded_polygon(star_points(w, h, k.count, k.inner_ratio), c.radii[0])
    case 'line': {
      const p = BezPath.new()
      p.move_to({ x: 0, y: 0 })
      p.line_to({ x: w, y: 0 })
      return p
    }
    case 'vector': {
      const filled = VectorNetPaths.fillPath(
        k.network as { vertices: unknown[]; segments: unknown[]; regions: unknown[] }
      )
      return filled.elements.length > 0 ? filled : VectorNetPaths.strokePath(k.network)
    }
    case 'text':
      return rounded_rect(w, h, [0, 0, 0, 0], 0)
    default:
      return null
  }
}

/** The open/closed path strokes follow (vector networks stroke every segment). */
export function stroke_geometry(n: Node): BezPath | null {
  if (n.kind.type === 'vector')
    return VectorNetPaths.strokePath(
      n.kind.network as {
        vertices: Array<{ x: number; y: number }>
        segments: unknown[]
        regions: unknown[]
      }
    )
  return shape_path(n)
}

/** Whether the shape's path is closed (fills apply). */
export function is_closed(n: Node): boolean {
  if (n.kind.type === 'line') return false
  if (n.kind.type === 'vector') return (n.kind.network as { regions: unknown[] }).regions.length > 0
  return true
}

/** Vector-network path access delegated to the network module (avoids a cycle). */
const VectorNetPaths: {
  fillPath(net: unknown): BezPath
  strokePath(net: unknown): BezPath
} = {
  fillPath(net) {
    const { VectorNetwork } = require('./vector') as typeof import('./vector')
    return VectorNetwork.to_path(net as never)
  },
  strokePath(net) {
    const { VectorNetwork } = require('./vector') as typeof import('./vector')
    return VectorNetwork.to_path(net as never)
  }
}

/** How much further than `tol` a stroke with nothing filled reaches. */
export const STROKE_REACH = 2.5

/** A hit-test hook the engine injects (boolean results resolve through pathops). */
export type BoolResult = ((id: NodeId, node: Node) => BezPath | null) | null

/** Whether `pt` (page space) hits node `n`'s world-transformed shape. */
function hits_node(n: Node, pt: P, tol: number, outline: boolean): boolean {
  const shape = shape_path(n)
  if (!shape) return false
  // Transform the point into the node's local space.
  const inv = invertAffine(n.transform)
  if (!inv) return false
  const local: P = {
    x: inv.coeffs[0] * pt.x + inv.coeffs[2] * pt.y + inv.coeffs[4],
    y: inv.coeffs[1] * pt.x + inv.coeffs[3] * pt.y + inv.coeffs[5]
  }
  if (outline) {
    // Outline mode: a shape only where its outline is — approximate by the
    // stroke band around the path's sampled segments.
    return nearPath(shape, local, tol + StrokeReach.of(n))
  }
  if (!is_closed(n)) {
    return nearPath(shape, local, tol + StrokeReach.of(n))
  }
  // Closed shape: point-in-bounds then refined by the caller's pathops hook.
  const b = shape.bounding_box()
  if (!b) return false
  const inflated = RectMath.inflate(b, tol, tol)
  return RectMath.contains(inflated, local)
}

/** The stroke band a node's stroke adds around its shape. */
const StrokeReach = {
  of(n: Node): number {
    const hasFill = n.fills.some((f) => f.visible)
    if (hasFill && is_closed(n)) return 0
    return (n.stroke.weight / 2) * (1 + STROKE_REACH / 5)
  }
}

/** Distance from `p` to the path's flattened segments ≤ `limit`. */
function nearPath(path: BezPath, p: P, limit: number): boolean {
  const segs = path.segments()
  for (const seg of segs) {
    const pts: P[] = []
    if (seg.type === 'Line') pts.push(seg.p0, seg.p1)
    else if (seg.type === 'Quad')
      for (let i = 0; i <= 16; i++) pts.push(evalQuad(seg.p0, seg.p1, seg.p2, i / 16))
    else for (let i = 0; i <= 16; i++) pts.push(evalCubic(seg.p0, seg.p1, seg.p2, seg.p3, i / 16))
    for (let i = 1; i < pts.length; i++) {
      if (segmentDistance(pts[i - 1], pts[i], p) <= limit) return true
    }
  }
  return false
}

function evalQuad(p0: P, p1: P, p2: P, t: number): P {
  const u = 1 - t
  return {
    x: u * u * p0.x + 2 * u * t * p1.x + t * t * p2.x,
    y: u * u * p0.y + 2 * u * t * p1.y + t * t * p2.y
  }
}

function evalCubic(p0: P, p1: P, p2: P, p3: P, t: number): P {
  const u = 1 - t
  return {
    x: u * u * u * p0.x + 3 * u * u * t * p1.x + 3 * u * t * t * p2.x + t * t * t * p3.x,
    y: u * u * u * p0.y + 3 * u * u * t * p1.y + 3 * u * t * t * p2.y + t * t * t * p3.y
  }
}

function segmentDistance(a: P, b: P, q: P): number {
  const abx = b.x - a.x
  const aby = b.y - a.y
  const len2 = abx * abx + aby * aby
  const t = len2 > 0 ? Math.min(1, Math.max(0, ((q.x - a.x) * abx + (q.y - a.y) * aby) / len2)) : 0
  const cx = a.x + abx * t - q.x
  const cy = a.y + aby * t - q.y
  return Math.hypot(cx, cy)
}

function invertAffine(xf: { coeffs: readonly number[] }): { coeffs: number[] } | null {
  const [a, b, c, d, e, f] = xf.coeffs
  const det = a * d - b * c
  if (det === 0 || !Number.isFinite(det)) return null
  const ia = d / det
  const ib = -b / det
  const ic = -c / det
  const id = a / det
  return { coeffs: [ia, ib, ic, id, -(ia * e + ic * f), -(ib * e + id * f)] }
}

/** The node outlines a hit can land on in outline mode. */
export interface OutlineHits {
  /** Everything's outline counts (the canvas-wide outlines view). */
  all: boolean
  /** Masks' outlines count even when nothing else does. */
  maskOutlines: boolean
}

/** The layers at `pt` (page space), top-most first, with their depth. */
export function layers_at(
  doc: Document,
  page: NodeId,
  pt: P,
  tol: number,
  result: BoolResult,
  also: OutlineHits
): Array<[NodeId, number]> {
  const out: Array<[NodeId, number]> = []
  const pageNode = doc.node(page)
  if (!pageNode) return out
  const walk = (id: NodeId, depth: number): void => {
    const n = doc.node(id)
    if (!n || !n.visible) return
    // Children first (top-most within the parent come first).
    const children = [...n.children].reverse()
    for (const c of children) walk(c, depth + 1)
    const hit = hits_node(n, pt, tol, also.all)
      ? true
      : also.maskOutlines && n.is_mask
        ? hits_node(n, pt, tol, false)
        : result !== null && result(id, n) !== null
          ? hits_node(n, pt, tol, false)
          : false
    if (hit) out.push([id, depth])
  }
  for (const c of [...pageNode.children].reverse()) walk(c, 0)
  return out
}

/**
 * Resolve a clicked leaf to what a plain click selects.
 *
 * The rule: top-level frames behave like artboards, so a click selects their
 * direct child; groups select as a whole; when something is already selected,
 * its siblings (and their contents) resolve relative to that context, which is
 * how double-click "enters" groups. `deep` (modifier-click) selects the leaf
 * itself.
 */
export function select_target(
  doc: Document,
  leaf: NodeId,
  context: NodeId[],
  deep: boolean
): NodeId {
  if (deep) return leaf
  // Chain from the page's child down to the leaf.
  const chain = doc.ancestors(leaf)
  chain.reverse()
  chain.push(leaf)
  // chain[0] is the page.
  chain.shift()
  const top = chain[0]
  if (top === undefined) return leaf
  // Context: if a selected node's parent is in the chain, select that parent's
  // child in the chain.
  let best: number | null = null
  for (const id of context) {
    const n = doc.node(id)
    if (!n || n.parent === null || n.parent === undefined) continue
    const pos = chain.indexOf(n.parent)
    if (pos >= 0 && pos + 1 < chain.length) best = Math.max(best ?? pos + 1, pos + 1)
  }
  if (best !== null) {
    const id = chain[best]
    if (id !== undefined) return id
  }
  const isBoard = (at: NodeId): boolean => {
    const n = doc.node(at)
    return n !== null && (Node.is_frame_like(n.kind) || n.kind.type === 'section')
  }
  if (isBoard(top) && chain.length > 1) {
    // Sections contain frames: the frame inside a section is the board.
    let i = 1
    while (
      i + 1 < chain.length &&
      doc.node(chain[i - 1])?.kind.type === 'section' &&
      isBoard(chain[i] as NodeId)
    ) {
      i += 1
    }
    return chain[i] ?? leaf
  }
  return top
}

/**
 * What a double click on `leaf` selects: one level deeper than the selection,
 * i.e. the layer holding `leaf` just inside the deepest selected layer that
 * holds it (entering groups, frames and boolean groups), or the plain click
 * target when no selected layer holds it.
 */
export function enter_target(doc: Document, leaf: NodeId, selection: NodeId[]): NodeId {
  const chain = doc.ancestors(leaf)
  chain.reverse()
  chain.push(leaf)
  let seen = -1
  for (let i = chain.length - 1; i >= 0; i--) {
    if (selection.includes(chain[i] as NodeId)) {
      seen = i
      break
    }
  }
  const inner = seen >= 0 ? chain[seen + 1] : undefined
  return inner ?? select_target(doc, leaf, selection, false)
}

/** Whether the two boxes touch on both axes (flat layers count too). */
function touches(b: Rect, rect: Rect): boolean {
  return b.x0 <= rect.x1 && b.x1 >= rect.x0 && b.y0 <= rect.y1 && b.y1 >= rect.y0
}

/** The visible, unlocked children of `parent` whose world bounds touch `rect`. */
function marquee_children(doc: Document, parent: Node, rect: Rect): NodeId[] {
  return parent.children.filter((c) => {
    const child = doc.node(c)
    if (!child || !child.visible || child.locked) return false
    const b = doc.world_bounds(c)
    return b !== null && touches(b, rect)
  })
}

/**
 * Nodes on `page` whose world bounds intersect `rect` (marquee): top-level
 * children, or the children of top-level frames when the marquee starts inside
 * a frame (`within`).
 */
export function marquee(doc: Document, page: NodeId, rect: Rect, within: NodeId | null): NodeId[] {
  const parent = doc.node(within ?? page)
  return parent ? marquee_children(doc, parent, rect) : []
}

/**
 * Nodes on `page` a Cmd/Ctrl marquee selects: the innermost layers whose bounds
 * touch `rect` (frames, groups and instances are looked into; a container none
 * of whose children are touched counts itself; boolean groups count as one
 * shape).
 */
export function marquee_deep(doc: Document, page: NodeId, rect: Rect): NodeId[] {
  const out: NodeId[] = []
  const walk = (parent: NodeId, depth: number): void => {
    const p = doc.node(parent)
    if (!p) return
    for (const c of marquee_children(doc, p, rect)) {
      const before = out.length
      const n = doc.node(c)
      const opens = n !== null && n.children.length > 0 && n.kind.type !== 'booleanOp'
      if (opens && depth < 256) walk(c, depth + 1)
      if (out.length === before) out.push(c)
    }
  }
  walk(page, 0)
  return out
}

/**
 * Marquee select with Figma's rule: a marquee that starts inside a frame
 * selects that frame's children; from the canvas it selects top-level nodes.
 */
export function marquee_select(
  doc: Document,
  page: NodeId,
  rect: Rect,
  start_inside: NodeId | null
): NodeId[] {
  if (start_inside !== null) return marquee(doc, page, rect, start_inside)
  return marquee(doc, page, rect, null)
}

/** The snap points of node `id` (its world bounds' corners and edge/centre midpoints). */
export function snap_points(doc: Document, id: NodeId): P[] {
  const b = doc.world_bounds(id)
  if (!b) return []
  const cx = (b.x0 + b.x1) / 2
  const cy = (b.y0 + b.y1) / 2
  return [
    { x: b.x0, y: b.y0 },
    { x: b.x1, y: b.y0 },
    { x: b.x1, y: b.y1 },
    { x: b.x0, y: b.y1 },
    { x: cx, y: cy },
    { x: cx, y: b.y0 },
    { x: cx, y: b.y1 },
    { x: b.x0, y: cy },
    { x: b.x1, y: cy }
  ]
}
