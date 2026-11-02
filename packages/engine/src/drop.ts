/**
 * Where something dropped at a page point lands: the frame under the point (or
 * the page) and, in an auto layout frame, the child slot by pointer position
 * plus the insertion line to draw. (Converted 1:1 from FigCraft
 * `crates/engine/src/drop.rs`.)
 */

import type { Document, NodeId } from '@zenuxs/doc'
import type { Point, Rect } from '@zenuxs/geom'
import { RectMath } from '@zenuxs/geom'

/** A drop destination. */
export interface DropSlot {
  parent: NodeId
  /** Child index in an auto layout parent (`null`: on top). */
  index: number | null
  /** Insertion indicator `[x0, y0, x1, y1]` for auto layout parents. */
  line: [number, number, number, number] | null
}

/**
 * The slot in auto layout frame `parent` for pointer `p`, ignoring `exclude`
 * (layers being moved): the index (among the children left once `exclude` is
 * taken out) before the first placed child whose centre is past the pointer,
 * and the line to draw there. Hidden children and those ignoring auto layout
 * don't take part.
 */
export function autoLayoutSlot(
  doc: Document,
  parent: NodeId,
  p: Point,
  exclude: NodeId[]
): [number, [number, number, number, number] | null] | null {
  const pn = doc.node(parent)
  const layout = pn?.layout
  if (!pn || !layout) return null
  const vertical = layout.mode === 'vertical'
  const kids = pn.children.filter((c) => !exclude.includes(c))
  const flow: Array<[number, NodeId]> = []
  kids.forEach((c, i) => {
    const n = doc.node(c)
    if (n && n.visible && !n.child_layout.absolute) flow.push([i, c])
  })
  const index = (k: number): number =>
    k < flow.length ? (flow[k] as [number, NodeId])[0] : kids.length
  const flowIds = flow.map(([, c]) => c)
  if (layout.wrap && layout.mode !== 'grid') {
    const [k, line] = wrapSlot(doc, flowIds, p, vertical)
    return [index(k), line]
  }
  const pos = vertical ? p.y : p.x
  let k = flowIds.length
  for (let i = 0; i < flowIds.length; i++) {
    const b = doc.world_bounds(flowIds[i] as NodeId)
    if (b !== null && pos < (vertical ? RectMath.center(b).y : RectMath.center(b).x)) {
      k = i
      break
    }
  }
  let line: [number, number, number, number] | null = null
  const at = flowIds[k]
  const b = at === undefined ? null : doc.world_bounds(at)
  if (b !== null) line = lineBefore(b, vertical, 2)
  else {
    const lastId = flowIds[flowIds.length - 1]
    const lb = lastId === undefined ? null : doc.world_bounds(lastId)
    if (lb !== null)
      line = vertical ? [lb.x0, lb.y1 + 2, lb.x1, lb.y1 + 2] : [lb.x1 + 2, lb.y0, lb.x1 + 2, lb.y1]
  }
  return [index(k), line]
}

/** The insertion line `off` before a child with page bounds `b` (above it in a column). */
export function lineBefore(
  b: Rect,
  vertical: boolean,
  off: number
): [number, number, number, number] {
  return vertical ? [b.x0, b.y0 - off, b.x1, b.y0 - off] : [b.x0 - off, b.y0, b.x0 - off, b.y1]
}

/** `r` with x and y swapped when `vertical`: a vertical wrap (columns) is a
 * horizontal one (rows) turned on its side. */
export function flip(r: Rect, vertical: boolean): Rect {
  return vertical ? RectMath.new(r.y0, r.x0, r.y1, r.x1) : r
}

/**
 * The visual rows (columns when `vertical`) of a wrapping layout's placed
 * children `kids`, each child as `[its index in kids, its page bounds]`
 * (`flip`ped so the flow runs along x). Children wrap in flow order, so a new
 * row starts where a child sits before the one before, or where it does not
 * follow the one before along the flow but sits past it across (one child per
 * line).
 */
export function wrapRows(
  doc: Document,
  kids: NodeId[],
  vertical: boolean
): Array<Array<[number, Rect]>> {
  const rows: Array<Array<[number, Rect]>> = []
  kids.forEach((c, i) => {
    const wb = doc.world_bounds(c)
    if (wb === null) return
    const b = flip(wb, vertical)
    const row = rows[rows.length - 1]
    const prev = row?.[row.length - 1]?.[1]
    const continues =
      prev !== undefined &&
      b.x0 >= prev.x0 - 0.5 &&
      !(b.x0 < prev.x1 - 0.5 && b.y0 >= prev.y1 - 0.5)
    if (row !== undefined && continues) row.push([i, b])
    else rows.push([[i, b]])
  })
  return rows
}

/** The slot in a wrapping layout: the visual row (column) under the pointer,
 * then the position in it. */
function wrapSlot(
  doc: Document,
  kids: NodeId[],
  p: Point,
  vertical: boolean
): [number, [number, number, number, number] | null] {
  const [k, line] = wrapSlotRows(wrapRows(doc, kids, vertical), vertical ? { x: p.y, y: p.x } : p)
  if (line === null) return [k, null]
  const [x0, y0, x1, y1] = line
  return [k, vertical ? [y0, x0, y1, x1] : [x0, y0, x1, y1]]
}

/** `wrapSlot` in rows that run along x. */
function wrapSlotRows(
  rows: Array<Array<[number, Rect]>>,
  p: Point
): [number, [number, number, number, number] | null] {
  const span = (row: Array<[number, Rect]>): [number, number] =>
    row.reduce<[number, number]>(
      ([lo, hi], [, b]) => [Math.min(lo, b.y0), Math.max(hi, b.y1)],
      [Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY]
    )
  if (rows.length === 0) return [0, null]
  let best = rows[0] as Array<[number, Rect]>
  let bestD = Number.POSITIVE_INFINITY
  for (const row of rows) {
    const [lo, hi] = span(row)
    const d = p.y < lo ? lo - p.y : p.y > hi ? p.y - hi : 0
    if (d < bestD) {
      bestD = d
      best = row
    }
  }
  const [y0, y1] = span(best)
  for (const [i, b] of best) {
    if (p.x < RectMath.center(b).x) return [i, [b.x0 - 2, y0, b.x0 - 2, y1]]
  }
  const last = best[best.length - 1]
  if (last === undefined) return [0, null]
  return [last[0] + 1, [last[1].x1 + 2, y0, last[1].x1 + 2, y1]]
}
