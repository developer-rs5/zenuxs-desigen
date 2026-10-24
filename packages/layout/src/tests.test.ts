/**
 * Layout tests (ported from the core cases of FigCraft
 * `crates/layout/src/tests.rs` and `behaviour_tests.rs`).
 */

import { describe, expect, test } from 'bun:test'

import { Document, Node, AutoLayout, Sizing } from '@zenuxs/doc'
import { NoMeasure, clampSize, axisFactors, layoutPage, flowChildren, mainOffsets, gridLines } from './lib'

const M = NoMeasure

function frame(doc: Document, name: string, w: number, h: number): number {
  const id = doc.alloc_id()
  const n = Node.new(id, { type: 'frame' }, name, w, h)
  n.layout = AutoLayout.default()
  doc.insert(n)
  return id
}

function rect(doc: Document, name: string, w: number, h: number): number {
  const id = doc.alloc_id()
  doc.insert(Node.new(id, { type: 'rectangle' }, name, w, h))
  return id
}

function attach(doc: Document, parent: number, child: number): void {
  const p = doc.node_mut(parent)!
  p.children.push(child)
  const c = doc.node_mut(child)!
  c.parent = parent
}

describe('layout', () => {
  test('clampSize', () => {
    expect(clampSize(-5, null, null)).toBe(0)
    expect(clampSize(NaN, null, null)).toBe(0)
    expect(clampSize(50, 10, 100)).toBe(50)
    expect(clampSize(5, 10, 100)).toBe(10)
    expect(clampSize(500, 10, 100)).toBe(100)
    // When min > max, min wins.
    expect(clampSize(50, 100, 10)).toBe(100)
  })

  test('axisFactors_swap_at_90deg', () => {
    const identity = { coeffs: [1, 0, 0, 1, 0, 0] as const }
    const [fx, fy] = axisFactors(identity, 2, 3)
    expect(fx).toBeCloseTo(2, 9)
    expect(fy).toBeCloseTo(3, 9)
    // 90° rotation swaps the axes.
    const rot = { coeffs: [0, 1, -1, 0, 0, 0] as const }
    const [rx, ry] = axisFactors(rot, 2, 3)
    expect(rx).toBeCloseTo(3, 9)
    expect(ry).toBeCloseTo(2, 9)
  })

  test('vertical_stack_positions_children', () => {
    const doc = new Document()
    const page = doc.pages[0]
    const f = frame(doc, 'Stack', 100, 100)
    doc.node_mut(f)!.layout!.mode = 'vertical'
    attach(doc, page, f)
    const a = rect(doc, 'A', 40, 20)
    const b = rect(doc, 'B', 40, 20)
    attach(doc, f, a)
    attach(doc, f, b)
    layoutPage(doc, page, M)
    const na = doc.node(a)!
    const nb = doc.node(b)!
    expect(na.transform.coeffs[5]).toBe(10) // top padding
    expect(nb.transform.coeffs[5]).toBe(10 + 20 + 10) // gap 10
  })

  test('hug_frame_sizes_to_children', () => {
    const doc = new Document()
    const page = doc.pages[0]
    const f = frame(doc, 'Stack', 500, 500)
    doc.node_mut(f)!.layout!.mode = 'vertical'
    doc.node_mut(f)!.child_layout.sizing_v = 'hug' as Sizing
    attach(doc, page, f)
    const a = rect(doc, 'A', 40, 20)
    const b = rect(doc, 'B', 40, 20)
    attach(doc, f, a)
    attach(doc, f, b)
    layoutPage(doc, page, M)
    const nf = doc.node(f)!
    // padding 10 top + 20 + 10 + 20 + 10 bottom
    expect(nf.height).toBe(70)
  })

  test('fill_child_shares_free_space', () => {
    const doc = new Document()
    const page = doc.pages[0]
    const f = frame(doc, 'Row', 200, 40)
    doc.node_mut(f)!.layout!.mode = 'horizontal'
    attach(doc, page, f)
    const a = rect(doc, 'A', 40, 20)
    const b = rect(doc, 'B', 40, 20)
    doc.node_mut(b)!.child_layout.sizing_h = 'fill' as Sizing
    attach(doc, f, a)
    attach(doc, f, b)
    layoutPage(doc, page, M)
    const nb = doc.node(b)!
    // 200 - 10*2 padding - 40 fixed = 140 free for the fill child.
    expect(nb.width).toBeCloseTo(130, 6)
  })

  test('absolute_children_not_placed', () => {
    const doc = new Document()
    const page = doc.pages[0]
    const f = frame(doc, 'Row', 200, 40)
    attach(doc, page, f)
    const a = rect(doc, 'A', 40, 20)
    doc.node_mut(a)!.child_layout.absolute = true
    const mut0 = doc.node_mut(a)!
    mut0.transform = { ...mut0.transform, coeffs: [1, 0, 0, 1, 77, 5] as [number, number, number, number, number, number] }
    attach(doc, f, a)
    expect(flowChildren(doc, f).length).toBe(0)
    layoutPage(doc, page, M)
    expect(doc.node(a)!.transform.coeffs[4]).toBe(77)
  })

  test('mainOffsets', () => {
    expect(mainOffsets('min', 100, 60, 2, 10)).toEqual([0, 10])
    expect(mainOffsets('center', 100, 60, 2, 10)[0]).toBeCloseTo(15, 9)
    expect(mainOffsets('max', 100, 60, 2, 10)[0]).toBeCloseTo(30, 9)
    const [off, gap] = mainOffsets('spaceBetween', 100, 60, 3, 10)
    expect(gap).toBeCloseTo(20, 9)
    expect(off).toBe(0)
  })

  test('gridLines_columns_stretch', () => {
    const g = { kind: 'columns' as const, size: 100, count: 3, gutter: 10, offset: 0, align: 'stretch' as const, color: { r: 1, g: 0, b: 0, a: 0.1 }, visible: true }
    const lines = gridLines(g, 320, 100)
    expect(lines.length).toBe(3)
    expect(lines[0].x1 - lines[0].x0).toBeCloseTo(100, 6)
  })

  test('gridLines_square_grid', () => {
    const g = { kind: 'grid' as const, size: 10, count: 5, gutter: 5, offset: 0, align: 'stretch' as const, color: { r: 1, g: 0, b: 0, a: 0.1 }, visible: true }
    const lines = gridLines(g, 50, 50)
    expect(lines.length).toBe(9) // floor(50/15)=3 → 3×3 cells of 10px with 5px gutters
  })
})
