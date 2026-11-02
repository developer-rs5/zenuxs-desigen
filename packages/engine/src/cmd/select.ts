/**
 * Selection commands: which layers a click, a marquee or a keyboard shortcut
 * picks, and how a selection grows, shrinks and jumps between siblings.
 * (Converted 1:1 from FigCraft `crates/engine/src/cmd/edit.rs`.)
 */

import { layers_at, marquee_deep, marquee_select, type Node, type NodeId } from '@zenuxs/doc'
import { RectMath, type Rect } from '@zenuxs/geom'

import { frameAt } from '../components'
import { EngineError, ok, spec, type CommandSpec, type Session } from '../lib'
import { bad, boolean, get, id, idOf, num, reqNum, reqString, string } from './params'

/** `ids` (array), a single `id`, or nothing. */
function targets_param(p: Record<string, unknown>): NodeId[] {
  const ids = get(p, 'ids')
  if (Array.isArray(ids)) return ids.map(idOf).filter((x): x is NodeId => x !== null)
  const one = id(p, 'id')
  return one === null ? [] : [one]
}

/** Select `ids`, switching to their page if they're elsewhere. */
export function select_and_page(s: Session, ids: NodeId[]): void {
  const doc = s.doc()
  for (const i of ids) {
    if (!doc.contains(i)) throw new EngineError(`no such node ${i}`)
  }
  const first = ids[0]
  if (first !== undefined) {
    const pg = doc.page_of(first)
    if (pg !== null && pg !== s.page()) {
      // Library copies live outside the pages.
      if (!doc.pages.includes(pg)) {
        throw new EngineError(
          `command \`select\` is not available right now: ${first} isn't on a page (it is a library component)`
        )
      }
      s.ds().page = pg
    }
  }
  s.set_selection(ids)
}

/** Top-level selection: drop ids whose ancestor is also selected. */
export function roots(doc: { ancestors(id: NodeId): NodeId[] }, ids: NodeId[]): NodeId[] {
  const set = new Set(ids)
  return ids.filter((i) => !doc.ancestors(i).some((a) => set.has(a)))
}

/** Ids sorted in document (z) order. */
export function z_sorted(
  doc: { page_of(id: NodeId): NodeId | null; subtree(id: NodeId): NodeId[] },
  ids: NodeId[]
): NodeId[] {
  const first = ids[0]
  const page = first === undefined ? null : doc.page_of(first)
  if (page === null) return [...ids]
  const order = new Map<NodeId, number>()
  doc.subtree(page).forEach((id, i) => order.set(id, i))
  return [...ids].sort(
    (a, b) => (order.get(a) ?? Number.MAX_SAFE_INTEGER) - (order.get(b) ?? Number.MAX_SAFE_INTEGER)
  )
}

/** Whether `n`'s box is covered completely by `r`. */
function covers(r: Rect, b: Rect): boolean {
  return r.x0 <= b.x0 && r.y0 <= b.y0 && r.x1 >= b.x1 && r.y1 >= b.y1
}

/** What a marquee starting at page point `p` selects inside. */
export function marquee_within(s: Session, pt: { x: number; y: number }): NodeId | null {
  const doc = s.doc()
  const page = s.page()
  const within = frameAt(doc, page, pt, [])
  const onPage = within !== null && doc.node(within)?.parent === page ? within : null
  if (onPage !== null) {
    const b = doc.world_bounds(onPage)
    if (b === null || pt.x < b.x0 || pt.x > b.x1 || pt.y < b.y0 || pt.y > b.y1)
      return s.ds().focused()
    return s.ds().focused() ?? onPage
  }
  return s.ds().focused()
}

/**
 * The selection a marquee over page rect `r` makes from `base` (what was
 * selected before): the layers it touches (`deep`: nested ones too);
 * `additive` (Shift) toggles them.
 */
export function marquee_selection(
  s: Session,
  r: Rect,
  within: NodeId | null,
  deep: boolean,
  base: NodeId[],
  additive: boolean
): NodeId[] {
  const doc = s.doc()
  const page = s.page()
  let hits = deep ? marquee_deep(doc, page, r) : marquee_select(doc, page, r, within)
  const focused = s.ds().focused()
  if (focused !== null) hits = hits.filter((h) => h !== focused && doc.is_ancestor(focused, h))
  // A marquee over a frame from outside selects the frame only when it covers it fully.
  if (within === null && !deep) {
    hits = hits.filter((h) => {
      const n = doc.node(h)
      const b = doc.world_bounds(h)
      const isBoard = n !== null && (isBoardKind(n) || n.kind.type === 'section')
      return (b !== null && covers(r, b)) || !isBoard
    })
  }
  // Shift toggles: what was selected and is touched again comes out.
  const sel = base.filter((b) => !(additive && hits.includes(b)))
  for (const h of hits) {
    if (!base.includes(h) && !sel.includes(h)) sel.push(h)
  }
  return sel
}

function isBoardKind(n: Node): boolean {
  const t = n.kind.type
  return t === 'frame' || t === 'component' || t === 'componentSet' || t === 'instance'
}

function select_all(s: Session, _p: Record<string, unknown>): Record<string, unknown> {
  const doc = s.doc()
  const sel = s.selection()
  // Select all siblings of the current selection, else the page's top level.
  const first = sel[0]
  const parent = (first === undefined ? null : doc.node(first)?.parent) ?? s.page()
  const node = doc.node(parent)
  const ids = (node?.children ?? []).filter((c) => {
    const n = doc.node(c)
    return n !== null && n.visible && !n.locked
  })
  s.set_selection(ids)
  return { selection: ids }
}

/** What Select all would select, less the selection (hidden and locked layers neither). */
function select_inverse(s: Session, _p: Record<string, unknown>): Record<string, unknown> {
  const doc = s.doc()
  const sel = s.selection()
  const first = sel[0]
  const parent = (first === undefined ? null : doc.node(first)?.parent) ?? s.page()
  const node = doc.node(parent)
  const ids = (node?.children ?? []).filter((c) => {
    if (sel.includes(c)) return false
    const n = doc.node(c)
    return n !== null && n.visible && !n.locked
  })
  s.set_selection(ids)
  return { selection: ids }
}

/** `select.area`: what a marquee from (x, y) over the box selects; no box asks the app for one. */
function select_area(s: Session, p: Record<string, unknown>): Record<string, unknown> {
  const cmd = 'select.area'
  const keys = ['x', 'y', 'width', 'height'] as const
  if (keys.every((k) => get(p, k) === undefined)) {
    s.request_ui('selectArea', {})
    return ok()
  }
  const [x, y, w, h] = keys.map((k) => num(p, k))
  if (x === null || y === null || w === null || h === null)
    throw bad(cmd, 'pass x, y, width and height (numbers)')
  for (const v of [x, y, w, h]) {
    if (!Number.isFinite(v) || Math.abs(v) >= 1e9) throw bad(cmd, 'the box is out of range')
  }
  const start = { x, y }
  const r = RectMath.from_points(start, { x: x + w, y: y + h })
  const add = boolean(p, 'add') === true
  const base = add ? s.selection() : []
  const within = marquee_within(s, start)
  const sel = marquee_selection(s, r, within, boolean(p, 'deep') === true, base, add)
  s.set_selection(sel)
  return { selection: sel }
}

function select_children(s: Session, _p: Record<string, unknown>): Record<string, unknown> {
  const doc = s.doc()
  const ids: NodeId[] = []
  for (const i of s.selection()) {
    const n = doc.node(i)
    if (n) ids.push(...n.children)
  }
  if (ids.length === 0) return { selection: s.selection() }
  s.set_selection(ids)
  return { selection: ids }
}

function select_parent(s: Session, _p: Record<string, unknown>): Record<string, unknown> {
  const doc = s.doc()
  const ids: NodeId[] = []
  for (const i of s.selection()) {
    const parent = doc.node(i)?.parent
    if (parent === null || parent === undefined) continue
    if (doc.node(parent)?.kind.type === 'page') continue
    if (!ids.includes(parent)) ids.push(parent)
  }
  if (ids.length === 0) return { selection: s.selection() }
  s.set_selection(ids)
  return { selection: ids }
}

/** The sibling `dir` steps away in the layers panel (whose order is reversed). */
function select_sibling(s: Session, dir: number): Record<string, unknown> {
  const doc = s.doc()
  const sel = s.selection()
  const cur = sel.at(-1)
  if (cur === undefined) {
    const kids = doc.node(s.page())?.children ?? []
    const last = kids[kids.length - 1]
    s.set_selection(last === undefined ? [] : [last])
    return { selection: s.selection() }
  }
  const parent = doc.node(cur)?.parent
  if (parent === null || parent === undefined) throw bad('select.next', 'no parent')
  const kids = doc.node(parent)?.children ?? []
  const idx = Math.max(0, kids.indexOf(cur))
  const n = Math.max(1, kids.length)
  // Layers panel order is reversed (top of the list = last child): Tab goes down the list.
  const next = (((idx - dir) % n) + n) % n
  const picked = kids[next] ?? cur
  s.set_selection([picked])
  return { selection: [picked] }
}

function select_matching(s: Session, _p: Record<string, unknown>): Record<string, unknown> {
  const doc = s.doc()
  const sel = s.selection()
  const firstId = sel[0]
  const first = firstId === undefined ? null : doc.node(firstId)
  if (!first) return { selection: [] }
  const name = first.name
  const type = first.kind.type
  const ids = doc.subtree(s.page()).filter((i) => {
    const n = doc.node(i)
    return n !== null && n.name === name && n.kind.type === type
  })
  s.set_selection(ids)
  return { selection: ids }
}

function select_same(s: Session, same: (a: Node, b: Node) => boolean): Record<string, unknown> {
  const doc = s.doc()
  const sel = s.selection()
  const firstId = sel[0]
  const first = firstId === undefined ? null : doc.node(firstId)
  if (!first) return { selection: [] }
  const page = s.page()
  const ids = doc.subtree(page).filter((i) => {
    if (i === page) return false
    const n = doc.node(i)
    return n !== null && same(first, n)
  })
  s.set_selection(ids)
  return { selection: ids }
}

function paintsEqual(a: unknown[], b: unknown[]): boolean {
  return JSON.stringify(a) === JSON.stringify(b)
}

function sameText(k: Node, other: Node): { a: unknown; b: unknown } | null {
  if (k.kind.type !== 'text' || other.kind.type !== 'text') return null
  return { a: k.kind.style, b: other.kind.style }
}

export const SELECT_SPECS: CommandSpec[] = [
  spec('select.set', 'Select', '{ids: [..]}  (replace the selection)', false, (s, p) => {
    let ids: NodeId[]
    const raw = get(p, 'ids')
    if (Array.isArray(raw)) ids = raw.map(idOf).filter((x): x is NodeId => x !== null)
    else {
      const one = id(p, 'id')
      ids = one === null ? [] : [one]
    }
    select_and_page(s, ids)
    return { selection: s.selection() }
  }),
  spec('select.add', 'Add to selection', '{ids}', false, (s, p) => {
    const sel = s.selection()
    for (const i of targets_param(p)) {
      if (!sel.includes(i)) sel.push(i)
    }
    s.set_selection(sel)
    return { selection: s.selection() }
  }),
  spec('select.remove', 'Remove from selection', '{ids}', false, (s, p) => {
    const rm = targets_param(p)
    s.set_selection(s.selection().filter((i) => !rm.includes(i)))
    return { selection: s.selection() }
  }),
  spec(
    'select.layersAt',
    'Layers at a point',
    '{x, y (page coordinates)} → {layers: [{id, name, type, depth}]}',
    false,
    (s, p) => {
      const x = reqNum('select.layersAt', p, 'x')
      const y = reqNum('select.layersAt', p, 'y')
      const doc = s.doc()
      const zoom = Math.max(1e-6, s.ds().view.zoom)
      const layers = layers_at(doc, s.page(), { x, y }, 2 / zoom, null, {
        all: false,
        maskOutlines: false
      })
        .map(([i, depth]) => {
          const n = doc.node(i)
          return n ? { id: i, name: n.name, type: n.kind.type, depth } : null
        })
        .filter((v): v is NonNullable<typeof v> => v !== null)
      return { layers }
    }
  ),
  spec('select.all', 'Select all', '{}', false, select_all),
  spec('select.none', 'Select none', '{}', false, (s) => {
    s.set_selection([])
    const ds = s.ds()
    ds.text_edit = null
    ds.vector_edit = null
    return ok()
  }),
  spec('select.inverse', 'Select inverse', '{}', false, select_inverse),
  spec(
    'select.area',
    'Select area',
    '{x, y, width, height (page units; a marquee from x, y), add? (toggle like a Shift marquee), deep? (nested layers, like Cmd/Ctrl)} → {selection}',
    false,
    select_area
  ),
  spec('select.children', 'Select children', '{}', false, select_children),
  spec('select.parent', 'Select parent', '{}', false, select_parent),
  spec('select.next', 'Select next sibling', '{}', false, (s) => select_sibling(s, 1)),
  spec('select.previous', 'Select previous sibling', '{}', false, (s) => select_sibling(s, -1)),
  spec('select.matching', 'Select matching layers', '{}', false, select_matching),
  spec('select.sameFill', 'Select same fill', '{}', false, (s) =>
    select_same(s, (a, b) => paintsEqual(a.fills, b.fills) && a.fills.length > 0)
  ),
  spec('select.sameStroke', 'Select same stroke', '{}', false, (s) =>
    select_same(
      s,
      (a, b) =>
        paintsEqual(a.strokes, b.strokes) &&
        JSON.stringify(a.stroke) === JSON.stringify(b.stroke) &&
        a.strokes.length > 0
    )
  ),
  spec('select.sameEffect', 'Select same effect', '{}', false, (s) =>
    select_same(s, (a, b) => paintsEqual(a.effects, b.effects) && a.effects.length > 0)
  ),
  spec('select.sameText', 'Select same text properties', '{}', false, (s) => {
    return select_same(s, (a, b) => {
      const t = sameText(a, b)
      return t !== null && JSON.stringify(t.a) === JSON.stringify(t.b)
    })
  }),
  spec('select.sameFont', 'Select same font', '{}', false, (s) =>
    select_same(s, (a, b) => {
      if (a.kind.type !== 'text' || b.kind.type !== 'text') return false
      const x = (a.kind as { style: Record<string, unknown> }).style
      const y = (b.kind as { style: Record<string, unknown> }).style
      return x.font_family === y.font_family && x.font_style === y.font_style
    })
  ),
  spec('select.sameInstance', 'Select same instance', '{}', false, (s) =>
    select_same(s, (a, b) => {
      if (a.kind.type !== 'instance' || b.kind.type !== 'instance') return false
      return (
        (a.kind as { component: NodeId }).component === (b.kind as { component: NodeId }).component
      )
    })
  ),
  spec('select.sameProperties', 'Select same properties', '{}', false, (s) =>
    select_same(
      s,
      (a, b) =>
        a.kind.type === b.kind.type &&
        paintsEqual(a.fills, b.fills) &&
        paintsEqual(a.strokes, b.strokes) &&
        paintsEqual(a.effects, b.effects) &&
        JSON.stringify(a.corners) === JSON.stringify(b.corners)
    )
  ),
  spec(
    'select.byName',
    'Select layers by name',
    '{query, page? (default current; "all" for every page)}',
    false,
    (s, p) => {
      const q = reqString('select.byName', p, 'query')
      const page = string(p, 'page') === 'all' ? null : s.page()
      const ids = s.doc().find_by_name(q, page)
      select_and_page(s, ids)
      return { selection: ids }
    }
  )
]
