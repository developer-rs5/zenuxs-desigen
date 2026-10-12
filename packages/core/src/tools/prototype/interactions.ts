import { readNodeInteractions, type PrototypeInteraction } from '@open-pencil/scene-graph'

import { defineTool } from '#core/tools/schema'

import {
  actionParams,
  buildAction,
  buildInteraction,
  findInteraction,
  guardParams,
  readTransition,
  triggerParams,
  transitionParams,
  validateActionTarget,
  writeInteractions,
  TRIGGERS
} from './helpers'

export const createInteraction = defineTool({
  name: 'create_interaction',
  mutates: true,
  description:
    'Add a trigger→action interaction to a node (prototype behavior). Example: click on a button navigates to a screen with a fade. Pairs with set_interaction_* edits and validate_prototype.',
  params: {
    node_id: { type: 'string', description: 'Node the trigger fires on', required: true },
    ...triggerParams,
    ...actionParams,
    ...transitionParams,
    ...guardParams
  },
  execute: (figma, args) => {
    const raw = figma.graph.getNode(args.node_id)
    if (!raw) return { error: `Node "${args.node_id}" not found` }
    const built = buildInteraction(figma, args.node_id, args)
    if ('error' in built) return built
    const next = [...readNodeInteractions(raw), built.interaction]
    const writeError = writeInteractions(figma, args.node_id, next)
    if (writeError) return { error: writeError }
    return { id: built.interaction.id, node_id: args.node_id, count: next.length }
  }
})

export const setInteractionTrigger = defineTool({
  name: 'set_interaction_trigger',
  mutates: true,
  description: 'Change the trigger (and delay) of an existing interaction on a node.',
  params: {
    node_id: { type: 'string', description: 'Node owning the interaction', required: true },
    interaction_id: {
      type: 'string',
      description: 'Interaction id from create_interaction',
      required: true
    },
    ...triggerParams
  },
  execute: (figma, { node_id, interaction_id, trigger, delay_ms }) => {
    const found = findInteraction(figma, node_id, interaction_id)
    if ('error' in found) return found
    const nextTrigger = trigger ?? 'click'
    if (!TRIGGERS.includes(nextTrigger)) return { error: `Invalid trigger "${trigger}"` }
    if (nextTrigger === 'afterDelay' && delay_ms === undefined) {
      return { error: 'delay_ms is required when trigger=afterDelay' }
    }
    const next = found.interactions.map((interaction, i) => {
      if (i !== found.index) return interaction
      const updated: PrototypeInteraction = {
        ...interaction,
        trigger: nextTrigger as PrototypeInteraction['trigger']
      }
      if (nextTrigger === 'afterDelay') updated.delayMs = delay_ms
      else delete updated.delayMs
      return updated
    })
    const writeError = writeInteractions(figma, node_id, next)
    if (writeError) return { error: writeError }
    return { id: interaction_id, node_id, trigger: nextTrigger }
  }
})

export const setInteractionAction = defineTool({
  name: 'set_interaction_action',
  mutates: true,
  description:
    'Change the action (navigate/openOverlay/closeOverlay/setState) of an existing interaction.',
  params: {
    node_id: { type: 'string', description: 'Node owning the interaction', required: true },
    interaction_id: { type: 'string', description: 'Interaction id', required: true },
    ...actionParams
  },
  execute: (figma, args) => {
    const found = findInteraction(figma, args.node_id, args.interaction_id)
    if ('error' in found) return found
    const built = buildAction(figma, args)
    if ('error' in built) return built
    const targetError = validateActionTarget(figma, args.node_id, built.action)
    if (targetError) return { error: targetError }
    const next = found.interactions.map((interaction, i) =>
      i === found.index ? { ...interaction, action: built.action } : interaction
    )
    const writeError = writeInteractions(figma, args.node_id, next)
    if (writeError) return { error: writeError }
    return { id: args.interaction_id, node_id: args.node_id, action: built.action }
  }
})

export const setInteractionTransition = defineTool({
  name: 'set_interaction_transition',
  mutates: true,
  description:
    'Change the motion (kind/duration/easing/direction/spring) of an existing interaction.',
  params: {
    node_id: { type: 'string', description: 'Node owning the interaction', required: true },
    interaction_id: { type: 'string', description: 'Interaction id', required: true },
    ...transitionParams
  },
  execute: (figma, args) => {
    const found = findInteraction(figma, args.node_id, args.interaction_id)
    if ('error' in found) return found
    const built = readTransition(args)
    if ('error' in built) return built
    const next = found.interactions.map((interaction, i) =>
      i === found.index ? { ...interaction, transition: built.transition } : interaction
    )
    const writeError = writeInteractions(figma, args.node_id, next)
    if (writeError) return { error: writeError }
    return { id: args.interaction_id, node_id: args.node_id, transition: built.transition }
  }
})
