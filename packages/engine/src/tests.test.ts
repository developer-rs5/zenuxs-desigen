/**
 * Engine tests (ported from the core cases of FigCraft
 * `crates/engine/src/tests.rs` and the cmd tests).
 */

import { describe, expect, test } from 'bun:test'

import { Vertex, type Segment, type VectorNetwork } from '@zenuxs/doc'

import { applyKeptToggles, PAN_STEP_PX, viewChecked } from './cmd/view'
import {
  Session,
  History,
  ViewState,
  MIN_ZOOM,
  MAX_ZOOM,
  TOOL_COMMAND,
  TOOL_IDS,
  ToolId,
  UI_SCALE_MAX,
  UI_SCALE_MIN
} from './lib'

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
    s.execute('proto.interaction.add', {
      id: a,
      dest: b,
      trigger: 'onClick',
      transition: 'smartAnimate',
      durationMs: 300
    })
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

  test('board_sticky_and_timer', () => {
    const s = new Session()
    const sticky = s.execute('board.sticky.create', {
      text: 'Ship v2.0',
      color: 'pink',
      x: 50,
      y: 50
    })
    expect(sticky.ok).toBe(true)
    const stickyId = sticky.id as number
    expect(s.doc().node(stickyId)?.name).toContain('Ship v2.0')

    const timer = s.execute('board.timer.start', { seconds: 120 })
    expect(timer.running).toBe(true)
    expect(timer.remainingSeconds).toBe(120)

    const timerStatus = s.execute('board.timer.get', {})
    expect(timerStatus.running).toBe(true)

    s.execute('board.vote.cast', { node_id: stickyId })
    const tally = s.execute('board.vote.tally', {})
    expect(tally.votes[stickyId]).toBe(1)
  })

  test('structure_convert_and_wrap', () => {
    const s = new Session()
    const frameId = s.execute('shape.frame', { width: 120, height: 80 }).id as number
    s.execute('object.convertToGroup', { ids: [frameId] })
    expect(s.doc().node(frameId)?.kind.type).toBe('group')

    s.execute('object.convertToFrame', { ids: [frameId] })
    expect(s.doc().node(frameId)?.kind.type).toBe('frame')

    const wrap = s.execute('object.wrapInSection', { ids: [frameId], name: 'Feature Block' })
    expect(wrap.ok).toBe(true)
    const sectionId = wrap.id as number
    expect(s.doc().node(sectionId)?.kind.type).toBe('section')
  })

  test('arrange_distribute_and_flips', () => {
    const s = new Session()
    const a = s.execute('shape.rectangle', { x: 0, width: 50 }).id as number
    const b = s.execute('shape.rectangle', { x: 100, width: 50 }).id as number
    const c = s.execute('shape.rectangle', { x: 300, width: 50 }).id as number

    s.execute('align.distributeH', { ids: [a, b, c], spacing: 20 })
    expect(s.doc().node(a)?.transform.coeffs[4]).toBe(0)
    expect(s.doc().node(b)?.transform.coeffs[4]).toBe(70)
    expect(s.doc().node(c)?.transform.coeffs[4]).toBe(140)

    s.execute('object.rotate180', { ids: [a] })
    expect(s.doc().node(a)?.transform.coeffs[0]).toBe(-1)
  })

  test('vector_boolean_operations', () => {
    const s = new Session()
    const a = s.execute('shape.rectangle', { width: 50, height: 50 }).id as number
    const b = s.execute('shape.ellipse', { width: 50, height: 50 }).id as number
    const union = s.execute('vector.boolean.union', { ids: [a, b] })
    expect(union.ok).toBe(true)
    expect(union.op).toBe('union')
  })

  test('vector_delete_heal_joins_neighbours_and_keeps_region', () => {
    const s = new Session()
    const id = s.execute('shape.rectangle', { width: 10, height: 10 }).id as number
    const node = s.doc().node_mut(id)
    if (!node) throw new Error('missing node')
    const line = (a: number, b: number): Segment => ({ a, b, ta: [0, 0], tb: [0, 0] })
    const network: VectorNetwork = {
      vertices: [
        Vertex.new(0, 0),
        Vertex.new(50, 0),
        Vertex.new(100, 0),
        Vertex.new(100, 100),
        Vertex.new(0, 100)
      ],
      segments: [line(0, 1), line(1, 2), line(2, 3), line(3, 4), line(4, 0)],
      regions: [{ loops: [[0, 1, 2, 3, 4]], winding: 'nonZero' }]
    }
    node.kind = { type: 'vector', network }

    const result = s.execute('vector.deleteHeal', { id, vertices: [1] })
    expect(result.healed).toBe(1)
    expect(result.removed).toBe(1)

    const healed = s.doc().node(id)?.kind
    if (healed?.type !== 'vector') throw new Error('not a vector')
    const net = healed.network as VectorNetwork
    expect(net.vertices.length).toBe(4)
    expect(net.segments.length).toBe(4)
    expect(net.regions[0]?.loops[0]?.length).toBe(4)
    expect(net.segments.some((segment) => segment.a === 0 && segment.b === 1)).toBe(true)
  })

  test('vector_delete_heal_solves_curve_through_deleted_point', () => {
    const s = new Session()
    const id = s.execute('shape.rectangle', { width: 10, height: 10 }).id as number
    const node = s.doc().node_mut(id)
    if (!node) throw new Error('missing node')
    const network: VectorNetwork = {
      vertices: [Vertex.new(0, 0), Vertex.new(50, 50), Vertex.new(100, 0)],
      segments: [
        { a: 0, b: 1, ta: [10, 30], tb: [0, 0] },
        { a: 1, b: 2, ta: [0, 0], tb: [0, 0] }
      ],
      regions: []
    }
    node.kind = { type: 'vector', network }

    s.execute('vector.deleteHeal', { id, vertices: [1] })

    const healed = s.doc().node(id)?.kind
    if (healed?.type !== 'vector') throw new Error('not a vector')
    const net = healed.network as VectorNetwork
    expect(net.vertices.length).toBe(2)
    expect(net.segments.length).toBe(1)
    const segment = net.segments[0]
    const a = net.vertices[0]
    const b = net.vertices[1]
    if (!segment || !a || !b) throw new Error('missing healed segment')

    const t = 0.5
    const u = 1 - t
    const x =
      u * u * u * a.x +
      3 * u * u * t * (a.x + segment.ta[0]) +
      3 * u * t * t * (b.x + segment.tb[0]) +
      t * t * t * b.x
    const y =
      u * u * u * a.y +
      3 * u * u * t * (a.y + segment.ta[1]) +
      3 * u * t * t * (b.y + segment.tb[1]) +
      t * t * t * b.y
    expect(x).toBeCloseTo(50, 6)
    expect(y).toBeCloseTo(50, 6)
  })

  test('vector_delete_heal_defaults_to_redundant_points', () => {
    const s = new Session()
    const id = s.execute('shape.rectangle', { width: 10, height: 10 }).id as number
    const node = s.doc().node_mut(id)
    if (!node) throw new Error('missing node')
    const line = (a: number, b: number): Segment => ({ a, b, ta: [0, 0], tb: [0, 0] })
    node.kind = {
      type: 'vector',
      network: {
        vertices: [Vertex.new(0, 0), Vertex.new(50, 0), Vertex.new(100, 0)],
        segments: [line(0, 1), line(1, 2)],
        regions: []
      } satisfies VectorNetwork
    }

    const result = s.execute('vector.deleteHeal', { id })
    expect(result.removed).toBe(1)
    const healed = s.doc().node(id)?.kind
    if (healed?.type !== 'vector') throw new Error('not a vector')
    expect((healed.network as VectorNetwork).vertices.length).toBe(2)
  })

  test('codegen_inspect_and_css', () => {
    const s = new Session()
    const id = s.execute('shape.rectangle', { width: 120, height: 60 }).id as number
    const inspect = s.execute('dev.inspect', { id })
    expect(inspect.width).toBe(120)
    expect(inspect.height).toBe(60)

    const css = s.execute('dev.code.css', { id })
    expect(css.code).toContain('width: 120px;')
    expect(css.code).toContain('height: 60px;')
  })

  test('templates_list_and_create', () => {
    const s = new Session()
    const list = s.execute('template.list', {})
    expect(list.templates.length).toBe(8)

    const created = s.execute('template.create', { id: 'mobile-app' })
    expect(created.ok).toBe(true)
    expect(created.rootIds.length).toBe(4) // 4 mobile screens
  })

  test('view_zoom_steps_and_fit', () => {
    const s = new Session()
    s.execute('view.zoom100', {})
    expect(s.ds().view.zoom).toBe(1)
    s.execute('view.zoomIn', {})
    expect(s.ds().view.zoom).toBe(2)
    s.execute('view.zoomOut', {})
    expect(s.ds().view.zoom).toBe(1)
    s.execute('view.zoom50', {})
    expect(s.ds().view.zoom).toBe(0.5)
    s.execute('view.zoom200', {})
    expect(s.ds().view.zoom).toBe(2)
    s.execute('view.get', {})
    expect(s.ds().view.zoom).toBe(2)

    // A selection bigger than the viewport zooms out to fit it.
    const id = s.execute('shape.rectangle', { x: 0, y: 0, width: 4000, height: 3000 }).id as number
    s.ds().selection = [id]
    const fit = s.execute('view.zoomFit', {})
    expect(fit.zoom).toBeLessThan(1)
    expect(fit.zoom).toBeGreaterThan(0)
    const sel = s.execute('view.zoomSelection', {})
    expect(sel.zoom).toBeGreaterThan(0)

    // The zoom always stays inside the usable range.
    s.execute('view.zoomIn', {})
    s.execute('view.zoomIn', {})
    for (let i = 0; i < 40; i++) s.execute('view.zoomOut', {})
    expect(s.ds().view.zoom).toBe(0.02)
    for (let i = 0; i < 40; i++) s.execute('view.zoomIn', {})
    expect(s.ds().view.zoom).toBe(256)
  })

  test('view_toggles_reach_the_view_and_only_kept_ones_reach_prefs', () => {
    const s = new Session()
    expect(s.ds().view.pixel_grid).toBe(false)

    const on = s.execute('view.pixelGrid', {})
    expect(on.on).toBe(true)
    expect(s.ds().view.pixel_grid).toBe(true)
    expect(s.prefs.view['view.pixelGrid']).toBe(true)
    expect(viewChecked(s, 'view.pixelGrid')).toBe(true)

    // Omitting `on` flips it back.
    expect(s.execute('view.pixelGrid', {}).on).toBe(false)
    expect(s.ds().view.pixel_grid).toBe(false)

    // An explicit value wins over the flip.
    expect(s.execute('view.rulers', { on: false }).on).toBe(false)
    expect(s.ds().view.rulers).toBe(false)

    // Outline modes stay with the file.
    s.execute('view.outlines', { on: true })
    expect(s.ds().view.outlines).toBe(true)
    expect(s.prefs.view['view.outlines']).toBeUndefined()

    expect(viewChecked(s, 'command.undo')).toBeNull()

    // A fresh file starts with the kept toggles.
    s.execute('view.pixelGrid', { on: true })
    const fresh = ViewState.default()
    applyKeptToggles(s.prefs, fresh)
    expect(fresh.pixel_grid).toBe(true)
    expect(fresh.outlines).toBe(false)
  })

  test('view_get_and_set', () => {
    const s = new Session()
    const got = s.execute('view.get', {})
    expect(typeof got.zoom).toBe('number')
    expect(typeof got.cx).toBe('number')

    s.execute('view.set', { zoom: 3, cx: 40, cy: -20 })
    expect(s.ds().view.zoom).toBe(3)
    expect(s.ds().view.cx).toBe(40)
    expect(s.ds().view.cy).toBe(-20)

    // Out-of-range values are clamped, not stored.
    s.execute('view.set', { zoom: 10_000 })
    expect(s.ds().view.zoom).toBe(256)
    s.execute('view.set', { zoom: 0 })
    expect(s.ds().view.zoom).toBe(0.02)
  })

  test('view_pan_and_regions', () => {
    const s = new Session()
    s.execute('view.zoom100', {})
    s.execute('view.set', { cx: 0, cy: 0 })
    s.execute('view.pan', { dx: 1, dy: 1 })
    expect(s.ds().view.cx).toBe(PAN_STEP_PX)
    expect(s.ds().view.cy).toBe(PAN_STEP_PX)
    s.execute('view.pan', { dx: -1, dy: 0, big: true })
    expect(s.ds().view.cx).toBe(PAN_STEP_PX - PAN_STEP_PX * 10)

    // A region that isn't showing is a no-op, not a crash.
    expect(s.execute('view.nextRegion', {}).ok).toBe(true)
    expect(s.execute('view.previousRegion', {}).ok).toBe(true)
  })

  test('pref_toggles_and_values', () => {
    const s = new Session()
    expect(s.prefs.reduce_motion).toBe(false)
    expect(s.execute('pref.reduceMotion', {}).on).toBe(true)
    expect(s.prefs.reduce_motion).toBe(true)

    s.execute('pref.highlightHover', { on: false })
    expect(s.prefs.highlight_hover).toBe(false)

    // Number keys either set opacity or jump to a zoom step, never both.
    expect(s.prefs.number_keys_opacity).toBe(true)
    s.execute('pref.numberKeysOpacity', {})
    expect(s.prefs.number_keys_opacity).toBe(false)

    s.execute('pref.nudge', { small: 5, big: 50 })
    expect(s.prefs.nudge_small).toBe(5)
    expect(s.prefs.nudge_large).toBe(50)
    // Out of range nudges are clamped.
    s.execute('pref.nudge', { small: 0, big: 1_000_000 })
    expect(s.prefs.nudge_small).toBe(0.01)
    expect(s.prefs.nudge_large).toBe(10_000)
  })

  test('pref_userName_language_and_uiScale_validate', () => {
    const s = new Session()
    expect(() => s.execute('pref.userName', {})).toThrow()
    expect(s.execute('pref.userName', { name: '   ' }).name).toBe('You')
    expect(s.execute('pref.userName', { name: 'Ada\u0007' }).name).toBe('Ada')
    expect(s.execute('pref.userName', { name: 'x'.repeat(100) }).name).toHaveLength(64)

    expect(s.execute('pref.language', { language: 'en-US' }).language).toBe('en-US')
    expect(s.execute('pref.language', { language: 'pt_BR' }).language).toBe('pt_BR')
    expect(() => s.execute('pref.language', { language: 'not a tag!' })).toThrow()
    expect(() => s.execute('pref.language', { language: 'x'.repeat(40) })).toThrow()

    // `auto` means "let the platform decide".
    expect(s.execute('pref.uiScale', { scale: 'auto' }).scale).toBe(1)
    expect(s.execute('pref.uiScale', { scale: 1.5 }).scale).toBe(1.5)
    expect(s.execute('pref.uiScale', { scale: 99 }).scale).toBe(UI_SCALE_MAX)
    expect(s.execute('pref.uiScale', { scale: 0 }).scale).toBe(UI_SCALE_MIN)
  })

  test('tools_set_and_anchor', () => {
    const s = new Session()
    expect(s.tool()).toBe('move')
    expect(s.execute('tool.rectangle', {}).tool).toBe('rectangle')
    expect(s.tool()).toBe('rectangle')
    expect(s.execute('tool.set', { tool: 'pen' }).tool).toBe('pen')
    expect(ToolId.fromId('pen')).toBe('pen')
    expect(ToolId.fromId('nope')).toBeNull()
    expect(() => s.execute('tool.set', { tool: 'nope' })).toThrow()

    expect(s.tools.scale_anchor).toEqual([1, 1])
    expect(s.execute('tool.scaleAnchor', { anchor: 'bl' }).anchor).toBe('bl')
    expect(s.tools.scale_anchor).toEqual([0, 2])
    const read = s.execute('tool.scaleAnchor', {})
    expect(read.anchor).toBe('bl')
    expect(() => s.execute('tool.scaleAnchor', { anchor: 'nope' })).toThrow()

    // Every tool has a command, and running it selects that tool.
    for (const id of TOOL_IDS) {
      const r = s.execute(TOOL_COMMAND[id], {})
      expect(r.tool).toBe(id)
      expect(s.tool()).toBe(id)
    }
  })

  test('tool_place_makes_the_selected_tool_shape_selected', () => {
    const s = new Session()
    s.execute('tool.rectangle', {})
    const r = s.execute('tool.place', { x: 200, y: 150 })
    expect(r.ids).toHaveLength(1)
    expect(s.ds().selection).toEqual(r.ids)
    const node = s.doc().node(r.ids[0] as number)
    expect(node?.kind.type).toBe('rectangle')
    expect(node?.transform.coeffs[4]).toBe(150)
    expect(node?.transform.coeffs[5]).toBe(100)
    expect(node?.width).toBe(100)

    // A tool that doesn't place a shape says so.
    s.execute('tool.hand', {})
    expect(() => s.execute('tool.place', {})).toThrow()
  })
})
