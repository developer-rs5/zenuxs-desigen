/**
 * Arrow keys on auto layout children (`transform.nudge`): instead of nudging,
 * a child placed by its auto layout frame moves one place.
 *
 * - **Along the flow** (Left/Right in a row, Up/Down in a column) it swaps
 *   with the next placed sibling; selected neighbours move together. Hidden
 *   siblings and those ignoring auto layout keep their places in the layer
 *   order.
 * - **Wrapping rows:** Left/Right move along the flow, Up/Down to the
 *   previous/next visual row, next to the child nearest the selection's
 *   centre.
 * - **Grid:** each selected child moves to the neighbouring cell (an anchored
 *   child keeps its cell numbers).
 * - **Into a neighbouring frame:** at the edge, the selection moves into the
 *   auto layout frame next to its own.
 * (Converted 1:1 from FigCraft `crates/engine/src/al_keys.rs`.)
 */

import type { Document, NodeId } from '@zenuxs/doc'
import { RectMath } from '@zenuxs/geom'
import { gridPlace } from '@zenuxs/layout'

import { structureLocked } from './components'
import { flip, wrapRows } from './drop'

export interface Dir {
  horizontal: boolean
  forward: boolean
}

/** The arrows in a nudge of (`ux`, `uy`) units: horizontal first, then vertical. */
export function dirFromUnits(ux: number, uy: number): Dir[] {
  const out: Dir[] = []
  if (Number.isFinite(ux) && ux !== 0) out.push({ horizontal: true, forward: ux > 0 })
  if (Number.isFinite(uy) && uy !== 0) out.push({ horizontal: false, forward: uy > 0 })
  return out
}

/**
 * The auto layout frame that places `id` (`null` for layers ignoring auto
 * layout, hidden ones and layers of plain frames).
 */
export function flowingParent(doc: Document, id: NodeId): NodeId | null {
  const n = doc.node(id)
  if (!n) return null
  const parent = n.parent
  if (parent === null || parent === undefined) return null
  const pn = doc.node(parent)
  if (!pn || !pn.layout || !isFrameLike(pn)) return null
  return n.visible && !n.child_layout.absolute ? parent : null
}

function isFrameLike(n: { kind: { type: string } }): boolean {
  const t = n.kind.type
  return t === 'frame' || t === 'component' || t === 'componentSet' || t === 'instance'
}

/**
 * Move the `selected` children of auto layout frame `parent` one place in
 * `dir`. Returns whether anything moved.
 */
export function arrowMove(doc: Document, parent: NodeId, selected: NodeId[], dir: Dir): boolean {
  const pn = doc.node(parent)
  const layout = pn?.layout ?? null
  if (layout === null) return false
  const flow = flowChildren(doc, parent)
  const block = flow.filter((c) => selected.includes(c))
  if (block.length === 0) return false
  let moved = false
  if (layout.mode === 'grid') moved = gridMove(doc, parent, layout, block, dir)
  else {
    const along = (layout.mode === 'horizontal') === dir.horizontal
    if (along) moved = stepInFlow(doc, parent, flow, block, dir.forward)
    else if (layout.wrap)
      moved = wrapRowMove(doc, parent, flow, block, dir.forward, layout.mode === 'vertical')
  }
  if (moved) return true
  return moveIntoNeighbour(doc, parent, block, dir)
}

function flowChildren(doc: Document, frame: NodeId): NodeId[] {
  const f = doc.node(frame)
  if (!f) return []
  return f.children.filter((c) => {
    const n = doc.node(c)
    return n !== null && n.visible && !n.child_layout.absolute
  })
}

/**
 * Write a new order of `parent`'s placed children back: the slots placed
 * children held in the child list take `flow` in order; the other children
 * keep theirs.
 */
function writeFlow(doc: Document, parent: NodeId, flow: NodeId[]): void {
  const p = doc.node(parent)
  if (!p) return
  const placed = new Set(flow)
  const next = flow[Symbol.iterator]()
  p.children = p.children.map((c) => {
    if (!placed.has(c)) return c
    const v = next.next()
    return v.done === true ? c : v.value
  })
}

/**
 * Swap each selected child with the next unselected placed sibling that way
 * (selected neighbours move as a block). Returns whether anything moved.
 */
function stepInFlow(
  doc: Document,
  parent: NodeId,
  flow: NodeId[],
  block: NodeId[],
  forward: boolean
): boolean {
  const order = [...flow]
  const idx: number[] = []
  for (let i = 0; i < order.length; i++) idx.push(i)
  if (forward) idx.reverse()
  const has = (x: NodeId): boolean => block.includes(x)
  for (const i of idx) {
    const j = forward ? i + 1 : i - 1
    if (j < 0 || j >= order.length) continue
    const a = order[i] as NodeId
    const b = order[j] as NodeId
    if (has(a) && !has(b)) {
      order[i] = b
      order[j] = a
    }
  }
  if (order.every((v, k) => v === flow[k])) return false
  writeFlow(doc, parent, order)
  return true
}

/**
 * Up/Down in a wrapping row layout (Left/Right in a wrapping column layout,
 * `vertical`): into the previous/next visual row, next to the child nearest
 * the selection's centre. Returns whether anything moved.
 */
function wrapRowMove(
  doc: Document,
  parent: NodeId,
  flow: NodeId[],
  block: NodeId[],
  forward: boolean,
  vertical: boolean
): boolean {
  const rows = wrapRows(doc, flow, vertical)
  const lead = forward ? block[block.length - 1] : block[0]
  if (lead === undefined) return false
  const leadI = flow.indexOf(lead)
  if (leadI < 0) return false
  const row = rows.findIndex((r) => r.some(([i]) => i === leadI))
  if (row < 0) return false
  const target = forward ? rows[row + 1] : rows[row - 1]
  if (target === undefined) return false
  const bb = doc.bounds_of(block)
  if (bb === null) return false
  const centre = RectMath.center(flip(bb, vertical)).x
  let nearest: NodeId | null = null
  let bestD = Number.POSITIVE_INFINITY
  for (const [i, r] of target) {
    const c = flow[i]
    if (c === undefined || block.includes(c)) continue
    const d = Math.abs(RectMath.center(r).x - centre)
    if (d < bestD) {
      bestD = d
      nearest = c
    }
  }
  if (nearest === null) return false
  const order = flow.filter((c) => !block.includes(c))
  const at0 = order.indexOf(nearest)
  if (at0 < 0) return false
  const at = forward ? at0 + 1 : at0
  block.forEach((c, k) => {
    order.splice(Math.min(at + k, order.length), 0, c)
  })
  writeFlow(doc, parent, order)
  return true
}

/** Whether grid cell `c` covers column `col`, row `row`. */
function covers(
  c: { column: number; row: number; column_span: number; row_span: number },
  col: number,
  row: number
): boolean {
  return (
    c.column <= col && col < c.column + c.column_span && c.row <= row && row < c.row + c.row_span
  )
}

/**
 * An arrow in a grid: each selected child moves to the neighbouring cell.
 * Returns whether anything moved (`false` at the grid's edge).
 */
function gridMove(
  doc: Document,
  parent: NodeId,
  layout: NonNullable<NonNullable<ReturnType<Document['node']>>['layout']>,
  block: NodeId[],
  dir: Dir
): boolean {
  const cols = Math.max(1, Math.round(layout.grid_columns))
  let moved = false
  const order = dir.forward ? [...block].reverse() : [...block]
  for (const id of order) {
    const flow = flowChildren(doc, parent)
    const [cells, rows] = gridPlace(doc, layout, flow)
    const cell = cells.find((_c, k) => flow[k] === id)
    if (cell === undefined) continue
    const [dc, dr] = dir.horizontal
      ? dir.forward
        ? [1, 0]
        : [-1, 0]
      : dir.forward
        ? [0, 1]
        : [0, -1]
    const tc = cell.column + dc
    const tr = cell.row + dr
    if (tc < 0 || tr < 0) continue
    if (tc + cell.column_span > cols || tr + cell.row_span > rows) continue
    const leadC = dc > 0 ? tc + cell.column_span - 1 : tc
    const leadR = dr > 0 ? tr + cell.row_span - 1 : tr
    const occupant = cells.find((c, k) => flow[k] !== id && covers(c, leadC, leadR))
    const anchored = (i: NodeId): boolean => {
      const n = doc.node(i)
      return n !== null && (n.child_layout.grid_column !== null || n.child_layout.grid_row !== null)
    }
    if (occupant !== undefined) {
      const occId = flow[cells.indexOf(occupant)]
      if (occId !== undefined && !anchored(id) && !anchored(occId)) {
        const next = flow.filter((c) => c !== id)
        const at = next.indexOf(occId)
        if (at < 0) continue
        next.splice(dir.forward ? at + 1 : at, 0, id)
        writeFlow(doc, parent, next)
        moved = true
        continue
      }
      if (occId !== undefined && anchored(occId)) {
        const o = doc.node_mut(occId)
        if (o) {
          o.child_layout.grid_column = cell.column
          o.child_layout.grid_row = cell.row
        }
      }
    }
    const n = doc.node_mut(id)
    if (n) {
      n.child_layout.grid_column = tc
      n.child_layout.grid_row = tr
    }
    moved = true
  }
  return moved
}

/**
 * Move `block` (children of `parent`) into the auto layout frame next to
 * `parent` in `dir`, when `parent` is placed by an auto layout frame flowing
 * that way. Returns whether anything moved.
 */
function moveIntoNeighbour(doc: Document, parent: NodeId, block: NodeId[], dir: Dir): boolean {
  const outer = flowingParent(doc, parent)
  if (outer === null) return false
  const outerLayout = doc.node(outer)?.layout
  if (!outerLayout) return false
  const flowsThatWay =
    outerLayout.mode === 'horizontal'
      ? dir.horizontal
      : outerLayout.mode === 'vertical'
        ? !dir.horizontal
        : false
  if (!flowsThatWay) return false
  const siblings = flowChildren(doc, outer)
  const i = siblings.indexOf(parent)
  if (i < 0) return false
  const dest = siblings[dir.forward ? i + 1 : i - 1]
  if (dest === undefined) return false
  const dn = doc.node(dest)
  const accepts =
    dn !== null &&
    isFrameLike(dn) &&
    !dn.locked &&
    dn.layout !== null &&
    dn.layout.mode !== 'grid' &&
    !structureLocked(doc, dest)
  if (!accepts) return false
  const b = doc.world_bounds(dest)
  const sel = doc.bounds_of(block)
  if (b === null || sel === null) return false
  // Enter at the near edge, level with the selection on the other axis (just
  // before its centre, so a child level with it is displaced and the selection
  // keeps its place).
  const edge = (lo: number, hi: number): number =>
    dir.forward ? lo + Math.min(hi - lo, 0.5) : hi - Math.min(hi - lo, 0.5)
  const level = (c: number, lo: number, hi: number): number =>
    Math.min(Math.max(c - 0.5, lo), Math.max(hi, lo))
  const probe = dir.horizontal
    ? { x: edge(b.x0, b.x1), y: level(RectMath.center(sel).y, b.y0, b.y1) }
    : { x: level(RectMath.center(sel).x, b.x0, b.x1), y: edge(b.y0, b.y1) }
  const slot = autoLayoutSlotFor(doc, dest, probe, block)
  if (slot === null) return false
  block.forEach((c, k) => {
    doc.reparent(c, dest, slot + k)
  })
  return true
}

function autoLayoutSlotFor(
  doc: Document,
  parent: NodeId,
  p: { x: number; y: number },
  exclude: NodeId[]
): number | null {
  const pn = doc.node(parent)
  const layout = pn?.layout
  if (pn === null || !layout) return null
  const vertical = layout.mode === 'vertical'
  const kids = pn.children.filter((c) => !exclude.includes(c))
  const flow: Array<[number, NodeId]> = []
  kids.forEach((c, i) => {
    const n = doc.node(c)
    if (n && n.visible && !n.child_layout.absolute) flow.push([i, c])
  })
  if (layout.wrap && layout.mode !== 'grid') {
    const [k, line] = wrapSlotIndex(
      doc,
      flow.map(([, c]) => c),
      p,
      vertical
    )
    void line
    return k < flow.length ? (flow[k] as [number, NodeId])[0] : kids.length
  }
  const pos = vertical ? p.y : p.x
  let k = flow.length
  for (let i = 0; i < flow.length; i++) {
    const b = doc.world_bounds((flow[i] as [number, NodeId])[1])
    if (b !== null && pos < (vertical ? RectMath.center(b).y : RectMath.center(b).x)) {
      k = i
      break
    }
  }
  return k < flow.length ? (flow[k] as [number, NodeId])[0] : kids.length
}

function wrapSlotIndex(
  doc: Document,
  kids: NodeId[],
  p: { x: number; y: number },
  vertical: boolean
): [number, [number, number, number, number] | null] {
  const rows = wrapRows(doc, kids, vertical)
  const at = vertical ? { x: p.y, y: p.x } : p
  if (rows.length === 0) return [0, null]
  const span = (
    row: Array<[number, { x0: number; y0: number; x1: number; y1: number }]>
  ): [number, number] =>
    row.reduce<[number, number]>(
      ([lo, hi], [, b]) => [Math.min(lo, b.y0), Math.max(hi, b.y1)],
      [Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY]
    )
  let best = rows[0] as Array<[number, { x0: number; y0: number; x1: number; y1: number }]>
  let bestD = Number.POSITIVE_INFINITY
  for (const row of rows) {
    const [lo, hi] = span(row)
    const d = at.y < lo ? lo - at.y : at.y > hi ? at.y - hi : 0
    if (d < bestD) {
      bestD = d
      best = row
    }
  }
  const [y0, y1] = span(best)
  for (const [i, b] of best) {
    if (at.x < (b.x0 + b.x1) / 2) return [i, [b.x0 - 2, y0, b.x0 - 2, y1]]
  }
  const last = best[best.length - 1]
  if (last === undefined) return [0, null]
  return [last[0] + 1, [last[1].x1 + 2, y0, last[1].x1 + 2, y1]]
}
