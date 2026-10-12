import { describe, expect, test } from 'bun:test'

import { BUILTIN_IO_FORMATS, IORegistry, penFormat } from '@open-pencil/core/io'
import { parsePenFile, writePenFile } from '@open-pencil/pen'
import {
  INTERACTIONS_PLUGIN_KEY,
  PROTOTYPE_DOC_PLUGIN_KEY,
  PROTOTYPE_PLUGIN_ID,
  activeFlow,
  readNodeInteractions,
  readPrototypeDocument,
  serializePluginValue,
  SceneGraph,
  type PrototypeDocument,
  type PrototypeInteraction
} from '@open-pencil/scene-graph'

/**
 * Audit 3.14 resolved: `.pen` carries an optional `pluginData` extension on
 * both `PenDocument` and `PenNode`, `writePenFile` serializes it back out, and
 * `penFormat` registers `writeDocument`. Node ids are verbatim in `.pen`
 * (`buildBaseOverrides` reads `id: pen.id`), so embedded prototype references
 * need no remap — unlike `.fig`.
 */
describe('.pen prototype metadata round trip (audit 3.14)', () => {
  test('the .pen adapter declares a writer and appears in writable formats', () => {
    expect(penFormat.support.readDocument).toBe(true)
    expect(penFormat.support.writeDocument).toBe(true)
    expect(typeof penFormat.writeDocument).toBe('function')

    const registry = new IORegistry(BUILTIN_IO_FORMATS)
    const writable = registry.listWritableFormats().map((format) => format.id)
    expect(writable).toContain('pen')
    expect(writable).toContain('fig')
  })

  test('a .pen file without pluginData parses to empty node pluginData', () => {
    const document = JSON.stringify({
      version: '1',
      children: [{ type: 'frame', id: 'screen-1', name: 'Screen', width: 400, height: 300 }]
    })
    const graph = parsePenFile(document)
    const screen = graph.getNode('screen-1')
    expect(screen).toBeDefined()
    expect(screen?.pluginData).toEqual([])
  })

  test('per-node prototype pluginData survives a write/read round trip', () => {
    const graph = new SceneGraph()
    const page = graph.getPages()[0]
    const screen = graph.createNodeWithId('screen-1', 'FRAME', page.id, {
      name: 'Screen',
      width: 400,
      height: 300
    })
    const interaction: PrototypeInteraction = {
      id: 'nav',
      trigger: 'click',
      action: { type: 'navigate', destinationId: 'screen-1' },
      transition: { kind: 'fade', durationMs: 200, easing: 'easeOut' }
    }
    graph.updateNode(screen.id, {
      pluginData: [
        {
          pluginId: PROTOTYPE_PLUGIN_ID,
          key: INTERACTIONS_PLUGIN_KEY,
          value: serializePluginValue([interaction])
        }
      ]
    })

    const reopened = parsePenFile(writePenFile(graph))
    const restored = reopened.getNode('screen-1')
    if (!restored) throw new Error('screen-1 did not survive the .pen round trip')
    expect(readNodeInteractions(restored)).toEqual([interaction])
  })

  test('document-level flows live on PenDocument and reopen on the root node', () => {
    const graph = new SceneGraph()
    const page = graph.getPages()[0]
    graph.createNodeWithId('home', 'FRAME', page.id, { name: 'Home', width: 800, height: 600 })
    graph.createNodeWithId('detail', 'FRAME', page.id, { name: 'Detail', width: 800, height: 600 })
    const prototype: PrototypeDocument = {
      version: 1,
      flows: [
        { id: 'flow-main', name: 'Main', startNodeId: 'home' },
        { id: 'flow-alt', name: 'Alt', startNodeId: 'detail' }
      ],
      activeFlowId: 'flow-alt'
    }
    graph.updateNode(graph.rootId, {
      pluginData: [
        {
          pluginId: PROTOTYPE_PLUGIN_ID,
          key: PROTOTYPE_DOC_PLUGIN_KEY,
          value: serializePluginValue(prototype)
        }
      ]
    })

    const written = writePenFile(graph)
    const document = JSON.parse(written) as { pluginData?: unknown }
    expect(document.pluginData).toHaveLength(1)

    const reopened = parsePenFile(written)
    const root = reopened.getNode(reopened.rootId)
    const restored = root ? readPrototypeDocument(root) : null
    expect(restored).toEqual(prototype)
    expect(activeFlow(restored)?.id).toBe('flow-alt')
    // Ids stay verbatim: no remap pass exists for `.pen`.
    expect(reopened.getNode('home')).toBeDefined()
    expect(reopened.getNode('detail')).toBeDefined()
  })
})
