import { afterEach, describe, expect, mock, spyOn, test } from 'bun:test'

import { readNodeInteractions } from '@open-pencil/scene-graph'

import { createZenuxsDesignTools } from '@/app/ai/tools/zenuxs-design'
import type { EditorStore } from '@/app/editor/active-store'
import { createEditorStore } from '@/app/editor/session/create'
import { zenuxsBridge } from '@/app/zenuxs-bridge'
import { getZenuxsEngine, resetZenuxsEngine } from '@/app/zenuxs-engine'

type ToolInput = Record<string, unknown>
type ToolForTest = {
  execute: (input: ToolInput, options: { toolCallId: string; messages: never[] }) => unknown
}

const stores: EditorStore[] = []

afterEach(() => {
  mock.restore()
  for (const store of stores.splice(0)) store.dispose()
  resetZenuxsEngine()
})

function createStore(): EditorStore {
  const store = createEditorStore()
  stores.push(store)
  return store
}

async function invoke(tool: ToolForTest, input: ToolInput): Promise<unknown> {
  return await tool.execute(input, { toolCallId: 'test-call', messages: [] })
}

function snapshotGraph(store: EditorStore): string {
  return JSON.stringify([...store.graph.nodes.values()].sort((a, b) => a.id.localeCompare(b.id)))
}

function snapshotEngine(): string {
  const document = getZenuxsEngine().doc()
  return JSON.stringify({
    pages: document.pages,
    nodes: [...document.ids()].sort((a, b) => a - b).map((id) => document.node(id))
  })
}

function createRectangle(store: EditorStore, overrides: Record<string, unknown> = {}) {
  return store.graph.createNode('RECTANGLE', store.state.currentPageId, {
    name: 'Source',
    width: 80,
    height: 40,
    ...overrides
  })
}

describe('Zenuxs AI design tools', () => {
  test('creates a screen with the frame command and one undo reverts it', async () => {
    const store = createStore()
    const execute = spyOn(getZenuxsEngine(), 'execute')
    const tools = createZenuxsDesignTools(store)

    await invoke(tools.zenuxs_create_screen, {
      name: 'Checkout',
      x: 12,
      y: 24,
      width: 390,
      height: 844
    })

    expect(execute.mock.calls.map(([command]) => command)).toEqual(['shape.frame'])
    const screen = store.graph.getChildren(store.state.currentPageId)[0]
    expect(screen).toMatchObject({
      type: 'FRAME',
      name: 'Checkout',
      x: 12,
      y: 24,
      width: 390,
      height: 844
    })
    expect(store.undo.depth).toBe(1)
    store.undoAction()
    expect(store.graph.getNode(screen?.id ?? '')).toBeUndefined()
  })

  test('creates a rectangle with the rectangle command and one undo reverts it', async () => {
    const store = createStore()
    const execute = spyOn(getZenuxsEngine(), 'execute')
    const tools = createZenuxsDesignTools(store)

    await invoke(tools.zenuxs_create_rectangle, {
      name: 'Card',
      x: 10,
      y: 20,
      width: 240,
      height: 120
    })

    expect(execute.mock.calls.map(([command]) => command)).toEqual(['shape.rectangle'])
    const rectangle = store.graph.getChildren(store.state.currentPageId)[0]
    expect(rectangle).toMatchObject({
      type: 'RECTANGLE',
      name: 'Card',
      x: 10,
      y: 20,
      width: 240,
      height: 120
    })
    expect(store.undo.depth).toBe(1)
    store.undoAction()
    expect(store.graph.getNode(rectangle?.id ?? '')).toBeUndefined()
  })

  test('creates text with the text command and one undo reverts it', async () => {
    const store = createStore()
    const execute = spyOn(getZenuxsEngine(), 'execute')
    const tools = createZenuxsDesignTools(store)

    await invoke(tools.zenuxs_create_text, {
      characters: 'Welcome',
      fontSize: 24,
      x: 30,
      y: 40
    })

    expect(execute.mock.calls.map(([command]) => command)).toEqual(['text.create'])
    const text = store.graph.getChildren(store.state.currentPageId)[0]
    expect(text).toMatchObject({ type: 'TEXT', text: 'Welcome', fontSize: 24, x: 30, y: 40 })
    expect(store.undo.depth).toBe(1)
    store.undoAction()
    expect(store.graph.getNode(text?.id ?? '')).toBeUndefined()
  })

  test('keeps the requested name on the created text node', async () => {
    const store = createStore()
    spyOn(getZenuxsEngine(), 'execute')
    const tools = createZenuxsDesignTools(store)

    await invoke(tools.zenuxs_create_text, {
      name: 'Headline',
      characters: 'Welcome to Zenuxs',
      fontSize: 28
    })

    const text = store.graph.getChildren(store.state.currentPageId)[0]
    expect(text).toMatchObject({ type: 'TEXT', name: 'Headline', text: 'Welcome to Zenuxs' })
  })

  test('creates a vector with the vector command and one undo reverts it', async () => {
    const store = createStore()
    const execute = spyOn(getZenuxsEngine(), 'execute')
    const tools = createZenuxsDesignTools(store)
    const points: Array<[number, number]> = [
      [0, 0],
      [40, 0],
      [20, 30]
    ]

    await invoke(tools.zenuxs_create_vector, { name: 'Triangle', points, closed: true })

    expect(execute.mock.calls.map(([command]) => command)).toEqual(['shape.vector'])
    const vector = store.graph.getChildren(store.state.currentPageId)[0]
    expect(vector?.type).toBe('VECTOR')
    expect(vector?.name).toBe('Triangle')
    expect(vector?.vectorNetwork?.vertices.map(({ x, y }) => [x, y])).toEqual(points)
    expect(vector?.vectorNetwork?.segments).toHaveLength(3)
    expect(vector?.vectorNetwork?.regions).toHaveLength(1)
    expect(store.undo.depth).toBe(1)
    store.undoAction()
    expect(store.graph.getNode(vector?.id ?? '')).toBeUndefined()
  })

  test('sets only the supported visual fields with one undo reverting all changes', async () => {
    const store = createStore()
    const node = createRectangle(store)
    const originalFills = structuredClone(node.fills)
    const execute = spyOn(getZenuxsEngine(), 'execute')
    const tools = createZenuxsDesignTools(store)

    await invoke(tools.zenuxs_set_node_properties, {
      id: node.id,
      name: 'Primary card',
      x: 16,
      y: 24,
      width: 120,
      height: 72,
      cornerRadius: 8,
      fills: [{ type: 'SOLID', color: { r: 0.1, g: 0.2, b: 0.3, a: 1 } }]
    })

    expect(execute.mock.calls.map(([command]) => command)).toEqual(['node.set'])
    expect(store.graph.getNode(node.id)).toMatchObject({
      name: 'Primary card',
      x: 16,
      y: 24,
      width: 120,
      height: 72,
      cornerRadius: 8,
      fills: [
        {
          type: 'SOLID',
          color: { r: 0.1, g: 0.2, b: 0.3, a: 1 },
          opacity: 1,
          visible: true
        }
      ]
    })
    expect(store.undo.depth).toBe(1)
    store.undoAction()
    expect(store.graph.getNode(node.id)).toMatchObject({
      name: 'Source',
      x: 0,
      y: 0,
      width: 80,
      height: 40,
      cornerRadius: 0,
      fills: originalFills
    })
  })

  test('marks a component with the component command and one undo reverts it', async () => {
    const store = createStore()
    const node = createRectangle(store)
    const execute = spyOn(getZenuxsEngine(), 'execute')
    const tools = createZenuxsDesignTools(store)

    await invoke(tools.zenuxs_make_component, { id: node.id, description: 'Reusable card' })

    expect(execute.mock.calls.map(([command]) => command)).toEqual(['component.create'])
    expect(store.graph.getNode(node.id)?.type).toBe('COMPONENT')
    expect(store.undo.depth).toBe(1)
    store.undoAction()
    expect(store.graph.getNode(node.id)).toMatchObject({ type: 'RECTANGLE', name: 'Source' })
  })

  test('adds navigation to an existing frame with one undo reverting it', async () => {
    const store = createStore()
    const source = createRectangle(store)
    const destination = store.graph.createNode('FRAME', store.state.currentPageId, {
      name: 'Details',
      width: 390,
      height: 844
    })
    const execute = spyOn(getZenuxsEngine(), 'execute')
    const tools = createZenuxsDesignTools(store)

    await invoke(tools.zenuxs_add_navigation, {
      sourceId: source.id,
      destinationFrameId: destination.id
    })

    expect(execute.mock.calls.map(([command]) => command)).toEqual(['proto.interaction.add'])
    const updatedSource = store.graph.getNode(source.id)
    if (!updatedSource) throw new Error('navigation source disappeared')
    expect(readNodeInteractions(updatedSource)).toEqual([
      {
        id: `${source.id}:0`,
        trigger: 'click',
        action: { type: 'navigate', destinationId: destination.id },
        transition: { kind: 'instant' }
      }
    ])
    expect(store.undo.depth).toBe(1)
    store.undoAction()
    const revertedSource = store.graph.getNode(source.id)
    if (!revertedSource) throw new Error('navigation source disappeared')
    expect(readNodeInteractions(revertedSource)).toEqual([])
  })

  test('preserves selected graph and engine IDs after a tool creates a node', async () => {
    const store = createStore()
    const activePageId = store.state.currentPageId
    const selected = createRectangle(store)
    store.select([selected.id])
    const tools = createZenuxsDesignTools(store)

    await invoke(tools.zenuxs_create_rectangle, { name: 'New card' })

    expect([...store.state.selectedIds]).toEqual([selected.id])
    expect(store.state.currentPageId).toBe(activePageId)
    expect(getZenuxsEngine().ds().page).toBe(zenuxsBridge.toEngineId(activePageId))
    expect(getZenuxsEngine().ds().selection).toEqual([zenuxsBridge.toEngineId(selected.id)])
  })

  test('preserves unsupported SceneGraph node types during a Zenuxs tool call', async () => {
    const store = createStore()
    const rounded = store.graph.createNode('ROUNDED_RECTANGLE', store.state.currentPageId, {
      name: 'Rounded',
      width: 70,
      height: 50
    })
    const boolean = store.graph.createNode('BOOLEAN_OPERATION', store.state.currentPageId, {
      name: 'Boolean',
      width: 30,
      height: 30
    })
    const connector = store.graph.createNode('CONNECTOR', store.state.currentPageId, {
      name: 'Connector',
      width: 20,
      height: 20
    })
    const shapeWithText = store.graph.createNode('SHAPE_WITH_TEXT', store.state.currentPageId, {
      name: 'Labeled',
      width: 60,
      height: 40
    })
    const tools = createZenuxsDesignTools(store)

    await invoke(tools.zenuxs_create_rectangle, { name: 'New shape' })

    expect(store.graph.getNode(rounded.id)?.type).toBe('ROUNDED_RECTANGLE')
    expect(store.graph.getNode(boolean.id)?.type).toBe('BOOLEAN_OPERATION')
    expect(store.graph.getNode(connector.id)?.type).toBe('CONNECTOR')
    expect(store.graph.getNode(shapeWithText.id)?.type).toBe('SHAPE_WITH_TEXT')
  })

  test('a graph-native instance keeps Zenuxs tool calls from deleting real nodes', async () => {
    const store = createStore()
    const tools = createZenuxsDesignTools(store)

    const home = (await invoke(tools.zenuxs_create_screen, {
      name: 'Home',
      x: 0,
      y: 0,
      width: 390,
      height: 844
    })) as { createdNodeIds: string[] }
    const details = (await invoke(tools.zenuxs_create_screen, {
      name: 'Details',
      x: 420,
      y: 0,
      width: 390,
      height: 844
    })) as { createdNodeIds: string[] }
    const card = (await invoke(tools.zenuxs_create_rectangle, {
      name: 'Card',
      x: 24,
      y: 120,
      width: 342,
      height: 180
    })) as { createdNodeIds: string[] }
    const component = (await invoke(tools.zenuxs_make_component, {
      id: card.createdNodeIds[0]
    })) as { componentNodeIds: string[] }

    // The core component tools create instances directly on the graph, which
    // hands the node a synthetic id such as `0:3` instead of a numeric one.
    store.graph.createInstance(component.componentNodeIds[0], store.state.currentPageId, {
      x: 24,
      y: 340
    })

    await invoke(tools.zenuxs_create_vector, {
      name: 'Spark',
      points: [
        [0, 0],
        [40, 0],
        [20, 36]
      ],
      closed: true
    })
    await invoke(tools.zenuxs_add_navigation, {
      sourceId: home.createdNodeIds[0],
      destinationFrameId: details.createdNodeIds[0]
    })

    expect(store.graph.getNode(home.createdNodeIds[0])?.type).toBe('FRAME')
    expect(store.graph.getNode(details.createdNodeIds[0])?.type).toBe('FRAME')
    expect(store.graph.getNode(card.createdNodeIds[0])?.type).toBe('COMPONENT')
    const interactions = readNodeInteractions(store.graph.getNode(home.createdNodeIds[0]))
    expect(interactions.map((interaction) => interaction.action)).toEqual([
      { type: 'navigate', destinationId: details.createdNodeIds[0] }
    ])
  })

  test('keeps engine document canonical and history aligned through editor undo and redo', async () => {
    const store = createStore()
    const tools = createZenuxsDesignTools(store)

    await invoke(tools.zenuxs_create_rectangle, { name: 'Undoable' })
    expect(getZenuxsEngine().doc().nodesCount()).toBe(store.graph.nodes.size - 1)
    expect(getZenuxsEngine().ds().history.undo).toHaveLength(0)
    expect(getZenuxsEngine().ds().history.redo).toHaveLength(0)

    store.undoAction()
    expect(getZenuxsEngine().doc().nodesCount()).toBe(store.graph.nodes.size - 1)
    expect(getZenuxsEngine().ds().history.undo).toHaveLength(0)
    expect(getZenuxsEngine().ds().history.redo).toHaveLength(0)

    store.redoAction()
    expect(getZenuxsEngine().doc().nodesCount()).toBe(store.graph.nodes.size - 1)
    expect(getZenuxsEngine().ds().history.undo).toHaveLength(0)
    expect(getZenuxsEngine().ds().history.redo).toHaveLength(0)
    expect(
      getZenuxsEngine()
        .doc()
        .ids()
        .map((id) => getZenuxsEngine().doc().node(id)?.name)
    ).toContain('Undoable')
  })

  test('restores engine document, history and journal after an executed command fails afterward', async () => {
    const store = createStore()
    const engine = getZenuxsEngine()
    const previousDocument = engine.ds().doc
    const previousUndo = [...engine.ds().history.undo]
    const previousRedo = [...engine.ds().history.redo]
    const previousJournal = [...engine.journal]
    const previousGraph = snapshotGraph(store)
    const originalExecute = engine.execute.bind(engine)
    const execute = spyOn(engine, 'execute').mockImplementation((command, params) => {
      const result = originalExecute(command, params)
      throw new Error(`failure after ${String(result.ok)}`)
    })
    const tools = createZenuxsDesignTools(store)

    await expect(
      invoke(tools.zenuxs_create_rectangle, { name: 'Should roll back' })
    ).rejects.toThrow(/failed/)

    expect(snapshotGraph(store)).toBe(previousGraph)
    expect(engine.ds().doc).toBe(previousDocument)
    expect(engine.ds().history.undo).toEqual(previousUndo)
    expect(engine.ds().history.redo).toEqual(previousRedo)
    expect(engine.journal).toEqual(previousJournal)
    expect(store.undo.depth).toBe(0)
  })

  test('runs AI lifecycle feedback, completion, logging, flash and validation for navigation', async () => {
    const store = createStore()
    const source = createRectangle(store)
    const destination = store.graph.createNode('FRAME', store.state.currentPageId, {
      name: 'Destination',
      width: 200,
      height: 300
    })
    const lifecycle: string[] = []
    const tools = createZenuxsDesignTools(store, {
      onBeforeExecute: (name) => lifecycle.push(`before:${name}`),
      onAfterExecute: (name) => lifecycle.push(`after:${name}`),
      onFlashNodes: (ids) => lifecycle.push(`flash:${ids.join(',')}`),
      onToolLog: (entry) => lifecycle.push(`log:${entry.tool}`),
      onPrototypeMutation: () => lifecycle.push('prototype-validation'),
      onLayoutMutation: () => lifecycle.push('layout-validation')
    })

    await invoke(tools.zenuxs_add_navigation, {
      sourceId: source.id,
      destinationFrameId: destination.id
    })

    expect(lifecycle).toEqual([
      'before:zenuxs_add_navigation',
      'prototype-validation',
      'layout-validation',
      `flash:${source.id}`,
      'log:zenuxs_add_navigation',
      'after:zenuxs_add_navigation'
    ])
  })

  test('rolls back graph and engine when a post-execution lifecycle hook fails', async () => {
    const store = createStore()
    const engine = getZenuxsEngine()
    const previousGraph = snapshotGraph(store)
    const previousDocument = engine.ds().doc
    const previousJournal = [...engine.journal]
    const tools = createZenuxsDesignTools(store, {
      onAfterExecute: () => {
        throw new Error('validation hook failed')
      }
    })

    await expect(
      invoke(tools.zenuxs_create_rectangle, { name: 'Should roll back' })
    ).rejects.toThrow(/validation hook failed/)

    expect(snapshotGraph(store)).toBe(previousGraph)
    expect(engine.ds().doc).toBe(previousDocument)
    expect(engine.ds().history.undo).toHaveLength(0)
    expect(engine.ds().history.redo).toHaveLength(0)
    expect(engine.journal).toEqual(previousJournal)
    expect(store.undo.depth).toBe(0)
  })

  test('rejects invalid parameters without changing either document or undo history', async () => {
    const store = createStore()
    const tools = createZenuxsDesignTools(store)
    const graphBefore = snapshotGraph(store)
    const engineBefore = snapshotEngine()

    await expect(
      invoke(tools.zenuxs_create_vector, { points: [[0, 0]], closed: true })
    ).rejects.toThrow()

    expect(snapshotGraph(store)).toBe(graphBefore)
    expect(snapshotEngine()).toBe(engineBefore)
    expect(store.undo.depth).toBe(0)
  })

  test('rejects unsupported properties without changing either document or undo history', async () => {
    const store = createStore()
    const node = createRectangle(store)
    const tools = createZenuxsDesignTools(store)
    const graphBefore = snapshotGraph(store)
    const engineBefore = snapshotEngine()

    await expect(
      invoke(tools.zenuxs_set_node_properties, { id: node.id, opacity: 0.5 })
    ).rejects.toThrow()

    expect(snapshotGraph(store)).toBe(graphBefore)
    expect(snapshotEngine()).toBe(engineBefore)
    expect(store.undo.depth).toBe(0)
  })

  test('rejects a missing navigation destination without changing either document or undo history', async () => {
    const store = createStore()
    const source = createRectangle(store)
    const tools = createZenuxsDesignTools(store)
    const graphBefore = snapshotGraph(store)
    const engineBefore = snapshotEngine()

    await expect(
      invoke(tools.zenuxs_add_navigation, {
        sourceId: source.id,
        destinationFrameId: 'missing-frame'
      })
    ).rejects.toThrow(/destination/i)

    expect(snapshotGraph(store)).toBe(graphBefore)
    expect(snapshotEngine()).toBe(engineBefore)
    expect(store.undo.depth).toBe(0)
  })
})
