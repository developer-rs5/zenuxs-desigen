import { describe, expect, test } from 'bun:test'

import { parsePenFile, writePenFile } from '@open-pencil/pen'
import {
  ANIMATIONS_PLUGIN_KEY,
  INTERACTIONS_PLUGIN_KEY,
  PROTOTYPE_DOC_PLUGIN_KEY,
  PROTOTYPE_PLUGIN_ID,
  STATE_PLUGIN_KEY,
  activeFlow,
  readNodeAnimations,
  readNodeInteractions,
  readNodeStateModel,
  readPrototypeDocument,
  serializePluginValue,
  SceneGraph,
  type PluginDataEntry,
  type PrototypeAnimations,
  type PrototypeDocument,
  type PrototypeInteraction,
  type PrototypeStateModel,
  type SceneNode
} from '@open-pencil/scene-graph'

import { createPrototypeRuntime } from '#core/prototype/runtime'

import { repoPath } from '#tests/helpers/paths'

/**
 * Semantic `.pen` round trip (mission §4): write → reopen → the prototype is
 * still the same prototype and still executable. Assertions read through the
 * scene-graph prototype accessors, never raw JSON, and ids are expected to be
 * verbatim — `.pen` needs no id remap.
 */

function withPluginValue(node: SceneNode, key: string, value: unknown): PluginDataEntry[] {
  return [
    ...node.pluginData.filter(
      (entry) => !(entry.pluginId === PROTOTYPE_PLUGIN_ID && entry.key === key)
    ),
    { pluginId: PROTOTYPE_PLUGIN_ID, key, value: serializePluginValue(value) }
  ]
}

const navigateInteraction: PrototypeInteraction = {
  id: 'nav-detail',
  trigger: 'click',
  action: { type: 'navigate', destinationId: 'detail' },
  transition: { kind: 'fade', durationMs: 250, easing: 'easeOut' }
}

const overlayInteraction: PrototypeInteraction = {
  id: 'nav-overlay',
  trigger: 'click',
  action: { type: 'openOverlay', overlayId: 'overlay', backdropOpacity: 0.5 }
}

const stateInteraction: PrototypeInteraction = {
  id: 'state-highlight',
  trigger: 'click',
  action: { type: 'setState', state: 'highlighted' },
  transition: { kind: 'instant' }
}

const stateModel: PrototypeStateModel = {
  version: 1,
  initial: 'idle',
  states: [
    { name: 'idle', visual: {} },
    {
      name: 'highlighted',
      visual: { scale: 1.1, opacity: 0.5 },
      transition: { kind: 'fade', durationMs: 150, easing: 'easeOut' }
    }
  ]
}

const animations: PrototypeAnimations = {
  version: 1,
  animations: [
    {
      id: 'pulse',
      name: 'Pulse',
      durationMs: 400,
      playMode: 'once',
      easing: 'easeInOut',
      keyframes: [
        { offsetMs: 0, visual: { scale: 1 } },
        { offsetMs: 400, visual: { scale: 1.25 } }
      ]
    }
  ]
}

const prototypeDocument: PrototypeDocument = {
  version: 1,
  flows: [
    { id: 'flow-main', name: 'Main', startNodeId: 'home' },
    { id: 'flow-alt', name: 'Alt', startNodeId: 'detail' }
  ],
  activeFlowId: 'flow-alt'
}

function buildPrototypeGraph(): SceneGraph {
  const graph = new SceneGraph()
  const page = graph.getPages()[0]
  const home = graph.createNodeWithId('home', 'FRAME', page.id, {
    name: 'Home',
    width: 800,
    height: 600
  })
  graph.createNodeWithId('detail', 'FRAME', page.id, { name: 'Detail', width: 800, height: 600 })
  graph.createNodeWithId('overlay', 'FRAME', page.id, { name: 'Overlay', width: 320, height: 240 })
  const card = graph.createNodeWithId('card', 'RECTANGLE', home.id, {
    name: 'Card',
    x: 40,
    y: 40,
    width: 200,
    height: 120
  })
  graph.createNodeWithId('go-detail', 'RECTANGLE', home.id, {
    name: 'GoDetail',
    x: 40,
    y: 200,
    width: 120,
    height: 48
  })
  graph.createNodeWithId('go-overlay', 'RECTANGLE', home.id, {
    name: 'GoOverlay',
    x: 40,
    y: 280,
    width: 120,
    height: 48
  })

  const root = graph.getNode(graph.rootId)
  if (!root) throw new Error('graph root missing')
  graph.updateNode(graph.rootId, {
    pluginData: withPluginValue(root, PROTOTYPE_DOC_PLUGIN_KEY, prototypeDocument)
  })
  graph.updateNode(card.id, {
    pluginData: withPluginValue(card, INTERACTIONS_PLUGIN_KEY, [stateInteraction])
  })
  graph.updateNode(card.id, { pluginData: withPluginValue(card, STATE_PLUGIN_KEY, stateModel) })
  graph.updateNode(card.id, {
    pluginData: withPluginValue(card, ANIMATIONS_PLUGIN_KEY, animations)
  })
  const goDetail = graph.getNode('go-detail')
  if (goDetail) {
    graph.updateNode(goDetail.id, {
      pluginData: withPluginValue(goDetail, INTERACTIONS_PLUGIN_KEY, [navigateInteraction])
    })
  }
  const goOverlay = graph.getNode('go-overlay')
  if (goOverlay) {
    graph.updateNode(goOverlay.id, {
      pluginData: withPluginValue(goOverlay, INTERACTIONS_PLUGIN_KEY, [overlayInteraction])
    })
  }
  return graph
}

describe('.pen prototype round trip', () => {
  test('flows, states, interactions, and animations survive write → reopen', () => {
    const graph = buildPrototypeGraph()
    const reopened = parsePenFile(writePenFile(graph))

    // Ids are verbatim: every reference still resolves without a remap pass.
    for (const id of ['home', 'detail', 'overlay', 'card', 'go-detail', 'go-overlay']) {
      expect(reopened.getNode(id)).toBeDefined()
    }
    expect(reopened.getNode('card')).toMatchObject({
      name: 'Card',
      x: 40,
      y: 40,
      width: 200,
      height: 120
    })

    const root = reopened.getNode(reopened.rootId)
    if (!root) throw new Error('root node missing after reopen')
    const restoredDoc = readPrototypeDocument(root)
    expect(restoredDoc).toEqual(prototypeDocument)
    expect(activeFlow(restoredDoc)?.id).toBe('flow-alt')

    const card = reopened.getNode('card')
    const goDetail = reopened.getNode('go-detail')
    const goOverlay = reopened.getNode('go-overlay')
    if (!card || !goDetail || !goOverlay) throw new Error('prototype nodes missing after reopen')

    expect(readNodeInteractions(goDetail)).toEqual([navigateInteraction])
    expect(readNodeInteractions(goOverlay)).toEqual([overlayInteraction])
    expect(readNodeInteractions(card)).toEqual([stateInteraction])
    expect(readNodeStateModel(card)).toEqual(stateModel)
    expect(readNodeAnimations(card)).toEqual(animations)
  })

  test('the reopened prototype executes: state drives visuals, navigation resolves', () => {
    const reopened = parsePenFile(writePenFile(buildPrototypeGraph()))
    const root = reopened.getNode(reopened.rootId)
    const doc = root ? readPrototypeDocument(root) : null
    const startNodeId = activeFlow(doc)?.startNodeId
    expect(startNodeId).toBe('detail')

    const runtime = createPrototypeRuntime(reopened)
    runtime.start(0, 'home')
    expect(runtime.getScreenId()).toBe('home')

    // State model drives a visual on the reopened document.
    runtime.click('card', 10)
    expect(runtime.getRenderState()?.nodeVisuals.get('card')).toMatchObject({
      scale: 1.1,
      opacity: 0.5
    })

    // Overlay reference resolves.
    runtime.click('go-overlay', 20)
    const overlayState = runtime.getRenderState()
    expect(overlayState?.drawIds).toContain('overlay')
    expect(overlayState?.backdropOpacity).toBe(0.5)

    // Navigate destination resolves: the runtime switched screens.
    runtime.click('go-detail', 30)
    expect(runtime.getScreenId()).toBe('detail')
    expect(runtime.getWarnings()).toEqual([])
  })

  test('a modified prototype survives a second save/reopen cycle', () => {
    const reopened = parsePenFile(writePenFile(buildPrototypeGraph()))

    const root = reopened.getNode(reopened.rootId)
    if (!root) throw new Error('root node missing')
    const doc = readPrototypeDocument(root)
    if (!doc) throw new Error('prototype document missing after first cycle')
    reopened.updateNode(reopened.rootId, {
      pluginData: withPluginValue(root, PROTOTYPE_DOC_PLUGIN_KEY, {
        ...doc,
        flows: [...doc.flows, { id: 'flow-third', name: 'Third', startNodeId: 'overlay' }],
        activeFlowId: 'flow-main'
      } satisfies PrototypeDocument)
    })
    const detail = reopened.getNode('detail')
    if (!detail) throw new Error('detail missing')
    const backInteraction: PrototypeInteraction = {
      id: 'nav-home',
      trigger: 'click',
      action: { type: 'navigate', destinationId: 'home' }
    }
    reopened.updateNode(detail.id, {
      pluginData: withPluginValue(detail, INTERACTIONS_PLUGIN_KEY, [backInteraction])
    })

    const secondReopen = parsePenFile(writePenFile(reopened))
    const secondRoot = secondReopen.getNode(secondReopen.rootId)
    if (!secondRoot) throw new Error('root node missing after second cycle')
    const secondDoc = readPrototypeDocument(secondRoot)
    expect(secondDoc?.flows).toHaveLength(3)
    expect(activeFlow(secondDoc)?.id).toBe('flow-main')

    const secondDetail = secondReopen.getNode('detail')
    if (!secondDetail) throw new Error('detail missing after second cycle')
    expect(readNodeInteractions(secondDetail)).toEqual([backInteraction])

    // Untouched prototype data from cycle one is still present.
    const secondCard = secondReopen.getNode('card')
    if (!secondCard) throw new Error('card missing after second cycle')
    expect(readNodeStateModel(secondCard)).toEqual(stateModel)
    expect(readNodeAnimations(secondCard)).toEqual(animations)
    expect(secondReopen.getNode('go-detail')).toBeDefined()
    expect(secondReopen.getNode('overlay')).toBeDefined()
  })
})

interface NodeSnapshot {
  id: string
  type: string
  name: string
  parentId: string | null
  childIds: string[]
  x: number
  y: number
  width: number
  height: number
  layoutMode: string
  fills: SceneNode['fills']
  strokes: SceneNode['strokes']
  text: string
  componentId: string | null
  pluginData: PluginDataEntry[]
  bindings: Record<string, string>
}

interface CollectionSnapshot {
  modes: string[]
  variables: Array<{ name: string; type: string; values: unknown[] }>
}

interface GraphSnapshot {
  nodes: NodeSnapshot[]
  collections: CollectionSnapshot[]
}

/** Page ids regenerate on read (`.pen` has no page identity): collapse them. */
function stableParentId(graph: SceneGraph, node: SceneNode): string | null {
  const parent = node.parentId ? graph.getNode(node.parentId) : undefined
  if (!parent || parent.type === 'CANVAS' || parent.id === graph.rootId) return null
  return parent.id
}

function snapshotGraph(graph: SceneGraph): GraphSnapshot {
  const nodes: NodeSnapshot[] = []
  for (const node of graph.getAllNodes()) {
    if (node.id === graph.rootId || node.type === 'CANVAS') continue
    nodes.push({
      id: node.id,
      type: node.type,
      name: node.name,
      parentId: stableParentId(graph, node),
      childIds: [...node.childIds],
      x: node.x,
      y: node.y,
      width: node.width,
      height: node.height,
      layoutMode: node.layoutMode,
      fills: node.fills,
      strokes: node.strokes,
      text: node.text,
      componentId: node.componentId,
      pluginData: node.pluginData,
      // Variable ids regenerate on read; bindings are compared by name.
      bindings: Object.fromEntries(
        Object.entries(node.boundVariables).map(([field, variableId]) => [
          field,
          graph.variables.get(variableId)?.name ?? variableId
        ])
      )
    })
  }
  nodes.sort((a, b) => a.id.localeCompare(b.id))

  const collections: CollectionSnapshot[] = []
  for (const collection of graph.variableCollections.values()) {
    const variables: CollectionSnapshot['variables'] = []
    for (const variableId of collection.variableIds) {
      const variable = graph.variables.get(variableId)
      if (!variable) continue
      variables.push({
        name: variable.name,
        type: variable.type,
        values: collection.modes.map((mode) => variable.valuesByMode[mode.modeId])
      })
    }
    variables.sort((a, b) => a.name.localeCompare(b.name))
    collections.push({ modes: collection.modes.map((mode) => mode.name), variables })
  }
  return { nodes, collections }
}

describe('.pen fixture idempotence', () => {
  const fixtures = [
    'pencil_button.pen',
    'pencil_simple.pen',
    'pen-layout-defaults.pen',
    'pen-variables.pen'
  ]

  for (const fixture of fixtures) {
    test(`${fixture} reopens to the same graph and rewrites byte-identically`, async () => {
      const source = await Bun.file(repoPath(`tests/fixtures/${fixture}`)).text()
      const first = parsePenFile(source)
      const written = writePenFile(first)
      const second = parsePenFile(written)

      expect(snapshotGraph(second)).toEqual(snapshotGraph(first))
      expect(writePenFile(second)).toBe(written)
    })
  }
})
