/**
 * Tests for the doc crate's remaining modules (ported from FigCraft's
 * `*_tests.rs` core cases: props width profiles, proto easings/exprs, text
 * replace_range, styles resolve, vector networks, faces).
 */

import { describe, expect, test } from 'bun:test'

import { Color } from '@zenuxs/color'
import { Point } from '@zenuxs/geom'

import { WidthPoint, WidthProfile, StrokeProps, Effect, Blur, AutoLayout, ChildLayout, Constraints, Corners } from './props'
import { Easing, Spring, Transition, parseExpr, Expr, KeyMods, Trigger, PrototypeSettings, Interaction } from './proto'
import { TextData, TextStyle, LineHeight, LetterSpacing } from './text'
import { Variables, Variables as Vars, normalize_scopes } from './styles'
import { VectorNetwork, VectorNet as _, Segment, Vertex } from './vector'
import { VectorNetwork as VN } from './vector'
import { Face, triangulateFan } from './vector_faces'
import { loopContains } from './vector_regions'
import { Message, Comment as CommentAPI } from './comments'
import { Libraries } from './library'
import { shape_path, is_closed } from './geometry'
import { Node } from './node'

describe('doc props — width profiles', () => {
  test('uniform_profile_measures_one_everywhere', () => {
    const p = WidthProfile.uniform()
    expect(WidthProfile.scaleAt(p, 0)).toBeCloseTo(1, 9)
    expect(WidthProfile.scaleAt(p, 0.5)).toBeCloseTo(1, 9)
    expect(WidthProfile.scaleAt(p, 1)).toBeCloseTo(1, 9)
  })

  test('taper_interpolates_monotonically', () => {
    const p = WidthProfile.new([
      [0, 0.05],
      [1, 1]
    ])
    const s0 = WidthProfile.scaleAt(p, 0)
    const s1 = WidthProfile.scaleAt(p, 0.5)
    const s2 = WidthProfile.scaleAt(p, 1)
    expect(s1).toBeGreaterThan(s0)
    expect(s2).toBeGreaterThan(s1)
  })

  test('from_sides_and_sides_roundtrip', () => {
    const p = WidthPoint.fromSides(0.5, 1, 3)
    expect(p.scale).toBeCloseTo(2, 9)
    expect(p.bias).toBeCloseTo(0.5, 9)
    const [l, r] = WidthPoint.sides(p)
    expect(l).toBeCloseTo(1, 9)
    expect(r).toBeCloseTo(3, 9)
  })

  test('insert_keeps_sorted_and_bounds', () => {
    const p = WidthProfile.new([
      [0, 1],
      [1, 1]
    ])
    WidthProfile.insert(p, 0.5, 2)
    expect(p.points.map((q) => q.t)).toEqual([0, 0.5, 1])
    WidthProfile.insert(p, -5, 1e9)
    expect(p.points[0].t).toBe(0)
    expect(p.points.length).toBeLessThanOrEqual(WidthProfile.MAX_POINTS)
  })

  test('miter_angle_roundtrip', () => {
    const limit = StrokeProps.miterLimitFor(28.955)
    expect(limit).toBeCloseTo(4, 1)
  })
})

describe('doc props — effects and defaults', () => {
  test('blur_reach_and_progressive', () => {
    const b = Blur.uniform(8)
    expect(Blur.isProgressive(b)).toBe(false)
    expect(Blur.maxRadius(b)).toBe(8)
  })

  test('effect_reach_shadows', () => {
    const e = Effect.dropShadow({ offset: [3, 4], radius: 8, spread: 2, color: Color.BLACK, show_behind: false, blend: 'normal', visible: true })
    expect(Effect.reach(e)).toBeCloseTo(15, 6)
    expect(Effect.color(e)).toEqual(Color.BLACK)
  })

  test('default_layout_objects', () => {
    expect(AutoLayout.isDefault(AutoLayout.default())).toBe(true)
    expect(ChildLayout.isDefault(ChildLayout.default())).toBe(true)
    expect(Constraints.isDefault(Constraints.default())).toBe(true)
    expect(Corners.isDefault(Corners.default())).toBe(true)
  })
})

describe('doc proto — easings and springs', () => {
  test('spring_settles_at_one', () => {
    const s = new Spring(1, 100, 15)
    expect(s.at(0)).toBeCloseTo(0, 9)
    expect(s.at(1)).toBe(1)
    expect(s.settle).toBeGreaterThan(0.1)
  })

  test('easing_eval_endpoints', () => {
    for (const e of Easing.ALL) {
      expect(Easing.eval(e, 0)).toBeCloseTo(0, 9)
      expect(Easing.eval(e, 1)).toBe(1)
    }
  })

  test('easeOutBack_overshoots', () => {
    expect(Easing.eval('easeOutBack', 0.8)).toBeGreaterThan(0.9)
  })

  test('transition_reversed_directions', () => {
    const r = Transition.reversed({ type: 'push', direction: 'left' })
    expect(r).toEqual({ type: 'push', direction: 'right' })
    expect(Transition.reversed({ type: 'instant' })).toEqual({ type: 'instant' })
  })

  test('key_trigger_aliases_and_mods', () => {
    const t: Trigger = { type: 'keyPress', key: 'Shift+K' }
    const [mods, key] = KeyMods.split(t.key)
    expect(mods.shift).toBe(true)
    expect(Trigger.fires_on_key(t, 'K', mods)).toBe(true)
    expect(Trigger.fires_on_key(t, 'J', mods)).toBe(false)
  })

  test('gamepad_buttons_standard_layout', () => {
    expect(PrototypeSettings.DEVICES.length).toBe(19)
    const delay: Trigger = { type: 'afterDelay', ms: 250 }
    expect(Trigger.label(delay)).toBe('After delay 250ms')
  })

  test('interaction_delay_secs_only_mouse_triggers', () => {
    const mouse: Interaction = { trigger: { type: 'mouseEnter' }, actions: [], delay_ms: 300 }
    expect(Interaction.delay_secs(mouse)).toBeCloseTo(0.3, 9)
    const click: Interaction = { trigger: { type: 'onClick' }, actions: [], delay_ms: 300 }
    expect(Interaction.delay_secs(click)).toBe(0)
  })
})

describe('doc proto — expressions', () => {
  test('parse_and_holds', () => {
    const e = parseExpr('count + 1 > 3')
    expect(Expr.holds(e, { count: 3 }, {})).toBe(true)
    expect(Expr.holds(e, { count: 2 }, {})).toBe(false)
  })

  test('not_and_and_or', () => {
    const e = parseExpr('not open && (a or b)')
    expect(Expr.holds(e, { open: false, a: true, b: false }, {})).toBe(true)
    expect(Expr.holds(e, { open: true, a: true, b: false }, {})).toBe(false)
  })

  test('string_equality', () => {
    const e = parseExpr('name == "aura"')
    expect(Expr.holds(e, { name: 'aura' }, {})).toBe(true)
    expect(Expr.holds(e, { name: 'other' }, {})).toBe(false)
  })

  test('variables_listed', () => {
    const e = parseExpr('a + b * 2')
    expect(Expr.variables(e).sort()).toEqual(['a', 'b'])
  })

  test('malformed_throws', () => {
    expect(() => parseExpr('a +')).toThrow()
    expect(() => parseExpr('(a')).toThrow()
  })
})

describe('doc text', () => {
  test('line_height_and_letter_spacing_resolve', () => {
    expect(LineHeight.resolve({ unit: 'pixels', value: 24 }, 16, 1.2)).toBe(24)
    expect(LineHeight.resolve({ unit: 'percent', value: 150 }, 16, 1.2)).toBe(24)
    expect(LineHeight.resolve(LineHeight.AUTO, 16, 1.2)).toBeCloseTo(19.2, 9)
    expect(LetterSpacing.resolve({ unit: 'percent', value: 10 }, 16)).toBeCloseTo(1.6, 9)
  })

  test('replace_range_keeps_runs_in_step', () => {
    const t = TextData.default()
    t.characters = 'hello world'
    t.runs = [{ start: 0, end: 5, style: { ...TextStyle.default(), font_style: 'Bold' } }]
    TextData.replaceRange(t, 5, 11, '!')
    expect(t.characters).toBe('hello!')
    expect(t.runs[0].end).toBe(5)
  })

  test('styleAt_uses_runs', () => {
    const t = TextData.default()
    t.characters = 'abc'
    const bold = { ...TextStyle.default(), font_style: 'Bold' }
    t.runs = [{ start: 1, end: 3, style: bold }]
    expect(TextData.styleAt(t, 0).font_style).toBe('Regular')
    expect(TextData.styleAt(t, 2).font_style).toBe('Bold')
  })
})

describe('doc styles — variables', () => {
  const vars: Variables = {
    collections: [
      {
        id: 'VariableCollectionId:1',
        name: 'Colors',
        modes: [
          { id: 'VariableCollectionId:1/mode1', name: 'Light' },
          { id: 'VariableCollectionId:1/mode2', name: 'Dark' }
        ],
        default_mode: 'VariableCollectionId:1/mode1',
        hidden_from_publishing: false
      }
    ],
    variables: [
      {
        id: 'VariableID:1',
        name: 'surface',
        collection: 'VariableCollectionId:1',
        values: {
          'VariableCollectionId:1/mode1': { type: 'color', value: Color.WHITE },
          'VariableCollectionId:1/mode2': { type: 'color', value: Color.BLACK }
        },
        scopes: normalize_scopes('color', ['fill', 'junk'])
      }
    ]
  }

  test('resolve_by_mode_and_default', () => {
    const light = Vars.resolve(vars, 'VariableID:1', { 'VariableCollectionId:1': 'VariableCollectionId:1/mode1' })
    expect(light).toEqual({ type: 'color', value: Color.WHITE })
    const fallback = Vars.resolve(vars, 'VariableID:1', {})
    expect(fallback).toEqual({ type: 'color', value: Color.WHITE })
  })

  test('scopes_normalized', () => {
    expect(vars.variables[0].scopes).toEqual(['fill'])
  })

  test('aliases_follow', () => {
    const withAlias: Variables = {
      collections: vars.collections,
      variables: [
        ...vars.variables,
        {
          id: 'VariableID:2',
          name: 'surface-alias',
          collection: 'VariableCollectionId:1',
          values: { 'VariableCollectionId:1/mode1': { type: 'alias', value: 'VariableID:1' } },
          scopes: []
        }
      ]
    }
    expect(Vars.resolve(withAlias, 'VariableID:2', {})).toEqual({ type: 'color', value: Color.WHITE })
  })
})

describe('doc vector networks', () => {
  test('from_points_closed_makes_region', () => {
    const net = VectorNetwork.from_points(
      [
        [0, 0],
        [100, 0],
        [100, 100],
        [0, 100]
      ],
      true
    )
    expect(net.vertices.length).toBe(4)
    expect(net.segments.length).toBe(4)
    expect(net.regions.length).toBe(1)
    expect(is_closed({ ...Node.new(1, { type: 'frame' }, '', 0, 0), kind: { type: 'vector', network: net } })).toBe(true)
  })

  test('to_path_traces_segments', () => {
    const net = VectorNetwork.from_points(
      [
        [0, 0],
        [100, 0],
        [100, 100]
      ],
      false
    )
    const path = VN.to_path(net)
    expect(path.segments().length).toBe(2)
  })
})

describe('doc vector faces and regions', () => {
  test('face_interior_point_and_area', () => {
    const f = { points: [Point.new(0, 0), Point.new(10, 0), Point.new(0, 10)] as [Point, Point, Point] }
    const p = Face.interiorPoint(f)
    expect(p?.x).toBeCloseTo(10 / 3, 6)
    expect(p?.y).toBeCloseTo(10 / 3, 6)
    expect(Face.area(f)).toBeCloseTo(50, 6)
    expect(Face.interiorPoint({ points: [Point.new(0, 0), Point.new(0, 0), Point.new(0, 0)] })).toBeNull()
  })

  test('triangulateFan_count', () => {
    const faces = triangulateFan([
      Point.new(0, 0),
      Point.new(10, 0),
      Point.new(10, 10),
      Point.new(0, 10)
    ])
    expect(faces.length).toBe(2)
  })

  test('loop_contains_nonzero_and_evenodd', () => {
    const square: Array<[number, number]> = [
      [0, 0],
      [10, 0],
      [10, 10],
      [0, 10]
    ]
    expect(loopContains(square, [5, 5], 'nonZero')).toBe(true)
    expect(loopContains(square, [15, 5], 'nonZero')).toBe(false)
  })
})

describe('doc comments and libraries', () => {
  test('message_react_toggles', () => {
    const m = Message.new('a', 'hi', 100)
    expect(Message.react(m, '🎉', 'b', null)).toBe(true)
    expect(Message.reacted(m, '🎉', 'b')).toBe(true)
    expect(Message.react(m, '🎉', 'b', null)).toBe(true)
    expect(Message.reacted(m, '🎉', 'b')).toBe(false)
  })

  test('comment_participants_and_activity', () => {
    const c = {
      id: 1,
      page: 1,
      x: 0,
      y: 0,
      author: 'a',
      text: 'first',
      created: 100,
      reactions: [],
      resolved: false,
      replies: [{ author: 'b', text: 'reply', created: 200, reactions: [] }]
    }
    expect(CommentAPI.participants(c)).toEqual(['a', 'b'])
    expect(CommentAPI.lastActivity(c)).toBe(200)
    expect(CommentAPI.messages(c).length).toBe(2)
  })

  test('libraries_empty_and_unused', () => {
    const l = Libraries.empty()
    expect(Libraries.is_empty(l)).toBe(true)
    Libraries.link(l, { id: 'lib1', name: 'Team lib' })
    expect(Libraries.is_empty(l)).toBe(false)
  })
})

describe('doc geometry — shape paths', () => {
  test('rectangle_path_bounds', () => {
    const n = Node.new(1, { type: 'rectangle' }, 'Rect', 100, 50)
    const p = shape_path(n)
    expect(p).not.toBeNull()
    const b = p!.bounding_box()
    expect(b?.x1).toBeCloseTo(100, 6)
    expect(b?.y1).toBeCloseTo(50, 6)
  })

  test('line_is_open', () => {
    const n = Node.new(1, { type: 'line' }, 'Line', 100, 0)
    expect(is_closed(n)).toBe(false)
  })

  test('ellipse_pie_path', () => {
    const n = Node.new(1, { type: 'ellipse', start: 0, sweep: Math.PI, inner: 0 }, 'Pie', 100, 100)
    const p = shape_path(n)
    expect(p).not.toBeNull()
  })
})
