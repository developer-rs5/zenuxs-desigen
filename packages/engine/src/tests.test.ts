/**
 * Engine tests (ported from the core cases of FigCraft
 * `crates/engine/src/tests.rs` and the cmd tests).
 */

import { describe, expect, test } from 'bun:test'

import { Session, History, ViewState, MIN_ZOOM, MAX_ZOOM } from './lib'

describe('engine session', () => {
  test('new_session_has_one_doc_and_page', () => {
    const s = new Session()
    expect(s.docs.length).toBe(1)
    expect(s.doc().pages.length).toBe(1)
  })

  test('create_rect_command', () => {
    const s = new Session()
    const r = s.execute('shape.rectangle', { x: 10, y: 20, width: 50, height: 40 })
    expect(r.ok).toBe(true)
    const id = r.id as number
    const n = s.doc().node(id)
    expect(n?.width).toBe(50)
    expect(n?.height).toBe(40)
    expect(s.ds().selection).toContain(id)
  })

  test('undo_rollback_on_error', () => {
    const s = new Session()
    const r = s.execute('shape.rectangle', {})
    const id = r.id as number
    // A failing command rolls back and throws; the document is untouched.
    expect(() => s.execute('node.get', { id: '99999' })).toThrow()
    expect(s.doc().node(id)).not.toBeNull()
    // node.set records history; undo restores the width.
    s.execute('node.set', { id, props: { width: 80 } })
    expect(s.doc().node(id)?.width).toBe(80)
    expect(s.undo()).toBe(true)
    expect(s.doc().node(id)?.width).toBe(100)
    expect(s.redo()).toBe(true)
    expect(s.doc().node(id)?.width).toBe(80)
    // Two more undos: undo the set again, then the rectangle creation.
    expect(s.undo()).toBe(true)
    expect(s.doc().node(id)?.width).toBe(100)
    expect(s.undo()).toBe(true)
    expect(s.doc().node(id)).toBeNull()
  })

  test('edit_delete_and_duplicate', () => {
    const s = new Session()
    const r = s.execute('shape.rectangle', {})
    s.execute('edit.duplicate', { dx: 10, dy: 0 })
    expect(s.ds().selection.length).toBe(1)
    s.execute('edit.delete', {})
    expect(s.doc().nodesCount()).toBe(2) // page root + the original rectangle
  })

  test('group_and_ungroup', () => {
    const s = new Session()
    const a = s.execute('shape.rectangle', { x: 0, y: 0, width: 50, height: 50 }).id as number
    const b = s.execute('shape.ellipse', { x: 60, y: 0, width: 50, height: 50 }).id as number
    s.execute('select.set', { ids: [a, b] })
    const g = s.execute('object.group', { name: 'G' }).id as number
    expect(s.doc().node(g)?.kind.type).toBe('group')
    expect(s.doc().node(a)?.parent).toBe(g)
    s.execute('object.ungroup', {})
    expect(s.doc().node(g)).toBeNull()
    expect(s.doc().node(a)?.parent).not.toBe(g)
  })

  test('history_limit', () => {
    const h = new History()
    h.limit = 3
    for (let i = 0; i < 5; i++) {
      h.record(`step ${i}`, { label: '', doc: new Session().doc(), selection: [], page: 1 })
    }
    expect(h.undo.length).toBe(3)
    expect(h.undo[0].label).toBe('step 2')
  })

  test('viewstate_zoom_bounds', () => {
    const v = ViewState.default()
    ViewState.setZoomAt(v, 500, 0, 0)
    expect(v.zoom).toBeLessThanOrEqual(MAX_ZOOM)
    ViewState.setZoomAt(v, 0.0001, 0, 0)
    expect(v.zoom).toBeGreaterThanOrEqual(MIN_ZOOM)
    ViewState.fit(v, { x0: 0, y0: 0, x1: 800, y1: 600 })
    expect(v.zoom).toBeLessThanOrEqual(1)
  })

  test('page_add_and_list', () => {
    const s = new Session()
    const r = s.execute('page.add', { name: 'Page 2' })
    const list = s.execute('page.list', {})
    expect((list.pages as unknown[]).length).toBe(2)
    expect(r.ok).toBe(true)
  })

  test('proto_interaction_add_and_clear', () => {
    const s = new Session()
    const a = s.execute('shape.rectangle', { width: 100, height: 50 }).id as number
    const b = s.execute('shape.rectangle', { x: 200, width: 100, height: 50 }).id as number
    s.execute('proto.interaction.add', { id: a, dest: b, trigger: 'onClick', transition: 'smartAnimate', durationMs: 300 })
    const n = s.doc().node(a)!
    expect(n.interactions.length).toBe(1)
    expect((n.interactions[0] as { trigger: { type: string } }).trigger.type).toBe('onClick')
    s.execute('proto.interaction.clear', { ids: [a] })
    expect(s.doc().node(a)!.interactions.length).toBe(0)
  })

  test('command_batch', () => {
    const s = new Session()
    const r = s.execute('command.batch', {
      commands: [
        { id: 'shape.rectangle', params: { width: 10 } },
        { id: 'shape.ellipse', params: { width: 20 } }
      ]
    })
    expect((r.results as unknown[]).length).toBe(2)
  })

  test('style_create_apply_detach_delete', () => {
    const s = new Session()
    const rectId = s.execute('shape.rectangle', { width: 100, height: 100 }).id as number
    const st = s.execute('style.create', { name: 'Brand Blue', kind: 'color' })
    expect(st.ok).toBe(true)
    const styleId = st.id as string

    s.execute('style.apply', { ids: [rectId], slot: 'fill', styleId })
    expect(s.doc().node(rectId)?.styles.fill).toBe(styleId)

    s.execute('style.detach', { ids: [rectId], slot: 'fill' })
    expect(s.doc().node(rectId)?.styles.fill).toBeUndefined()

    s.execute('style.delete', { id: styleId })
    expect(s.doc().styles.length).toBe(0)
  })

  test('variable_collection_create_bind_unbind', () => {
    const s = new Session()
    const rectId = s.execute('shape.rectangle', { width: 80, height: 80 }).id as number
    const col = s.execute('variable.collection.create', { name: 'Theme Tokens' })
    const varRes = s.execute('variable.create', {
      name: 'primaryColor',
      collection: col.id,
      type: 'color',
      value: { r: 0, g: 0.5, b: 1, a: 1 }
    })
    const varId = varRes.id as string

    s.execute('variable.bind', { ids: [rectId], field: 'fill', variableId: varId })
    expect(s.doc().node(rectId)?.bound.fill).toBe(varId)

    s.execute('variable.unbind', { ids: [rectId], field: 'fill' })
    expect(s.doc().node(rectId)?.bound.fill).toBeUndefined()
  })

  test('component_create_instantiate_detach', () => {
    const s = new Session()
    const frameId = s.execute('shape.frame', { width: 200, height: 150 }).id as number
    s.execute('component.create', { id: frameId, description: 'Card component' })
    expect(s.doc().node(frameId)?.kind.type).toBe('component')

    const inst = s.execute('component.instantiate', { componentId: frameId, x: 50, y: 50 })
    expect(inst.ok).toBe(true)
    const instId = inst.id as number
    expect(s.doc().node(instId)?.kind.type).toBe('instance')

    s.execute('component.detach', { id: instId })
    expect(s.doc().node(instId)?.kind.type).toBe('frame')
  })

  test('file_info_and_rename', () => {
    const s = new Session()
    s.execute('file.rename', { name: 'Zenuxs App Design' })
    expect(s.doc().name).toBe('Zenuxs App Design')

    const info = s.execute('file.info', {})
    expect(info.name).toBe('Zenuxs App Design')
    expect(info.pages).toBe(1)
  })
})
