import {
  PROTOTYPE_DOC_PLUGIN_KEY,
  PROTOTYPE_SCHEMA_VERSION,
  readNodeInteractions,
  readPrototypeDocument,
  serializePluginValue,
  type PrototypeDocument,
  type PrototypeFlow
} from '@open-pencil/scene-graph'

import { defineTool } from '#core/tools/schema'

import { buildInteraction, triggerParams, transitionParams, writeInteractions } from './helpers'

/** Write the flow entry screen onto a copied flow list; pure (mutates only `flows`). */
function upsertFlowEntry(
  flows: PrototypeFlow[],
  args: { node_id: string; flow_id?: string; flow_name?: string }
): { flow: PrototypeFlow; created: boolean } | { error: string } {
  const index = args.flow_id ? flows.findIndex((entry) => entry.id === args.flow_id) : 0
  const existing = index >= 0 ? flows[index] : undefined
  if (existing) {
    const flow = { ...existing, startNodeId: args.node_id }
    if (args.flow_name?.trim()) flow.name = args.flow_name.trim().slice(0, 128)
    flows[index] = flow
    return { flow, created: false }
  }
  if (args.flow_id || flows.length === 0) {
    if (flows.length >= 64) return { error: 'A document supports at most 64 flows' }
    const flow: PrototypeFlow = {
      id: args.flow_id ?? 'flow-1',
      name: args.flow_name?.trim() || `Flow ${flows.length + 1}`,
      startNodeId: args.node_id
    }
    flows.push(flow)
    return { flow, created: true }
  }
  const flow = { ...flows[0], startNodeId: args.node_id }
  flows[0] = flow
  return { flow, created: false }
}

export const createPrototypeFlow = defineTool({
  name: 'create_prototype_flow',
  mutates: true,
  description:
    'Set (or add) a prototype flow entry screen. Use when the user says which screen presentation starts from ("start from the splash screen"). Pass flow_id/flow_name to author multiple flows.',
  params: {
    node_id: {
      type: 'string',
      description: 'Screen (frame) node that starts the flow',
      required: true
    },
    flow_id: { type: 'string', description: 'Existing or new flow id (default: first flow)' },
    flow_name: { type: 'string', description: 'Flow display name when creating a flow' }
  },
  execute: (figma, { node_id, flow_id, flow_name }) => {
    if (!figma.graph.getNode(node_id)) return { error: `Node "${node_id}" not found` }
    const raw = figma.graph.getNode(figma.graph.rootId)
    const doc = raw ? readPrototypeDocument(raw) : null
    const flows = [...(doc?.flows ?? [])]

    const updated = upsertFlowEntry(flows, { node_id, flow_id, flow_name })
    if ('error' in updated) return updated

    const next: PrototypeDocument = {
      version: doc?.version ?? PROTOTYPE_SCHEMA_VERSION,
      flows,
      // Touching a flow makes it the flow preview starts from.
      activeFlowId: flow_id ?? doc?.activeFlowId ?? updated.flow.id
    }
    figma.root.setPluginData(PROTOTYPE_DOC_PLUGIN_KEY, serializePluginValue(next))
    return {
      start_node_id: node_id,
      flow_id: updated.flow.id,
      flows: next.flows.length,
      active_flow_id: next.activeFlowId ?? updated.flow.id,
      created: updated.created
    }
  }
})

export const listFlows = defineTool({
  name: 'list_flows',
  mutates: false,
  description:
    'Inspect prototype flows (spec §17: inspect what was actually authored): ids, names, entry screens, and which flow is active.',
  params: {},
  execute: (figma) => {
    const raw = figma.graph.getNode(figma.graph.rootId)
    const doc = raw ? readPrototypeDocument(raw) : null
    return {
      active_flow_id: doc?.activeFlowId ?? doc?.flows[0]?.id ?? null,
      flows: (doc?.flows ?? []).map((flow) => ({
        id: flow.id,
        name: flow.name,
        start_node_id: flow.startNodeId,
        start_exists: Boolean(figma.graph.getNode(flow.startNodeId))
      }))
    }
  }
})

export const setActiveFlow = defineTool({
  name: 'set_active_flow',
  mutates: true,
  description: 'Choose which prototype flow preview/presentation starts from.',
  params: {
    flow_id: { type: 'string', description: 'Flow id from list_flows', required: true }
  },
  execute: (figma, { flow_id }) => {
    const raw = figma.graph.getNode(figma.graph.rootId)
    const doc = raw ? readPrototypeDocument(raw) : null
    const flow = doc?.flows.find((entry) => entry.id === flow_id)
    if (!doc || !flow) {
      const ids = doc?.flows.map((entry) => entry.id).join(', ') || 'none'
      return { error: `Flow "${flow_id}" not found. Present: ${ids}` }
    }
    const next: PrototypeDocument = { ...doc, activeFlowId: flow_id }
    figma.root.setPluginData(PROTOTYPE_DOC_PLUGIN_KEY, serializePluginValue(next))
    return { flow_id, active_flow_id: flow_id }
  }
})

export const connectScreens = defineTool({
  name: 'connect_screens',
  mutates: true,
  description:
    'Connect two screens: appends a navigate interaction from one screen to another ("click A goes to B"). Sugar over create_interaction.',
  params: {
    from_id: { type: 'string', description: 'Source screen (fires the trigger)', required: true },
    to_id: { type: 'string', description: 'Destination screen', required: true },
    ...triggerParams,
    ...transitionParams
  },
  execute: (figma, args) => {
    const raw = figma.graph.getNode(args.from_id)
    if (!raw) return { error: `Node "${args.from_id}" not found` }
    if (!figma.graph.getNode(args.to_id)) return { error: `Destination "${args.to_id}" not found` }
    const built = buildInteraction(figma, args.from_id, {
      ...args,
      action: 'navigate',
      destination_id: args.to_id
    })
    if ('error' in built) return built
    const next = [...readNodeInteractions(raw), built.interaction]
    const writeError = writeInteractions(figma, args.from_id, next)
    if (writeError) return { error: writeError }
    return { id: built.interaction.id, from: args.from_id, to: args.to_id, count: next.length }
  }
})
