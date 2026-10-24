/**
 * Handoff snapshots: what a ready-for-dev frame or section looked like before
 * it changed, so Dev Mode can compare it with what it is now.
 * (Converted 1:1 from FigCraft `crates/doc/src/handoff.rs`.)
 */

import type { Document } from './lib'
import type { Node, NodeId } from './node'

/** Most layers a snapshot holds (a larger frame isn't snapshotted). */
export const MAX_SNAPSHOT_NODES = 20_000

/** A layer and everything under it, in pre-order (the layer first), as it was. */
export interface DevSnapshot {
  nodes: Node[]
}

export const DevSnapshot = {
  /** The layer the snapshot is of. */
  root(s: DevSnapshot): Node | null {
    return s.nodes[0] ?? null
  },

  /** The snapshot's nodes by id. */
  node(s: DevSnapshot, id: NodeId): Node | null {
    return s.nodes.find((n) => n.id === id) ?? null
  }
}

declare module './lib' {
  interface Document {
    dev_snapshots: Map<NodeId, DevSnapshot>
    /** Layer `root` and everything under it as they are now. */
    snapshotSubtree(root: NodeId): DevSnapshot | null
    /** A copy of this document in which layer `root` is as its snapshot shows. */
    withDevSnapshot(root: NodeId): Document | null
  }
}

/** Take a snapshot of `root`'s subtree from `doc` (null past the size cap). */
export function snapshot_subtree(doc: Document, root: NodeId): DevSnapshot | null {
  const ids = doc.subtree(root)
  if (ids.length === 0 || ids.length > MAX_SNAPSHOT_NODES) return null
  return { nodes: ids.map((i) => structuredClone(doc.node(i)!)).filter(Boolean) }
}

/**
 * A copy of `doc` in which layer `root` is as its snapshot shows it (null
 * without a usable snapshot). Only `root`'s subtree is meant to be read from
 * the copy.
 */
export function with_dev_snapshot(doc: Document, root: NodeId, snapshots: Map<NodeId, DevSnapshot>): Document | null {
  const snap = snapshots.get(root)
  if (!snap) return null
  if (DevSnapshot.root(snap)?.id !== root || !doc.contains_id(root)) return null
  const copy: Document = Object.create(Object.getPrototypeOf(doc))
  Object.assign(copy, doc)
  const kept = new Set(snap.nodes.map((n) => n.id))
  for (const id of doc.subtree(root)) {
    if (!kept.has(id)) copy.delete(id)
  }
  for (const n of snap.nodes.slice(0, MAX_SNAPSHOT_NODES)) {
    // Pages are never part of a snapshot (a damaged file could claim otherwise).
    if (n.kind.type === 'page' || doc.pages.includes(n.id)) continue
    copy.insert(structuredClone(n))
  }
  // The copy's root keeps its current place in the page.
  const now = doc.node(root)
  const restored = copy.node_mut(root)
  if (now && restored) restored.parent = now.parent
  return copy
}
