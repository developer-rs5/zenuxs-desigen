/**
 * Renderer tests (ported from the core cases of FigCraft
 * `crates/render/src/tests.rs` — geometry and state, plus pixel checks in the
 * browser suite).
 */

import { describe, expect, test } from 'bun:test'

import { Document, Node } from '@zenuxs/doc'
import { nodePath, renderNode, type Canvas2DLike } from './index'

/** A recording canvas stub that counts path ops. */
function stubCtx(): Canvas2DLike & { moves: number; fills: number; strokes: number; texts: string[] } {
  const stub = {
    moves: 0,
    fills: 0,
    strokes: 0,
    texts: [] as string[],
    save() {},
    restore() {},
    translate() {},
    scale() {},
    rotate() {},
    beginPath() {},
    closePath() {},
    moveTo() {
      this.moves += 1
    },
    lineTo() {},
    bezierCurveTo() {},
    arc() {},
    rect() {},
    clip() {},
    fill() {
      this.fills += 1
    },
    stroke() {
      this.strokes += 1
    },
    drawImage() {},
    createLinearGradient() {
      return { addColorStop() {} }
    },
    createRadialGradient() {
      return { addColorStop() {} }
    },
    fillStyle: '',
    strokeStyle: '',
    lineWidth: 1,
    lineCap: 'butt',
    lineJoin: 'miter',
    miterLimit: 4,
    globalAlpha: 1,
    shadowColor: 'transparent',
    shadowBlur: 0,
    shadowOffsetX: 0,
    shadowOffsetY: 0,
    filter: 'none',
    transform() {},
    fillText(text: string) {
      this.texts.push(text)
    }
  }
  return stub as unknown as Canvas2DLike & { moves: number; fills: number; strokes: number; texts: string[] }
}

describe('render', () => {
  test('nodePath_rectangle_bounds', () => {
    const n = Node.new(1, { type: 'rectangle' }, 'Rect', 100, 50)
    const p = nodePath(n)
    expect(p).not.toBeNull()
    const b = p!.bounding_box()
    expect(b?.x1).toBeCloseTo(100, 6)
    expect(b?.y1).toBeCloseTo(50, 6)
  })

  test('render_draws_fill_and_children', () => {
    const doc = new Document()
    const page = doc.pages[0]
    const fid = doc.alloc_id()
    const frame = Node.new(fid, { type: 'frame' }, 'Frame', 200, 200)
    frame.fills = [{ kind: { type: 'solid', color: { r: 1, g: 0, b: 0, a: 1 } }, opacity: 1, visible: true, blend: 'normal' }]
    frame.parent = page
    doc.insert(frame)
    doc.node_mut(page)!.children.push(fid)
    const cid = doc.alloc_id()
    const child = Node.new(cid, { type: 'rectangle' }, 'Rect', 50, 50)
    child.parent = fid
    child.fills = [{ kind: { type: 'solid', color: { r: 0, g: 0, b: 1, a: 1 } }, opacity: 1, visible: true, blend: 'normal' }]
    doc.insert(child)
    doc.node_mut(fid)!.children.push(cid)

    const ctx = stubCtx()
    renderNode(ctx, doc, fid)
    expect(ctx.fills).toBeGreaterThanOrEqual(2)
  })

  test('render_text_draws_characters', () => {
    const doc = new Document()
    const page = doc.pages[0]
    const tid = doc.alloc_id()
    const t = Node.new(tid, {
      type: 'text',
      characters: 'Hello\nWorld',
      style: { font_family: 'Inter', font_style: 'Regular', font_features: {}, variation_axes: {}, font_size: 16, line_height: { unit: 'auto' }, letter_spacing: { unit: 'percent', value: 0 }, decoration: 'none', decoration_look: { style: 'solid', offset: 0, thickness: 1, color: null }, text_case: 'original', links: {} },
      runs: [],
      auto_resize: 'widthAndHeight',
      align_h: 'left',
      align_v: 'top',
      paragraph_spacing: 0,
      paragraph_indent: 0,
      list: 'none',
      paragraphs: [],
      list_spacing: 0,
      hanging_punctuation: false,
      hanging_list: false,
      leading_trim: 'none',
      max_lines: 0,
      features: {},
      path: null
    }, 'Text', 100, 40)
    t.parent = page
    doc.insert(t)
    doc.node_mut(page)!.children.push(tid)
    const ctx = stubCtx()
    renderNode(ctx, doc, tid)
    expect(ctx.texts).toEqual(['Hello', 'World'])
  })

  test('invisible_nodes_are_skipped', () => {
    const doc = new Document()
    const page = doc.pages[0]
    const rid = doc.alloc_id()
    const r = Node.new(rid, { type: 'rectangle' }, 'Hidden', 50, 50)
    r.visible = false
    r.parent = page
    doc.insert(r)
    doc.node_mut(page)!.children.push(rid)
    const ctx = stubCtx()
    renderNode(ctx, doc, rid)
    expect(ctx.fills).toBe(0)
  })
})
