/**
 * A layer's ordered lists (fills, strokes, effects, layout grids): reordering
 * them, and keeping the variable bindings on their items
 * (`fills/<i>/color`, `fills/<i>/stops/<j>/color`, `effects/<i>/radius`,
 * `layoutGrids/<i>/gutter`, …) with their items when a list is reordered or
 * shrinks, and on gradient stops when a stop is removed.
 *
 * Every list is stored bottom first: index 0 paints (or applies) first, the
 * last one is on top; the Design panel shows them in reverse, the topmost row
 * first. (Converted 1:1 from FigCraft `crates/engine/src/cmd/lists.rs`.)
 */

import type { Node } from '@zenuxs/doc'

import { ok, spec, type CommandSpec, type Session } from '../lib'
import { reqIndex, reqTargets } from './params'

/** One of a layer's ordered lists whose items carry variable bindings. */
export enum BoundList {
  Fills = 'fills',
  Strokes = 'strokes',
  Effects = 'effects',
  Grids = 'layoutGrids'
}

/** The items of `list` on `n`. */
function items(n: Node, list: BoundList): unknown[] {
  switch (list) {
    case BoundList.Fills:
      return n.fills
    case BoundList.Strokes:
      return n.strokes
    case BoundList.Effects:
      return n.effects
    case BoundList.Grids:
      return n.grids
  }
}

/** Replace the items of `list` on `n`. */
function setItems(n: Node, list: BoundList, v: unknown[]): void {
  switch (list) {
    case BoundList.Fills:
      n.fills = v as Node['fills']
      return
    case BoundList.Strokes:
      n.strokes = v as Node['strokes']
      return
    case BoundList.Effects:
      n.effects = v as Node['effects']
      return
    case BoundList.Grids:
      n.grids = v as Node['grids']
  }
}

export const BoundListOps = {
  /** The binding key prefix (`<prefix>/<index>/<field>`). */
  prefix(list: BoundList): string {
    return list
  },

  len(n: Node, list: BoundList): number {
    return items(n, list).length
  },

  /** Unlink the style that defined the whole list (it no longer matches it). */
  detach_style(n: Node, list: BoundList): void {
    switch (list) {
      case BoundList.Fills:
        delete n.styles.fill
        return
      case BoundList.Strokes:
        delete n.styles.stroke
        return
      case BoundList.Effects:
        delete n.styles.effect
        return
      case BoundList.Grids:
        delete n.styles.grid
    }
  },

  /** The binding key of `field` on item `index` (`fills/2/color`). */
  key(list: BoundList, index: number, field: string): string {
    return `${list}/${index}/${field}`
  }
}

/** The list item a binding key refers to: its list, index and field. */
export function list_binding(
  key: string
): { list: BoundList; index: number; field: string } | null {
  if (key === 'fill' || key === 'fills' || key === 'fills/0') {
    return { list: BoundList.Fills, index: 0, field: 'color' }
  }
  if (key === 'stroke') return { list: BoundList.Strokes, index: 0, field: 'color' }
  const slash = key.indexOf('/')
  if (slash < 0) return null
  const prefix = key.slice(0, slash)
  const rest = key.slice(slash + 1)
  const list = Object.values(BoundList).find((l) => l === prefix)
  if (list === undefined) return null
  const next = rest.indexOf('/')
  if (next < 0) return null
  const i = rest.slice(0, next)
  const field = rest.slice(next + 1)
  if (i.length === 0 || !/^[0-9]+$/.test(i) || field.length === 0) return null
  return { list, index: Number(i), field }
}

/** The binding key on paint `index`'s colour that `n` uses, if any. */
export function paint_binding_key(n: Node, fills: boolean, index: number): string | null {
  const list = fills ? BoundList.Fills : BoundList.Strokes
  for (const k of Object.keys(n.bound)) {
    const ref = list_binding(k)
    if (ref && ref.list === list && ref.index === index && ref.field === 'color') return k
  }
  return null
}

/** The gradient stop a paint field names (`stops/<j>/color` → j). */
export function stop_binding(field: string): number | null {
  if (!field.startsWith('stops/') || !field.endsWith('/color')) return null
  const j = field.slice('stops/'.length, field.length - '/color'.length)
  if (j.length === 0 || !/^[0-9]+$/.test(j)) return null
  return Number(j)
}

/** Where item `k` lands when the item at `removed` goes (`null`: it is removed). */
export function removed_index(k: number, removed: number): number | null {
  if (k < removed) return k
  if (k === removed) return null
  return k - 1
}

/** Where item `k` lands when `from` moves to `to`. */
export function moved_index(k: number, from: number, to: number): number {
  if (k === from) return to
  if (from < to && k > from && k <= to) return k - 1
  if (to < from && k >= to && k < from) return k + 1
  return k
}

/**
 * Keep `n`'s bindings on `list`'s items with their items when the list changes:
 * `map` gives an item's new index, or null when it was removed (its bindings go
 * with it). Bindings whose item keeps its place keep their key.
 */
export function remap_list_bindings(
  n: Node,
  list: BoundList,
  map: (i: number) => number | null
): void {
  const moved: Array<[string, string | null]> = []
  for (const k of Object.keys(n.bound)) {
    const ref = list_binding(k)
    if (!ref || ref.list !== list) continue
    const j = map(ref.index)
    if (j === null) moved.push([k, null])
    else if (j !== ref.index) moved.push([k, BoundListOps.key(list, j, ref.field)])
  }
  const kept: Array<[string, string]> = []
  for (const [old, next] of moved) {
    const v = n.bound[old]
    delete n.bound[old]
    if (next !== null && v !== undefined) kept.push([next, v])
  }
  for (const [k, v] of kept) n.bound[k] = v
}

/**
 * Drop item `index` of `list` on `n` with its bindings (later items' bindings
 * move down one). False when there is no such item.
 */
export function remove_item(n: Node, list: BoundList, index: number): boolean {
  const v = [...items(n, list)]
  if (index >= v.length) return false
  v.splice(index, 1)
  setItems(n, list, v)
  remap_list_bindings(n, list, (k) => removed_index(k, index))
  return true
}

/** Move `v[from]` to `to`; false (and nothing changes) when either is out of range or they match. */
function reorder<T>(v: T[], from: number, to: number): boolean {
  if (from >= v.length || to >= v.length || from === to) return false
  const [item] = v.splice(from, 1)
  v.splice(to, 0, item as T)
  return true
}

/** `fill.move` / `stroke.move` / `effect.move` / `grid.move`. */
function move_item(
  s: Session,
  p: Record<string, unknown>,
  cmd: string,
  list: BoundList
): Record<string, unknown> {
  const from = reqIndex(cmd, p, 'from')
  const to = reqIndex(cmd, p, 'to')
  for (const id of reqTargets(cmd, s, p)) {
    const len = s.doc().node(id) ? BoundListOps.len(s.doc().node(id) as Node, list) : 0
    if (from >= len || to >= len || from === to) continue
    const n = s.doc().node_mut(id)
    if (!n) continue
    const v = [...items(n, list)]
    const moved = reorder(v, from, to)
    if (!moved) continue
    setItems(n, list, v)
    remap_list_bindings(n, list, (k) => moved_index(k, from, to))
    BoundListOps.detach_style(n, list)
  }
  return ok()
}

export const LIST_SPECS: CommandSpec[] = [
  spec(
    'fill.move',
    'Move fill',
    '{ids?, from, to} (indices in the fill list, bottom first)',
    true,
    (s, p) => move_item(s, p, 'fill.move', BoundList.Fills)
  ),
  spec(
    'stroke.move',
    'Move stroke',
    '{ids?, from, to} (indices in the stroke list, bottom first)',
    true,
    (s, p) => move_item(s, p, 'stroke.move', BoundList.Strokes)
  ),
  spec(
    'effect.move',
    'Move effect',
    '{ids?, from, to} (indices in the effect list, bottom first)',
    true,
    (s, p) => move_item(s, p, 'effect.move', BoundList.Effects)
  ),
  spec(
    'grid.move',
    'Move layout grid',
    '{ids?, from, to} (indices in the layout grid list, bottom first)',
    true,
    (s, p) => move_item(s, p, 'grid.move', BoundList.Grids)
  )
]
