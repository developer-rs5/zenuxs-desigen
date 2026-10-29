import { afterEach, describe, expect, mock, spyOn, test } from 'bun:test'

import type { Interaction } from '@zenuxs/doc'

import { createPrototypeCritic, runZenuxsPrototypeValidation } from '@/app/ai/chat/prototype-critic'
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

function createRectangle(store: EditorStore, overrides: Record<string, unknown> = {}) {
  return store.graph.createNode('RECTANGLE', store.state.currentPageId, {
    name: 'Source',
    width: 80,
    height: 40,
    ...overrides
  })
}

describe('Zenuxs prototype validation', () => {
  function setInteractions(id: number, interactions: Interaction[]) {
    const node = getZenuxsEngine().doc().node_mut(id)
    if (!node) throw new Error(`engine node ${String(id)} is missing`)
    node.interactions = interactions
  }

  async function linkScreens(store: EditorStore) {
    const source = createRectangle(store)
    const destination = store.graph.createNode('FRAME', store.state.currentPageId, {
      name: 'Destination',
      width: 200,
      height: 300
    })
    const tools = createZenuxsDesignTools(store)
    await invoke(tools.zenuxs_add_navigation, {
      sourceId: source.id,
      destinationFrameId: destination.id
    })
    return {
      sourceId: zenuxsBridge.toEngineId(source.id),
      destinationId: zenuxsBridge.toEngineId(destination.id)
    }
  }

  test('reports ok for navigation authored by the AI tool', async () => {
    const store = createStore()
    await linkScreens(store)

    expect(runZenuxsPrototypeValidation()).toEqual({ ok: true, errors: [] })
  })

  test('reports a destination the Zenuxs document no longer contains', async () => {
    const store = createStore()
    const { destinationId } = await linkScreens(store)
    getZenuxsEngine().doc().delete(destinationId)

    expect(runZenuxsPrototypeValidation()).toEqual({
      ok: false,
      errors: [`Source: interaction 0 → missing destination "${String(destinationId)}"`]
    })
  })

  test('reports an interaction with no actions', async () => {
    const store = createStore()
    const { sourceId } = await linkScreens(store)
    setInteractions(sourceId, [{ trigger: { type: 'onClick' }, actions: [] }])

    expect(runZenuxsPrototypeValidation()).toEqual({
      ok: false,
      errors: ['Source: interaction 0 has no actions']
    })
  })

  test('reports a transition duration above the prototype limit', async () => {
    const store = createStore()
    const { sourceId, destinationId } = await linkScreens(store)
    setInteractions(sourceId, [
      {
        trigger: { type: 'onClick' },
        actions: [{ type: 'navigate', dest: destinationId }],
        transition: { type: 'dissolve' },
        duration_ms: 120_001
      }
    ])

    expect(runZenuxsPrototypeValidation()).toEqual({
      ok: false,
      errors: ['Source: interaction 0 → duration out of range']
    })
  })

  test('reports a gesture delay above the prototype limit', async () => {
    const store = createStore()
    const { sourceId, destinationId } = await linkScreens(store)
    setInteractions(sourceId, [
      {
        trigger: { type: 'mouseEnter' },
        actions: [{ type: 'navigate', dest: destinationId }],
        delay_ms: 600_001
      }
    ])

    expect(runZenuxsPrototypeValidation()).toEqual({
      ok: false,
      errors: ['Source: interaction 0 → delay out of range']
    })
  })

  test('reports a flow whose start node was deleted', async () => {
    const store = createStore()
    const { sourceId } = await linkScreens(store)
    getZenuxsEngine().execute('proto.flow.add', { start: sourceId, name: 'Checkout' })
    getZenuxsEngine().doc().delete(sourceId)

    expect(runZenuxsPrototypeValidation()).toEqual({
      ok: false,
      errors: [`Flow "Checkout" start "${String(sourceId)}" does not exist`]
    })
  })

  test('surfaces a throwing validator as a failed verdict', () => {
    spyOn(getZenuxsEngine(), 'doc').mockImplementation(() => {
      throw new Error('engine unavailable')
    })

    expect(runZenuxsPrototypeValidation()).toEqual({
      ok: false,
      errors: ['Zenuxs prototype validation could not run: engine unavailable']
    })
  })

  test('feeds a failed verdict into one repair round and then stops', async () => {
    const store = createStore()
    const { destinationId } = await linkScreens(store)
    getZenuxsEngine().doc().delete(destinationId)
    const critic = createPrototypeCritic()

    critic.noteMutation()
    critic.recordValidation(runZenuxsPrototypeValidation())

    const repair = critic.takeRepair()
    expect(repair).toContain('Automatic prototype validation failed')
    expect(repair).toContain('missing destination')
    expect(critic.takeRepair()).toBeNull()
    expect(critic.report()).toMatchObject({
      mutated: true,
      repairRoundsUsed: 1,
      validation: { ok: false }
    })
  })

  test('records the Zenuxs verdict through the tool lifecycle', async () => {
    const store = createStore()
    const critic = createPrototypeCritic()
    const tools = createZenuxsDesignTools(store, {
      onPrototypeMutation: () => {
        critic.noteMutation()
        critic.recordValidation(runZenuxsPrototypeValidation())
      }
    })
    const source = createRectangle(store)
    const destination = store.graph.createNode('FRAME', store.state.currentPageId, {
      name: 'Destination',
      width: 200,
      height: 300
    })

    await invoke(tools.zenuxs_add_navigation, {
      sourceId: source.id,
      destinationFrameId: destination.id
    })

    expect(critic.report()).toMatchObject({
      mutated: true,
      validation: { ok: true, errors: [] }
    })
    expect(critic.takeRepair()).toBeNull()
  })
})
