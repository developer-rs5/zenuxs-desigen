import { describe, expect, test } from 'bun:test'

import { SceneGraph } from '@open-pencil/scene-graph'

import { zenuxsFormat } from '@/app/document/io/zenuxs'

describe('ZenuxsDesign Native Format (.zenuxs)', () => {
  test('zenuxsFormat has correct adapter properties and support flags', () => {
    expect(zenuxsFormat.id).toBe('zenuxs')
    expect(zenuxsFormat.extensions).toContain('zenuxs')
    expect(zenuxsFormat.support.readDocument).toBe(true)
    expect(zenuxsFormat.support.writeDocument).toBe(true)
    expect(zenuxsFormat.support.exportDocument).toBe(true)
    expect(zenuxsFormat.support.exportSelection).toBe(true)
  })

  test('zenuxsFormat writes and reads a scene graph round-trip', async () => {
    const graph = new SceneGraph()
    const page = graph.addPage('Mobile App')
    graph.createNode('RECTANGLE', page.id, {
      name: 'Primary Button',
      x: 20,
      y: 50,
      width: 320,
      height: 56,
      cornerRadius: 12,
      fills: [
        {
          type: 'SOLID',
          color: { r: 0.2, g: 0.5, b: 0.9, a: 1 },
          opacity: 1,
          visible: true
        }
      ]
    })

    const writeResult = await zenuxsFormat.writeDocument!(graph)
    expect(writeResult.format).toBe('zenuxs')
    expect(writeResult.extension).toBe('zenuxs')
    expect(writeResult.data).toBeInstanceOf(Uint8Array)
    expect((writeResult.data as Uint8Array).length).toBeGreaterThan(50)

    const readResult = await zenuxsFormat.readDocument!({
      data: writeResult.data as Uint8Array,
      name: 'app.zenuxs'
    })
    expect(readResult.sourceFormat).toBe('zenuxs')
    expect(readResult.graph).toBeInstanceOf(SceneGraph)

    const readPages = readResult.graph.getPages()
    expect(readPages.length).toBeGreaterThan(0)
    expect(readPages.map((p) => p.name)).toContain('Mobile App')
  })
})
