/**
 * Converting frames, groups and sections in place: what converts, what is
 * refused, and what stays exactly where it was on the page.
 * (Ported from FigCraft `crates/engine/src/convert_container_tests.rs`.)
 */

import { describe, expect, test } from 'bun:test'

import { RectMath, transform_rect_bbox } from '@zenuxs/geom'

import { EngineError, Session } from './lib'

/** Run a command, letting a refusal fail the test with its message. */
function ex(
  s: Session,
  cmd: string,
  params: Record<string, unknown> = {}
): Record<string, unknown> {
  return s.execute(cmd, params)
}

/** A 40 × 20 rectangle inside `parent` at (x, y); its id. */
function rect(s: Session, parent: number, x: number, y: number): number {
  return ex(s, 'shape.rectangle', { parent, x, y, width: 40, height: 20 }).id as number
}

/** The layer's box on the page, to thousandths. */
function pageBox(s: Session, id: number): number[] {
  const n = s.doc().node(id)
  if (!n) throw new Error(`no node ${id}`)
  const box = transform_rect_bbox(
    s.doc().world_transform(id),
    RectMath.new(0, 0, n.width, n.height)
  )
  return [box.x0, box.y0, box.x1, box.y1].map((v) => Math.round(v * 1000) / 1000)
}

/** The layer's kind type. */
function kindOf(s: Session, id: number): string {
  const n = s.doc().node(id)
  if (!n) throw new Error(`no node ${id}`)
  return n.kind.type
}

/** The message a refused command reports. */
function refusal(s: Session, cmd: string, params: Record<string, unknown>): string {
  try {
    s.execute(cmd, params)
  } catch (error) {
    return error instanceof Error ? error.message : String(error)
  }
  throw new Error(`${cmd} was expected to be refused`)
}

describe('converting containers', () => {
  test('a frame becomes a group around its layers', () => {
    const s = new Session()
    const f = ex(s, 'shape.frame', {
      x: 100,
      y: 50,
      width: 300,
      height: 200,
      name: 'Card',
      cornerRadius: 8
    }).id as number
    ex(s, 'node.set', { id: f, props: { fills: [{ type: 'SOLID', color: { r: 1, g: 0, b: 0 } }] } })
    const a = rect(s, f, 20, 30)
    const b = rect(s, f, 120, 90)
    ex(s, 'node.set', { id: f, props: { opacity: 0.5 } })
    const before = [pageBox(s, a), pageBox(s, b)]

    expect(ex(s, 'object.convertToGroup', { ids: [f] }).ids).toEqual([f])
    const n = s.doc().node(f)
    expect(n?.kind.type).toBe('group')
    expect(n?.name).toBe('Card')
    expect(n?.opacity).toBe(0.5)
    expect(n?.children).toEqual([a, b])
    expect(n?.fills).toEqual([])
    expect(n?.strokes).toEqual([])
    expect(n?.clip).toBe(false)
    expect(n?.corners.radii).toEqual([0, 0, 0, 0])
    expect([pageBox(s, a), pageBox(s, b)]).toEqual(before)
    expect(pageBox(s, f)).toEqual([120, 80, 260, 160])

    // One undo step puts the frame back as it was.
    expect(s.undo()).toBe(true)
    const back = s.doc().node(f)
    expect(back?.kind.type).toBe('frame')
    expect(back?.fills.length).toBe(1)
    expect(back?.clip).toBe(false)
    expect(pageBox(s, f)).toEqual([100, 50, 400, 250])
  })

  test('auto layout is dropped and positions kept', () => {
    const s = new Session()
    const f = ex(s, 'shape.frame', { x: 0, y: 0, width: 200, height: 100 }).id as number
    const a = rect(s, f, 0, 0)
    const b = rect(s, f, 0, 0)
    // Nothing to fill in a frame that has no auto layout yet, so the layers sit
    // at their own (0, 0); adding the layout is what places them.
    const sized = s.doc().node_mut(b)
    if (sized) {
      sized.child_layout.sizing_h = 'fill'
      sized.child_layout.sizing_v = 'fill'
    }
    s.ds().selection = [f]
    ex(s, 'layout.add', {})
    expect(s.doc().node(f)?.layout).not.toBeNull()

    const before = [pageBox(s, a), pageBox(s, b)]
    expect(before).toEqual([
      [10, 10, 50, 30],
      [60, 10, 190, 90]
    ])

    ex(s, 'object.convertToGroup', { ids: [f] })
    expect(s.doc().node(f)?.layout).toBeNull()
    expect([pageBox(s, a), pageBox(s, b)]).toEqual(before)
    const cl = s.doc().node(b)?.child_layout
    expect([cl?.sizing_h, cl?.sizing_v]).toEqual(['fixed', 'fixed'])

    // And back: a plain frame of the group's box, the layers still in place.
    ex(s, 'object.convertToFrame', { ids: [f] })
    const n = s.doc().node(f)
    expect(n?.kind.type).toBe('frame')
    expect(n?.layout).toBeNull()
    expect(n?.clip).toBe(false)
    expect(n?.fills).toEqual([])
    expect(pageBox(s, f)).toEqual([10, 10, 190, 90])
    expect([pageBox(s, a), pageBox(s, b)]).toEqual(before)
  })

  test('a rotated group becomes a frame in place', () => {
    const s = new Session()
    const page = s.ds().page
    const a = rect(s, page, 10, 10)
    const b = rect(s, page, 80, 60)
    s.ds().selection = [a, b]
    const g = ex(s, 'object.group', {}).id as number
    ex(s, 'object.rotate180', { ids: [g] })
    const before = [pageBox(s, a), pageBox(s, b), pageBox(s, g)]

    ex(s, 'object.convertToFrame', { ids: [g] })
    expect(kindOf(s, g)).toBe('frame')
    expect([pageBox(s, a), pageBox(s, b), pageBox(s, g)]).toEqual(before)
    // The layers now sit in the frame's own space: a at its origin.
    const c = s.doc().node(a)?.transform.coeffs ?? []
    expect(Math.abs(c[4] ?? 1)).toBeLessThan(1e-6)
    expect(Math.abs(c[5] ?? 1)).toBeLessThan(1e-6)
  })

  test('what cannot convert is refused and nothing changes', () => {
    const s = new Session()
    const page = s.ds().page
    const f = ex(s, 'shape.frame', { x: 0, y: 0, width: 100, height: 100 }).id as number
    const inner = ex(s, 'shape.frame', { parent: f, x: 10, y: 10, width: 50, height: 50 })
      .id as number
    rect(s, inner, 0, 0)
    ex(s, 'component.create', { id: f })
    const inst = ex(s, 'component.instantiate', { componentId: f, x: 300, y: 0 }).id as number
    // The instance brings no layers of its own here, so one is added by hand.
    const instInner = ex(s, 'shape.frame', { x: 0, y: 0, width: 60, height: 60 }).id as number
    const moved = s.doc().node_mut(instInner)
    if (moved) moved.parent = inst
    s.doc().node_mut(inst)?.children.push(instInner)
    const empty = ex(s, 'shape.frame', { x: 0, y: 300, width: 50, height: 50 }).id as number
    const loose = rect(s, page, 500, 0)
    const okFrame = ex(s, 'shape.frame', { x: 0, y: 500, width: 50, height: 50 }).id as number
    rect(s, okFrame, 5, 5)

    const cases: Array<[number, string]> = [
      [f, 'main component'],
      [inst, 'is an instance'],
      [instInner, 'inside an instance'],
      [empty, 'is empty'],
      [loose, 'neither a frame nor a group']
    ]
    for (const [layer, says] of cases) {
      for (const cmd of ['object.convertToGroup', 'object.convertToFrame']) {
        if (layer === empty && cmd === 'object.convertToFrame') continue
        // Together with a frame that could convert: all or nothing.
        expect(refusal(s, cmd, { ids: [okFrame, layer] })).toContain(says)
        expect(kindOf(s, okFrame)).toBe('frame')
      }
    }

    // Already what was asked for: left alone, not an error.
    expect(ex(s, 'object.convertToFrame', { ids: [okFrame] }).ids).toEqual([])
    // A frame inside a main component converts (its instances follow their main).
    ex(s, 'object.convertToGroup', { ids: [inner] })
    expect(kindOf(s, inner)).toBe('group')
  })

  test('a frame on the page becomes a section and back', () => {
    const s = new Session()
    const f = ex(s, 'shape.frame', {
      x: 100,
      y: 50,
      width: 300,
      height: 200,
      name: 'Flow'
    }).id as number
    ex(s, 'node.set', {
      id: f,
      props: { fills: [{ type: 'SOLID', color: { r: 1, g: 0.933, b: 0.867 } }] }
    })
    const a = rect(s, f, 20, 30)
    const b = rect(s, f, 400, 90)
    s.ds().selection = [f]
    ex(s, 'layout.add', {})
    ex(s, 'node.set', { id: f, props: { width: 300, height: 200 } })
    const before = [pageBox(s, a), pageBox(s, b), pageBox(s, f)]

    expect(ex(s, 'object.convertToSection', { ids: [f] }).ids).toEqual([f])
    const sec = s.doc().node(f)
    expect(sec?.kind.type).toBe('section')
    expect(sec?.name).toBe('Flow')
    expect(sec?.children).toEqual([a, b])
    expect(sec?.fills.length).toBe(1)
    expect(sec?.layout).toBeNull()
    expect(sec?.clip).toBe(false)
    expect([pageBox(s, a), pageBox(s, b), pageBox(s, f)]).toEqual(before)

    // And back: a frame that keeps the fill and doesn't clip, so the look stays.
    expect(ex(s, 'object.convertToFrame', { ids: [f] }).ids).toEqual([f])
    const n = s.doc().node(f)
    expect(n?.kind.type).toBe('frame')
    expect(n?.fills.length).toBe(1)
    expect(n?.clip).toBe(false)
    expect([pageBox(s, a), pageBox(s, b), pageBox(s, f)]).toEqual(before)

    // Each conversion is one undo step.
    s.undo()
    expect(kindOf(s, f)).toBe('section')
    s.undo()
    expect(kindOf(s, f)).toBe('frame')
    expect(s.doc().node(f)?.layout).not.toBeNull()
  })

  test('only frames on the page or in a section become sections', () => {
    const s = new Session()
    const outer = ex(s, 'shape.frame', { x: 0, y: 0, width: 300, height: 300 }).id as number
    const inner = ex(s, 'shape.frame', {
      parent: outer,
      x: 10,
      y: 10,
      width: 100,
      height: 100
    }).id as number
    expect(refusal(s, 'object.convertToSection', { ids: [inner] })).toContain('inside a frame')
    const r = rect(s, outer, 150, 150)
    expect(refusal(s, 'object.convertToSection', { ids: [r] })).toContain('is not a frame')

    // A section is made by wrapping: there is no bare "new section" command.
    const loose = rect(s, s.ds().page, 600, 0)
    const sec = ex(s, 'object.wrapInSection', { ids: [loose] }).id as number
    expect(kindOf(s, sec)).toBe('section')
    const inSec = ex(s, 'shape.frame', {
      parent: sec,
      x: 20,
      y: 20,
      width: 100,
      height: 100
    }).id as number
    rect(s, inSec, 0, 0)
    ex(s, 'object.convertToSection', { ids: [inSec] })
    expect(kindOf(s, inSec)).toBe('section')
    // A section holding a section can't become a frame.
    expect(refusal(s, 'object.convertToFrame', { ids: [sec] })).toContain('holds sections')
    expect(kindOf(s, sec)).toBe('section')
  })

  test('junk parameters are refused not fatal', () => {
    const junk: unknown[] = [null, true, -1, 1e308, 'x', [[1]], { a: 1 }, [0, 999999, '7']]
    for (const cmd of [
      'object.convertToGroup',
      'object.convertToFrame',
      'object.convertToSection'
    ]) {
      for (const j of junk) {
        const s = new Session()
        const f = ex(s, 'shape.frame', { x: 0, y: 0, width: 50, height: 50 }).id as number
        rect(s, f, 0, 0)
        for (const p of [{ ids: j }, { id: j }, j]) {
          try {
            s.execute(cmd, p as Record<string, unknown>)
          } catch (error) {
            expect(error).toBeInstanceOf(EngineError)
          }
        }
      }
    }
  })

  test('wrapping errors name the command that was run', () => {
    const s = new Session()
    for (const cmd of [
      'object.convertToGroup',
      'object.convertToFrame',
      'object.convertToSection',
      'object.wrapInSection',
      'object.resizeToFit',
      'object.mask',
      'object.releaseMask',
      'object.flatten',
      'object.outlineStroke'
    ]) {
      expect(refusal(s, cmd, {})).toContain(`\`${cmd}\``)
    }
  })
})
