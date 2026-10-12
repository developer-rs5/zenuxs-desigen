import { describe, expect, test } from 'bun:test'

import {
  INTERACTIONS_PLUGIN_KEY,
  PROTOTYPE_DOC_PLUGIN_KEY,
  PROTOTYPE_PLUGIN_ID,
  STATE_PLUGIN_KEY,
  readNodeInteractions,
  readNodeStateModel,
  readPrototypeDocument,
  SceneGraph,
  serializePluginValue,
  type PrototypeInteraction
} from '@open-pencil/scene-graph'

import { getNodeOrThrow } from '#tests/helpers/assert'

function setup() {
  const graph = new SceneGraph()
  const page = graph.getPages()[0]
  const frame = graph.createNode('FRAME', page.id)
  const button = graph.createNode('RECTANGLE', frame.id)
  return { graph, frame, button }
}

function writePlugin(graph: SceneGraph, nodeId: string, key: string, value: unknown): void {
  const node = graph.getNode(nodeId)
  if (!node) throw new Error('missing node')
  graph.updateNode(nodeId, {
    pluginData: [
      ...node.pluginData.filter(
        (entry) => !(entry.pluginId === PROTOTYPE_PLUGIN_ID && entry.key === key)
      ),
      { pluginId: PROTOTYPE_PLUGIN_ID, key, value: serializePluginValue(value) }
    ]
  })
}

const clickNavigate: PrototypeInteraction = {
  id: 'i1',
  trigger: 'click',
  action: { type: 'navigate', destinationId: 'dest-frame' },
  transition: { kind: 'fade', durationMs: 500, easing: 'easeOut' }
}

describe('prototype document data', () => {
  test('round-trips interactions through node pluginData', () => {
    const { graph, button } = setup()
    writePlugin(graph, button.id, INTERACTIONS_PLUGIN_KEY, [clickNavigate])
    expect(readNodeInteractions(getNodeOrThrow(graph, button.id))).toEqual([clickNavigate])
  })

  test('returns empty for nodes without prototype data', () => {
    const { graph, button } = setup()
    expect(readNodeInteractions(getNodeOrThrow(graph, button.id))).toEqual([])
    expect(readNodeStateModel(getNodeOrThrow(graph, button.id))).toBeNull()
  })

  test('treats malformed JSON as absent instead of throwing', () => {
    const { graph, button } = setup()
    const node = graph.getNode(button.id)
    if (!node) throw new Error('missing node')
    graph.updateNode(button.id, {
      pluginData: [
        { pluginId: PROTOTYPE_PLUGIN_ID, key: INTERACTIONS_PLUGIN_KEY, value: '{not json' }
      ]
    })
    expect(readNodeInteractions(getNodeOrThrow(graph, button.id))).toEqual([])
  })

  test('rejects invalid trigger and action structures', () => {
    const { graph, button } = setup()
    writePlugin(graph, button.id, INTERACTIONS_PLUGIN_KEY, [
      { id: 'bad', trigger: 'onFire', action: { type: 'explode' } }
    ])
    expect(readNodeInteractions(getNodeOrThrow(graph, button.id))).toEqual([])
  })

  test('parses state models and rejects empty state lists', () => {
    const { graph, button } = setup()
    writePlugin(graph, button.id, STATE_PLUGIN_KEY, {
      version: 1,
      initial: 'default',
      states: [
        { name: 'default', visual: { scale: 1 } },
        {
          name: 'pressed',
          visual: { scale: 0.96 },
          transition: { kind: 'spring', spring: { mode: 'time', bounce: 0.2 } }
        }
      ]
    })
    const model = readNodeStateModel(getNodeOrThrow(graph, button.id))
    expect(model?.states.map((state) => state.name)).toEqual(['default', 'pressed'])

    writePlugin(graph, button.id, STATE_PLUGIN_KEY, { version: 1, initial: 'x', states: [] })
    expect(readNodeStateModel(getNodeOrThrow(graph, button.id))).toBeNull()
  })

  test('parses document flows from the root node', () => {
    const { graph, frame } = setup()
    writePlugin(graph, graph.rootId, PROTOTYPE_DOC_PLUGIN_KEY, {
      version: 1,
      flows: [{ id: 'flow-1', name: 'Main flow', startNodeId: frame.id }]
    })
    expect(readPrototypeDocument(graph.getNode(graph.rootId))?.flows[0].startNodeId).toBe(frame.id)
  })

  test('clamps unsafe transition durations out of range', () => {
    const { graph, button } = setup()
    writePlugin(graph, button.id, INTERACTIONS_PLUGIN_KEY, [
      {
        id: 'bad-duration',
        trigger: 'click',
        action: { type: 'navigate', destinationId: 'x' },
        transition: { kind: 'fade', durationMs: -10, easing: 'linear' }
      }
    ])
    expect(readNodeInteractions(getNodeOrThrow(graph, button.id))).toEqual([])
  })
})
