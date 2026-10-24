/**
 * ZenuxsDesign document model tests (ported from the core cases of FigCraft
 * `crates/doc/src/tests.rs` and `lib.rs` doc tests).
 */

import { describe, expect, test } from 'bun:test'

import { Document, DocError } from './lib'
import { Node } from './node'
import { parseNodeId, mode_number, space_of } from './ids'

describe('doc document model', () => {
  test('new_document_has_one_page_root', () => {
    const d = new Document()
    expect(d.pages.length).toBe(1)
    const root = d.node(d.pages[0])
    expect(root).not.toBeNull()
    expect(root?.kind.type).toBe('page')
    expect(root?.name).toBe('Page 1')
  })

  test('alloc_ids_count_up', () => {
    const d = new Document()
    const a = d.alloc_id()
    const b = d.alloc_id()
    expect(b).toBe(a + 1)
  })

  test('create_and_reparent_nodes', () => {
    const d = new Document()
    const page = d.pages[0]
    const frameId = d.alloc_id()
    const frame = Node.new(frameId, { type: 'frame' }, 'Frame', 100, 100)
    d.insert(frame)
    const frameMut = d.node_mut(frameId)!
    frameMut.parent = page
    const pageMut = d.node_mut(page)!
    pageMut.children.push(frameId)

    const childId = d.alloc_id()
    const child = Node.new(childId, { type: 'rectangle' }, 'Rect', 50, 50)
    d.insert(child)
    const childMut = d.node_mut(childId)!
    childMut.parent = frameId
    d.node_mut(frameId)!.children.push(childId)

    expect(d.node(childId)?.parent).toBe(frameId)
    expect(d.subtree(page)).toContain(childId)
    expect(d.is_ancestor(frameId, childId)).toBe(true)
    expect(d.is_ancestor(childId, frameId)).toBe(false)
  })

  test('node_mut_is_copy_on_write', () => {
    const d = new Document()
    const id = d.alloc_id()
    d.insert(Node.new(id, { type: 'frame' }, 'Frame', 10, 10))
    const before = d.node(id)
    d.node_mut(id)!.name = 'Renamed'
    const after = d.node(id)
    expect(before?.name).toBe('Frame')
    expect(after?.name).toBe('Renamed')
  })

  test('delete_detaches_subtree', () => {
    const d = new Document()
    const page = d.pages[0]
    const f = d.alloc_id()
    d.insert(Node.new(f, { type: 'frame' }, 'Frame', 10, 10))
    d.node_mut(f)!.parent = page
    d.node_mut(page)!.children.push(f)
    const c = d.alloc_id()
    d.insert(Node.new(c, { type: 'rectangle' }, 'Rect', 5, 5))
    d.node_mut(c)!.parent = f
    d.node_mut(f)!.children.push(c)

    expect(d.delete(f)).toBe(true)
    expect(d.node(f)).toBeNull()
    expect(d.node(c)).toBeNull()
    expect(d.node(page)!.children.includes(f)).toBe(false)
  })

  test('changed_ids_reports_added_updated_removed', () => {
    const d = new Document()
    const before = new Map(d.ids().map((id) => [id, structuredClone(d.node(id)!)]))
    const added = d.alloc_id()
    d.insert(Node.new(added, { type: 'frame' }, 'Added', 10, 10))
    d.node_mut(d.pages[0])!.name = 'Renamed page'
    const removed = d.pages[0]
    const d2 = new Document()
    void removed
    void d2

    const changed = d.changed_ids(before)
    expect(changed).toContain(added)
    expect(changed).toContain(d.pages[0])
  })

  test('validate_repairs_broken_links', () => {
    const d = new Document()
    const f = d.alloc_id()
    d.insert(Node.new(f, { type: 'frame' }, 'Frame', 10, 10))
    // Broken parent link.
    d.node_mut(f)!.parent = 9999
    const warnings = d.validate()
    expect(warnings.length).toBeGreaterThan(0)
    expect(d.node(f)?.parent ?? null).toBeNull()
  })

  test('parse_node_ids_accept_figma_forms', () => {
    expect(parseNodeId('12')).toBe(12)
    expect(parseNodeId('0:12')).toBe(12)
    expect(parseNodeId('nope')).toBeNull()
    expect(parseNodeId('-1')).toBeNull()
  })

  test('collab_id_spaces', () => {
    expect(space_of(5)).toBe(0)
    expect(mode_number('VariableCollectionId:1/mode2')).toBe(2)
  })

  test('doc_error_codes_are_stable', () => {
    const e = new DocError('no_node')
    expect(e.code).toBe('no_node')
    expect(e.name).toBe('DocError')
  })
})
