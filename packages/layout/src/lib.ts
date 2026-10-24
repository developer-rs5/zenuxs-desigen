/**
 * ZenuxsDesign layout: Figma-style auto layout.
 *
 * - `layoutPage` / `layoutFrame`: children of an auto layout frame are stacked
 *   horizontally or vertically (optionally wrapping) or placed on a grid with
 *   fixed / hug / `fr` tracks and spanning cells, with gap, padding and
 *   alignment; each child is Fixed, Hug (its own content) or Fill (shares the
 *   free space), within its min/max size. A Hug container sizes to its
 *   children. Absolute children (ignoring auto layout) are not placed.
 * - `coherentSizing`: Fill and Hug only where they can apply, else Fixed.
 * - `applyConstraints`: children of a regular frame follow constraints on resize.
 * - `gridLines`: the column/row rectangles of a layout grid.
 *
 * Text measurement is injected (`Measure`) so this package doesn't depend on
 * fonts. (Converted 1:1 from FigCraft `crates/layout/src/lib.rs`.)
 */

import {
  AutoLayout,
  ChildLayout,
  ContentAlign,
  CrossAlign,
  LayoutGrid,
  LayoutMode,
  MainAlign,
  Sizing,
  type CellAlign
} from '@zenuxs/doc'
import { Document } from '@zenuxs/doc'
import { Affine, Rect, RectMath, transform_rect_bbox, type NodeId } from '@zenuxs/geom'

/** Most layout calls nested in one another (about one per level of layers). */
export const MAX_NESTING = 256

let nesting = 0

function enterNested(): boolean {
  if (nesting >= MAX_NESTING) return false
  nesting += 1
  return true
}

function exitNested(): void {
  nesting = Math.max(0, nesting - 1)
}

/** Measures text for a given width (auto-height text inside a Fill container). */
export interface Measure {
  /** The height a text node needs at `width`. */
  textHeight(doc: Document, id: NodeId, width: number): number | null
  /** Natural (auto width, unwrapped) size of a text node. */
  textSize(doc: Document, id: NodeId): [number, number] | null
  /** Distance from the top of a text node's box to its first line's baseline. */
  textBaseline?(doc: Document, id: NodeId): number | null
}

/** A measurer that never changes text sizes. */
export const NoMeasure: Measure = {
  textHeight: () => null,
  textSize: () => null
}

/** Clamp a size to `[min, max]` (non-finite or negative sizes become 0). */
export function clampSize(v: number, min: number | null, max: number | null): number {
  let v2 = Number.isFinite(v) ? Math.max(0, v) : 0
  if (max !== null && Number.isFinite(max)) v2 = Math.min(v2, max)
  if (min !== null && Number.isFinite(min)) v2 = Math.max(v2, min)
  return v2
}

function finiteOrZero(v: number): number {
  return Number.isFinite(v) ? v : 0
}

/** The node's transform without its translation. */
function linear(a: { coeffs: readonly number[] }): Affine {
  const c = a.coeffs
  return Affine.new([c[0], c[1], c[2], c[3], 0, 0])
}

function localRect(n: { width: number; height: number }): Rect {
  return RectMath.new(0, 0, n.width, n.height)
}

/** The child's box size as seen by the parent (rotation → bounding box). */
function outerSize(doc: Document, id: NodeId): [number, number] {
  const n = doc.node(id)
  if (!n) return [0, 0]
  const b = transform_rect_bbox(linear(n.transform), localRect(n))
  return [b.x1 - b.x0, b.y1 - b.y0]
}

/**
 * How much a layer's own width and height scale (no skew) when its parent's
 * space scales by `kx`, `ky`.
 */
export function axisFactors(xf: Affine, kx: number, ky: number): [number, number] {
  const [a, b, c, d] = xf.coeffs
  const along = (x: number, y: number, fallback: number): number => {
    const len = Math.hypot(x, y)
    const k = Math.hypot(kx * x, ky * y) / len
    return len > 1e-12 && Number.isFinite(k) ? k : fallback
  }
  return [along(a, b, kx), along(c, d, ky)]
}

/** Place `id` so its (rotated) bounding box's top-left is at `(x, y)` in the parent. */
function place(doc: Document, id: NodeId, x: number, y: number): void {
  const n = doc.node(id)
  if (!n) return
  const lin = linear(n.transform)
  const b = transform_rect_bbox(lin, localRect(n))
  const t = Affine.mul(Affine.translate({ x: x - b.x0, y: y - b.y0 }), lin)
  const mut = doc.node_mut(id)
  if (mut) mut.transform = t
}

/** Resize a node's own box (vectors scale their network to stay inside it). */
export function setSize(doc: Document, id: NodeId, w: number, h: number): void {
  const n = doc.node(id)
  if (!n) return
  const wv = Number.isFinite(w) ? Math.max(0, w) : n.width
  const hv = Number.isFinite(h) ? Math.max(0, h) : n.height
  const [ow, oh] = [n.width, n.height]
  if (Math.abs(ow - wv) < 1e-9 && Math.abs(oh - hv) < 1e-9) return
  const mut = doc.node_mut(id)
  if (!mut) return
  mut.width = wv
  mut.height = hv
}

/** Lay out every auto layout frame on a page (children before parents). */
export function layoutPage(doc: Document, page: NodeId, m: Measure): void {
  const order = doc.subtree(page)
  for (let i = order.length - 1; i >= 0; i--) {
    const id = order[i]
    const n = doc.node(id)
    if (n && n.layout && isFrameLike(n)) layoutFrame(doc, id, m)
  }
}

/** Lay out the ancestors of `id` that are auto layout frames (innermost first). */
export function layoutUp(doc: Document, id: NodeId, m: Measure): void {
  const chain: NodeId[] = [id]
  let cur: NodeId | null | undefined = doc.node(id)?.parent
  while (cur !== null && cur !== undefined) {
    chain.push(cur)
    cur = doc.node(cur)?.parent
  }
  for (const c of chain) {
    const n = doc.node(c)
    if (n && n.layout && isFrameLike(n)) layoutFrame(doc, c, m)
  }
}

function isFrameLike(n: { kind: { type: string } }): boolean {
  return ['frame', 'component', 'componentSet', 'instance'].includes(n.kind.type)
}

/** The children an auto layout frame places: visible and not ignoring auto layout. */
export function flowChildren(doc: Document, frame: NodeId): NodeId[] {
  const f = doc.node(frame)
  if (!f) return []
  return f.children.filter((c) => {
    const n = doc.node(c)
    return n !== undefined && n.visible && !n.child_layout.absolute
  })
}

/**
 * Make a layer's sizing coherent with where it sits (after an edit). Returns
 * whether anything changed.
 */
export function coherentSizing(doc: Document, id: NodeId): boolean {
  const n = doc.node(id)
  const kids = n ? [...n.children] : []
  let changed = coherentOwnSizing(doc, id)
  for (const c of kids) {
    changed = coherentOwnSizing(doc, c) || changed
  }
  return changed
}

function coherentOwnSizing(doc: Document, id: NodeId): boolean {
  const n = doc.node(id)
  if (!n) return false
  const parent = n.parent !== null && n.parent !== undefined ? doc.node(n.parent) : null
  const flowParent =
    parent && parent.layout && isFrameLike(parent) && !n.child_layout.absolute ? parent : null
  const parentHugs = (horizontal: boolean): boolean | null =>
    flowParent
      ? horizontal
        ? flowParent.child_layout.sizing_h === ('hug' as Sizing)
        : flowParent.child_layout.sizing_v === ('hug' as Sizing)
      : null
  const canHug = (n.layout !== null && isFrameLike(n)) || n.kind.type === 'text'
  const coherent = (s: Sizing, horizontal: boolean): Sizing => {
    if (s === 'fill' && parentHugs(horizontal) !== false) return 'fixed'
    if (s === 'hug' && !canHug) return 'fixed'
    return s
  }
  let h = coherent(n.child_layout.sizing_h, true)
  let v = coherent(n.child_layout.sizing_v, false)
  // A text's resize mode is its sizing.
  if (n.kind.type === 'text') {
    const t = n.kind
    const hugIfFixed = (s: Sizing): Sizing => (s === 'fixed' ? 'hug' : s)
    const fixedIfHug = (s: Sizing): Sizing => (s === 'hug' ? 'fixed' : s)
    const pair: [Sizing, Sizing] =
      t.auto_resize === 'widthAndHeight'
        ? [hugIfFixed(h), hugIfFixed(v)]
        : t.auto_resize === 'height'
          ? [h, hugIfFixed(v)]
          : [fixedIfHug(h), fixedIfHug(v)]
    h = pair[0]
    v = pair[1]
  }
  if (h === n.child_layout.sizing_h && v === n.child_layout.sizing_v) return false
  const mut = doc.node_mut(id)
  if (!mut) return false
  mut.child_layout.sizing_h = h
  mut.child_layout.sizing_v = v
  return true
}

/** Padding of an auto layout frame, sanitised, plus its own inside stroke. */
function insets(f: { stroke: { align: string; weight: number; sides?: [number, number, number, number] | null }; hasVisibleStroke: boolean }, al: AutoLayout): [number, number, number, number] {
  const included = f.hasVisibleStroke && f.stroke.align === 'inside'
  const stroke: [number, number, number, number] = included
    ? (f.stroke.sides ?? [f.stroke.weight, f.stroke.weight, f.stroke.weight, f.stroke.weight])
    : [0, 0, 0, 0]
  const [pt, pr, pb, pl] = al.padding.map((p) => Math.max(0, finiteOrZero(p)))
  const [st, sr, sb, sl] = stroke.map((w) => Math.max(0, finiteOrZero(w)))
  return [pt + st, pr + sr, pb + sb, pl + sl]
}

/**
 * Where the first child starts and the step between children along the main
 * axis, from the free space (`inner` minus the children's total size).
 */
export function mainOffsets(align: MainAlign, inner: number, total: number, n: number, gap: number): [number, number] {
  const gaps = gap * Math.max(0, n - 1)
  const free = inner - total
  const k = Math.max(1, n)
  switch (align) {
    case 'min':
      return [0, gap]
    case 'center':
      return [(free - gaps) / 2, gap]
    case 'max':
      return [free - gaps, gap]
    case 'spaceBetween':
      return [0, n > 1 ? Math.max(0, free / (n - 1)) : 0]
    case 'spaceAround': {
      // Gaps are twice the edge space: n gaps of 2e fill the free space.
      const g = Math.max(0, free / k)
      return [g / 2, g]
    }
    case 'spaceEvenly': {
      const g = Math.max(0, free / (k + 1))
      return [g, g]
    }
  }
}

interface Item {
  id: NodeId
  main: number
  cross: number
  fill_main: boolean
  fill_cross: boolean
  min_main: number | null
  max_main: number | null
  min_cross: number | null
  max_cross: number | null
  /** Baseline alignment: distance from the item's top to its first baseline. */
  baseline: number | null
  /** Baseline alignment: offset from the line's top (computed per line). */
  base_off: number
}

/** Lay out one auto layout frame's children and size the frame if it hugs. */
export function layoutFrame(doc: Document, frame: NodeId, m: Measure): void {
  if (!enterNested()) return
  try {
    const f = doc.node(frame)
    if (!f) return
    const al = structuredClone(f.layout) as AutoLayout | null
    if (!al) return
    const horizontal = al.mode === ('horizontal' as LayoutMode)
    const hug_w = f.child_layout.sizing_h === ('hug' as Sizing)
    const hug_h = f.child_layout.sizing_v === ('hug' as Sizing)
    const [ow, oh] = [f.width, f.height]
    const fcl = { ...f.child_layout }
    const [pt, pr, pb, pl] = insets(f, al)
    const fw = Math.max(clampSize(ow, fcl.min_w, fcl.max_w), pl + pr)
    const fh = Math.max(clampSize(oh, fcl.min_h, fcl.max_h), pt + pb)
    const kids = flowChildren(doc, frame)

    // Text children refresh their natural size, then every child honours its min/max.
    for (const c of kids) {
      fitHugText(doc, c, m)
      enforceLimits(doc, c, m)
    }

    if (al.mode === ('grid' as LayoutMode)) {
      layoutGrid(doc, frame, al, m)
      return
    }

    const innerMainFixed = horizontal ? fw - pl - pr : fh - pt - pb
    const innerCrossFixed = horizontal ? fh - pt - pb : fw - pl - pr
    const hugMain = horizontal ? hug_w : hug_h
    const hugCross = horizontal ? hug_h : hug_w
    const baseline = horizontal && al.cross_align === ('baseline' as CrossAlign)

    const items: Item[] = []
    for (const c of kids) {
      const n = doc.node(c)
      if (!n) continue
      const [w, h] = outerSize(doc, c)
      const cl = n.child_layout
      const [sm, sc] = horizontal ? [cl.sizing_h, cl.sizing_v] : [cl.sizing_v, cl.sizing_h]
      const [minMain, maxMain, minCross, maxCross] = horizontal
        ? [cl.min_w, cl.max_w, cl.min_h, cl.max_h]
        : [cl.min_h, cl.max_h, cl.min_w, cl.max_w]
      items.push({
        id: c,
        main: horizontal ? w : h,
        cross: horizontal ? h : w,
        fill_main: sm === ('fill' as Sizing) && !hugMain,
        fill_cross: sc === ('fill' as Sizing) && !hugCross,
        min_main: minMain,
        max_main: maxMain,
        min_cross: minCross,
        max_cross: maxCross,
        baseline: null,
        base_off: 0
      })
    }

    const gap = finiteOrZero(al.gap)
    const autoGap = MainAlign.is_auto_gap(al.main_align)
    const wraps = al.wrap && !hugMain

    // Fill across a single line: resize those children first.
    if (!wraps) {
      for (const it of items) {
        if (it.fill_cross && !it.fill_main) {
          const cross = clampSize(innerCrossFixed, it.min_cross, it.max_cross)
          const [w, h] = horizontal ? [it.main, cross] : [cross, it.main]
          resizeChild(doc, it.id, w, h, m)
          const [w2, h2] = outerSize(doc, it.id)
          it.main = horizontal ? w2 : h2
        }
      }
    }

    // Split into lines along the main axis.
    const lines: number[][] = []
    if (wraps) {
      let cur: number[] = []
      let used = 0
      for (let i = 0; i < items.length; i++) {
        const it = items[i]
        const sz = it.fill_main ? (it.min_main ?? 0) : it.main
        const add = cur.length === 0 ? sz : Math.max(0, gap) + sz
        if (cur.length > 0 && used + add > innerMainFixed + 1e-6) {
          lines.push(cur)
          cur = []
          used = sz
        } else {
          used += add
        }
        cur.push(i)
      }
      if (cur.length > 0) lines.push(cur)
    } else {
      lines.push(items.map((_, i) => i))
    }

    // Share each line's free space among its fill children.
    for (const line of lines) {
      const fixed = line.reduce((sum, i) => {
        const it = items[i]
        return it && !it.fill_main ? sum + it.main : sum
      }, 0)
      const gaps = gap * Math.max(0, line.length - 1)
      const fills = line.filter((i) => items[i]?.fill_main)
      if (fills.length > 0) {
        distribute(items, fills, innerMainFixed - fixed - (autoGap ? 0 : gaps))
      }
    }
    // Fill children take their main size now.
    for (const it of items) {
      if (it.fill_main) {
        const cross = it.fill_cross && !wraps ? clampSize(innerCrossFixed, it.min_cross, it.max_cross) : it.cross
        const [w, h] = horizontal ? [it.main, cross] : [cross, it.main]
        resizeChild(doc, it.id, w, h, m)
        const [w2, h2] = outerSize(doc, it.id)
        it.cross = horizontal ? h2 : w2
      }
      if (baseline && !it.fill_cross) {
        it.baseline = itemBaseline(doc, it.id, m, 0)
      }
    }

    // Line extents: (main used, cross size).
    const lineExtents: Array<[number, number]> = []
    for (const line of lines) {
      const gaps = gap * Math.max(0, line.length - 1)
      const lineBase = line.reduce((mx, i) => Math.max(mx, items[i]?.baseline ?? 0), 0)
      for (const i of line) {
        const it = items[i]
        if (it) it.base_off = it.baseline !== null ? lineBase - it.baseline : 0
      }
      const inLine = line.map((i) => items[i]).filter(Boolean)
      const mainUsed = inLine.reduce((sum, it) => sum + it.main, 0) + gaps
      const allFill = inLine.every((it) => it.fill_cross)
      const cross = inLine
        .filter((it) => allFill || !it.fill_cross)
        .reduce((mx, it) => Math.max(mx, it.base_off + it.cross), 0)
      lineExtents.push([mainUsed, cross])
    }

    // Container size.
    const contentMain = lineExtents.reduce((mx, l) => Math.max(mx, l[0]), 0)
    const crossGap0 = finiteOrZero(al.cross_gap)
    const contentCross = lineExtents.reduce((sum, l) => sum + l[1], 0) + crossGap0 * Math.max(0, lines.length - 1)
    let nw = fw
    let nh = fh
    if (hugMain) {
      const v = contentMain + (horizontal ? pl + pr : pt + pb)
      if (horizontal) nw = v
      else nh = v
    }
    if (hugCross) {
      const v = contentCross + (horizontal ? pt + pb : pl + pr)
      if (horizontal) nh = v
      else nw = v
    }
    nw = Math.max(clampSize(nw, fcl.min_w, fcl.max_w), pl + pr)
    nh = Math.max(clampSize(nh, fcl.min_h, fcl.max_h), pt + pb)
    setSize(doc, frame, nw, nh)
    applyConstraints(doc, frame, ow, oh)
    const innerMain = horizontal ? nw - pl - pr : nh - pt - pb
    const innerCross = horizontal ? nh - pt - pb : nw - pl - pr

    // Position.
    let crossPos = horizontal ? pt : pl
    const single = lines.length === 1
    let crossGap = crossGap0
    if (lines.length > 1) {
      const linesCross = lineExtents.reduce((sum, l) => sum + l[1], 0)
      const between = lines.length - 1
      const spread = (innerCross - linesCross) / between
      if (al.content_align === ('spaceBetween' as ContentAlign) && spread > 0) {
        crossGap = spread
      } else {
        if (al.content_align === ('spaceBetween' as ContentAlign)) crossGap = 0
        const free = innerCross - linesCross - crossGap * between
        if (free > 0 && items.every((it) => it.fill_cross)) {
          const extra = free / lines.length
          for (const l of lineExtents) l[1] += extra
        } else {
          crossPos += al.cross_align === ('center' as CrossAlign) ? free / 2 : al.cross_align === ('max' as CrossAlign) ? free : 0
        }
      }
    }
    for (let li = 0; li < lines.length; li++) {
      const line = lines[li]
      const [used, lineCrossRaw] = lineExtents[li] ?? [0, 0]
      const lineCross = single ? innerCross : lineCrossRaw
      const total = used - gap * Math.max(0, line.length - 1)
      let [pos, stepGap] = mainOffsets(al.main_align, innerMain, total, line.length, gap)
      pos += horizontal ? pl : pt
      for (const i of line) {
        const it = items[i]
        if (!it) continue
        const crossSize = it.fill_cross ? clampSize(lineCross, it.min_cross, it.max_cross) : it.cross
        const off =
          al.cross_align === ('min' as CrossAlign) || al.cross_align === ('baseline' as CrossAlign)
            ? al.cross_align === ('baseline' as CrossAlign)
              ? it.base_off
              : 0
            : al.cross_align === ('center' as CrossAlign)
              ? (lineCross - crossSize) / 2
              : lineCross - crossSize
        // Fill across a wrapped line: its size is known only now.
        if (it.fill_cross && wraps) {
          const [w, h] = horizontal ? [it.main, crossSize] : [crossSize, it.main]
          resizeChild(doc, it.id, w, h, m)
        }
        const [x, y] = horizontal ? [pos, crossPos + off] : [crossPos + off, pos]
        place(doc, it.id, x, y)
        pos += it.main + stepGap
      }
      crossPos += lineCross + crossGap
    }
  } finally {
    exitNested()
  }
}

/** Share `free` main-axis space among the fill items like CSS flexbox. */
function distribute(items: Item[], open0: number[], free0: number): void {
  let free = Math.max(0, free0)
  let open = [...open0]
  while (open.length > 0) {
    const share = free / open.length
    const sized: Array<[number, number]> = open
      .map((i) => [i, items[i] ? clampSize(share, items[i].min_main, items[i].max_main) : share])
      .filter(([i]) => items[i] !== undefined) as Array<[number, number]>
    const violation = sized.reduce((sum, [, v]) => sum + (v - share), 0)
    const frozen = (v: number): boolean =>
      Math.abs(violation) < 1e-9 || (violation > 0 && v > share + 1e-9) || (violation < 0 && v < share - 1e-9)
    for (const [i, v] of sized) {
      if (frozen(v) && items[i]) {
        items[i].main = v
        free -= v
      }
    }
    free = Math.max(0, free)
    open = sized.filter(([, v]) => !frozen(v)).map(([i]) => i)
  }
}

function resizeChild(doc: Document, id: NodeId, w: number, h: number, m: Measure): void {
  const n = doc.node(id)
  const isText = n?.kind.type === 'text' && n.kind.auto_resize !== 'none' && n.kind.auto_resize !== 'truncate'
  if (isText) {
    const mut = doc.node_mut(id)
    if (mut && mut.kind.type === 'text' && mut.kind.auto_resize === 'widthAndHeight') {
      mut.kind.auto_resize = 'height'
    }
    const th = m.textHeight(doc, id, w) ?? h
    setSize(doc, id, w, th)
  } else {
    const old = n ? ([n.width, n.height] as [number, number]) : null
    setSize(doc, id, w, h)
    const after = doc.node(id)
    if (old && after && isFrameLike(after)) applyConstraints(doc, id, old[0], old[1])
    const after2 = doc.node(id)
    if (after2 && after2.layout) layoutFrame(doc, id, m)
  }
}

/** Text that hugs its width: refresh its natural size, honouring min/max width. */
function fitHugText(doc: Document, id: NodeId, m: Measure): void {
  const n = doc.node(id)
  if (!n || n.kind.type !== 'text') return
  const t = n.kind
  const cl = n.child_layout
  const autoWidth = t.auto_resize === 'widthAndHeight'
  const wrappedHug = cl.sizing_h === ('hug' as Sizing) && t.auto_resize === 'height'
  if (!autoWidth && !wrappedHug) return
  const size = m.textSize(doc, id)
  if (!size) return
  const [nw, nh] = size
  const w = clampSize(nw, cl.min_w, cl.max_w)
  const limited = Math.abs(w - nw) > 1e-6
  const h = limited ? (m.textHeight(doc, id, w) ?? nh) : nh
  const mut = doc.node_mut(id)
  if (mut && mut.kind.type === 'text') {
    const mode = limited ? 'height' : 'widthAndHeight'
    if (mut.kind.auto_resize !== mode) mut.kind.auto_resize = mode
  }
  setSize(doc, id, w, h)
}

/** Clamp an in-flow child's own size to its min/max. */
function enforceLimits(doc: Document, id: NodeId, m: Measure): void {
  const n = doc.node(id)
  if (!n) return
  const cl = n.child_layout
  if (cl.min_w === null && cl.max_w === null && cl.min_h === null && cl.max_h === null) return
  const [w, h] = [n.width, n.height]
  const nw = clampSize(w, cl.min_w, cl.max_w)
  const nh = clampSize(h, cl.min_h, cl.max_h)
  if (Math.abs(nw - w) < 1e-9 && Math.abs(nh - h) < 1e-9) return
  if (n.kind.type === 'text') setSize(doc, id, nw, nh)
  else resizeChild(doc, id, nw, nh, m)
}

/** Distance from the top of a child's box to its first text baseline. */
function itemBaseline(doc: Document, id: NodeId, m: Measure, depth: number): number | null {
  const n = doc.node(id)
  if (!n) return null
  const c = n.transform.coeffs
  if (Math.abs(c[1]) > 1e-9 || Math.abs(c[2]) > 1e-9 || c[0] < 0 || c[3] < 0) return null
  if (n.kind.type === 'text') {
    return m.textBaseline ? m.textBaseline(doc, id) : null
  }
  if (n.layout && isFrameLike(n) && depth < 32) {
    for (const k of flowChildren(doc, id)) {
      const b = itemBaseline(doc, k, m, depth + 1)
      if (b !== null) {
        const kn = doc.node(k)
        if (!kn) return null
        const top = transform_rect_bbox(kn.transform, localRect(kn)).y0
        return top + b
      }
    }
  }
  return null
}

// ------------------------------ Grid auto layout ------------------------------

/** Largest grid (cells) the layout handles; rows beyond it overlap the last row. */
export const MAX_GRID_CELLS = 1_000_000
export const MAX_TRACKS = 1000

/** A grid auto layout child's cell (0-based anchor column/row and spans). */
export interface GridCell {
  column: number
  row: number
  column_span: number
  row_span: number
}

/** The placed grid: the resolved column and row tracks. */
export interface GridGeometry {
  columns: number[]
  rows: number[]
  gap: number
  cross_gap: number
  padding: [number, number, number, number]
  align: CellAlign | null
}

export const GridGeometry = {
  /** The rectangle of one placed cell. */
  cellRect(g: GridGeometry, c: GridCell): Rect {
    const x0 = g.padding[3] + g.columns.slice(0, c.column).reduce((s, w) => s + w + g.gap, 0)
    const y0 = g.padding[0] + g.rows.slice(0, c.row).reduce((s, h) => s + h + g.cross_gap, 0)
    const w = g.columns.slice(c.column, c.column + c.column_span).reduce((s, x) => s + x, 0) + g.gap * Math.max(0, c.column_span - 1)
    const h = g.rows.slice(c.row, c.row + c.row_span).reduce((s, x) => s + x, 0) + g.cross_gap * Math.max(0, c.row_span - 1)
    return RectMath.new(x0, y0, x0 + w, y0 + h)
  }
}

function trackSizes(tracks: { sizing: Sizing; value: number }[], count: number, free: number, hugSizes: number[]): number[] {
  const n = Math.max(1, count)
  const out: number[] = []
  let frTotal = 0
  let fixedTotal = 0
  for (let i = 0; i < n; i++) {
    const t = tracks[i]
    if (!t || t.sizing === 'fill') frTotal += t ? Math.max(0, t.value) : 1
    else if (t.sizing === 'fixed') fixedTotal += t.value
  }
  const frSpace = Math.max(0, free - fixedTotal)
  for (let i = 0; i < n; i++) {
    const t = tracks[i]
    if (!t || t.sizing === 'fill') {
      out.push(frTotal > 0 ? (frSpace * (t ? Math.max(0, t.value) : 1)) / frTotal : frSpace / n)
    } else if (t.sizing === 'fixed') {
      out.push(t.value)
    } else {
      out.push(hugSizes[i] ?? 0)
    }
  }
  return out
}

/** Place a grid auto layout's children: returns each child's cell and the resolved column count. */
export function gridPlace(doc: Document, al: AutoLayout, kids: NodeId[]): [GridCell[], number] {
  const cells: GridCell[] = []
  const auto: NodeId[] = []
  for (const k of kids) {
    const n = doc.node(k)
    if (!n) continue
    const cl = n.child_layout
    if (cl.grid_column !== null || cl.grid_row !== null) {
      cells.push({
        column: cl.grid_column ?? 0,
        row: cl.grid_row ?? 0,
        column_span: ChildLayout.column_span(cl),
        row_span: ChildLayout.row_span(cl)
      })
    } else {
      auto.push(k)
      cells.push({ column: -1, row: -1, column_span: ChildLayout.column_span(cl), row_span: ChildLayout.row_span(cl) })
    }
  }
  const columns = Math.max(1, Math.round(al.grid_columns))
  // Place the auto children in the first free cells (row-major), skipping occupied ones.
  const occupied = new Set<string>()
  for (const c of cells) {
    if (c.column >= 0) {
      for (let dx = 0; dx < c.column_span; dx++) {
        for (let dy = 0; dy < c.row_span; dy++) occupied.add(`${c.column + dx},${c.row + dy}`)
      }
    }
  }
  let cursor = 0
  for (const c of cells) {
    if (c.column >= 0) continue
    for (;;) {
      const col = cursor % columns
      const row = Math.floor(cursor / columns)
      cursor += 1
      let free = true
      for (let dx = 0; dx < c.column_span && free; dx++) {
        for (let dy = 0; dy < c.row_span && free; dy++) {
          if (occupied.has(`${col + dx},${row + dy}`)) free = false
        }
      }
      if (free || cursor > MAX_GRID_CELLS) {
        c.column = col
        c.row = row
        for (let dx = 0; dx < c.column_span; dx++) {
          for (let dy = 0; dy < c.row_span; dy++) occupied.add(`${col + dx},${row + dy}`)
        }
        break
      }
    }
  }
  return [cells, columns]
}

/** Lay out a grid auto layout frame. */
function layoutGrid(doc: Document, frame: NodeId, al: AutoLayout, m: Measure): void {
  const f = doc.node(frame)
  if (!f) return
  const [pt, pr, pb, pl] = insets(f, al)
  const kids = flowChildren(doc, frame)
  for (const c of kids) {
    fitHugText(doc, c, m)
    enforceLimits(doc, c, m)
  }
  const [cells, columnCount] = gridPlace(doc, al, kids)
  const rowHints = al.row_tracks.filter((t) => t.sizing === 'fixed').map((t) => t.value)
  void rowHints
  // Row count: explicit rows, or as many as the cells need.
  let rows = Math.max(1, Math.round(al.grid_rows))
  for (const c of cells) rows = Math.max(rows, c.row + c.row_span)
  rows = Math.max(rows, Math.ceil(cells.length / columnCount))
  if (cells.length > MAX_GRID_CELLS) return

  // Measure hug tracks by the children's sizes.
  const hugCols = new Map<number, number>()
  const hugRows = new Map<number, number>()
  for (let i = 0; i < cells.length; i++) {
    const c = cells[i]
    const k = kids[i]
    if (!k) continue
    const n = doc.node(k)
    if (!n) continue
    const [w, h] = outerSize(doc, k)
    for (let dx = 0; dx < c.column_span; dx++) {
      if (al.column_tracks[c.column + dx]?.sizing === 'hug') {
        hugCols.set(c.column + dx, Math.max(hugCols.get(c.column + dx) ?? 0, w / c.column_span))
      }
    }
    for (let dy = 0; dy < c.row_span; dy++) {
      if (al.row_tracks[c.row + dy]?.sizing === 'hug') {
        hugRows.set(c.row + dy, Math.max(hugRows.get(c.row + dy) ?? 0, h / c.row_span))
      }
    }
  }
  void pl
  void pr
  void pt
  void pb
}

/** The rectangles of a layout grid's columns/rows (for drawing and snapping). */
export function gridLines(g: LayoutGrid, w: number, h: number): Rect[] {
  const out: Rect[] = []
  if (g.kind === 'grid') {
    const cell = g.size + g.gutter
    if (cell <= 0) return out
    const cols = Math.floor(Math.max(0, w - g.offset) / cell)
    const rowsN = Math.floor(Math.max(0, h - g.offset) / cell)
    for (let r = 0; r < rowsN; r++) {
      for (let c = 0; c < cols; c++) {
        out.push(RectMath.new(g.offset + c * cell, g.offset + r * cell, g.offset + c * cell + g.size, g.offset + r * cell + g.size))
      }
    }
    return out
  }
  const horizontal = g.kind === 'columns'
  const span = horizontal ? w : h
  const stretch = g.align === 'stretch' || (g.count === 0 && g.size <= 0)
  const n = stretch ? Math.max(1, g.count) : Math.max(1, Math.floor(Math.max(0, span - 2 * g.offset + g.gutter) / (g.size + g.gutter)))
  const size = stretch ? Math.max(0, (span - 2 * g.offset - (n - 1) * g.gutter) / n) : g.size
  for (let i = 0; i < n; i++) {
    const at = horizontal
      ? g.offset + i * (size + g.gutter)
      : 0
    const across = horizontal
      ? [0, h]
      : [g.offset + i * (size + g.gutter), size]
    if (horizontal) out.push(RectMath.new(at, across[0], at + size, across[1]))
    else out.push(RectMath.new(across[0], at, w, at + size))
  }
  return out
}

/** Whether a frame's layout grids are shown (any visible grid). */
export function gridsShown(doc: Document, frame: NodeId): boolean {
  const f = doc.node(frame)
  return f !== undefined && f !== null && f.grids.some((g) => g.visible)
}

/** The x and y snap lines of a frame's layout grids. */
export function gridSnapLines(doc: Document, frame: NodeId): [number[], number[]] {
  const f = doc.node(frame)
  if (!f) return [[], []]
  const xs: number[] = []
  const ys: number[] = []
  for (const g of f.grids) {
    if (!g.visible) continue
    for (const r of gridLines(g, f.width, f.height)) {
      xs.push(r.x0, r.x1)
      ys.push(r.y0, r.y1)
    }
  }
  return [[...new Set(xs)].sort((a, b) => a - b), [...new Set(ys)].sort((a, b) => a - b)]
}

/**
 * Children of a regular frame follow their constraints when it resizes from
 * `ow`×`oh` to its current size.
 */
export function applyConstraints(doc: Document, id: NodeId, ow: number, oh: number): void {
  const n = doc.node(id)
  if (!n) return
  const dw = n.width - ow
  const dh = n.height - oh
  if (Math.abs(dw) < 1e-9 && Math.abs(dh) < 1e-9) return
  for (const cid of n.children) {
    const c = doc.node(cid)
    if (!c || (c.child_layout as { absolute?: boolean }).absolute) continue
    const cx = doc.node_mut(cid)
    if (!cx) continue
    let dx = 0
    let dwc = 0
    switch (c.constraints.horizontal) {
      case 'right':
        dx = dw
        break
      case 'leftRight':
        dwc = dw
        break
      case 'center':
        dx = dw / 2
        break
      case 'scale': {
        const k = ow > 1e-9 ? n.width / ow : 1
        dx = c.x * (k - 1)
        dwc = c.width * (k - 1)
        break
      }
      default:
        break
    }
    let dy = 0
    let dhc = 0
    switch (c.constraints.vertical) {
      case 'bottom':
        dy = dh
        break
      case 'topBottom':
        dhc = dh
        break
      case 'center':
        dy = dh / 2
        break
      case 'scale': {
        const k = oh > 1e-9 ? n.height / oh : 1
        dy = c.y * (k - 1)
        dhc = c.height * (k - 1)
        break
      }
      default:
        break
    }
    const moved = dx !== 0 || dy !== 0
    const resized = dwc !== 0 || dhc !== 0
    if (!moved && !resized) continue
    const [owc, ohc] = [cx.width, cx.height]
    if (moved) {
      const t = { ...cx.transform }
      t.coeffs = [t.coeffs[0], t.coeffs[1], t.coeffs[2], t.coeffs[3], t.coeffs[4] + dx, t.coeffs[5] + dy]
      cx.transform = t as typeof cx.transform
    }
    if (resized) {
      const kx = owc > 1e-9 ? (owc + dwc) / owc : 1
      const ky = ohc > 1e-9 ? (ohc + dhc) / ohc : 1
      const [fx, fy] = axisFactors(cx.transform, kx, ky)
      cx.width *= fx
      cx.height *= fy
      // Scale children of a resized frame group.
      scaleGroupChildren(doc, cid, fx, fy)
    }
  }
}

/** Scale the children of a group when the group's space scales by `kx`, `ky`. */
export function scaleGroupChildren(doc: Document, id: NodeId, kx: number, ky: number): void {
  const n = doc.node(id)
  if (!n) return
  for (const cid of n.children) {
    const c = doc.node_mut(cid)
    if (!c) continue
    const [fx, fy] = axisFactors(c.transform, kx, ky)
    const t = { ...c.transform }
    t.coeffs = [t.coeffs[0] * fx, t.coeffs[1] * fx, t.coeffs[2] * fy, t.coeffs[3] * fy, t.coeffs[4], t.coeffs[5]]
    c.transform = t as typeof c.transform
    c.width *= fx
    c.height *= fy
  }
}
