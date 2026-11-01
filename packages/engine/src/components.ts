/**
 * Component ownership queries shared by commands that must not edit inside an
 * instance. (Converted 1:1 from FigCraft `crates/engine/src/components.rs`.)
 */

import type { Document, NodeId } from '@zenuxs/doc'

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

function isInstance(doc: Document, id: NodeId): boolean {
  return doc.node(id)?.kind.type === 'instance'
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
