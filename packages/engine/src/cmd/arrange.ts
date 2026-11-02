/**
 * Arrange: align, distribute, tidy, z-order, flips, rotations and numeric
 * transforms, plus smart-selection spacing and slot reordering.
 * (Converted 1:1 from FigCraft `crates/engine/src/cmd/arrange.rs`,
 * `selection_spacing.rs` and `selection_reorder.rs`.)
 */

import {
  Node,
  type Document,
  type LetterSpacing as LetterSpacingT,
  type LineHeight as LineHeightT,
  type NodeId,
  type TextData
} from '@zenuxs/doc'
import { Affine, RectMath, Vec2Math, rotate_about, type Point, type Rect } from '@zenuxs/geom'

import { insideInstance } from '../components'
import { EngineError, ok, spec, type CommandSpec, type Session } from '../lib'
import { roots } from './edit'
import { bad, boolean, get, num, numOr, reqId, reqNum, reqTargets } from './params'
import { z_sorted } from './select'

// ------------------------------ world moves ------------------------------

/** Move a node by `(dx, dy)` in page units. */
export function moveWorld(doc: Document, id: NodeId, dx: number, dy: number): void {
  const n = doc.node(id)
  if (!n) throw new Error(`no such node ${id}`)
  const pid = n.parent ?? null
  const pw = pid === null ? Affine.IDENTITY : doc.world_transform(pid)
  const d = Affine.mul(Affine.mul(Affine.inverse(pw), Affine.translate(Vec2Math.new(dx, dy))), pw)
  const moved = Affine.mul(d, n.transform)
  const target = doc.node_mut(id)
  if (target) target.transform = moved
}

/** Turn a node by `deg` degrees about `pivot` (page coordinates). */
export function rotateWorld(doc: Document, id: NodeId, pivot: Point, deg: number): void {
  doc.set_world_transform(id, rotate_about(doc.world_transform(id), pivot, deg))
}

// ------------------------------ align ------------------------------

type Al = 'left' | 'hcenter' | 'right' | 'top' | 'vcenter' | 'bottom'

/** What `roots` align to: one layer to its parent frame, several to their combined bounds. */
function alignTarget(doc: Document, ids: NodeId[]): Rect | null {
  const first = ids[0]
  if (first === undefined) return null
  if (ids.length > 1) return doc.bounds_of(ids)
  const parent = doc.node(first)?.parent ?? null
  if (parent === null) return null
  const pn = doc.node(parent)
  if (!pn || Node.is_page(pn)) return null
  return doc.world_bounds(parent)
}

function align(s: Session, p: Record<string, unknown>, a: Al): Record<string, unknown> {
  const doc = s.doc()
  const ids = roots(doc, reqTargets('align', s, p))
  const target = alignTarget(doc, ids)
  if (target === null) return ok()
  const tc = RectMath.center(target)
  for (const i of ids) {
    const b = doc.world_bounds(i)
    if (b === null) continue
    const bc = RectMath.center(b)
    const dx =
      a === 'left'
        ? target.x0 - b.x0
        : a === 'hcenter'
          ? tc.x - bc.x
          : a === 'right'
            ? target.x1 - b.x1
            : 0
    const dy =
      a === 'top'
        ? target.y0 - b.y0
        : a === 'vcenter'
          ? tc.y - bc.y
          : a === 'bottom'
            ? target.y1 - b.y1
            : 0
    moveWorld(doc, i, dx, dy)
  }
  return ok()
}

// ------------------------------ distribute / pack / tidy ------------------------------

function distribute(
  s: Session,
  p: Record<string, unknown>,
  horizontal: boolean
): Record<string, unknown> {
  const doc = s.doc()
  const ids = roots(doc, reqTargets('distribute', s, p))
  const spacing = num(p, 'spacing')
  if (ids.length < 3 && spacing === null) return ok()
  const items: Array<[NodeId, Rect]> = []
  for (const i of ids) {
    const b = doc.world_bounds(i)
    if (b !== null) items.push([i, b])
  }
  items.sort((x, y) => (horizontal ? x[1].x0 - y[1].x0 : x[1].y0 - y[1].y0))
  const first = items[0]
  const last = items[items.length - 1]
  if (!first || !last) return ok()
  const size = (b: Rect): number => (horizontal ? b.x1 - b.x0 : b.y1 - b.y0)
  const total = items.reduce((sum, [, b]) => sum + size(b), 0)
  const span = horizontal ? last[1].x1 - first[1].x0 : last[1].y1 - first[1].y0
  const gap = spacing ?? (span - total) / Math.max(items.length - 1, 1)
  let pos = horizontal ? first[1].x0 : first[1].y0
  for (const [i, b] of items) {
    if (horizontal) {
      moveWorld(doc, i, pos - b.x0, 0)
      pos += size(b) + gap
    } else {
      moveWorld(doc, i, 0, pos - b.y0)
      pos += size(b) + gap
    }
  }
  return ok()
}

function pack(
  s: Session,
  p: Record<string, unknown>,
  horizontal: boolean
): Record<string, unknown> {
  return distribute(s, { ...p, spacing: 0 }, horizontal)
}

/** Tidy up: snap the selection into a grid of rows with even spacing. */
function tidy(s: Session, p: Record<string, unknown>): Record<string, unknown> {
  const doc = s.doc()
  const ids = roots(doc, reqTargets('arrange.tidy', s, p))
  const items: Array<[NodeId, Rect]> = []
  for (const i of ids) {
    const b = doc.world_bounds(i)
    if (b !== null) items.push([i, b])
  }
  if (items.length < 2) return ok()
  items.sort((x, y) => x[1].y0 - y[1].y0)
  // Group into rows by vertical centre overlap.
  const rows: Array<Array<[NodeId, Rect]>> = []
  for (const it of items) {
    const last = rows[rows.length - 1]
    const cy = (it[1].y0 + it[1].y1) / 2
    if (last && last.some(([, b]) => cy < b.y1 && cy > b.y0)) last.push(it)
    else rows.push([it])
  }
  let origin: Rect | null = null
  let maxW = 0
  let maxH = 0
  for (const row of rows) {
    for (const [, b] of row) {
      origin = origin === null ? b : RectMath.union(origin, b)
      maxW = Math.max(maxW, b.x1 - b.x0)
      maxH = Math.max(maxH, b.y1 - b.y0)
    }
  }
  if (origin === null) return ok()
  // Keep the average existing horizontal gap (at least 10).
  const gaps = rows
    .filter((r) => r.length > 1)
    .map((r) => {
      const right = Math.max(...r.map(([, b]) => b.x1))
      const left = Math.min(...r.map(([, b]) => b.x0))
      const sum = r.reduce((acc, [, b]) => acc + (b.x1 - b.x0), 0)
      return (right - left - sum) / (r.length - 1)
    })
  const gap = num(p, 'spacing') ?? Math.max(10, ...gaps, 0)
  const base = origin.x0
  const top = origin.y0
  rows.forEach((row, ri) => {
    row.sort((x, y) => x[1].x0 - y[1].x0)
    row.forEach(([id, b], ci) => {
      moveWorld(doc, id, base + ci * (maxW + gap) - b.x0, top + ri * (maxH + gap) - b.y0)
    })
  })
  return ok()
}

// ------------------------------ pixels and z-order ------------------------------

function roundPixels(s: Session, p: Record<string, unknown>): Record<string, unknown> {
  const doc = s.doc()
  for (const i of reqTargets('arrange.roundToPixels', s, p)) {
    const n = doc.node_mut(i)
    if (!n) throw new Error(`no such node ${i}`)
    const c = n.transform.coeffs
    n.transform = Affine.new([c[0], c[1], c[2], c[3], Math.round(c[4]), Math.round(c[5])])
    n.width = Math.max(Math.round(n.width), n.width > 0 ? 1 : 0)
    n.height = Math.max(Math.round(n.height), n.height > 0 ? 1 : 0)
  }
  return ok()
}

type Z = 'front' | 'forward' | 'backward' | 'back'

function zorder(s: Session, p: Record<string, unknown>, z: Z): Record<string, unknown> {
  const doc = s.doc()
  const ids = z_sorted(doc, roots(doc, reqTargets('arrange', s, p)))
  const selected = new Set(ids)
  const order = z === 'front' || z === 'forward' ? [...ids].reverse() : ids
  for (const i of order) {
    const n = doc.node(i)
    const pid = n?.parent
    if (!n || pid === null || pid === undefined) continue
    const parent = doc.node(pid)
    if (!parent) continue
    const len = parent.children.length
    const cur = doc.index_in_parent(i) ?? 0
    const at = (k: number): boolean => {
      const c = parent.children[k]
      return c !== undefined && selected.has(c)
    }
    const target =
      z === 'front'
        ? Math.max(len - 1, 0)
        : z === 'back'
          ? 0
          : z === 'forward'
            ? cur + 1 < len && !at(cur + 1)
              ? cur + 1
              : cur
            : cur > 0 && !at(cur - 1)
              ? cur - 1
              : cur
    doc.reorder(i, target)
  }
  // Front/Back of several keep their relative order.
  if (z === 'front') {
    for (const i of ids) {
      const pid = doc.node(i)?.parent
      if (pid === null || pid === undefined) continue
      const parent = doc.node(pid)
      if (parent) doc.reorder(i, parent.children.length)
    }
  }
  if (z === 'back') {
    const next = new Map<NodeId, number>()
    for (const i of ids) {
      const pid = doc.node(i)?.parent
      if (pid === null || pid === undefined) continue
      const k = next.get(pid) ?? 0
      doc.reorder(i, k)
      next.set(pid, k + 1)
    }
  }
  return ok()
}

// ------------------------------ flips and rotations ------------------------------

function flip(
  s: Session,
  p: Record<string, unknown>,
  horizontal: boolean
): Record<string, unknown> {
  const doc = s.doc()
  const ids = roots(doc, reqTargets('flip', s, p))
  const b = doc.bounds_of(ids)
  if (b === null) return ok()
  const c = RectMath.center(b)
  const m = horizontal
    ? Affine.new([-1, 0, 0, 1, 2 * c.x, 0])
    : Affine.new([1, 0, 0, -1, 0, 2 * c.y])
  for (const i of ids) doc.set_world_transform(i, Affine.mul(m, doc.world_transform(i)))
  return ok()
}

function rotateBy(s: Session, p: Record<string, unknown>, deg: number): Record<string, unknown> {
  const ids = reqTargets('rotate', s, p)
  const pivot = turnPivot(s, ids)
  if (pivot === null) return ok()
  const doc = s.doc()
  for (const i of roots(doc, ids)) rotateWorld(doc, i, pivot, deg)
  return ok()
}

function sameIds(a: NodeId[], b: NodeId[]): boolean {
  if (a.length !== b.length) return false
  for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return false
  return true
}

/** The shape of the selection's rotation origin on a document state. */
interface OriginState {
  doc: Document
  selection: NodeId[]
  rotation_origin: { ids: NodeId[]; at: Point | null; editing: boolean } | null
}

/** Where the selection turns about when its origin was moved (page coordinates). */
export function movedOrigin(ds: OriginState): Point | null {
  const o = ds.rotation_origin
  if (o === null || o.ids.length === 0 || !sameIds(o.ids, ds.selection)) return null
  if (o.at === null) return null
  const first = o.ids[0]
  if (first === undefined) return null
  const p = Affine.apply(ds.doc.world_transform(first), o.at)
  return Number.isFinite(p.x) && Number.isFinite(p.y) ? p : null
}

/**
 * Where `ids` turn: the selection's moved rotation origin when they are the
 * selection, else the centre of their bounds.
 */
function turnPivot(s: Session, ids: NodeId[]): Point | null {
  const ds = s.ds()
  const moved = movedOrigin(ds)
  if (moved !== null && sameIds(ds.rotation_origin?.ids ?? [], ids)) return moved
  const b = ds.doc.bounds_of(roots(ds.doc, ids))
  return b === null ? null : RectMath.center(b)
}

/** The selection's rotation origin (page coordinates): where it was moved, else its centre. */
function originPoint(s: Session): Point {
  const ds = s.ds()
  const moved = movedOrigin(ds)
  if (moved !== null) return moved
  const b = ds.doc.bounds_of(roots(ds.doc, ds.selection))
  return b === null ? { x: 0, y: 0 } : RectMath.center(b)
}

function originJson(s: Session, editing: boolean): Record<string, unknown> {
  const at = originPoint(s)
  return { editing, moved: movedOrigin(s.ds()) !== null, x: at.x, y: at.y }
}

// ------------------------------ scale ------------------------------

/** A paint whose kind may be a tiled image. */
interface ScalablePaint {
  kind: { type: string; scale_mode?: string; scale?: number }
}

function scalePaints(paints: ScalablePaint[], k: number): void {
  for (const p of paints) {
    const kind = p.kind
    if (kind.type === 'image' && kind.scale_mode === 'tile' && typeof kind.scale === 'number') {
      kind.scale *= k
    }
  }
}

/** Effect payloads the Scale tool grows. */
type ScalableEffect = {
  kind:
    | { type: 'dropShadow' | 'innerShadow'; shadow: ScalableShadow }
    | { type: 'layerBlur' | 'backgroundBlur'; blur: ScalableBlur }
    | { type: 'noise'; noise: ScalableNoise }
    | { type: 'texture'; texture: { noise: ScalableNoise; radius?: number } }
    | {
        type: 'glass'
        glass: { refraction?: number; depth?: number; frost: number; light?: number }
      }
}
type ScalableShadow = { radius: number; spread: number; offset: [number, number] }
type ScalableBlur = { radius: number; start?: number; end?: number }
type ScalableNoise = { size: number; size_y?: number | null }

function scaleEffect(e: ScalableEffect, k: number): void {
  const kind = e.kind
  switch (kind.type) {
    case 'dropShadow':
    case 'innerShadow': {
      const sh = kind.shadow
      sh.radius *= k
      sh.spread *= k
      sh.offset = [sh.offset[0] * k, sh.offset[1] * k]
      return
    }
    case 'layerBlur':
    case 'backgroundBlur': {
      const b = kind.blur
      b.radius *= k
      if (typeof b.start === 'number') b.start *= k
      if (typeof b.end === 'number') b.end *= k
      return
    }
    case 'noise': {
      kind.noise.size *= k
      if (typeof kind.noise.size_y === 'number') kind.noise.size_y *= k
      return
    }
    case 'texture': {
      const t = kind.texture
      t.noise.size *= k
      if (typeof t.noise.size_y === 'number') t.noise.size_y *= k
      if (typeof t.radius === 'number') t.radius *= k
      return
    }
    case 'glass': {
      const g = kind.glass
      if (typeof g.depth === 'number') g.depth *= k
      g.frost *= k
    }
  }
}

/** Scale the pixel-valued parts of a text style. */
function scaleTextStyle(
  st: {
    font_size: number
    line_height: LineHeightT
    letter_spacing: LetterSpacingT
    decoration_look: { thickness: LineHeightT; offset: LineHeightT }
  },
  k: number
): void {
  st.font_size *= k
  if (st.line_height.unit === 'pixels')
    st.line_height = { unit: 'pixels', value: st.line_height.value * k }
  if (st.letter_spacing.unit === 'pixels') {
    st.letter_spacing = { unit: 'pixels', value: st.letter_spacing.value * k }
  }
  for (const key of ['thickness', 'offset'] as const) {
    const v = st.decoration_look[key]
    if (v.unit === 'pixels') st.decoration_look[key] = { unit: 'pixels', value: v.value * k }
  }
}

/** A loose vector network (the node model keeps it untyped). */
interface VectorNet {
  vertices: Array<{ x: number; y: number }>
  segments: Array<{ ta: [number, number]; tb: [number, number] }>
}

/** `id` and its whole subtree, each with its depth below `id`. */
function walkDepth(doc: Document, id: NodeId): Array<[NodeId, number]> {
  const out: Array<[NodeId, number]> = []
  const stack: Array<[NodeId, number]> = [[id, 0]]
  while (stack.length > 0) {
    const next = stack.pop()
    if (!next) break
    const [cur, depth] = next
    const n = doc.node(cur)
    if (!n) continue
    out.push([cur, depth])
    for (const c of n.children) stack.push([c, depth + 1])
  }
  return out
}

/**
 * Scale a node and everything in it uniformly (the Scale tool): sizes and
 * positions, strokes, effects, radii, auto layout spacing, layout grids,
 * guides, tiled images and text sizes.
 */
export function scaleNode(doc: Document, id: NodeId, k: number): void {
  if (!Number.isFinite(k) || k <= 0) return
  for (const [i, depth] of walkDepth(doc, id)) {
    const n = doc.node_mut(i)
    if (!n) continue
    scalePaints(n.fills as ScalablePaint[], k)
    scalePaints(n.strokes as ScalablePaint[], k)
    const cl = n.child_layout
    for (const key of ['min_w', 'max_w', 'min_h', 'max_h'] as const) {
      const v = cl[key]
      if (v !== null) cl[key] = v * k
    }
    for (const g of n.grids) {
      g.size *= k
      g.gutter *= k
      g.offset *= k
    }
    for (const g of n.guides) g.offset *= k
    n.stroke.weight *= k
    const sides = n.stroke.sides
    if (sides) for (let s = 0; s < sides.length; s++) sides[s] = (sides[s] ?? 0) * k
    for (let d = 0; d < n.stroke.dashes.length; d++) {
      n.stroke.dashes[d] = (n.stroke.dashes[d] ?? 0) * k
    }
    const [r0, r1, r2, r3] = n.corners.radii
    n.corners = { ...n.corners, radii: [r0 * k, r1 * k, r2 * k, r3 * k] }
    for (const e of n.effects as ScalableEffect[]) scaleEffect(e, k)
    const l = n.layout
    if (l !== null) {
      l.gap *= k
      l.cross_gap *= k
      l.padding = l.padding.map((x) => x * k) as [number, number, number, number]
      for (const t of [...l.column_tracks, ...l.row_tracks]) if (t.sizing === 'fixed') t.value *= k
    }
    if (n.kind.type === 'text') {
      const t = n.kind as unknown as TextData
      scaleTextStyle(t.style, k)
      for (const r of t.runs) scaleTextStyle(r.style, k)
      t.paragraph_spacing *= k
      t.paragraph_indent *= k
      t.list_spacing *= k
    }
    if (n.kind.type === 'vector') {
      const net = n.kind.network as VectorNet
      for (const v of net.vertices) {
        v.x *= k
        v.y *= k
      }
      for (const s of net.segments) {
        s.ta = [s.ta[0] * k, s.ta[1] * k]
        s.tb = [s.tb[0] * k, s.tb[1] * k]
      }
    }
    n.width *= k
    n.height *= k
    if (depth > 0) {
      const c = n.transform.coeffs
      n.transform = Affine.new([c[0], c[1], c[2], c[3], c[4] * k, c[5] * k])
    }
  }
}

function scaleCmd(s: Session, p: Record<string, unknown>): Record<string, unknown> {
  const k = reqNum('transform.scale', p, 'factor')
  if (k <= 0) throw bad('transform.scale', '`factor` must be positive')
  const doc = s.doc()
  const ids = roots(doc, reqTargets('transform.scale', s, p))
  const b = doc.bounds_of(ids) ?? RectMath.ZERO
  const pivot = { x: numOr(p, 'cx', b.x0), y: numOr(p, 'cy', b.y0) }
  for (const i of ids) {
    const nb = doc.world_bounds(i)
    if (nb === null) continue
    scaleNode(doc, i, k)
    // Keep the layer's place relative to the pivot.
    const tx = pivot.x + (nb.x0 - pivot.x) * k
    const ty = pivot.y + (nb.y0 - pivot.y) * k
    const after = doc.world_bounds(i)
    if (after !== null) moveWorld(doc, i, tx - after.x0, ty - after.y0)
  }
  return ok()
}

// ------------------------------ smart-selection spacing ------------------------------

const EPS = 0.01

/** One column (horizontal spacing) or row (vertical spacing) of aligned layers. */
interface Track {
  ids: NodeId[]
  bounds: Rect
  anchor: Rect
}

interface Axis {
  tracks: Track[]
  vertical: boolean
  /** `null`: the existing distances are mixed. */
  value: number | null
}

const axisStart = (a: Axis, b: Rect): number => (a.vertical ? b.y0 : b.x0)
const axisEnd = (a: Axis, b: Rect): number => (a.vertical ? b.y1 : b.x1)

/** Desired page-space translations, keeping the first track fixed. */
function axisOffsets(a: Axis, value: number): Array<[NodeId, number]> {
  const first = a.tracks[0]
  let pos = first ? axisStart(a, first.bounds) : 0
  const out: Array<[NodeId, number]> = []
  for (const t of a.tracks) {
    const delta = pos - axisStart(a, t.bounds)
    for (const id of t.ids) out.push([id, delta])
    pos += axisEnd(a, t.bounds) - axisStart(a, t.bounds) + value
  }
  return out
}

/**
 * The layers a spacing edit can move: visible, unlocked, outside instances and
 * not part of a normal auto-layout flow.
 */
function spacingEligible(doc: Document, ids: NodeId[]): Array<[NodeId, Rect]> | null {
  const first = ids[0]
  if (first === undefined) return null
  const firstNode = doc.node(first)
  if (!firstNode) return null
  if (ids.length < 2 || ids.length > 2000) return null
  const out: Array<[NodeId, Rect]> = []
  const seen = new Set<NodeId>()
  for (const id of ids) {
    const n = doc.node(id)
    if (!n) return null
    if (n.parent !== firstNode.parent) return null
    if (!n.visible) return null
    if (doc.ancestors(id).some((a) => doc.node(a)?.visible === false)) return null
    if (insideInstance(doc, id)) return null
    if (n.kind.type === 'page') return null
    const pid = n.parent ?? null
    const parent = pid === null ? null : doc.node(pid)
    if (parent && parent.layout !== null && !n.child_layout.absolute) return null
    const det = pid === null ? 1 : Affine.determinant(doc.world_transform(pid))
    if (!Number.isFinite(det) || Math.abs(det) < 1e-12) return null
    const b = doc.world_bounds(id)
    if (b === null) return null
    if (![b.x0, b.y0, b.x1, b.y1].every((v) => Number.isFinite(v))) return null
    if (b.x1 - b.x0 <= EPS || b.y1 - b.y0 <= EPS) return null
    if (!seen.has(id)) {
      seen.add(id)
      out.push([id, b])
    }
  }
  return out
}

function buildAxis(items: Array<[NodeId, Rect]>, vertical: boolean): Axis | null {
  const edges = (b: Rect): [number, number] => (vertical ? [b.y0, b.y1] : [b.x0, b.x1])
  const sorted = [...items].sort((x, y) => {
    const d = edges(x[1])[0] - edges(y[1])[0]
    return d !== 0 ? d : x[0] - y[0]
  })
  const tracks: Track[] = []
  for (const [id, b] of sorted) {
    const [lo, hi] = edges(b)
    const aligned = tracks.find((t) => {
      const [a, z] = edges(t.anchor)
      return (
        Math.abs(lo - a) <= EPS || Math.abs(hi - z) <= EPS || Math.abs((lo + hi - a - z) / 2) <= EPS
      )
    })
    if (aligned) {
      aligned.ids.push(id)
      aligned.bounds = RectMath.union(aligned.bounds, b)
    } else {
      tracks.push({ ids: [id], bounds: b, anchor: b })
    }
  }
  if (tracks.length < 2) return null
  tracks.sort((a, b) => edges(a.bounds)[0] - edges(b.bounds)[0])
  // Diagonally scattered layers aren't a row, column or grid selection.
  const cross = (b: Rect): [number, number] => (vertical ? [b.x0, b.x1] : [b.y0, b.y1])
  const low = Math.max(...tracks.map((t) => cross(t.bounds)[0]))
  const high = Math.min(...tracks.map((t) => cross(t.bounds)[1]))
  if (high - low <= EPS) return null
  const axis: Axis = { tracks, vertical, value: null }
  const gaps: number[] = []
  for (let i = 0; i + 1 < tracks.length; i++) {
    const a = tracks[i]
    const b = tracks[i + 1]
    if (!a || !b) continue
    gaps.push(axisStart(axis, b.bounds) - axisEnd(axis, a.bounds))
  }
  const head = gaps[0]
  if (head !== undefined && gaps.every((g) => Math.abs(g - head) <= EPS)) axis.value = head
  return axis
}

/** Smart-selection spacing in page coordinates. */
export function selectionSpacing(
  doc: Document,
  ids: NodeId[]
): { horizontal: Axis | null; vertical: Axis | null } {
  const items = spacingEligible(doc, ids)
  if (items === null) return { horizontal: null, vertical: null }
  return { horizontal: buildAxis(items, false), vertical: buildAxis(items, true) }
}

interface ReorderLayout {
  slots: Array<[NodeId, Rect]>
  columns: number
  rows: number
  gapX: number
  gapY: number
}

/**
 * Geometry for reordering a smart selection: only regular, non-overlapping
 * rows, columns and complete top-left-aligned grids have unambiguous slots.
 */
export function reorderLayout(doc: Document, ids: NodeId[]): ReorderLayout | null {
  const { horizontal: h, vertical: v } = selectionSpacing(doc, ids)
  const gapOf = (a: Axis | null): number | null => {
    if (a === null) return 0
    const value = a.value
    return value !== null && value >= 0 ? value : null
  }
  const gapX = gapOf(h)
  const gapY = gapOf(v)
  if (gapX === null || gapY === null) return null
  const columns = h === null ? 1 : h.tracks.length
  const rows = v === null ? 1 : v.tracks.length
  if (ids.length < 2 || columns * rows !== ids.length) return null
  const cells = new Map<string, [NodeId, Rect]>()
  for (const id of ids) {
    const col = h === null ? 0 : h.tracks.findIndex((t) => t.ids.includes(id))
    const row = v === null ? 0 : v.tracks.findIndex((t) => t.ids.includes(id))
    if (col < 0 || row < 0) return null
    const b = doc.world_bounds(id)
    if (b === null) return null
    if (columns > 1 && rows > 1 && h !== null && v !== null) {
      const tx = h.tracks[col]?.bounds.x0
      const ty = v.tracks[row]?.bounds.y0
      if (tx === undefined || ty === undefined) return null
      if (Math.abs(b.x0 - tx) > EPS || Math.abs(b.y0 - ty) > EPS) return null
    }
    const key = `${row}:${col}`
    if (cells.has(key)) return null
    cells.set(key, [id, b])
  }
  const slots = [...cells.keys()].sort(cellOrder).map((k) => cells.get(k) as [NodeId, Rect])
  return { slots, columns, rows, gapX, gapY }
}

function cellOrder(a: string, b: string): number {
  const [ar, ac] = a.split(':').map(Number) as [number, number]
  const [br, bc] = b.split(':').map(Number) as [number, number]
  return ar !== br ? ar - br : ac - bc
}

function starts(sizes: number[], at: number, gap: number): number[] {
  let cur = at
  return sizes.map((size) => {
    const s = cur
    cur += size + gap
    return s
  })
}

/**
 * Insertion shifts the items in between; swapping exchanges two slots. Sizes
 * and original gaps are kept, so unequal layers reflow instead of overlapping.
 */
function reorderPositions(
  layout: ReorderLayout,
  source: NodeId,
  target: NodeId,
  swap: boolean
): Array<[NodeId, Point]> | null {
  const from = layout.slots.findIndex(([id]) => id === source)
  const to = layout.slots.findIndex(([id]) => id === target)
  if (from < 0 || to < 0) return null
  if (from === to) return layout.slots.map(([id, b]) => [id, { x: b.x0, y: b.y0 }])
  const order = [...layout.slots]
  if (swap) {
    const a = order[from]
    const b = order[to]
    if (!a || !b) return null
    order[from] = b
    order[to] = a
  } else {
    const item = order.splice(from, 1)[0]
    if (!item) return null
    order.splice(to, 0, item)
  }
  const widths: number[] = Array.from({ length: layout.columns }, () => 0)
  const heights: number[] = Array.from({ length: layout.rows }, () => 0)
  order.forEach(([, b], i) => {
    widths[i % layout.columns] = Math.max(widths[i % layout.columns] ?? 0, b.x1 - b.x0)
    const r = Math.floor(i / layout.columns)
    heights[r] = Math.max(heights[r] ?? 0, b.y1 - b.y0)
  })
  const x0 = Math.min(...layout.slots.map(([, b]) => b.x0))
  const y0 = Math.min(...layout.slots.map(([, b]) => b.y0))
  const xs = starts(widths, x0, layout.gapX)
  const ys = starts(heights, y0, layout.gapY)
  const out: Array<[NodeId, Point]> = []
  order.forEach(([id, b], i) => {
    const x = layout.columns === 1 ? b.x0 : xs[i % layout.columns]
    const y = layout.rows === 1 ? b.y0 : ys[Math.floor(i / layout.columns)]
    if (x === undefined || y === undefined) return
    out.push([id, { x, y }])
  })
  return out
}

// ------------------------------ rotation origin ------------------------------

/** Show or hide the selection's origin handle (`on`: `null` toggles). Returns whether it shows. */
export function editRotationOrigin(s: Session, on: boolean | null): boolean {
  const ds = s.ds()
  if (ds.selection.length === 0) {
    throw new EngineError(
      'command `transform.rotationOrigin` is not available right now: nothing is selected'
    )
  }
  const current = ds.rotation_origin
  if (current === null || !sameIds(current.ids, ds.selection)) {
    ds.rotation_origin = { ids: [...ds.selection], at: null, editing: false }
  }
  const o = ds.rotation_origin
  if (o === null) return false
  o.editing = on ?? !o.editing
  ds.revision += 1
  return o.editing
}

/** Move the selection's origin to `p` (page coordinates); `null` puts it back at the centre. */
export function setRotationOrigin(s: Session, p: Point | null): void {
  const ds = s.ds()
  if (ds.selection.length === 0) {
    throw new EngineError(
      'command `transform.setRotationOrigin` is not available right now: nothing is selected'
    )
  }
  const first = ds.selection[0]
  const world = first === undefined ? null : ds.doc.world_transform(first)
  const current = ds.rotation_origin
  if (current === null || !sameIds(current.ids, ds.selection)) {
    ds.rotation_origin = { ids: [...ds.selection], at: null, editing: false }
  }
  const o = ds.rotation_origin
  if (o === null) return
  if (p === null || world === null || Math.abs(Affine.determinant(world)) <= 1e-12) {
    o.at = null
  } else {
    const local = Affine.apply(Affine.inverse(world), p)
    o.at = Number.isFinite(local.x) && Number.isFinite(local.y) ? local : null
  }
  ds.revision += 1
}

// ------------------------------ specs ------------------------------

const ALIGN_SPECS: CommandSpec[] = (
  [
    ['align.left', 'Align left', 'left'],
    ['align.hcenter', 'Align horizontal centers', 'hcenter'],
    ['align.right', 'Align right', 'right'],
    ['align.top', 'Align top', 'top'],
    ['align.vcenter', 'Align vertical centers', 'vcenter'],
    ['align.bottom', 'Align bottom', 'bottom']
  ] as const
).map(([id, label, a]) => spec(id, label, '{ids?}', true, (s, p) => align(s, p, a)))

const DISTRIBUTE_SPECS: CommandSpec[] = [
  spec('distribute.horizontal', 'Distribute horizontal spacing', '{ids?, spacing?}', true, (s, p) =>
    distribute(s, p, true)
  ),
  spec('distribute.vertical', 'Distribute vertical spacing', '{ids?, spacing?}', true, (s, p) =>
    distribute(s, p, false)
  ),
  spec('arrange.packH', 'Pack horizontal', '{ids?}', true, (s, p) => pack(s, p, true)),
  spec('arrange.packV', 'Pack vertical', '{ids?}', true, (s, p) => pack(s, p, false)),
  spec('arrange.tidy', 'Tidy up', '{ids?, spacing?}', true, (s, p) => tidy(s, p)),
  spec('arrange.roundToPixels', 'Round to pixels', '{ids?}', true, (s, p) => roundPixels(s, p))
]

const ZORDER_SPECS: CommandSpec[] = [
  spec('arrange.front', 'Bring to front', '{ids?}', true, (s, p) => zorder(s, p, 'front')),
  spec('arrange.forward', 'Bring forward', '{ids?}', true, (s, p) => zorder(s, p, 'forward')),
  spec('arrange.backward', 'Send backward', '{ids?}', true, (s, p) => zorder(s, p, 'backward')),
  spec('arrange.back', 'Send to back', '{ids?}', true, (s, p) => zorder(s, p, 'back'))
]

const FLIP_SPECS: CommandSpec[] = [
  spec('object.flipH', 'Flip horizontal', '{ids?}', true, (s, p) => flip(s, p, true)),
  spec('object.flipV', 'Flip vertical', '{ids?}', true, (s, p) => flip(s, p, false)),
  spec('object.rotate180', 'Rotate 180°', '{ids?}', true, (s, p) => rotateBy(s, p, 180)),
  spec('object.rotateLeft', 'Rotate 90° left', '{ids?}', true, (s, p) => rotateBy(s, p, 90)),
  spec('object.rotateRight', 'Rotate 90° right', '{ids?}', true, (s, p) => rotateBy(s, p, -90))
]

const TRANSFORM_SPECS: CommandSpec[] = [
  spec('transform.move', 'Move', '{ids?, dx, dy}  (page units)', true, (s, p) => {
    const dx = numOr(p, 'dx', 0)
    const dy = numOr(p, 'dy', 0)
    const doc = s.doc()
    for (const i of roots(doc, reqTargets('transform.move', s, p))) moveWorld(doc, i, dx, dy)
    return ok()
  }),
  spec(
    'transform.moveTo',
    'Move to',
    "{ids?, x, y} (page coordinates of the selection's top-left)",
    true,
    (s, p) => {
      const doc = s.doc()
      const ids = roots(doc, reqTargets('transform.moveTo', s, p))
      const b = doc.bounds_of(ids)
      if (b === null) throw bad('transform.moveTo', 'nothing to move')
      const dx = numOr(p, 'x', b.x0) - b.x0
      const dy = numOr(p, 'y', b.y0) - b.y0
      for (const i of ids) moveWorld(doc, i, dx, dy)
      return ok()
    }
  ),
  spec(
    'transform.rotate',
    'Rotate',
    "{ids?, degrees, cx?, cy? (pivot, page coords; default the selection's rotation origin, else its centre)}",
    true,
    (s, p) => {
      const deg = reqNum('transform.rotate', p, 'degrees')
      const ids = reqTargets('transform.rotate', s, p)
      const c = turnPivot(s, ids) ?? { x: 0, y: 0 }
      const pivot = { x: numOr(p, 'cx', c.x), y: numOr(p, 'cy', c.y) }
      const doc = s.doc()
      for (const i of roots(doc, ids)) rotateWorld(doc, i, pivot, deg)
      return ok()
    }
  ),
  spec(
    'transform.rotationOrigin',
    'Move rotation origin',
    "{on? (default: toggles)} — shows the selection's rotation origin to drag (Escape hides it); not saved",
    false,
    (s, p) => originJson(s, editRotationOrigin(s, boolean(p, 'on')))
  ),
  spec(
    'transform.setRotationOrigin',
    'Set rotation origin',
    '{x, y (page coords) | reset: true} — the point the selection turns about (default its centre); kept while the selection lasts, not saved',
    false,
    (s, p) => {
      const x = num(p, 'x')
      const y = num(p, 'y')
      const reset = boolean(p, 'reset') === true
      if (reset) {
        setRotationOrigin(s, null)
      } else if (x !== null && y !== null) {
        setRotationOrigin(s, { x, y })
      } else {
        throw bad('transform.setRotationOrigin', 'give `x` and `y`, or `reset: true`')
      }
      return originJson(s, s.ds().rotation_origin?.editing === true)
    }
  ),
  spec(
    'transform.scale',
    'Scale',
    '{ids?, factor, cx?, cy? (pivot; default top-left)} — scales size, strokes, effects, text (the K tool)',
    true,
    (s, p) => scaleCmd(s, p)
  )
]

const SMART_SPECS: CommandSpec[] = [
  spec(
    'arrange.spacing',
    'Spacing',
    '{ids?, horizontal?, vertical?, fromGesture?} (page units; fromGesture uses the interaction snapshot)',
    true,
    (s, p) => {
      const ids = reqTargets('arrange.spacing', s, p)
      const ds = s.ds()
      const base =
        boolean(p, 'fromGesture') === true && ds.interaction !== null ? ds.interaction.doc : ds.doc
      const layout = selectionSpacing(base, ids)
      const offsets = new Map<NodeId, { x: number | null; y: number | null }>()
      let any = false
      for (const [key, axis, vertical] of [
        ['horizontal', layout.horizontal, false],
        ['vertical', layout.vertical, true]
      ] as const) {
        if (get(p, key) === undefined) continue
        const value = reqNum('arrange.spacing', p, key)
        if (Math.abs(value) > 1_000_000) throw bad('arrange.spacing', 'spacing out of range')
        if (axis === null) throw bad('arrange.spacing', 'selection has no spacing on this axis')
        any = true
        for (const [id, delta] of axisOffsets(axis, value)) {
          if (!Number.isFinite(delta)) throw bad('arrange.spacing', 'non-finite spacing result')
          const pair = offsets.get(id) ?? { x: null, y: null }
          if (vertical) pair.y = delta
          else pair.x = delta
          offsets.set(id, pair)
        }
      }
      if (!any) throw bad('arrange.spacing', 'pass horizontal or vertical spacing')
      const doc = s.doc()
      const moves: Array<[NodeId, number, number]> = []
      for (const [id, d] of offsets) {
        const before = base.world_bounds(id)
        const now = doc.world_bounds(id)
        if (before === null || now === null) continue
        const dx = d.x === null ? 0 : before.x0 + d.x - now.x0
        const dy = d.y === null ? 0 : before.y0 + d.y - now.y0
        if (!Number.isFinite(dx) || !Number.isFinite(dy)) {
          throw bad('arrange.spacing', 'non-finite spacing result')
        }
        moves.push([id, dx, dy])
      }
      for (const [id, dx, dy] of moves) moveWorld(doc, id, dx, dy)
      return ok()
    }
  ),
  spec(
    'arrange.reorder',
    'Reorder selection',
    "{ids?, source, target, swap?, fromGesture?} (insert at target's visual slot; no hierarchy changes)",
    true,
    (s, p) => {
      const cmd = 'arrange.reorder'
      const ids = reqTargets(cmd, s, p)
      const source = reqId(cmd, p, 'source')
      const target = reqId(cmd, p, 'target')
      const ds = s.ds()
      const base =
        boolean(p, 'fromGesture') === true && ds.interaction !== null ? ds.interaction.doc : ds.doc
      const layout = reorderLayout(base, ids)
      if (layout === null) {
        throw bad(cmd, 'select a regular row, column or complete aligned grid')
      }
      const positions = reorderPositions(layout, source, target, boolean(p, 'swap') === true)
      if (positions === null) throw bad(cmd, 'source and target must belong to the selection')
      const doc = s.doc()
      const moves: Array<[NodeId, number, number]> = []
      for (const [id, at] of positions) {
        const now = doc.world_bounds(id)
        if (now === null) throw bad(cmd, 'layer is no longer available')
        const dx = at.x - now.x0
        const dy = at.y - now.y0
        if (!Number.isFinite(dx) || !Number.isFinite(dy))
          throw bad(cmd, 'non-finite reorder result')
        if (Math.abs(dx) > 1e-9 || Math.abs(dy) > 1e-9) moves.push([id, dx, dy])
      }
      for (const [id, dx, dy] of moves) moveWorld(doc, id, dx, dy)
      return ok()
    }
  )
]

export const ARRANGE_SPECS: CommandSpec[] = [
  ...ALIGN_SPECS,
  ...DISTRIBUTE_SPECS,
  ...ZORDER_SPECS,
  ...FLIP_SPECS,
  ...TRANSFORM_SPECS,
  ...SMART_SPECS
]
