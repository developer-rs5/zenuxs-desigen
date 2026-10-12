import {
  readNodeInteractions,
  readNodeStateModel,
  type PrototypeStateVisual,
  type SceneGraph
} from '@open-pencil/scene-graph'

import type { PendingTimer } from './render-state'
import { isIdentityVisual } from './visuals'

/**
 * Graph-derived runtime setup (spec §8): subtree walks, `afterDelay` timer
 * seeding, and each node's declared initial state visual. Pure reads of the
 * scene graph plus caller-owned collections — no runtime closure state, so the
 * whole file stays deterministic and unit-testable.
 */

/** Every descendant id under `rootId`, depth-first, excluding the root itself. */
export function descendants(graph: SceneGraph, rootId: string): string[] {
  const result: string[] = []
  const walk = (id: string): void => {
    const node = graph.getNode(id)
    if (!node) return
    for (const childId of node.childIds) {
      result.push(childId)
      walk(childId)
    }
  }
  walk(rootId)
  return result
}

/** Queue one pending timer per `afterDelay` interaction on the node. */
export function scheduleTimers(
  graph: SceneGraph,
  timers: PendingTimer[],
  nodeId: string,
  nowMs: number
): void {
  const node = graph.getNode(nodeId)
  if (!node) return
  for (const interaction of readNodeInteractions(node)) {
    if (interaction.trigger !== 'afterDelay') continue
    timers.push({
      nodeId,
      interactionId: interaction.id,
      dueAt: nowMs + (interaction.delayMs ?? 0)
    })
  }
}

/** Settle each node's declared initial state visual before load triggers run. */
export function seedInitialStates(
  graph: SceneGraph,
  stateVisuals: Map<string, PrototypeStateVisual>,
  rootId: string
): void {
  const seed = (id: string): void => {
    const node = graph.getNode(id)
    const model = node ? readNodeStateModel(node) : null
    if (!model) return
    const initial = model.states.find((state) => state.name === model.initial)
    if (!initial) return
    if (isIdentityVisual(initial.visual)) stateVisuals.delete(id)
    else stateVisuals.set(id, initial.visual)
  }
  seed(rootId)
  for (const id of descendants(graph, rootId)) seed(id)
}
