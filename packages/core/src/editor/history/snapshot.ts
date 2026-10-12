import type { SceneGraph, SceneNode } from '@open-pencil/scene-graph'

import type { EditorContext } from '#core/editor/types'
import { computeAllLayouts } from '#core/layout'

export type PageSnapshot = Map<string, SceneNode>

export function snapshotPage(graph: SceneGraph, pageId: string): PageSnapshot {
  const snapshot: PageSnapshot = new Map()
  const walk = (id: string) => {
    const node = graph.getNode(id)
    if (!node) return
    snapshot.set(id, structuredClone(node))
    for (const childId of node.childIds) walk(childId)
  }
  walk(pageId)
  // Root carries document-level pluginData (prototype flow document) that the
  // page subtree walk never visits; without it AI mutations to flows bypass undo.
  const root = graph.getNode(graph.rootId)
  if (root && !snapshot.has(root.id)) snapshot.set(root.id, structuredClone(root))
  return snapshot
}

export function restorePageFromSnapshot(ctx: EditorContext, snapshot: PageSnapshot): void {
  const pageId = ctx.state.currentPageId
  const page = ctx.graph.getNode(pageId)
  const pageSnap = snapshot.get(pageId)
  if (!page || !pageSnap) return

  // Restore root-owned fields (pluginData, name) while keeping the live page
  // list — childIds point at pages that this snapshot never captured.
  const root = ctx.graph.getNode(ctx.graph.rootId)
  const rootSnap = snapshot.get(ctx.graph.rootId)
  if (root && rootSnap && root !== page) {
    const { childIds: _childIds, parentId: _parentId, ...rootFields } = rootSnap
    ctx.graph.updateNode(root.id, rootFields)
  }

  for (const childId of page.childIds.slice()) ctx.graph.deleteNode(childId)
  restoreChildren(ctx.graph, snapshot, pageId, pageSnap.childIds)

  ctx.graph.clearAbsPosCache()
  computeAllLayouts(ctx.graph, pageId)
  ctx.setSelectedIds(new Set())
  ctx.state.hoveredNodeId = null
  ctx.requestRender()
}

function restoreChildren(
  graph: SceneGraph,
  snapshot: PageSnapshot,
  parentId: string,
  childIds: string[]
): void {
  for (const childId of childIds) {
    const snap = snapshot.get(childId)
    if (!snap) continue
    const { parentId: _snapParentId, childIds: snapChildIds, ...rest } = snap
    graph.createNode(snap.type, parentId, { ...rest, childIds: [] })
    graph.reorderChild(snap.id, parentId, childIds.indexOf(childId))
    restoreChildren(graph, snapshot, snap.id, snapChildIds)
  }
}
