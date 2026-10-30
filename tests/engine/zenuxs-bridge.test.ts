import { describe, expect, test } from 'bun:test'

import type {
  Interaction as ZenuxsInteraction,
  VectorNetwork as ZenuxsVectorNetwork
} from '@zenuxs/doc'

import { readNodeInteractions, SceneGraph } from '@open-pencil/scene-graph'

import {
  applyEngineDocToGraph,
  NodeIdMap,
  reapplyEnginePatch,
  revertEnginePatch,
  sceneGraphToZenuxsDoc,
  zenuxsDocToSceneGraph,
  zenuxsBridge
} from '@/app/zenuxs-bridge'
import { getZenuxsEngine, resetZenuxsEngine } from '@/app/zenuxs-engine'

function resetEngine(): void {
  resetZenuxsEngine()
}

describe('Zenuxs Document Bridge', () => {
  test('NodeIdMap maps string IDs to numeric NodeIds consistently', () => {
    const map = new NodeIdMap()
    const id1 = map.toNum('1:2')
    const id2 = map.toNum('frame-1')
    expect(id1).toBeGreaterThan(0)
    expect(id2).toBeGreaterThan(0)
    expect(id1).not.toBe(id2)

    expect(map.toStr(id1)).toBe('1:2')
    expect(map.toStr(id2)).toBe('frame-1')
  })

  test('NodeIdMap never hands a synthetic id to a node that already claims it', () => {
    const map = new NodeIdMap()
    // Nodes created outside the bridge get synthetic ids such as `0:2`. The
    // first one is allocated from a counter that starts at 100 and must not
    // steal an engine id a graph node already claims.
    expect(map.toNum('0:1')).toBeGreaterThan(0)
    expect(map.toNum('102')).toBe(102)
    expect(map.toNum('0:2')).not.toBe(102)

    const strings = ['0:1', '0:2', '103', '105']
    for (const id of strings) expect(map.toStr(map.toNum(id))).toBe(id)

    const nums = strings.map((id) => map.toNum(id))
    expect(new Set(nums).size).toBe(strings.length)

    // A reserved numeric graph id still keeps its own value afterwards.
    map.reserve(110)
    expect(map.toNum('110')).toBe(110)
    expect(map.toStr(110)).toBe('110')
  })

  test('sceneGraphToZenuxsDoc converts scene graph nodes and preserves hierarchy', () => {
    const graph = new SceneGraph()
    const page = graph.addPage('Page 1')
    const rect = graph.createNode('RECTANGLE', page.id, {
      name: 'Hero Card',
      x: 100,
      y: 200,
      width: 400,
      height: 300,
      fills: [
        {
          type: 'SOLID',
          color: { r: 0.1, g: 0.2, b: 0.3, a: 1 },
          opacity: 0.9,
          visible: true
        }
      ],
      cornerRadius: 16
    })

    const { doc, idMap } = sceneGraphToZenuxsDoc(graph)
    expect(doc.pages.length).toBeGreaterThan(0)

    const numRectId = idMap.toNum(rect.id)
    const zn = doc.node(numRectId)
    expect(zn).not.toBeNull()
    expect(zn?.name).toBe('Hero Card')
    expect(zn?.width).toBe(400)
    expect(zn?.height).toBe(300)
    expect(zn?.transform.coeffs[4]).toBe(100)
    expect(zn?.transform.coeffs[5]).toBe(200)
    expect(zn?.corners.radii[0]).toBe(16)
    expect(zn?.fills.length).toBe(1)
  })

  test('zenuxsBridge synchronizes scene graph into Zenuxs session', () => {
    const graph = new SceneGraph()
    const page = graph.addPage('Design Screen')
    graph.createNode('FRAME', page.id, {
      name: 'Mobile Frame',
      x: 0,
      y: 0,
      width: 393,
      height: 852
    })

    const doc = zenuxsBridge.syncToZenuxs(graph)
    expect(doc.pages.length).toBeGreaterThan(0)

    const res = zenuxsBridge.execute('shape.rectangle', {
      x: 20,
      y: 40,
      width: 300,
      height: 60
    })
    expect(res).toBeTruthy()
  })
})

describe('Zenuxs engine patch round-trip', () => {
  function setup() {
    resetEngine()
    const graph = new SceneGraph()
    const page = graph.addPage('Page A')
    const frame = graph.createNode('FRAME', page.id, {
      name: 'Frame',
      x: 0,
      y: 0,
      width: 400,
      height: 400
    })
    zenuxsBridge.syncToZenuxs(graph, page.id)
    return { graph, page, frame }
  }

  test('created nodes land on the active page', () => {
    const { graph, page } = setup()
    zenuxsBridge.execute('shape.rectangle', { x: 20, y: 20, width: 100, height: 60 })
    const patch = zenuxsBridge.applyEngineChanges(graph)
    expect(patch.changed).toBe(true)

    const [created] = patch.created
    expect(created).toBeDefined()
    const node = graph.getNode(created?.node.id ?? '')
    expect(node?.name).toBe('Rectangle')
    expect(node?.parentId).toBe(page.id)
    expect(graph.getNode(page.id)?.childIds).toContain(node?.id)
  })

  test('vector networks and navigation interactions round-trip through the bridge', () => {
    const { graph, page, frame } = setup()
    const points: Array<[number, number]> = [
      [10, 20],
      [80, 20],
      [40, 90]
    ]
    const result = zenuxsBridge.execute('shape.vector', { points, closed: true }) as {
      id: number
    }
    zenuxsBridge.execute('proto.interaction.add', {
      id: result.id,
      dest: zenuxsBridge.toEngineId(frame.id),
      trigger: 'onClick',
      transition: 'smartAnimate',
      durationMs: 450
    })

    const patch = zenuxsBridge.applyEngineChanges(graph)
    expect(patch.changed).toBe(true)
    const vectorId = patch.created[0]?.node.id
    if (!vectorId) throw new Error('vector node was not created')
    const vector = graph.getNode(vectorId)
    if (!vector) throw new Error('vector node is missing from the graph')
    expect(vector?.vectorNetwork?.vertices.map(({ x, y }) => [x, y])).toEqual(points)
    expect(vector?.vectorNetwork?.segments).toHaveLength(points.length)
    expect(vector?.vectorNetwork?.regions).toHaveLength(1)
    expect(readNodeInteractions(vector)).toEqual([
      {
        id: `${result.id}:0`,
        trigger: 'click',
        action: { type: 'navigate', destinationId: frame.id },
        transition: { kind: 'smartAnimate', durationMs: 450 }
      }
    ])

    const stableId = vector.id
    const doc = zenuxsBridge.syncToZenuxs(graph, page.id)
    const synced = doc.node(zenuxsBridge.toEngineId(stableId))
    if (synced?.kind.type !== 'vector') throw new Error('not a vector')
    const syncedNetwork = synced.kind.network as ZenuxsVectorNetwork
    expect(syncedNetwork.vertices.map(({ x, y }) => [x, y])).toEqual(points)
    expect(syncedNetwork.segments).toHaveLength(points.length)
    expect(syncedNetwork.regions).toHaveLength(1)
    expect(synced.interactions).toMatchObject([
      {
        trigger: { type: 'onClick' },
        actions: [{ type: 'navigate', dest: zenuxsBridge.toEngineId(frame.id) }],
        transition: { type: 'smartAnimate' },
        duration_ms: 450
      }
    ])
    expect(graph.getNode(stableId)?.id).toBe(stableId)
  })

  test('unsupported prototype actions produce descriptive bridge errors', () => {
    const graph = new SceneGraph()
    const page = graph.addPage('Page')
    const source = graph.createNode('FRAME', page.id)
    graph.updateNode(source.id, {
      pluginData: [
        {
          pluginId: 'open-pencil',
          key: 'interactions',
          value: JSON.stringify([
            {
              id: 'back',
              trigger: 'click',
              action: { type: 'back' }
            }
          ])
        }
      ]
    })

    expect(() => sceneGraphToZenuxsDoc(graph)).toThrow('unsupported prototype action "back"')
  })

  test('unsupported prototype transitions produce descriptive bridge errors', () => {
    const graph = new SceneGraph()
    const page = graph.addPage('Page')
    const source = graph.createNode('FRAME', page.id)
    graph.updateNode(source.id, {
      pluginData: [
        {
          pluginId: 'open-pencil',
          key: 'interactions',
          value: JSON.stringify([
            {
              id: 'spring',
              trigger: 'click',
              action: { type: 'navigate', destinationId: page.id },
              transition: {
                kind: 'spring',
                spring: { mode: 'physics', mass: 1, stiffness: 100, damping: 15 }
              }
            }
          ])
        }
      ]
    })

    expect(() => sceneGraphToZenuxsDoc(graph)).toThrow('unsupported prototype transition "spring"')
  })

  test('malformed Zenuxs vector networks produce descriptive bridge errors', () => {
    const graph = new SceneGraph()
    const page = graph.addPage('Page')
    const vector = graph.createNode('VECTOR', page.id)
    const { doc, idMap } = sceneGraphToZenuxsDoc(graph)
    const engineNode = doc.node_mut(idMap.toNum(vector.id))
    if (engineNode?.kind.type !== 'vector') throw new Error('not a vector')
    engineNode.kind.network = { vertices: 'invalid', segments: [], regions: [] }

    expect(() => zenuxsDocToSceneGraph(doc, idMap)).toThrow('invalid Zenuxs vector network')
  })

  test('unsupported Zenuxs transitions include their variant in bridge errors', () => {
    const graph = new SceneGraph()
    const page = graph.addPage('Page')
    const vector = graph.createNode('VECTOR', page.id)
    const { doc, idMap } = sceneGraphToZenuxsDoc(graph)
    const engineNode = doc.node_mut(idMap.toNum(vector.id))
    if (engineNode?.kind.type !== 'vector') throw new Error('not a vector')
    const interaction: ZenuxsInteraction = {
      trigger: { type: 'onClick' },
      actions: [{ type: 'navigate', dest: idMap.toNum(page.id) }],
      transition: { type: 'instant' }
    }
    Object.assign(interaction, { transition: { type: 'fade' } })
    engineNode.interactions = [interaction]

    expect(() => zenuxsDocToSceneGraph(doc, idMap)).toThrow('unsupported Zenuxs transition "fade"')
  })

  test('field changes revert and reapply', () => {
    const { graph, frame } = setup()
    const engineId = zenuxsBridge.toEngineId(frame.id)
    zenuxsBridge.execute('node.set', {
      id: engineId,
      props: { name: 'Renamed', x: 77 }
    })
    const patch = zenuxsBridge.applyEngineChanges(graph)
    expect(patch.changed).toBe(true)
    expect(graph.getNode(frame.id)?.name).toBe('Renamed')
    expect(graph.getNode(frame.id)?.x).toBe(77)

    revertEnginePatch(graph, patch)
    expect(graph.getNode(frame.id)?.name).toBe('Frame')
    expect(graph.getNode(frame.id)?.x).toBe(0)

    reapplyEnginePatch(graph, patch)
    expect(graph.getNode(frame.id)?.name).toBe('Renamed')
    expect(graph.getNode(frame.id)?.x).toBe(77)
  })

  test('deleted subtrees are restored on revert', () => {
    const { graph, page } = setup()
    const frame = graph.createNode('FRAME', page.id, {
      name: 'Group',
      x: 0,
      y: 0,
      width: 200,
      height: 200
    })
    const child = graph.createNode('RECTANGLE', frame.id, {
      name: 'Child',
      x: 10,
      y: 10,
      width: 80,
      height: 80
    })
    const leaf = graph.createNode('TEXT', child.id, {
      name: 'Label',
      x: 2,
      y: 2,
      width: 40,
      height: 16,
      text: 'hi'
    })
    zenuxsBridge.syncToZenuxs(graph, page.id)
    getZenuxsEngine().ds().selection = [zenuxsBridge.toEngineId(frame.id)]
    zenuxsBridge.execute('edit.delete')

    const patch = zenuxsBridge.applyEngineChanges(graph)
    expect(patch.changed).toBe(true)
    expect(graph.getNode(frame.id)).toBeUndefined()
    expect(graph.getNode(leaf.id)).toBeUndefined()

    revertEnginePatch(graph, patch)
    expect(graph.getNode(frame.id)?.name).toBe('Group')
    expect(graph.getNode(leaf.id)?.name).toBe('Label')
    expect(graph.getNode(child.id)?.parentId).toBe(frame.id)
    expect(graph.getNode(leaf.id)?.parentId).toBe(child.id)

    reapplyEnginePatch(graph, patch)
    expect(graph.getNode(frame.id)).toBeUndefined()
    expect(graph.getNode(leaf.id)).toBeUndefined()
  })

  test('a run with no mutations produces an empty patch', () => {
    const { graph } = setup()
    const patch = zenuxsBridge.applyEngineChanges(graph)
    expect(patch.changed).toBe(false)
    expect(patch.created).toHaveLength(0)
    expect(patch.deleted).toHaveLength(0)
    expect(patch.fieldChanges).toHaveLength(0)
  })
})
