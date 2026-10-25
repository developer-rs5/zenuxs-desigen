import { describe, expect, test } from 'bun:test'

import { SceneGraph, type SceneNode } from '@open-pencil/scene-graph'

import {
  NodeIdMap,
  sceneGraphToZenuxsDoc,
  zenuxsDocToSceneGraph,
  zenuxsBridge
} from '@/app/zenuxs-bridge'

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
