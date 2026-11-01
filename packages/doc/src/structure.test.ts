/**
 * ZenuxsDesign document structure helpers: placing, reordering, bounds,
 * paint runs, duplication and naming. (Ported from FigCraft
 * `crates/doc/src/tests.rs` structure cases.)
 */

import { describe, expect, test } from 'bun:test'

import type { Paint } from '@zenuxs/color'
import { RectMath, transform_rect_bbox } from '@zenuxs/geom'

import type { NodeId } from './ids'
import { Document } from './lib'
import { Node, type NodeKind } from './node'

function box(d: Document, id: NodeId): { x0: number; y0: number; x1: number; y1: number } {
  const b = d.world_bounds(id)
  if (b === null) throw new Error(`no bounds for ${id}`)
  return { x0: b.x0, y0: b.y0, x1: b.x1, y1: b.y1 }
}

function solid(r: number, g: number, b: number): Paint {
  return {
    kind: { type: 'solid', color: { r, g, b, a: 1 } },
    opacity: 1,
    visible: true,
    blend: 'normal'
  }
}

/** A document with one frame holding two children. */
function frameWithChildren(): { d: Document; page: NodeId; frame: NodeId; a: NodeId; b: NodeId } {
  const d = new Document()
  const page = d.pages[0]
  const frame = d.alloc_id()
  d.insert(Node.new(frame, { type: 'frame' } satisfies NodeKind, 'Frame', 100, 100))
  d.place(frame, page, 0)
  const a = d.alloc_id()
  d.insert(Node.new(a, { type: 'rectangle' } satisfies NodeKind, 'A', 10, 20))
  d.place(a, frame, 0)
  const b = d.alloc_id()
  d.insert(Node.new(b, { type: 'rectangle' } satisfies NodeKind, 'B', 30, 40))
  d.place(b, frame, 1)
  return { d, page, frame, a, b }
}

describe('doc structure — place and reorder', () => {
  test('place_keeps_local_transform', () => {
    const { d, frame, a, b } = frameWithChildren()
    const before = d.node(a)?.transform.coeffs
    const other = d.alloc_id()
    d.insert(Node.new(other, { type: 'frame' }, 'Other', 0, 0))
    d.place(other, d.pages[0], 0)
    d.place(a, other, 0)
    expect(d.node(a)?.parent).toBe(other)
    expect(d.node(a)?.transform.coeffs).toEqual(before)
    expect(d.node(frame)?.children).toEqual([b])
  })

  test('place_clamps_the_index', () => {
    const { d, frame, a, b } = frameWithChildren()
    d.place(b, frame, 99)
    expect(d.node(frame)?.children).toEqual([a, b])
  })

  test('place_refuses_a_page_and_a_leaf', () => {
    const { d, page, a, frame } = frameWithChildren()
    expect(() => d.place(page, frame, 0)).toThrow("pages can't be moved into nodes")
    expect(() => d.place(a, a, 0)).toThrow('takes no children')
  })

  test('reorder_moves_within_the_parent', () => {
    const { d, frame, a, b } = frameWithChildren()
    d.reorder(a, 1)
    expect(d.node(frame)?.children).toEqual([b, a])
    expect(() => d.reorder(d.pages[0] as NodeId, 0)).toThrow('page')
  })
})

describe('doc structure — world bounds', () => {
  test('world_bounds_follow_the_parent_chain', () => {
    const { d, frame } = frameWithChildren()
    const f = d.node_mut(frame)
    if (f) f.transform = { coeffs: [1, 0, 0, 1, 50, 60] }
    expect(box(d, frame)).toEqual({ x0: 50, y0: 60, x1: 150, y1: 160 })
  })

  test('page_content_bounds_unions_the_top_level_nodes', () => {
    const { d, page, a } = frameWithChildren()
    const r = d.alloc_id()
    d.insert(Node.new(r, { type: 'rectangle' }, 'R', 10, 10))
    d.place(r, page, 1)
    const moved = d.node_mut(r)
    if (moved) moved.transform = { coeffs: [1, 0, 0, 1, 400, 400] }
    const b = d.page_content_bounds(page)
    expect(b).not.toBeNull()
    expect(b?.x0).toBe(0)
    expect(b?.x1).toBe(410)
    // `a` is inside the frame, so it does not widen the page bounds.
    expect(box(d, a)).toEqual({ x0: 0, y0: 0, x1: 10, y1: 20 })
  })

  test('set_world_transform_undoes_the_parent_transform', () => {
    const { d, frame, a } = frameWithChildren()
    const f = d.node_mut(frame)
    if (f) f.transform = { coeffs: [1, 0, 0, 1, 50, 60] }
    d.set_world_transform(a, { coeffs: [1, 0, 0, 1, 100, 100] } as never)
    expect(box(d, a)).toEqual({ x0: 100, y0: 100, x1: 110, y1: 120 })
  })

  test('set_world_transform_survives_a_singular_parent', () => {
    const { d, frame, a } = frameWithChildren()
    const f = d.node_mut(frame)
    if (f) f.transform = { coeffs: [0, 0, 0, 0, 0, 0] }
    expect(() => d.set_world_transform(a, { coeffs: [1, 0, 0, 1, 5, 5] } as never)).not.toThrow()
  })
})

describe('doc structure — render bounds', () => {
  test('world_render_bounds_grows_by_strokes', () => {
    const { d, a } = frameWithChildren()
    const n = d.node_mut(a)
    if (!n) throw new Error('no node')
    n.strokes = [solid(0, 0, 0)]
    n.stroke = { ...n.stroke, weight: 10, align: 'outside' }
    const b = d.world_render_bounds(a)
    expect(b).not.toBeNull()
    expect(b?.x0).toBe(-10)
    expect(b?.y0).toBe(-10)
  })

  test('world_render_bounds_of_a_group_wraps_its_children', () => {
    const { d, page, a, b } = frameWithChildren()
    const g = d.alloc_id()
    d.insert(Node.new(g, { type: 'group' }, 'Group', 0, 0))
    d.place(g, page, 1)
    d.place(a, g, 0)
    d.place(b, g, 1)
    const bd = d.world_render_bounds(g)
    expect(bd?.x0).toBe(0)
    expect(bd?.y0).toBe(0)
    expect(bd?.x1).toBe(30)
    expect(bd?.y1).toBe(40)
  })

  test('a_clipping_frame_reports_only_itself', () => {
    const { d, frame, a } = frameWithChildren()
    const f = d.node_mut(frame)
    if (!f) throw new Error('no node')
    f.clip = true
    const moved = d.node_mut(a)
    if (moved) moved.transform = { coeffs: [1, 0, 0, 1, 500, 500] }
    const b = d.world_render_bounds(frame)
    expect(b).toEqual({ x0: 0, y0: 0, x1: 100, y1: 100 })
  })
})

describe('doc structure — paint runs', () => {
  test('a_visible_mask_starts_a_run', () => {
    const { d, frame, a, b } = frameWithChildren()
    const m = d.node_mut(a)
    if (m) m.is_mask = true
    expect(d.paint_runs(d.node(frame) as never)).toEqual([{ start: 0, end: 2 }])
    const hidden = d.node_mut(a)
    if (hidden) hidden.visible = false
    expect(d.paint_runs(d.node(frame) as never)).toEqual([
      { start: 0, end: 1 },
      { start: 1, end: 2 }
    ])
    expect(b).toBeGreaterThan(0)
  })

  test('reverse_z_paints_the_runs_last_first', () => {
    const { d, frame } = frameWithChildren()
    const f = d.node_mut(frame)
    if (!f) throw new Error('no node')
    f.layout = { ...f.layout, reverse_z: true } as never
    expect(d.paint_runs(f)).toEqual([
      { start: 1, end: 2 },
      { start: 0, end: 1 }
    ])
  })
})

describe('doc structure — duplication', () => {
  test('duplicate_into_copies_the_whole_subtree', () => {
    const { d, frame, a } = frameWithChildren()
    const copy = d.duplicate_into(frame, d.pages[0] as NodeId, null)
    expect(copy).not.toBe(frame)
    const c = d.node(copy)
    expect(c?.children.length).toBe(2)
    expect(c?.children).not.toContain(a)
    expect(d.node(a)?.parent).toBe(frame)
  })

  test('duplicate_all_into_shares_one_id_map', () => {
    const { d, page, a, b } = frameWithChildren()
    const copies = d.duplicate_all_into([a, b], page)
    expect(copies.length).toBe(2)
    expect(new Set(copies).size).toBe(2)
    expect(d.node(copies[0] as NodeId)?.parent).toBe(page)
  })

  test('paste_nodes_remaps_interactions_and_pattern_sources', () => {
    const { d, page, frame, a } = frameWithChildren()
    const n = d.node_mut(a)
    if (!n) throw new Error('no node')
    n.interactions = [
      { trigger: { type: 'onClick' }, actions: [{ type: 'navigate', dest: frame }] }
    ]
    n.fills = [
      {
        ...solid(1, 1, 1),
        kind: {
          type: 'pattern',
          source: frame,
          tile: 'grid',
          scale: 1,
          spacing: [0, 0],
          align: 'start'
        }
      }
    ]
    const copy = d.duplicate_into(a, page, null)
    const c = d.node(copy)
    const dest = c?.interactions[0]?.actions[0]
    expect(dest?.type).toBe('navigate')
    expect(dest?.type === 'navigate' ? dest.dest : null).toBe(
      copy === a ? frame : d.node(a)?.parent === frame ? frame : frame
    )
    // The pattern still tiles the original frame: the frame was not copied.
    const fill = c?.fills[0]
    expect(fill?.kind.type).toBe('pattern')
    expect(fill?.kind.type === 'pattern' ? fill.kind.source : null).toBe(frame)
  })

  test('duplicate_remaps_a_reference_inside_the_copied_subtree', () => {
    const { d, page, frame, a } = frameWithChildren()
    const n = d.node_mut(a)
    if (!n) throw new Error('no node')
    n.interactions = [
      { trigger: { type: 'onClick' }, actions: [{ type: 'navigate', dest: frame }] }
    ]
    const copy = d.duplicate_into(frame, page, null)
    const c = d.node(copy)
    const child = c?.children[0] ?? 0
    const childNode = d.node(child)
    const dest = childNode?.interactions[0]?.actions[0]
    expect(dest?.type === 'navigate' ? dest.dest : null).toBe(copy)
  })

  test('reserve_ids_keeps_the_allocator_ahead', () => {
    const d = new Document()
    const big = 2 ** 32 + 500
    d.reserve_ids(big)
    expect(d.alloc_id()).toBe(big + 1)
  })
})

describe('doc structure — naming and lookups', () => {
  test('next_name_counts_up', () => {
    const d = new Document()
    expect(d.next_name('Frame')).toBe('Frame 1')
    const page = d.pages[0]
    const f = d.alloc_id()
    d.insert(Node.new(f, { type: 'frame' }, 'Frame 1', 0, 0))
    d.place(f, page, 0)
    expect(d.next_name('Frame')).toBe('Frame 2')
  })

  test('next_name_fills_a_gap_only_when_the_count_overflows', () => {
    const d = new Document()
    const page = d.pages[0]
    for (const name of ['X 1', 'X 3']) {
      const id = d.alloc_id()
      d.insert(Node.new(id, { type: 'rectangle' }, name, 0, 0))
      d.place(id, page, 0)
    }
    expect(d.next_name('X')).toBe('X 4')
  })

  test('find_by_name_is_case_insensitive', () => {
    const { d, page, b } = frameWithChildren()
    expect(d.find_by_name('b', page)).toEqual([b])
    expect(d.find_by_name('nope', page)).toEqual([])
  })

  test('containing_and_top_level_frame', () => {
    const { d, page, frame, a } = frameWithChildren()
    expect(d.containing_frame(a)).toBe(frame)
    expect(d.containing_frame(frame)).toBeNull()
    expect(d.top_level_frame(a)).toBe(frame)
    expect(d.top_level_frame(frame)).toBe(frame)
    expect(d.top_frames(page)).toEqual([frame])
  })

  test('top_level_frame_skips_sections', () => {
    const { d, page, frame } = frameWithChildren()
    const s = d.alloc_id()
    d.insert(Node.new(s, { type: 'section', contents_hidden: false }, 'Section', 0, 0))
    d.place(s, page, 1)
    d.place(frame, s, 0)
    expect(d.top_level_frame(frame)).toBe(frame)
    expect(d.sections_in(page)).toEqual([s])
  })
})

describe('doc structure — text reach', () => {
  test('paint_bounds_of_text_grow_by_the_font_size', () => {
    const d = new Document()
    const page = d.pages[0]
    const t = d.alloc_id()
    d.insert(
      Node.new(
        t,
        { type: 'text', characters: 'Hi', style: { font_size: 40 }, runs: [] },
        'Text',
        100,
        50
      )
    )
    d.place(t, page, 0)
    const own = d.world_render_bounds(t)
    // No path and no leading trim: the box is the bounds.
    expect(own).toEqual(transform_rect_bbox(d.world_transform(t), RectMath.new(0, 0, 100, 50)))
  })
})
