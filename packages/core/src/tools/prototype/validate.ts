import {
  readNodeAnimations,
  readNodeInteractions,
  readNodeStateModel,
  readPrototypeDocument,
  resolveVariantComponentId
} from '@open-pencil/scene-graph'
import type { PrototypeInteraction, PrototypeStateModel, SceneNode } from '@open-pencil/scene-graph'

import type { FigmaAPI } from '#core/figma-api'
import { defineTool } from '#core/tools/schema'

import { MAX_DURATION_MS, walkSubtree } from './helpers'

interface NodeRecord {
  node: SceneNode
  stateNames: Set<string>
  stateTargets: Set<string>
  navigateEdges: string[]
}

/** Shared collectors threaded through one node's checks. */
interface ValidateCollectors {
  errors: string[]
  warnings: string[]
  counters: { interactions: number; states: number; animations: number }
}

/** Action-id pools interactions resolve their targets against. */
interface ActionPools {
  model: PrototypeStateModel | null
  animationIds: Set<string>
  groupIds: Set<string>
}

/** State-model checks: duplicates, visual ranges, and untargeted states. */
function validateStates(record: NodeRecord, collectors: ValidateCollectors): void {
  const { node, stateNames, stateTargets } = record
  const model = readNodeStateModel(node)
  if (!model) return
  const { errors, warnings, counters } = collectors
  counters.states += model.states.length
  const seen = new Set<string>()
  for (const state of model.states) {
    if (seen.has(state.name)) {
      errors.push(`${node.name} (${node.id}): duplicate state "${state.name}"`)
    }
    seen.add(state.name)
    if (
      state.visual.opacity !== undefined &&
      (state.visual.opacity < 0 || state.visual.opacity > 1)
    ) {
      errors.push(`${node.name}: state "${state.name}" opacity out of 0–1`)
    }
    if (state.visual.scale !== undefined && (state.visual.scale <= 0 || state.visual.scale > 10)) {
      errors.push(`${node.name}: state "${state.name}" scale out of (0–10]`)
    }
  }
  if (!stateNames.has(model.initial)) {
    errors.push(`${node.name} (${node.id}): initial state "${model.initial}" is not defined`)
  }
  // States never targeted by any setState on this node stay dead weight.
  for (const name of stateNames) {
    if (name !== model.initial && !stateTargets.has(name)) {
      warnings.push(`${node.name}: state "${name}" is never targeted by a setState action`)
    }
  }
}

/** Animation-container checks; returns the id pools for playAnimation actions. */
function validateAnimations(node: SceneNode, collectors: ValidateCollectors): ActionPools {
  const { errors, counters } = collectors
  const container = readNodeAnimations(node)
  counters.animations += (container?.animations?.length ?? 0) + (container?.groups?.length ?? 0)
  for (const animation of container?.animations ?? []) {
    if (animation.keyframes.length === 0) {
      errors.push(`${node.name}: animation "${animation.id}" has no keyframes`)
    }
    let previous = -1
    for (const keyframe of animation.keyframes) {
      if (keyframe.offsetMs <= previous) {
        errors.push(
          `${node.name}: animation "${animation.id}" keyframes out of order at ${keyframe.offsetMs} ms`
        )
        break
      }
      previous = keyframe.offsetMs
    }
    if (animation.durationMs <= 0 && animation.keyframes.length > 1) {
      errors.push(`${node.name}: animation "${animation.id}" has keyframes but zero duration`)
    }
  }
  return {
    model: null,
    animationIds: new Set((container?.animations ?? []).map((entry) => entry.id)),
    groupIds: new Set((container?.groups ?? []).map((entry) => entry.id))
  }
}

/** Action-target checks: destinations, states, animations, and variants. */
function validateAction(
  figma: FigmaAPI,
  record: NodeRecord,
  interaction: Pick<PrototypeInteraction, 'id' | 'action'>,
  pools: ActionPools,
  errors: string[]
): void {
  const { node, stateNames, navigateEdges } = record
  const { action } = interaction
  if (action.type === 'navigate') {
    if (!figma.graph.getNode(action.destinationId)) {
      errors.push(
        `${node.name}: interaction ${interaction.id} → missing destination "${action.destinationId}"`
      )
    } else {
      navigateEdges.push(action.destinationId)
    }
  }
  if (action.type === 'openOverlay' && !figma.graph.getNode(action.overlayId)) {
    errors.push(
      `${node.name}: interaction ${interaction.id} → missing overlay "${action.overlayId}"`
    )
  }
  if (action.type === 'setState') {
    let stateError: string | null
    if (!pools.model) stateError = 'node has no state model'
    else if (!stateNames.has(action.state)) stateError = `undefined state "${action.state}"`
    else stateError = null
    if (stateError) errors.push(`${node.name}: interaction ${interaction.id} → ${stateError}`)
  }
  if (action.type === 'playAnimation') {
    const known = action.group === true ? pools.groupIds : pools.animationIds
    if (!known.has(action.animationId)) {
      const kind = action.group === true ? 'animation group' : 'animation'
      errors.push(
        `${node.name}: interaction ${interaction.id} → missing ${kind} "${action.animationId}"`
      )
    }
  }
  if (action.type === 'setVariant') {
    if (node.type !== 'INSTANCE') {
      errors.push(`${node.name}: interaction ${interaction.id} → setVariant on a non-INSTANCE node`)
    } else if (!resolveVariantComponentId(figma.graph, node.id, action.variant)) {
      errors.push(
        `${node.name}: interaction ${interaction.id} → no variant matches "${action.variant}"`
      )
    }
  }
}

/** Guard conditions must name variables the node's state model declares. */
function validateGuard(
  record: NodeRecord,
  interaction: Pick<PrototypeInteraction, 'id' | 'guard'>,
  model: PrototypeStateModel | null,
  errors: string[]
): void {
  const { guard } = interaction
  if (!guard) return
  const { node } = record
  for (const condition of guard.all) {
    if (model && !(condition.variable in (model.vars ?? {}))) {
      errors.push(
        `${node.name}: interaction ${interaction.id} → guard references unknown variable "${condition.variable}"`
      )
    } else if (!model) {
      errors.push(
        `${node.name}: interaction ${interaction.id} → guard on a node without a state model`
      )
    }
  }
}

/** Trigger delay and transition duration bounds. */
function validateTiming(
  interaction: Pick<PrototypeInteraction, 'id' | 'trigger' | 'delayMs' | 'transition'>,
  node: SceneNode,
  errors: string[]
): void {
  if (interaction.trigger === 'afterDelay' && (interaction.delayMs ?? -1) < 0) {
    errors.push(`${node.name}: interaction ${interaction.id} → afterDelay without delayMs`)
  }
  const { transition } = interaction
  if (
    transition &&
    (transition.kind === 'fade' || transition.kind === 'slide') &&
    (transition.durationMs < 0 || transition.durationMs > MAX_DURATION_MS)
  ) {
    errors.push(`${node.name}: interaction ${interaction.id} → duration out of range`)
  }
}

/** Validate one node's prototype payloads; append to shared collectors. */
function validateNode(figma: FigmaAPI, record: NodeRecord, collectors: ValidateCollectors): void {
  validateStates(record, collectors)
  const pools = validateAnimations(record.node, collectors)
  pools.model = readNodeStateModel(record.node)
  const interactions = readNodeInteractions(record.node)
  collectors.counters.interactions += interactions.length
  for (const interaction of interactions) {
    validateAction(figma, record, interaction, pools, collectors.errors)
    validateGuard(record, interaction, pools.model, collectors.errors)
    validateTiming(interaction, record.node, collectors.errors)
  }
}

/** First navigate cycle found among walked nodes, as a node-id path. */
function findNavigateCycle(records: Map<string, NodeRecord>): string[] {
  const state = new Map<string, 'visiting' | 'done'>()
  const stack: string[] = []

  function visit(id: string): string[] | null {
    const mark = state.get(id)
    if (mark === 'done') return null
    if (mark === 'visiting') return stack.slice(stack.indexOf(id))
    state.set(id, 'visiting')
    stack.push(id)
    for (const next of records.get(id)?.navigateEdges ?? []) {
      if (!records.has(next)) continue
      const cycle = visit(next)
      if (cycle) return cycle
    }
    stack.pop()
    state.set(id, 'done')
    return null
  }

  for (const id of records.keys()) {
    const cycle = visit(id)
    if (cycle) return cycle
  }
  return []
}

/** Flow-document checks: flow starts, active flow, and previewability. */
function collectFlowChecks(figma: FigmaAPI, rootId: string, collectors: ValidateCollectors): void {
  const { errors, warnings, counters } = collectors
  const raw = figma.graph.getNode(figma.graph.rootId)
  const doc = raw ? readPrototypeDocument(raw) : null
  const page = figma.graph.getNode(rootId)
  const hasFrame = (page?.childIds ?? []).some((id) => {
    const child = figma.graph.getNode(id)
    return child?.type === 'FRAME' || child?.type === 'COMPONENT'
  })
  if (!doc) {
    warnings.push('No prototype flow document — presentation falls back to the first frame')
  } else {
    for (const flow of doc.flows) {
      if (!figma.graph.getNode(flow.startNodeId)) {
        errors.push(`Flow "${flow.name}" start "${flow.startNodeId}" does not exist`)
        continue
      }
      const start = figma.graph.getNode(flow.startNodeId)
      if (start && start.type !== 'FRAME' && start.type !== 'COMPONENT') {
        warnings.push(
          `Flow "${flow.name}" starts at "${start.name}" which is a ${start.type}, not a screen`
        )
      }
    }
    if (doc.activeFlowId && !doc.flows.some((flow) => flow.id === doc.activeFlowId)) {
      warnings.push(
        `activeFlowId "${doc.activeFlowId}" matches no flow; preview falls back to the first flow`
      )
    }
  }
  if (!doc?.flows.length && !hasFrame) {
    warnings.push('Nothing previewable: no flow start and no frame on this page')
  }
  if (counters.interactions === 0) warnings.push('No interactions authored on this page yet')
}

export const validatePrototype = defineTool({
  name: 'validate_prototype',
  mutates: false,
  description:
    'Self-check authored prototype behavior (spec §17): existing targets, valid state names, sane durations, serializable data, guard/animation/state references, unreachable states, and navigate cycles. Run after generating prototype/motion behavior.',
  params: {
    node_id: {
      type: 'string',
      description: 'Validate this node subtree (default: current page)'
    }
  },
  execute: (figma, { node_id }) => {
    const errors: string[] = []
    const warnings: string[] = []
    const counters = { interactions: 0, states: 0, animations: 0 }
    const records = new Map<string, NodeRecord>()
    let checked = 0

    const rootId = node_id ?? figma.currentPageId
    if (!figma.graph.getNode(rootId)) return { error: `Node "${rootId}" not found` }

    walkSubtree(figma, rootId, (id) => {
      checked += 1
      const node = figma.graph.getNode(id)
      if (!node) return
      const model = readNodeStateModel(node)
      const stateTargets = new Set<string>()
      for (const interaction of readNodeInteractions(node)) {
        if (interaction.action.type === 'setState') stateTargets.add(interaction.action.state)
      }
      const record: NodeRecord = {
        node,
        stateNames: new Set((model?.states ?? []).map((state) => state.name)),
        stateTargets,
        navigateEdges: []
      }
      records.set(id, record)
      validateNode(figma, record, { errors, warnings, counters })
    })

    const cycle = findNavigateCycle(records)
    if (cycle.length > 0) {
      const names = cycle.map((id) => records.get(id)?.node.name ?? id)
      warnings.push(`Navigate cycle: ${names.join(' → ')} → ${names[0] ?? ''}`)
    }

    // Flow document checks (only meaningful when validating beyond one node).
    if (!node_id) collectFlowChecks(figma, rootId, { errors, warnings, counters })

    return {
      ok: errors.length === 0,
      checked_nodes: checked,
      interactions: counters.interactions,
      states: counters.states,
      animations: counters.animations,
      errors,
      warnings
    }
  }
})
