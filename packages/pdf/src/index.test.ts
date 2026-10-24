/**
 * PDF export tests (ported from the core cases of FigCraft
 * `crates/pdf/src/tests.rs`).
 */

import { describe, expect, test } from 'bun:test'

import { Document, Node } from '@zenuxs/doc'
import { exportFramesPdf, exportFramesPdfRaster } from './index'

function sampleDoc(): { doc: Document; frameId: number } {
  const doc = new Document()
  const page = doc.pages[0]
  const fid = doc.alloc_id()
  const frame = Node.new(fid, { type: 'frame' }, 'Page', 400, 300)
  frame.parent = page
  frame.fills = [{ kind: { type: 'solid', color: { r: 1, g: 1, b: 1, a: 1 } }, opacity: 1, visible: true, blend: 'normal' }]
  doc.insert(frame)
  doc.node_mut(page)!.children.push(fid)
  const rid = doc.alloc_id()
  const rect = Node.new(rid, { type: 'rectangle' }, 'Rect', 100, 50)
  rect.parent = fid
  rect.transform = { coeffs: [1, 0, 0, 1, 10, 10] }
  rect.fills = [{ kind: { type: 'solid', color: { r: 0, g: 0, b: 1, a: 1 } }, opacity: 1, visible: true, blend: 'normal' }]
  doc.insert(rect)
  doc.node_mut(fid)!.children.push(rid)
  return { doc, frameId: fid }
}

function asText(bytes: Uint8Array): string {
  return new TextDecoder().decode(bytes)
}

describe('pdf export', () => {
  test('output_starts_with_pdf_magic_and_ends_with_eof', () => {
    const { doc, frameId } = sampleDoc()
    const bytes = exportFramesPdf(doc, [frameId])
    const text = asText(bytes)
    expect(text.startsWith('%PDF-1.7')).toBe(true)
    expect(text.endsWith('%%EOF\n')).toBe(true)
  })

  test('page_and_content_objects_present', () => {
    const { doc, frameId } = sampleDoc()
    const text = asText(exportFramesPdf(doc, [frameId]))
    expect(text).toContain('/Type /Catalog')
    expect(text).toContain('/Type /Page')
    expect(text).toContain('/MediaBox [0 0 595 842]')
    expect(text).toContain('\nf\n')
  })

  test('xref_offsets_are_monotonic', () => {
    const { doc, frameId } = sampleDoc()
    const text = asText(exportFramesPdf(doc, [frameId]))
    const offsets = [...text.matchAll(/^(\d{10}) 00000 n$/gm)].map((m) => Number(m[1]))
    for (let i = 1; i < offsets.length; i++) {
      expect(offsets[i]).toBeGreaterThan(offsets[i - 1])
    }
  })

  test('raster_fallback_is_valid_pdf', () => {
    const { doc, frameId } = sampleDoc()
    const text = asText(exportFramesPdfRaster(doc, [frameId]))
    expect(text.startsWith('%PDF-1.7')).toBe(true)
  })
})
