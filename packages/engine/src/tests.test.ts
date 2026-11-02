/**
 * Engine tests (ported from the core cases of FigCraft
 * `crates/engine/src/tests.rs` and the cmd tests).
 */

import { describe, expect, test } from 'bun:test'

import { Vertex, type Segment, type VectorNetwork } from '@zenuxs/doc'
import { Affine } from '@zenuxs/geom'

import { reorderLayout, selectionSpacing } from './cmd/arrange'
import { applyKeptToggles, PAN_STEP_PX, viewChecked } from './cmd/view'
import { insideInstance } from './components'
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

  test('shape_vector_creates_open_and_closed_networks', () => {
    const s = new Session()
    const points: Array<[number, number]> = [
      [0, 0],
      [40, 20],
      [60, 0]
    ]

    const open = s.execute('shape.vector', { points })
    const openId = open.id as number
    expect(open).toMatchObject({ ok: true, id: openId })
    const openNode = s.doc().node(openId)
    if (openNode?.kind.type !== 'vector') throw new Error('not a vector')
    const openNetwork = openNode.kind.network as VectorNetwork
    expect(openNetwork.vertices.map(({ x, y }) => [x, y])).toEqual(points)
    expect(openNetwork.segments).toHaveLength(points.length - 1)
    expect(openNetwork.regions).toHaveLength(0)
    expect(s.ds().selection).toContain(openId)

    const closed = s.execute('shape.vector', { points, closed: true })
    const closedId = closed.id as number
    expect(closed).toMatchObject({ ok: true, id: closedId })
    const closedNode = s.doc().node(closedId)
    if (closedNode?.kind.type !== 'vector') throw new Error('not a vector')
    const closedNetwork = closedNode.kind.network as VectorNetwork
    expect(closedNetwork.vertices.map(({ x, y }) => [x, y])).toEqual(points)
    expect(closedNetwork.segments).toHaveLength(points.length)
    expect(closedNetwork.segments.at(-1)).toMatchObject({
      a: points.length - 1,
      b: 0
    })
    expect(closedNetwork.regions).toHaveLength(1)
    expect(s.ds().selection).toContain(closedId)
  })

  test('shape_vector_rejects_invalid_points', () => {
    const s = new Session()
    const invalidParams: Array<Record<string, unknown>> = [
      { points: [] },
      { points: [[0, 0]] },
      { points: [[0, 0], [1]] },
      {
        points: [
          [0, 0],
          [Number.POSITIVE_INFINITY, 1]
        ]
      },
      {
        points: [
          [0, 0],
          [1, 0]
        ],
        closed: true
      }
    ]

    for (const params of invalidParams) {
      const count = s.doc().nodesCount()
      expect(() => s.execute('shape.vector', params)).toThrow()
      expect(s.doc().nodesCount()).toBe(count)
    }
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
        { command: 'shape.rectangle', params: { width: 10 } },
        { command: 'shape.ellipse', params: { width: 20 } }
      ]
    })
    expect((r.steps as unknown[]).length).toBe(2)
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
    const frameId = s.execute('shape.frame', { width: 120, height: 80, name: 'Card' }).id as number
    s.execute('shape.rectangle', { parent: frameId, x: 10, y: 10, width: 40, height: 20 })
    const converted = s.execute('object.convertToGroup', { ids: [frameId] })
    expect(converted.ids).toEqual([frameId])
    expect(s.doc().node(frameId)?.kind.type).toBe('group')
    expect(s.doc().node(frameId)?.name).toBe('Card')

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

    s.execute('distribute.horizontal', { ids: [a, b, c], spacing: 20 })
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

describe('clipboard and duplicate', () => {
  test('duplicate_places_a_top_level_frame_to_the_right', () => {
    const s = new Session()
    const id = s.execute('shape.rectangle', { x: 0, y: 0, width: 100, height: 50 }).id as number
    s.execute('select.set', { ids: [id] })
    const r = s.execute('edit.duplicate', {})
    const copy = (r.ids as number[])[0] as number
    expect(copy).not.toBe(id)
    expect(s.doc().node(copy)?.transform.coeffs[4]).toBe(0)
    expect(s.ds().selection).toEqual([copy])
  })

  test('duplicate_uses_an_explicit_offset', () => {
    const s = new Session()
    const id = s.execute('shape.rectangle', { x: 100, y: 200, width: 100, height: 50 }).id as number
    s.execute('select.set', { ids: [id] })
    const r = s.execute('edit.duplicate', { dx: 30, dy: 40 })
    const copy = (r.ids as number[])[0] as number
    expect(s.doc().node(copy)?.transform.coeffs[4]).toBe(130)
    expect(s.doc().node(copy)?.transform.coeffs[5]).toBe(240)
  })

  test('duplicate_repeats_the_last_offset_while_the_copies_are_selected', () => {
    const s = new Session()
    const id = s.execute('shape.rectangle', { x: 0, y: 0, width: 100, height: 50 }).id as number
    s.execute('select.set', { ids: [id] })
    const first = (s.execute('edit.duplicate', { dx: 20, dy: 5 }).ids as number[])[0] as number
    // The copies are the selection, so the next one steps by the same offset again.
    const second = (s.execute('edit.duplicate', {}).ids as number[])[0] as number
    expect(s.doc().node(second)?.transform.coeffs[4]).toBe(40)
    expect(s.doc().node(second)?.transform.coeffs[5]).toBe(10)
    expect(first).not.toBe(second)
  })

  test('copy_and_paste_keeps_the_page_position', () => {
    const s = new Session()
    const id = s.execute('shape.rectangle', { x: 40, y: 60, width: 100, height: 50 }).id as number
    s.execute('select.set', { ids: [id] })
    expect(s.execute('edit.copy', {}).copied).toBe(1)
    const ids = s.execute('edit.paste', {}).ids as number[]
    expect(ids).toHaveLength(1)
    const pasted = s.doc().node(ids[0] as number)
    expect(pasted?.transform.coeffs[4]).toBe(40)
    expect(pasted?.transform.coeffs[5]).toBe(60)
    expect(s.ds().selection).toEqual(ids)
  })

  test('paste_lands_at_the_given_page_point', () => {
    const s = new Session()
    const id = s.execute('shape.rectangle', { x: 0, y: 0, width: 100, height: 50 }).id as number
    s.execute('select.set', { ids: [id] })
    s.execute('edit.copy', {})
    const ids = s.execute('edit.paste', { x: 500, y: 300 }).ids as number[]
    const pasted = s.doc().node(ids[0] as number)
    expect(pasted?.transform.coeffs[4]).toBe(500)
    expect(pasted?.transform.coeffs[5]).toBe(300)
  })

  test('paste_into_a_selected_frame_keeps_the_layer_inside_it', () => {
    const s = new Session()
    const frame = s.execute('shape.frame', { x: 0, y: 0, width: 400, height: 300 }).id as number
    const inner = s.execute('shape.rectangle', { x: 10, y: 10, width: 50, height: 50 }).id as number
    s.execute('select.set', { ids: [inner] })
    s.execute('edit.copy', {})
    s.execute('select.set', { ids: [frame] })
    const ids = s.execute('edit.paste', {}).ids as number[]
    expect(s.doc().node(ids[0] as number)?.parent).toBe(frame)
  })

  test('cut_removes_the_layer_and_keeps_it_on_the_clipboard', () => {
    const s = new Session()
    const id = s.execute('shape.rectangle', { x: 0, y: 0, width: 100, height: 50 }).id as number
    s.execute('select.set', { ids: [id] })
    s.execute('edit.cut', {})
    expect(s.doc().node(id)).toBeNull()
    expect(s.ds().selection).toEqual([])
    const ids = s.execute('edit.paste', {}).ids as number[]
    expect(s.doc().node(ids[0] as number)).not.toBeNull()
  })

  test('paste_over_places_the_copy_where_the_selection_is', () => {
    const s = new Session()
    const a = s.execute('shape.rectangle', { x: 0, y: 0, width: 50, height: 50 }).id as number
    s.execute('select.set', { ids: [a] })
    s.execute('edit.copy', {})
    const b = s.execute('shape.rectangle', { x: 200, y: 100, width: 50, height: 50 }).id as number
    s.execute('select.set', { ids: [b] })
    const ids = s.execute('edit.pasteOver', {}).ids as number[]
    const pasted = s.doc().node(ids[0] as number)
    expect(pasted?.transform.coeffs[4]).toBe(200)
    expect(pasted?.transform.coeffs[5]).toBe(100)
  })

  test('paste_replace_swaps_the_target_for_the_copy', () => {
    const s = new Session()
    const a = s.execute('shape.rectangle', { x: 0, y: 0, width: 10, height: 10 }).id as number
    s.execute('select.set', { ids: [a] })
    s.execute('edit.copy', {})
    const b = s.execute('shape.rectangle', { x: 200, y: 100, width: 50, height: 50 }).id as number
    s.execute('select.set', { ids: [b] })
    const ids = s.execute('edit.pasteReplace', {}).ids as number[]
    expect(s.doc().node(b)).toBeNull()
    expect(s.doc().node(ids[0] as number)).not.toBeNull()
    expect(s.doc().node(ids[0] as number)?.width).toBe(10)
  })

  test('copy_and_paste_properties', () => {
    const s = new Session()
    const a = s.execute('shape.rectangle', { width: 50, height: 50 }).id as number
    const b = s.execute('shape.rectangle', { width: 50, height: 50 }).id as number
    s.execute('node.set', { ids: [a], opacity: 0.42, cornerRadius: 8 })
    s.execute('select.set', { ids: [a] })
    s.execute('edit.copyProperties', {})
    s.execute('select.set', { ids: [b] })
    s.execute('edit.pasteProperties', {})
    expect(s.doc().node(b)?.opacity).toBe(0.42)
    expect(s.doc().node(b)?.corners.radii).toEqual([8, 8, 8, 8])
  })

  test('paste_properties_without_a_copy_is_disabled', () => {
    const s = new Session()
    const id = s.execute('shape.rectangle', {}).id as number
    expect(() => s.execute('edit.pasteProperties', { ids: [id] })).toThrow()
  })

  test('duplicate_of_a_page_is_refused', () => {
    const s = new Session()
    s.execute('select.set', { ids: [s.page()] })
    expect(() => s.execute('edit.duplicate', {})).toThrow()
  })
})

describe('clipboard — components', () => {
  test('duplicating_a_main_component_makes_an_instance_of_it', () => {
    const s = new Session()
    const frame = s.execute('shape.frame', { width: 200, height: 150, name: 'Card' }).id as number
    s.execute('component.create', { id: frame })
    s.execute('select.set', { ids: [frame] })
    const ids = s.execute('edit.duplicate', { dx: 300 }).ids as number[]
    const copy = s.doc().node(ids[0] as number)
    expect(copy?.kind.type).toBe('instance')
    if (copy?.kind.type === 'instance') expect(copy.kind.component).toBe(frame)
  })

  test('a_variant_duplicated_into_its_set_stays_a_component', () => {
    const s = new Session()
    const set = s.execute('shape.frame', { width: 100, height: 100, name: 'Set' }).id as number
    const frame = s.execute('shape.frame', { width: 100, height: 100, name: 'V' }).id as number
    // A component set holds its variants; its kind is the set, not a frame.
    const setNode = s.doc().node_mut(set)
    if (setNode) setNode.kind = { type: 'componentSet' }
    s.doc().reparent(frame, set, null)
    s.execute('component.create', { id: frame })
    s.execute('select.set', { ids: [frame] })
    const ids = s.execute('edit.duplicate', {}).ids as number[]
    // A variant stays a new variant in its set, so it is still a component.
    expect(s.doc().node(ids[0] as number)?.kind.type).toBe('component')
  })

  test('pasting_a_copied_main_component_makes_an_instance', () => {
    const s = new Session()
    const frame = s.execute('shape.frame', { width: 200, height: 150, name: 'Chip' }).id as number
    s.execute('component.create', { id: frame })
    s.execute('select.set', { ids: [frame] })
    s.execute('edit.copy', {})
    const ids = s.execute('edit.paste', {}).ids as number[]
    expect(s.doc().node(ids[0] as number)?.kind.type).toBe('instance')
  })

  test('an_instance_copy_stays_an_instance', () => {
    const s = new Session()
    const frame = s.execute('shape.frame', { width: 200, height: 150, name: 'Tile' }).id as number
    s.execute('component.create', { id: frame })
    const inst = s.execute('component.instantiate', { componentId: frame, x: 500 }).id as number
    s.execute('select.set', { ids: [inst] })
    const ids = s.execute('edit.duplicate', { dx: 20 }).ids as number[]
    const copy = s.doc().node(ids[0] as number)
    expect(copy?.kind.type).toBe('instance')
    if (copy?.kind.type === 'instance') expect(copy.kind.component).toBe(frame)
  })
})

describe('arrange — align and distribute', () => {
  /** A page with three 50×50 rectangles at the given `x`. */
  function three(s: Session, xs: number[]): number[] {
    return xs.map((x) => s.execute('shape.rectangle', { x, width: 50, height: 50 }).id as number)
  }

  test('aligning_several_layers_uses_their_combined_bounds', () => {
    const s = new Session()
    const [a, b] = three(s, [0, 200]) as [number, number]
    s.execute('align.left', { ids: [a, b] })
    expect(s.doc().world_bounds(a)?.x0).toBeCloseTo(0)
    expect(s.doc().world_bounds(b)?.x0).toBeCloseTo(0)
    s.execute('align.right', { ids: [a, b] })
    expect(s.doc().world_bounds(a)?.x1).toBeCloseTo(50)
    expect(s.doc().world_bounds(b)?.x1).toBeCloseTo(50)
  })

  test('aligning_one_layer_uses_its_parent_frame', () => {
    const s = new Session()
    const frame = s.execute('shape.frame', { x: 100, y: 100, width: 400, height: 300 }).id as number
    const child = s.execute('shape.rectangle', {
      parent: frame,
      x: 10,
      y: 10,
      width: 50,
      height: 50
    }).id as number
    s.execute('align.right', { ids: [child] })
    expect(s.doc().world_bounds(child)?.x1).toBeCloseTo(500)
    s.execute('align.bottom', { ids: [child] })
    expect(s.doc().world_bounds(child)?.y1).toBeCloseTo(400)
    s.execute('align.hcenter', { ids: [child] })
    const c = s.doc().world_bounds(child)
    expect((c?.x0 ?? 0) + (c?.x1 ?? 0)).toBeCloseTo(600)
  })

  test('a_top_level_layer_has_no_align_target', () => {
    const s = new Session()
    const a = s.execute('shape.rectangle', { x: 40, width: 50, height: 50 }).id as number
    s.execute('align.left', { ids: [a] })
    expect(s.doc().world_bounds(a)?.x0).toBeCloseTo(40)
  })

  test('distributing_without_spacing_uses_the_existing_span', () => {
    const s = new Session()
    const [a, b, c] = three(s, [0, 100, 300]) as [number, number, number]
    s.execute('distribute.horizontal', { ids: [a, b, c] })
    // 350 of span, 150 of layers: two 100px gaps.
    expect(s.doc().world_bounds(a)?.x0).toBeCloseTo(0)
    expect(s.doc().world_bounds(b)?.x0).toBeCloseTo(150)
    expect(s.doc().world_bounds(c)?.x0).toBeCloseTo(300)
  })

  test('distributing_two_layers_needs_an_explicit_spacing', () => {
    const s = new Session()
    const [a, b] = three(s, [0, 200]) as [number, number]
    s.execute('distribute.horizontal', { ids: [a, b] })
    expect(s.doc().world_bounds(b)?.x0).toBeCloseTo(200)
    s.execute('distribute.horizontal', { ids: [a, b], spacing: 10 })
    expect(s.doc().world_bounds(b)?.x0).toBeCloseTo(60)
  })

  test('packing_is_distributing_with_no_gap', () => {
    const s = new Session()
    const [a, b, c] = three(s, [0, 90, 180]) as [number, number, number]
    s.execute('arrange.packV', { ids: [a, b, c] })
    expect(s.doc().world_bounds(a)?.y0).toBeCloseTo(0)
    expect(s.doc().world_bounds(b)?.y0).toBeCloseTo(50)
    expect(s.doc().world_bounds(c)?.y0).toBeCloseTo(100)
  })

  test('tidying_snaps_into_rows_and_columns', () => {
    const s = new Session()
    const row1 = s.execute('shape.rectangle', { x: 0, y: 0, width: 50, height: 50 }).id as number
    const row1b = s.execute('shape.rectangle', { x: 300, y: 5, width: 80, height: 40 }).id as number
    const row2 = s.execute('shape.rectangle', { x: 40, y: 200, width: 50, height: 50 }).id as number
    s.execute('arrange.tidy', { ids: [row1, row1b, row2] })
    const a = s.doc().world_bounds(row1)
    const b = s.doc().world_bounds(row1b)
    const c = s.doc().world_bounds(row2)
    // Two rows share a left edge and a row pitch.
    expect(a?.x0).toBeCloseTo(0)
    expect(b?.x0).toBeGreaterThan(a?.x1 ?? 0)
    expect(a?.y0).toBeCloseTo(b?.y0 ?? -1)
    expect(c?.y0).toBeGreaterThan(a?.y0 ?? 0)
  })

  test('rounding_to_pixels_snaps_offsets_and_sizes', () => {
    const s = new Session()
    const a = s.execute('shape.rectangle', { x: 10.4, width: 50.6, height: 50.2 }).id as number
    const n = s.doc().node_mut(a)
    if (n) n.transform = Affine.new([1, 0, 0, 1, 10.4, 20.7])
    s.execute('arrange.roundToPixels', { ids: [a] })
    const after = s.doc().node(a)
    expect(after?.transform.coeffs[4]).toBe(10)
    expect(after?.transform.coeffs[5]).toBe(21)
    expect(after?.width).toBe(51)
  })
})

describe('arrange — z-order', () => {
  function stack(s: Session): number[] {
    return [0, 1, 2].map(
      (i) => s.execute('shape.rectangle', { x: i * 60, width: 50, height: 50 }).id as number
    )
  }

  test('bringing_to_front_and_sending_to_back', () => {
    const s = new Session()
    const [a, b, c] = stack(s) as [number, number, number]
    const page = s.page()
    s.execute('arrange.front', { ids: [a] })
    expect(s.doc().node(page)?.children.at(-1)).toBe(a)
    s.execute('arrange.back', { ids: [c] })
    expect(s.doc().node(page)?.children[0]).toBe(c)
    expect(b).toBeGreaterThan(0)
  })

  test('forward_and_backward_move_one_slot_and_stop_at_the_edge', () => {
    const s = new Session()
    const [a, b] = stack(s) as [number, number, number]
    const page = s.page()
    s.execute('arrange.forward', { ids: [a] })
    expect(s.doc().node(page)?.children[1]).toBe(a)
    s.execute('arrange.forward', { ids: [a] })
    s.execute('arrange.forward', { ids: [a] })
    expect(s.doc().node(page)?.children.at(-1)).toBe(a)
    s.execute('arrange.backward', { ids: [a] })
    expect(s.doc().node(page)?.children.at(-2)).toBe(a)
    expect(b).toBeGreaterThan(0)
  })

  test('several_layers_keep_their_relative_order_at_the_front', () => {
    const s = new Session()
    const [a, , c] = stack(s) as [number, number, number]
    const page = s.page()
    s.execute('arrange.front', { ids: [a, c] })
    const kids = s.doc().node(page)?.children ?? []
    expect(kids.indexOf(a)).toBeLessThan(kids.indexOf(c))
  })

  test('several_layers_keep_their_relative_order_at_the_back', () => {
    const s = new Session()
    const [a, b, c] = stack(s) as [number, number, number]
    const page = s.page()
    s.execute('arrange.back', { ids: [c, a] })
    const kids = s.doc().node(page)?.children ?? []
    // Both go to the back in their original z order, ahead of the untouched one.
    expect(kids.indexOf(a)).toBeLessThan(kids.indexOf(c))
    expect(kids.indexOf(c)).toBeLessThan(kids.indexOf(b))
  })
})

describe('arrange — flips and rotation', () => {
  test('flipping_mirrors_about_the_selection_centre', () => {
    const s = new Session()
    const a = s.execute('shape.rectangle', { x: 0, width: 50, height: 50 }).id as number
    const b = s.execute('shape.rectangle', { x: 150, width: 50, height: 50 }).id as number
    s.execute('object.flipH', { ids: [a, b] })
    // The pair swap places about x = 100.
    expect(s.doc().world_bounds(a)?.x0).toBeCloseTo(150)
    expect(s.doc().world_bounds(b)?.x0).toBeCloseTo(0)
    // The transform is mirrored, so the layer's own box still reads 50 wide.
    expect(s.doc().node(a)?.transform.coeffs[0]).toBeCloseTo(-1)
    expect(s.doc().node(b)?.transform.coeffs[0]).toBeCloseTo(-1)
  })

  test('flipping_vertically_mirrors_about_the_centre_y', () => {
    const s = new Session()
    const a = s.execute('shape.rectangle', { y: 0, width: 50, height: 50 }).id as number
    const b = s.execute('shape.rectangle', { y: 150, width: 50, height: 50 }).id as number
    s.execute('object.flipV', { ids: [a, b] })
    expect(s.doc().world_bounds(a)?.y0).toBeCloseTo(150)
    expect(s.doc().node(a)?.transform.coeffs[3]).toBeCloseTo(-1)
  })

  test('rotating_180_turns_about_the_selection_centre', () => {
    const s = new Session()
    const a = s.execute('shape.rectangle', { x: 0, width: 50, height: 50 }).id as number
    const b = s.execute('shape.rectangle', { x: 150, width: 50, height: 50 }).id as number
    s.execute('object.rotate180', { ids: [a, b] })
    expect(s.doc().world_bounds(a)?.x0).toBeCloseTo(150)
    expect(s.doc().world_bounds(b)?.x0).toBeCloseTo(0)
  })

  test('rotating_90_left_and_right_turn_opposite_ways', () => {
    const s = new Session()
    const a = s.execute('shape.rectangle', { x: 100, y: 0, width: 50, height: 20 }).id as number
    s.execute('object.rotateRight', { c: 0, ids: [a] })
    let b = s.doc().world_bounds(a)
    expect((b?.x1 ?? 0) - (b?.x0 ?? 0)).toBeCloseTo(20)
    expect((b?.y1 ?? 0) - (b?.y0 ?? 0)).toBeCloseTo(50)
    s.execute('object.rotateLeft', { ids: [a] })
    b = s.doc().world_bounds(a)
    expect((b?.x1 ?? 0) - (b?.x0 ?? 0)).toBeCloseTo(50)
  })
})

describe('arrange — numeric transforms', () => {
  test('moving_by_page_units_ignores_the_parent_scale', () => {
    const s = new Session()
    const frame = s.execute('shape.frame', { width: 200, height: 200 }).id as number
    const n = s.doc().node_mut(frame)
    if (n) n.transform = Affine.scale_non_uniform(2, 2)
    const child = s.execute('shape.rectangle', {
      parent: frame,
      width: 20,
      height: 20
    }).id as number
    s.execute('transform.move', { ids: [child], dx: 40, dy: 0 })
    // 40 page units inside a 2× frame is 20 local units.
    expect(s.doc().node(child)?.transform.coeffs[4]).toBeCloseTo(20)
    expect(s.doc().world_bounds(child)?.x0).toBeCloseTo(40)
  })

  test('moving_to_a_page_point_aligns_the_selection_top_left', () => {
    const s = new Session()
    const a = s.execute('shape.rectangle', { x: 10, y: 10, width: 50, height: 50 }).id as number
    const b = s.execute('shape.rectangle', { x: 90, y: 40, width: 50, height: 50 }).id as number
    s.execute('transform.moveTo', { ids: [a, b], x: 0, y: 0 })
    expect(s.doc().world_bounds(a)?.x0).toBeCloseTo(0)
    expect(s.doc().world_bounds(b)?.x0).toBeCloseTo(80)
    expect(s.doc().world_bounds(b)?.y0).toBeCloseTo(30)
  })

  test('rotating_turns_about_a_given_pivot', () => {
    const s = new Session()
    const a = s.execute('shape.rectangle', { x: 100, width: 20, height: 20 }).id as number
    s.execute('transform.rotate', { ids: [a], degrees: 90, cx: 0, cy: 0 })
    // Figma convention: 90° turns (100,0) up to (0,-100).
    const b = s.doc().world_bounds(a)
    expect(b?.x0).toBeCloseTo(0)
    expect(b?.y0).toBeCloseTo(-120)
    expect(b?.y1).toBeCloseTo(-100)
  })

  test('scaling_grows_sizes_strokes_and_text_together', () => {
    const s = new Session()
    const frame = s.execute('shape.frame', { width: 100, height: 100 }).id as number
    const r = s.execute('shape.rectangle', {
      parent: frame,
      width: 40,
      height: 40,
      cornerRadius: 4
    }).id as number
    s.execute('node.set', { ids: [r], strokeWeight: 2 })
    s.execute('transform.scale', { ids: [frame], factor: 3 })
    const after = s.doc().node(r)
    expect(after?.width).toBeCloseTo(120)
    expect(after?.stroke.weight).toBeCloseTo(6)
    expect(after?.corners.radii[0]).toBeCloseTo(12)
  })

  test('scaling_rejects_a_zero_or_negative_factor', () => {
    const s = new Session()
    const a = s.execute('shape.rectangle', { width: 20, height: 20 }).id as number
    expect(() => s.execute('transform.scale', { ids: [a], factor: 0 })).toThrow(/positive/)
  })

  test('scaling_a_vector_network_moves_its_vertices', () => {
    const s = new Session()
    const a = s.execute('shape.rectangle', { width: 10, height: 10 }).id as number
    const n = s.doc().node_mut(a)
    if (n) {
      n.kind = {
        type: 'vector',
        network: {
          vertices: [Vertex.new(0, 0), Vertex.new(10, 0), Vertex.new(10, 10)],
          segments: [
            { a: 0, b: 1, ta: [1, 0], tb: [0, 0] },
            { a: 1, b: 2, ta: [0, 0], tb: [0, 0] }
          ],
          regions: []
        }
      }
    }
    s.execute('transform.scale', { ids: [a], factor: 2 })
    const net =
      s.doc().node(a)?.kind.type === 'vector'
        ? (s.doc().node(a)?.kind.network as VectorNetwork)
        : null
    expect(net?.vertices[1]?.x).toBeCloseTo(20)
    expect(net?.segments[0]?.ta[0]).toBeCloseTo(2)
  })
})

describe('arrange — rotation origin', () => {
  test('the_origin_starts_at_the_selection_centre_and_can_be_moved', () => {
    const s = new Session()
    const a = s.execute('shape.rectangle', { x: 100, width: 50, height: 50 }).id as number
    s.execute('select.set', { ids: [a] })
    const shown = s.execute('transform.rotationOrigin', { on: true })
    expect(shown.editing).toBe(true)
    expect(shown.moved).toBe(false)
    expect(shown.x).toBeCloseTo(125)
    expect(shown.y).toBeCloseTo(25)
    const moved = s.execute('transform.setRotationOrigin', { x: 100, y: 0 })
    expect(moved.moved).toBe(true)
    expect(moved.x).toBeCloseTo(100)
    expect(s.execute('transform.setRotationOrigin', { reset: true }).moved).toBe(false)
  })

  test('rotating_with_a_moved_origin_turns_about_it', () => {
    const s = new Session()
    const a = s.execute('shape.rectangle', { x: 100, width: 50, height: 50 }).id as number
    s.execute('select.set', { ids: [a] })
    s.execute('transform.setRotationOrigin', { x: 100, y: 25 })
    s.execute('transform.rotate', { degrees: 90 })
    const b = s.doc().world_bounds(a)
    // Turning about the layer's left edge keeps it centred on the origin.
    expect(b?.x0).toBeCloseTo(75)
    expect(b?.x1).toBeCloseTo(125)
    expect(b?.y0).toBeCloseTo(-25)
    expect(b?.y1).toBeCloseTo(25)
  })

  test('the_origin_needs_a_selection', () => {
    const s = new Session()
    expect(() => s.execute('transform.rotationOrigin', {})).toThrow(/nothing is selected/)
    expect(() => s.execute('transform.setRotationOrigin', { x: 0, y: 0 })).toThrow(
      /nothing is selected/
    )
  })

  test('setting_the_origin_needs_coordinates_or_a_reset', () => {
    const s = new Session()
    const a = s.execute('shape.rectangle', { width: 20, height: 20 }).id as number
    s.execute('select.set', { ids: [a] })
    expect(() => s.execute('transform.setRotationOrigin', {})).toThrow(/give `x` and `y`/)
  })
})

describe('arrange — smart selection', () => {
  /** Three 50-wide rectangles in a row with a 10px gap. */
  function row(s: Session): number[] {
    return [0, 60, 120].map(
      (x) => s.execute('shape.rectangle', { x, width: 50, height: 50 }).id as number
    )
  }

  test('a_regular_row_has_equal_horizontal_spacing', () => {
    const s = new Session()
    const ids = row(s)
    const layout = selectionSpacing(s.doc(), ids)
    expect(layout.horizontal?.value).toBeCloseTo(10)
    expect(layout.horizontal?.tracks.length).toBe(3)
  })

  test('spacing_a_row_rewrites_the_gap', () => {
    const s = new Session()
    const [a, b, c] = row(s) as [number, number, number]
    s.execute('arrange.spacing', { ids: [a, b, c], horizontal: 30 })
    expect(s.doc().world_bounds(a)?.x0).toBeCloseTo(0)
    expect(s.doc().world_bounds(b)?.x0).toBeCloseTo(80)
    expect(s.doc().world_bounds(c)?.x0).toBeCloseTo(160)
  })

  test('spacing_needs_an_axis_and_a_regular_selection', () => {
    const s = new Session()
    const ids = row(s)
    expect(() => s.execute('arrange.spacing', { ids })).toThrow(/horizontal or vertical/)
    const scattered = [
      s.execute('shape.rectangle', { x: 0, y: 0, width: 20, height: 20 }).id as number,
      s.execute('shape.rectangle', { x: 300, y: 200, width: 20, height: 20 }).id as number
    ]
    expect(() => s.execute('arrange.spacing', { ids: scattered, horizontal: 10 })).toThrow(
      /no spacing on this axis/
    )
  })

  test('spacing_rejects_an_absurd_value', () => {
    const s = new Session()
    const ids = row(s)
    expect(() => s.execute('arrange.spacing', { ids, horizontal: 2_000_000 })).toThrow(
      /out of range/
    )
  })

  test('a_regular_row_has_an_ordered_reorder_layout', () => {
    const s = new Session()
    const ids = row(s)
    const layout = reorderLayout(s.doc(), ids)
    expect(layout?.columns).toBe(3)
    expect(layout?.rows).toBe(1)
    expect(layout?.gapX).toBeCloseTo(10)
    expect(layout?.slots.map(([id]) => id)).toEqual(ids)
  })

  test('reordering_inserts_at_the_target_slot', () => {
    const s = new Session()
    const [a, b, c] = row(s) as [number, number, number]
    s.execute('arrange.reorder', { ids: [a, b, c], source: a, target: c })
    expect(s.doc().world_bounds(b)?.x0).toBeCloseTo(0)
    expect(s.doc().world_bounds(c)?.x0).toBeCloseTo(60)
    expect(s.doc().world_bounds(a)?.x0).toBeCloseTo(120)
  })

  test('reordering_with_swap_exchanges_two_slots', () => {
    const s = new Session()
    const [a, b, c] = row(s) as [number, number, number]
    s.execute('arrange.reorder', { ids: [a, b, c], source: a, target: c, swap: true })
    expect(s.doc().world_bounds(c)?.x0).toBeCloseTo(0)
    expect(s.doc().world_bounds(b)?.x0).toBeCloseTo(60)
    expect(s.doc().world_bounds(a)?.x0).toBeCloseTo(120)
  })

  test('reordering_a_grid_slot_keeps_rows_and_columns_aligned', () => {
    const s = new Session()
    const ids: number[] = []
    for (let r = 0; r < 2; r++) {
      for (let c = 0; c < 2; c++) {
        ids.push(
          s.execute('shape.rectangle', {
            x: c * 60,
            y: r * 60,
            width: 50,
            height: 50
          }).id as number
        )
      }
    }
    const first = ids[0] as number
    const last = ids[3] as number
    const layout = reorderLayout(s.doc(), ids)
    expect(layout?.columns).toBe(2)
    expect(layout?.rows).toBe(2)
    expect(() => s.execute('arrange.reorder', { ids, source: first, target: last })).not.toThrow()
  })

  test('reordering_rejects_an_incomplete_selection', () => {
    const s = new Session()
    const ids: number[] = []
    for (let r = 0; r < 2; r++) {
      for (let c = 0; c < 2; c++) {
        ids.push(
          s.execute('shape.rectangle', {
            x: c * 60,
            y: r * 60,
            width: 50,
            height: 50
          }).id as number
        )
      }
    }
    const three = ids.slice(0, 3)
    expect(() =>
      s.execute('arrange.reorder', { ids: three, source: three[0], target: three[2] })
    ).toThrow(/regular row/)
  })

  test('spacing_and_reorder_ignore_layers_inside_an_instance', () => {
    const s = new Session()
    const inst = s.execute('shape.frame', { width: 300, height: 100 }).id as number
    const x = s.execute('shape.rectangle', { parent: inst, x: 0, width: 50, height: 50 })
      .id as number
    const y = s.execute('shape.rectangle', { parent: inst, x: 60, width: 50, height: 50 })
      .id as number
    const n = s.doc().node_mut(inst)
    if (n) n.kind = { type: 'instance', component: inst, props: {} }
    expect(insideInstance(s.doc(), x)).toBe(true)
    expect(insideInstance(s.doc(), inst)).toBe(false)
    // A regular row, but layers inside an instance don't take a spacing edit.
    expect(selectionSpacing(s.doc(), [x, y]).horizontal).toBeNull()
    expect(reorderLayout(s.doc(), [x, y])).toBeNull()
  })
})
