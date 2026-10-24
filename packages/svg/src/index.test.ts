/**
 * SVG tests (ported from the core cases of FigCraft `crates/svg/src/tests.rs`).
 */

import { describe, expect, test } from 'bun:test'

import { Document, Node } from '@zenuxs/doc'
import { Affine } from '@zenuxs/geom'
import { renderNodesToSVG, importSvg } from './index'

function sampleDoc(): { doc: Document; rectId: number } {
  const doc = new Document()
  const page = doc.pages[0]
  const rid = doc.alloc_id()
  const rect = Node.new(rid, { type: 'rectangle' }, 'Rect', 100, 50)
  rect.parent = page
  rect.transform = Affine.new([1, 0, 0, 1, 20, 30])
  rect.fills = [{ kind: { type: 'solid', color: { r: 1, g: 0, b: 0, a: 1 } }, opacity: 1, visible: true, blend: 'normal' }]
  doc.insert(rect)
  doc.node_mut(page)!.children.push(rid)
  return { doc, rectId: rid }
}

describe('svg export', () => {
  test('rectangle_exports_as_path_with_fill', () => {
    const { doc, rectId } = sampleDoc()
    const svg = renderNodesToSVG(doc, [rectId])
    expect(svg).toContain('<svg')
    expect(svg).toContain('data-node-id')
    expect(svg).toContain('fill="#FF0000"')
    expect(svg).toContain('d="M')
  })

  test('transform_becomes_svg_transform', () => {
    const { doc, rectId } = sampleDoc()
    const svg = renderNodesToSVG(doc, [rectId])
    expect(svg).toContain('translate(20 30)')
  })
})

describe('svg import', () => {
  test('path_becomes_vector_node', () => {
    const doc = new Document()
    const svg = '<svg xmlns="http://www.w3.org/2000/svg"><path d="M0 0L100 0L100 100L0 100Z" fill="#FF0000" /></svg>'
    const ids = importSvg(doc, svg)
    expect(ids.length).toBe(1)
    const n = doc.node(ids[0])
    expect(n?.kind.type).toBe('vector')
    expect(n?.fills.length).toBe(1)
  })

  test('rect_becomes_path_node', () => {
    const doc = new Document()
    const svg = '<svg xmlns="http://www.w3.org/2000/svg"><rect x="10" y="20" width="50" height="40" fill="blue" /></svg>'
    const ids = importSvg(doc, svg)
    expect(ids.length).toBe(1)
    expect(doc.node(ids[0])?.name).toBe('SVG Shape')
  })
})
