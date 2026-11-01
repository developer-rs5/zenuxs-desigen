/**
 * Keep derived state consistent after edits: text boxes resize to their
 * content, groups wrap their children, instances follow their main components,
 * auto layout re-flows.
 * (Converted from FigCraft `crates/engine/src/lib.rs::normalize`; the stages it
 * reaches through style/variable/component/comment modules are covered by the
 * Zenuxs equivalents noted inline.)
 */

import { Node, TextData, textOf, type Document, type NodeId, type NodeT } from '@zenuxs/doc'
import { coherentSizing, layoutFrame, setSize, type Measure } from '@zenuxs/layout'
import { textHeight, textSize, type Shaper } from '@zenuxs/text'

/** How a text node's box should follow its content, or null when it doesn't. */
export function autoSize(n: NodeT, shaper?: Shaper): [number, number] | null {
  if (n.kind.type !== 'text') return null
  const t = textOf(n.kind)
  if (t.path !== null) return null
  if (t.auto_resize === 'widthAndHeight') {
    const [w, h] = textSize(t, shaper)
    return [Math.max(1, Math.ceil(w)), Math.max(1, h)]
  }
  if (t.auto_resize === 'height') return [n.width, Math.max(1, textHeight(t, n.width, shaper))]
  return null
}

/** The layout measure for the current shaper. */
export function textMeasure(shaper?: Shaper): Measure {
  return {
    textHeight(doc: Document, id: NodeId, width: number): number | null {
      const n = doc.node(id)
      if (!n || n.kind.type !== 'text') return null
      return textHeight(textOf(n.kind), width, shaper)
    },
    textSize(doc: Document, id: NodeId): [number, number] | null {
      const n = doc.node(id)
      if (!n || n.kind.type !== 'text') return null
      return textSize(textOf(n.kind), shaper)
    }
  }
}

/** Whether `id` changed in a way that can move or resize layers around it. */
export function affectsLayout(before: Document, doc: Document, id: NodeId): boolean {
  const a = before.node(id)
  const b = doc.node(id)
  if (!a || !b) return true
  return (
    a.width !== b.width ||
    a.height !== b.height ||
    a.transform !== b.transform ||
    a.visible !== b.visible ||
    a.parent !== b.parent ||
    a.children !== b.children ||
    a.layout !== b.layout ||
    a.child_layout !== b.child_layout ||
    a.stroke !== b.stroke ||
    a.strokes.length !== b.strokes.length ||
    !sameKind(a, b)
  )
}

function sameKind(a: NodeT, b: NodeT): boolean {
  return JSON.stringify(a.kind) === JSON.stringify(b.kind)
}

/** Keep derived state consistent after an edit. See the module comment. */
export function normalize(doc: Document, before: Document, shaper?: Shaper): void {
  // Only what was touched since the last normalisation (edited, added or removed).
  const touched = doc.take_dirty()
  if (touched.size === 0) return
  const measure = textMeasure(shaper)
  const live = (t: Set<NodeId>): NodeId[] => [...t].filter((i) => doc.contains(i))

  // 0b. Fill and hug only where they can apply (a layer moved out of auto layout, a parent that
  // started to hug or lost auto layout): the rest becomes fixed at its current size.
  for (const id of live(touched)) coherentSizing(doc, id)
  for (const id of doc.take_dirty()) touched.add(id)

  // 1. Text auto-size.
  for (const id of live(touched)) {
    const n = doc.node(id)
    if (!n) continue
    const size = autoSize(n, shaper)
    if (size !== null && (Math.abs(size[0] - n.width) > 1e-6 || Math.abs(size[1] - n.height) > 1e-6)) {
      setSize(doc, id, size[0], size[1])
    }
  }
  for (const id of doc.take_dirty()) touched.add(id)

  // Parents of removed nodes (as they were before) count as touched.
  const removedParents: NodeId[] = []
  for (const i of touched) {
    if (doc.contains(i)) continue
    const p = before.node(i)?.parent
    if (p !== null && p !== undefined && doc.contains(p)) removedParents.push(p)
  }

  // 3. Groups / booleans wrap their children.
  const fit = new Set<NodeId>()
  for (const id of [...live(touched), ...removedParents]) {
    const n = doc.node(id)
    if (n && Node.bounds_follow_children(n.kind)) fit.add(id)
    for (const a of doc.ancestors(id)) {
      const an = doc.node(a)
      if (an && Node.bounds_follow_children(an.kind)) fit.add(a)
      else break
    }
  }
  const deepest = (ids: Iterable<NodeId>): NodeId[] =>
    [...ids].sort((a, b) => doc.ancestors(b).length - doc.ancestors(a).length)
  for (const id of deepest(fit)) {
    const n = doc.node(id)
    if (!n) continue
    if (n.children.length === 0) doc.remove(id)
    else doc.fit_to_children(id)
  }
  for (const id of doc.take_dirty()) touched.add(id)

  // 4. Auto layout for frames where something that sizes or places layers changed.
  const frames = new Set<NodeId>()
  for (const id of [...live(touched).filter((i) => affectsLayout(before, doc, i)), ...removedParents]) {
    if (!doc.contains(id)) continue
    for (const c of [id, ...doc.ancestors(id)]) {
      const cn = doc.node(c)
      if (cn && cn.layout !== null) frames.add(c)
    }
  }
  for (const f of deepest(frames)) {
    // Layers the layout leaves where they were stay untouched.
    const fNode = doc.node(f)
    if (!fNode) continue
    const kept: Array<[NodeT, boolean]> = []
    for (const i of [f, ...fNode.children]) {
      const n = doc.node(i)
      if (!n) continue
      kept.push([structuredClone(n), doc.dirty.ids.has(i)])
    }
    layoutFrame(doc, f, measure)
    for (const [old, wasDirty] of kept) doc.keep_if_unchanged(old, wasDirty)
  }
  for (const id of doc.take_dirty()) touched.add(id)

  // Drain whatever is left: callers read the dirty set for their own passes.
  doc.take_dirty()
}

export type { TextData }
