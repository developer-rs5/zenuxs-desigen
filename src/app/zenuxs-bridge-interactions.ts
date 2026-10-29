import type {
  Interaction as ZenuxsInteraction,
  NodeId,
  Transition as ZenuxsTransition
} from '@zenuxs/doc'

import {
  INTERACTIONS_PLUGIN_KEY,
  PROTOTYPE_PLUGIN_ID,
  type PluginDataEntry,
  type PrototypeInteraction,
  type PrototypeTransition
} from '@open-pencil/scene-graph'

interface BridgeNodeIdMap {
  toNum(strId: string): NodeId
  toStr(numId: NodeId): string
}

function prototypeDirectionToZenuxs(
  direction: 'left' | 'right' | 'up' | 'down'
): 'left' | 'right' | 'top' | 'bottom' {
  switch (direction) {
    case 'up':
      return 'top'
    case 'down':
      return 'bottom'
    default:
      return direction
  }
}

function zenuxsDirectionToPrototype(
  direction: 'left' | 'right' | 'top' | 'bottom'
): 'left' | 'right' | 'up' | 'down' {
  switch (direction) {
    case 'top':
      return 'up'
    case 'bottom':
      return 'down'
    default:
      return direction
  }
}

function prototypeTransitionToZenuxs(transition: PrototypeTransition): {
  transition: ZenuxsTransition
  durationMs?: number
} {
  if ('easing' in transition && transition.easing !== undefined) {
    throw new Error('unsupported prototype transition easing')
  }
  switch (transition.kind) {
    case 'instant':
      return { transition: { type: 'instant' } }
    case 'dissolve':
    case 'smartAnimate':
      return { transition: { type: transition.kind }, durationMs: transition.durationMs }
    case 'moveIn':
    case 'moveOut':
    case 'push':
    case 'slideIn':
    case 'slideOut':
      return {
        transition: {
          type: transition.kind,
          direction: prototypeDirectionToZenuxs(transition.direction)
        },
        durationMs: transition.durationMs
      }
    case 'fade':
    case 'slide':
    case 'spring':
      throw new Error(`unsupported prototype transition "${transition.kind}"`)
    default:
      throw new Error('unsupported prototype transition')
  }
}

export function prototypeInteractionToZenuxs(
  interaction: PrototypeInteraction,
  idMap: BridgeNodeIdMap
): ZenuxsInteraction {
  if (interaction.guard) throw new Error('unsupported prototype interaction guard')
  if (interaction.trigger !== 'click') {
    throw new Error(`unsupported prototype trigger "${interaction.trigger}"`)
  }
  if (interaction.delayMs !== undefined) {
    throw new Error('unsupported prototype interaction delay')
  }
  if (interaction.action.type !== 'navigate') {
    throw new Error(`unsupported prototype action "${interaction.action.type}"`)
  }

  const mappedTransition = interaction.transition
    ? prototypeTransitionToZenuxs(interaction.transition)
    : undefined
  const action: ZenuxsInteraction['actions'][number] = {
    type: 'navigate',
    dest: idMap.toNum(interaction.action.destinationId)
  }
  if (interaction.action.preserveScroll !== undefined) {
    action.preserve_scroll = interaction.action.preserveScroll
  }
  const mappedInteraction: ZenuxsInteraction = {
    trigger: { type: 'onClick' },
    actions: [action]
  }
  if (mappedTransition) {
    mappedInteraction.transition = mappedTransition.transition
    if (mappedTransition.durationMs !== undefined) {
      mappedInteraction.duration_ms = mappedTransition.durationMs
    }
  }
  return mappedInteraction
}

function zenuxsTransitionToPrototype(
  interaction: ZenuxsInteraction
): PrototypeTransition | undefined {
  const transition = interaction.transition
  if (!transition) return undefined
  if (interaction.easing !== undefined) throw new Error('unsupported Zenuxs transition easing')
  if (transition.type === 'instant') return { kind: 'instant' }

  const transitionType = transition.type
  const durationMs = interaction.duration_ms ?? 300
  switch (transition.type) {
    case 'dissolve':
    case 'smartAnimate':
      return { kind: transition.type, durationMs }
    case 'moveIn':
    case 'moveOut':
    case 'push':
    case 'slideIn':
    case 'slideOut':
      return {
        kind: transition.type,
        direction: zenuxsDirectionToPrototype(transition.direction),
        durationMs
      }
    default: {
      throw new Error(`unsupported Zenuxs transition "${String(transitionType)}"`)
    }
  }
}

function zenuxsInteractionToPrototype(
  interaction: ZenuxsInteraction,
  index: number,
  ownerId: string,
  idMap: BridgeNodeIdMap
): PrototypeInteraction {
  if (interaction.actions.length !== 1) {
    throw new Error('unsupported Zenuxs interaction with multiple actions')
  }
  const [action] = interaction.actions
  if (action.type !== 'navigate') {
    throw new Error(`unsupported Zenuxs action "${action.type}"`)
  }
  if (interaction.trigger.type !== 'onClick') {
    throw new Error(`unsupported Zenuxs trigger "${interaction.trigger.type}"`)
  }
  if (interaction.delay_ms !== undefined) {
    throw new Error('unsupported Zenuxs interaction delay')
  }
  const mappedAction: PrototypeInteraction['action'] = {
    type: 'navigate',
    destinationId: idMap.toStr(action.dest)
  }
  if (action.preserve_scroll !== undefined) {
    mappedAction.preserveScroll = action.preserve_scroll
  }
  const mappedInteraction: PrototypeInteraction = {
    id: `${ownerId}:${index}`,
    trigger: 'click',
    action: mappedAction
  }
  const transition = zenuxsTransitionToPrototype(interaction)
  if (transition !== undefined) mappedInteraction.transition = transition
  return mappedInteraction
}

export function pluginDataWithInteractions(
  existing: PluginDataEntry[],
  interactions: ZenuxsInteraction[],
  ownerId: string,
  idMap: BridgeNodeIdMap
): PluginDataEntry[] {
  const pluginData = existing.filter(
    (entry) => entry.pluginId !== PROTOTYPE_PLUGIN_ID || entry.key !== INTERACTIONS_PLUGIN_KEY
  )
  if (interactions.length > 0) {
    pluginData.push({
      pluginId: PROTOTYPE_PLUGIN_ID,
      key: INTERACTIONS_PLUGIN_KEY,
      value: JSON.stringify(
        interactions.map((interaction, index) =>
          zenuxsInteractionToPrototype(interaction, index, ownerId, idMap)
        )
      )
    })
  }
  return pluginData
}
