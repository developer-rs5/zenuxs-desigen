import { describe, expect, test } from 'bun:test'

import { FigmaAPI, SceneGraph } from '@open-pencil/core'
import { getPluginData } from '@open-pencil/core/figma-api/plugin-data'
import { contentHash, applySourcedImage } from '@open-pencil/core/tools'
import type { SceneNode } from '@open-pencil/scene-graph'

import { PNG_BYTES } from '#tests/helpers/image-sourcing'

const SVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100" width="100" height="100">
  <rect x="10" y="10" width="80" height="80" fill="#3366ff" />
</svg>`

function setup() {
  const graph = new SceneGraph()
  const page = graph.getPages()[0]
  if (!page) throw new Error('Expected a default page')
  return { graph, page, figma: new FigmaAPI(graph) }
}

describe('applySourcedImage', () => {
  test('applies raster bytes as an image fill', async () => {
    const { graph, page, figma } = setup()
    const node = graph.createNode('RECTANGLE', page.id, {
      name: 'HeroImg',
      width: 400,
      height: 300
    })

    const result = await applySourcedImage({
      figma,
      nodeId: node.id,
      bytes: PNG_BYTES,
      mimeType: 'image/png'
    })

    expect('error' in result).toBe(false)
    if ('error' in result) return
    expect(result.isVector).toBe(false)
    expect(node.fills[0]).toMatchObject({ type: 'IMAGE', imageScaleMode: 'FILL' })
    const hash = node.fills[0]?.imageHash
    expect(hash).toBeString()
    // The verified bytes must be the bytes that reached the document.
    expect(graph.images.get(hash as string)).toEqual(PNG_BYTES)
  })

  test('imports a sanitized svg as editable vector nodes', async () => {
    const { graph, page, figma } = setup()
    const node = graph.createNode('RECTANGLE', page.id, {
      name: 'HeroArt',
      x: 40,
      y: 60,
      width: 200,
      height: 100
    })

    const result = await applySourcedImage({
      figma,
      nodeId: node.id,
      bytes: new TextEncoder().encode(SVG),
      mimeType: 'image/svg+xml',
      svg: SVG
    })

    expect('error' in result).toBe(false)
    if ('error' in result) return
    expect(result.isVector).toBe(true)
    // The placeholder is replaced by the vector frame.
    expect(graph.getNode(node.id)).toBeUndefined()
    const frame = graph.getNode(result.id)
    expect(frame?.type).toBe('FRAME')
    expect(frame?.width).toBe(200)
    expect(frame?.height).toBe(100)
    expect(graph.getChildren(result.id).length).toBeGreaterThan(0)
  })

  test('keeps the position of the replaced placeholder', async () => {
    const { graph, page, figma } = setup()
    const node = graph.createNode('RECTANGLE', page.id, {
      name: 'HeroArt',
      x: 40,
      y: 60,
      width: 200,
      height: 100
    })

    const result = await applySourcedImage({
      figma,
      nodeId: node.id,
      bytes: new TextEncoder().encode(SVG),
      mimeType: 'image/svg+xml',
      svg: SVG
    })

    if ('error' in result) throw new Error(result.error)
    const frame = graph.getNode(result.id)
    expect(frame?.x).toBe(40)
    expect(frame?.y).toBe(60)
  })

  test('rejects a target that is not an image area', async () => {
    const { graph, page, figma } = setup()
    const node = graph.createNode('TEXT', page.id, { name: 'Heading' })

    const result = await applySourcedImage({
      figma,
      nodeId: node.id,
      bytes: PNG_BYTES,
      mimeType: 'image/png'
    })

    expect('error' in result && result.error).toContain('not a suitable image target')
  })

  test('rejects a container that already has content', async () => {
    const { graph, page, figma } = setup()
    const frame = graph.createNode('FRAME', page.id, { name: 'Card' })
    graph.createNode('RECTANGLE', frame.id, { name: 'Icon' })

    const result = await applySourcedImage({
      figma,
      nodeId: frame.id,
      bytes: PNG_BYTES,
      mimeType: 'image/png'
    })

    expect('error' in result && result.error).toContain('has children')
  })

  test('rejects open vector geometry', async () => {
    const { graph, page, figma } = setup()
    const vector = graph.createNode('VECTOR', page.id, {
      name: 'Open vector',
      vectorNetwork: {
        vertices: [
          { x: 0, y: 0 },
          { x: 10, y: 10 }
        ],
        segments: [
          { start: 0, end: 1, tangentStart: { x: 0, y: 0 }, tangentEnd: { x: 10, y: 10 } }
        ],
        regions: []
      }
    })

    const result = await applySourcedImage({
      figma,
      nodeId: vector.id,
      bytes: PNG_BYTES,
      mimeType: 'image/png'
    })

    expect('error' in result && result.error).toContain('no closed vector regions')
  })

  test('reports a missing target', async () => {
    const { figma } = setup()
    const result = await applySourcedImage({
      figma,
      nodeId: 'missing:1',
      bytes: PNG_BYTES,
      mimeType: 'image/png'
    })
    expect('error' in result && result.error).toBe('Not found')
  })

  test('refuses bytes that no longer match the verified content', async () => {
    const { graph, page, figma } = setup()
    const node = graph.createNode('RECTANGLE', page.id, { name: 'HeroImg' })

    const result = await applySourcedImage({
      figma,
      nodeId: node.id,
      bytes: PNG_BYTES,
      mimeType: 'image/png',
      expectedContentHash: 'sha256:0000000000000000000000000000000000000000000000000000000000000000'
    })

    expect('error' in result && result.error).toMatch(/no longer matches/)
    expect(node.fills[0]?.type).not.toBe('IMAGE')
    expect(graph.images.size).toBe(0)
  })

  test('accepts bytes that match the verified content', async () => {
    const { graph, page, figma } = setup()
    const node = graph.createNode('RECTANGLE', page.id, { name: 'HeroImg' })
    const hash = await contentHash(PNG_BYTES)

    const result = await applySourcedImage({
      figma,
      nodeId: node.id,
      bytes: PNG_BYTES,
      mimeType: 'image/png',
      expectedContentHash: hash
    })

    expect('error' in result).toBe(false)
  })

  test('attaches the sourcing provenance to the node', async () => {
    const { graph, page, figma } = setup()
    const node = graph.createNode('RECTANGLE', page.id, { name: 'HeroImg' })

    await applySourcedImage({
      figma,
      nodeId: node.id,
      bytes: PNG_BYTES,
      mimeType: 'image/png',
      provenance: {
        origin: 'search',
        provider: 'wikimedia',
        contentHash: 'sha256:abc',
        license: 'CC BY 2.0',
        attribution: 'Photo by Someone',
        verification: {
          assetContentHash: 'sha256:abc',
          inspectedContentHash: 'sha256:abc',
          relevanceScore: 0.9,
          matchedRequirements: ['subject'],
          failedRequirements: [],
          reason: 'matches',
          inspectedVia: 'bytes',
          verifiedAt: 1
        }
      }
    })

    const stored = getPluginData(graph.getNode(node.id) as SceneNode, 'image-sourcing')
    expect(stored).toContain('wikimedia')
    expect(stored).toContain('CC BY 2.0')
  })
})
