/**
 * Format round-trip tests (ported from the core cases of FigCraft
 * `crates/format/src/tests.rs` — save then reopen keeps the design).
 */

import { describe, expect, test } from 'bun:test'

import { Document, Node, AutoLayout } from '@zenuxs/doc'
import { Affine } from '@zenuxs/geom'
import { saveZenuxs, openZenuxs, documentToJson, documentFromJson } from './index'

function sampleDoc(): { doc: Document; rectId: number; frameId: number } {
  const doc = new Document()
  const page = doc.pages[0]
  doc.name = 'Sample'
  const frameId = doc.alloc_id()
  const frame = Node.new(frameId, { type: 'frame' }, 'Hero', 390, 844)
  frame.parent = page
  frame.layout = AutoLayout.default()
  frame.layout.mode = 'vertical'
  frame.transform = Affine.new([1, 0, 0, 1, 40, 40])
  frame.fills = [{ kind: { type: 'solid', color: { r: 1, g: 1, b: 1, a: 1 } }, opacity: 1, visible: true, blend: 'normal' }]
  doc.insert(frame)
  doc.node_mut(page)!.children.push(frameId)
  const rectId = doc.alloc_id()
  const rect = Node.new(rectId, { type: 'rectangle' }, 'Card', 200, 100)
  rect.parent = frameId
  rect.transform = Affine.new([1, 0, 0, 1, 16, 24])
  rect.corners = { radii: [8, 8, 8, 8], smoothing: 0 }
  doc.insert(rect)
  doc.node_mut(frameId)!.children.push(rectId)
  return { doc, rectId, frameId }
}

describe('zenuxs format', () => {
  test('document_json_roundtrip_keeps_the_design', () => {
    const { doc, rectId, frameId } = sampleDoc()
    const json = documentToJson(doc)
    const text = JSON.stringify(json)
    const back = documentFromJson(JSON.parse(text))
    expect(back.name).toBe('Sample')
    expect(back.pages.length).toBe(1)
    const frame = back.node(frameId)
    expect(frame?.name).toBe('Hero')
    expect(frame?.width).toBe(390)
    expect(frame?.layout?.mode).toBe('vertical')
    const rect = back.node(rectId)
    expect(rect?.corners.radii).toEqual([8, 8, 8, 8])
    expect(rect?.parent).toBe(frameId)
    expect(back.node(frameId)?.children).toContain(rectId)
  })

  test('save_and_open_zip_roundtrip', () => {
    const { doc, rectId } = sampleDoc()
    const bytes = saveZenuxs(doc, {
      thumbnail: new Uint8Array([137, 80, 78, 71]),
      versions: [{ id: 'v1', label: 'Initial', created: 1700000000 }]
    })
    // ZIP magic PK.
    expect(bytes[0]).toBe(0x50)
    expect(bytes[1]).toBe(0x4b)
    const reopened = openZenuxs(bytes)
    expect(reopened.doc.name).toBe('Sample')
    expect(reopened.doc.node(rectId)?.width).toBe(200)
    expect(reopened.thumbnail).not.toBeNull()
    expect(reopened.versions.length).toBe(1)
  })

  test('bare_document_json_also_opens', () => {
    const { doc } = sampleDoc()
    const bare = new TextEncoder().encode(JSON.stringify(documentToJson(doc)))
    const reopened = openZenuxs(bare)
    expect(reopened.doc.name).toBe('Sample')
  })

  test('defaults_omitted_from_file_json', () => {
    const { doc } = sampleDoc()
    const json = documentToJson(doc)
    const text = JSON.stringify(json)
    // Node-level defaults (visible: true, locked: false, opacity: 1) are omitted.
    const nodes = (JSON.parse(text).nodes as Array<Record<string, unknown>>)
    for (const n of nodes) {
      expect('visible' in n && n.visible === true).toBe(false)
      expect('locked' in n && n.locked === false).toBe(false)
      expect('opacity' in n && n.opacity === 1).toBe(false)
    }
  })
})
