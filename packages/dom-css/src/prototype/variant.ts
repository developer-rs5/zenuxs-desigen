import type { PrototypeInteraction, SceneNode, SceneGraph } from '@open-pencil/scene-graph'
import {
  INSTANCE_SYNC_PROPS,
  hasInstanceOverride,
  resolveVariantComponentId
} from '@open-pencil/scene-graph'

import { styleFromSceneNode, styleFromTextNode } from '../from-scene-graph'
import {
  recordRuntimeFeatures,
  shimBase,
  type FinishInteraction,
  type NodeContext,
  type WalkContext
} from './context'
import { nodeSelector } from './css'

/**
 * setVariant emission: resolve the authored spec to a sibling component at
 * build time (preview resolves it in `runSetVariant` via the same
 * `resolveVariantComponentId`), emit the instance root style rule (component
 * props minus placement, minus root-level instance overrides preview keeps),
 * and register templates for the target AND base component.
 */

// --- setVariant -------------------------------------------------------------

export function processVariant(
  ctx: WalkContext,
  node: SceneNode,
  local: NodeContext,
  interaction: PrototypeInteraction,
  baseDetail: string,
  finish: FinishInteraction
): void {
  const action = interaction.action
  if (action.type !== 'setVariant') return
  if (node.type !== 'INSTANCE' || !node.componentId) {
    finish('skipped', 'action', `${baseDetail} is not authored on an instance`, {
      reason: 'missing-target'
    })
    return
  }
  const targetId = resolveVariantComponentId(ctx.graph, node.id, action.variant)
  if (!targetId) {
    finish('skipped', 'action', `${baseDetail} resolves to no sibling variant`, {
      reason: 'missing-target'
    })
    return
  }
  const component = ctx.graph.getNode(targetId)
  if (!component) {
    finish('skipped', 'action', `${baseDetail} targets a node that does not exist`, {
      reason: 'missing-target'
    })
    return
  }

  // Root style rule: component styling for the instance wrapper, minus
  // placement (the instance keeps its own position) and minus root-level
  // instance overrides (preview swapInstanceComponent skips those keys).
  const merged = mergedVariantRoot(ctx.graph, node, component)
  const style = component.type === 'TEXT' ? styleFromTextNode(merged) : styleFromSceneNode(merged)
  delete style.position
  delete style.left
  delete style.top
  delete style['align-self']
  const declarations = Object.entries(style)
    .filter(([, value]) => value !== '')
    .map(([property, value]) => `${property}: ${value}`)
    .join(';')
  if (declarations) {
    ctx.frontCss.push(
      `${nodeSelector(node.id)}[data-op-variant="${escapeAttr(targetId)}"]{${declarations}}`
    )
  }

  const existing = ctx.variants.get(node.id) ?? []
  if (!existing.some((entry) => entry.componentId === targetId)) {
    existing.push({ componentId: targetId, spec: action.variant })
    ctx.variants.set(node.id, existing)
  }
  // Also ship a template for the instance's current component so a later
  // authored swap back to the base variant has markup to restore.
  if (!existing.some((entry) => entry.componentId === node.componentId)) {
    existing.push({ componentId: node.componentId, spec: '' })
    ctx.variants.set(node.id, existing)
  }
  ctx.variantComponentIds.add(targetId)
  // Subtree walk + ops re-attribution happens in finalize, once every node
  // has been visited (component frames are usually root children themselves).
  ctx.pendingVariantWalks.push({ componentId: targetId, instanceScreenId: local.screenId })

  ctx.shim.push({
    kind: 'variant',
    variant: targetId,
    base: node.componentId,
    ...shimBase(local, interaction, Boolean(interaction.guard))
  })
  recordRuntimeFeatures(ctx, node, baseDetail, interaction)
  finish('exported', 'action', `${baseDetail} → component ${component.name}`)
}

function escapeAttr(value: string): string {
  return value.replace(/\\/g, '\\\\').replace(/"/g, '\\"')
}

/**
 * The component's root styling as preview applies it after a swap: component
 * props copied onto the instance except root-level instance overrides
 * (`INSTANCE_SYNC_PROPS` keys with a self override keep the instance value).
 */
function mergedVariantRoot(
  graph: SceneGraph,
  instance: SceneNode,
  component: SceneNode
): SceneNode {
  const merged: SceneNode = { ...component }
  for (const key of INSTANCE_SYNC_PROPS) {
    if (hasInstanceOverride(graph, instance.id, key)) {
      Object.assign(merged, { [key]: instance[key] })
    }
  }
  return merged
}
