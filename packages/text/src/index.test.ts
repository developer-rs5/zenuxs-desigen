/**
 * Text layout tests (ported from the core cases of FigCraft
 * `crates/text/src/layout_tests.rs`).
 */

import { describe, expect, test } from 'bun:test'

import { TextData, TextStyle } from '@zenuxs/doc'
import { EstimateShaper, layoutText, textHeight, textSize, createDocMeasure } from './index'

function data(characters: string, fontSize = 16): TextData {
  const t = TextData.default()
  t.characters = characters
  t.style = { ...TextStyle.default(), font_size: fontSize }
  return t
}

describe('text layout', () => {
  test('single_line_measures_its_width', () => {
    const layout = layoutText(data('Hello'), 1000, EstimateShaper)
    expect(layout.lines.length).toBe(1)
    expect(layout.height).toBeCloseTo(16 * 1.4, 6)
  })

  test('hard_breaks_make_lines', () => {
    const layout = layoutText(data('Hello\nWorld'), 1000, EstimateShaper)
    expect(layout.lines.length).toBe(2)
    expect(layout.lines[0].runs[0].text).toBe('Hello')
    expect(layout.lines[1].runs[0].text).toBe('World')
  })

  test('wraps_long_text_at_width', () => {
    const layout = layoutText(data('The quick brown fox jumps over the lazy dog'), 100, EstimateShaper)
    expect(layout.lines.length).toBeGreaterThan(1)
    for (const line of layout.lines) {
      expect(line.width).toBeLessThanOrEqual(100 + 16)
    }
  })

  test('height_grows_with_lines', () => {
    const one = textHeight(data('One line'), 1000)
    const two = textHeight(data('One line\nTwo line'), 1000)
    expect(two).toBeGreaterThan(one)
  })

  test('natural_size_for_auto_text', () => {
    const [w, h] = textSize(data('Hello'))
    expect(w).toBeGreaterThan(0)
    expect(h).toBeCloseTo(16 * 1.4, 6)
  })

  test('doc_measure_reads_text_nodes', () => {
    const { Document, Node } = require('@zenuxs/doc') as typeof import('@zenuxs/doc')
    const doc = new Document()
    const id = doc.alloc_id()
    const td = data('Hi')
    const kind = { type: 'text' as const, ...td }
    const n = Node.new(id, kind, 'Text', 100, 30)
    doc.insert(n)
    const m = createDocMeasure()
    expect(m.textHeight(doc, id, 100)).toBeGreaterThan(0)
    expect(m.textBaseline(doc, id)).toBeGreaterThan(0)
  })
})
