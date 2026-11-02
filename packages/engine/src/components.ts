/**
 * Component ownership queries shared by commands that must not edit inside an
 * instance. (Converted 1:1 from FigCraft `crates/engine/src/components.rs`.)
 */

import type { Document, Node, NodeId } from '@zenuxs/doc'

/** The override that marks a node as holding an instance's own content. */
export const SLOT = 'slot'

function holdsContent(n: { overrides: Set<string> }): boolean {
  return n.overrides.has(SLOT)
}

/**
 * `id` and its ancestors, up to the nearest slot above it that holds an
 * instance's own content: content belongs to no instance.
 */
function scope(doc: Document, id: NodeId): NodeId[] {
  const out: NodeId[] = [id]
  for (const a of doc.ancestors(id)) {
    const n = doc.node(a)
    if (n && holdsContent(n)) break
    out.push(a)
  }
  return out
}

export function isInstance(doc: Document, id: NodeId): boolean {
  return doc.node(id)?.kind.type === 'instance'
}

/** Deepest walk of a component chain before giving up. */
const MAX_DEPTH = 256

/**
 * Whether `id` stands for a slot property of its component (directly, or
 * through the main it was copied from).
 */
export function isSlot(doc: Document, id: NodeId): boolean {
  let cur: NodeId | null = id
  for (let i = 0; i <= MAX_DEPTH; i++) {
    if (cur === null) return false
    const n = doc.node(cur)
    if (!n || n.kind.type !== 'frame') return false
    const name = n.prop_refs[SLOT]
    if (name !== undefined) {
      const owner = owningComponent(doc, cur)
      const ownerNode = owner === null ? null : doc.node(owner)
      if (!ownerNode || ownerNode.kind.type !== 'component') return false
      const def = ownerNode.kind.props[name]
      return def !== undefined && def.type === 'slot'
    }
    cur = n.source ?? null
  }
  return false
}

/**
 * For tree walks that look for where layers can go: whether the children of
 * `id` are locked (in an instance, outside its slots), given whether `id`
 * itself is (`locked`).
 */
export function locksChildren(doc: Document, id: NodeId, locked: boolean): boolean {
  return isInstance(doc, id) || (locked && !isSlot(doc, id))
}

/** Whether layers can't be added to, removed from or reordered in `id`. */
export function structureLocked(doc: Document, id: NodeId): boolean {
  const owner = owningInstance(doc, id)
  if (owner === null) return false
  // Inside a slot (or the slot's own content) structure is free.
  for (let cur: NodeId | null = id; cur !== null;) {
    const n = doc.node(cur)
    if (!n) return true
    if (n.overrides.has(SLOT)) return false
    if (isSlot(doc, cur)) return false
    cur = n.parent ?? null
  }
  return true
}

/**
 * The top-most frame-like (or section) node on the page containing page point
 * `pt`, excluding `exclude` and their descendants.
 */
export function frameAt(
  doc: Document,
  page: NodeId,
  pt: { x: number; y: number },
  exclude: NodeId[]
): NodeId | null {
  const rec = (id: NodeId, depth: number, locked: boolean): NodeId | null => {
    if (depth > 128 || exclude.includes(id)) return null
    const n: Node | null = doc.node(id)
    if (!n || !n.visible || n.locked) return null
    const isContainer = isFrameLike(n) || n.kind.type === 'section'
    const inside = (() => {
      const b = doc.world_bounds(id)
      if (b === null || pt.x < b.x0 || pt.x > b.x1 || pt.y < b.y0 || pt.y > b.y1) return false
      const inv = invertOrNull(doc.world_transform(id))
      if (inv === null) return false
      const [a, bb, c, d, e, f] = inv.coeffs
      const lx = a * pt.x + c * pt.y + e
      const ly = bb * pt.x + d * pt.y + f
      return lx >= 0 && lx <= n.width && ly >= 0 && ly <= n.height
    })()
    if (isContainer && !inside) return null
    const kidsLocked = locksChildren(doc, id, locked)
    for (const c of [...n.children].reverse()) {
      const f = rec(c, depth + 1, kidsLocked)
      if (f !== null) return f
    }
    return isContainer && inside && !kidsLocked ? id : null
  }
  const p = doc.node(page)
  if (!p) return null
  for (const c of [...p.children].reverse()) {
    const f = rec(c, 0, false)
    if (f !== null) return f
  }
  return null
}

function isFrameLike(n: Node): boolean {
  const t = n.kind.type
  return t === 'frame' || t === 'component' || t === 'componentSet' || t === 'instance'
}

function invertOrNull(xf: { coeffs: readonly number[] }): { coeffs: number[] } | null {
  const [a, b, c, d, e, f] = xf.coeffs as [number, number, number, number, number, number]
  const det = a * d - b * c
  if (det === 0 || !Number.isFinite(det)) return null
  const ia = d / det
  const ib = -b / det
  const ic = -c / det
  const id = a / det
  return { coeffs: [ia, ib, ic, id, -(ia * e + ic * f), -(ib * e + id * f)] }
}

/** The innermost instance containing `id` (`id` itself when it is one). */
export function owningInstance(doc: Document, id: NodeId): NodeId | null {
  for (const c of scope(doc, id)) {
    if (isInstance(doc, c)) return c
  }
  return null
}

/** The component a node belongs to (itself, or the nearest component ancestor). */
export function owningComponent(doc: Document, id: NodeId): NodeId | null {
  for (const c of [id, ...doc.ancestors(id)]) {
    if (doc.node(c)?.kind.type === 'component') return c
  }
  return null
}
