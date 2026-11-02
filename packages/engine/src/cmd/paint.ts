/**
 * Fill and stroke lists: adding, replacing and removing paints, plus pattern
 * fills. (Converted 1:1 from FigCraft `crates/engine/src/cmd/edit.rs`.)
 */

import { BlendMode, Color, Paint, type BlendMode as BlendModeT } from '@zenuxs/color'

import { EngineError, ok, spec, type CommandSpec, type Session } from '../lib'
import { BoundList, remove_item } from './lists'
import {
  bad,
  boolean,
  color,
  enumOf,
  get,
  num,
  optIndex,
  paintsOf,
  reqIndex,
  reqTargets
} from './params'

function frameLike(n: { kind: { type: string } }): boolean {
  const t = n.kind.type
  return t === 'frame' || t === 'component' || t === 'componentSet' || t === 'instance'
}

function blendOf(p: Record<string, unknown>, key: string): BlendModeT | null {
  const v = get(p, key)
  if (typeof v !== 'string') return null
  return enumOf(v, BlendMode.ALL)
}

/** The first paint of a `paint`/`color` parameter, or `null` when it is
 * absent; an invalid paint throws. */
function onePaint(cmd: string, raw: unknown): Paint | null {
  if (raw === undefined) return null
  const parsed = paintsOf(raw)
  if (parsed === null || parsed.length === 0) throw bad(cmd, 'invalid paint')
  return structuredClone(parsed[0] as Paint)
}

/** Add a paint to, or remove one from, every target's fill or stroke list. */
export function paint_list(
  s: Session,
  p: Record<string, unknown>,
  fills: boolean,
  add: boolean
): Record<string, unknown> {
  const cmd = fills ? 'fill' : 'stroke'
  const ids = reqTargets(cmd, s, p)
  const index = add || get(p, 'index') === undefined ? null : reqIndex(cmd, p, 'index')
  const given = onePaint(cmd, get(p, 'paint') ?? get(p, 'color'))
  const doc = s.doc()
  for (const i of ids) {
    const n = doc.node_mut(i)
    if (!n) throw new EngineError(`no such node ${i}`)
    if (add) {
      const frameish = frameLike(n)
      // Defaults: white for frames, the shape grey for other fills, black for strokes.
      const paint =
        given ?? Paint.solid(fills ? (frameish ? Color.WHITE : Color.DEFAULT_SHAPE) : Color.BLACK)
      const list = [...(fills ? n.fills : n.strokes), structuredClone(paint)]
      if (fills) n.fills = list
      else n.strokes = list
    } else {
      const list = fills ? n.fills : n.strokes
      const idx = index ?? Math.max(0, list.length - 1)
      // The paint's colour binding goes with it; later paints' move down one.
      remove_item(n, fills ? BoundList.Fills : BoundList.Strokes, idx)
    }
  }
  return ok()
}

/** Replace the paint at `index` (default: the last) in every target's list. */
export function paint_set(
  s: Session,
  p: Record<string, unknown>,
  fills: boolean
): Record<string, unknown> {
  const cmd = fills ? 'fill.set' : 'stroke.set'
  const ids = reqTargets(cmd, s, p)
  const idx = optIndex(cmd, p, 'index')
  const newPaint = onePaint(cmd, get(p, 'paint'))
  const col = color(p, 'color')
  const doc = s.doc()
  for (const i of ids) {
    const n = doc.node_mut(i)
    if (!n) throw new EngineError(`no such node ${i}`)
    let list = fills ? n.fills : n.strokes
    const at = idx ?? Math.max(0, list.length - 1)
    if (list.length === 0) list = [Paint.solid(fills ? Color.DEFAULT_SHAPE : Color.BLACK)]
    const old = list[at]
    if (old === undefined) throw bad(cmd, `no paint at index ${at}`)
    if (newPaint !== null) list[at] = structuredClone(newPaint)
    const cur = list[at] as Paint
    if (col !== null) {
      cur.kind = { type: 'solid', color: Color.withAlpha(col, 1) }
      if (col.a < 1) cur.opacity = col.a
    }
    const o = num(p, 'opacity')
    if (o !== null) cur.opacity = Math.min(1, Math.max(0, o > 1 ? o / 100 : o))
    const vis = boolean(p, 'visible')
    if (vis !== null) cur.visible = vis
    const blend = blendOf(p, 'blend')
    if (blend !== null) cur.blend = blend
    if (fills) n.fills = list
    else n.strokes = list
  }
  return ok()
}

/** `pattern.fill`: replace a target's fills with a tiled image paint. */
export function pattern_fill(s: Session, p: Record<string, unknown>): Record<string, unknown> {
  const cmd = 'pattern.fill'
  const ids = reqTargets(cmd, s, p)
  const paint = onePaint(cmd, get(p, 'paint') ?? get(p, 'image'))
  if (paint === null) throw bad(cmd, '`paint` must be an image paint')
  for (const i of ids) {
    const n = s.doc().node_mut(i)
    if (n) n.fills = [structuredClone(paint)]
  }
  return ok()
}

export const PAINT_SPECS: CommandSpec[] = [
  spec(
    'fill.add',
    'Add fill',
    '{ids?, paint? (default #D9D9D9 or white for frames)}',
    true,
    (s, p) => paint_list(s, p, true, true)
  ),
  spec('stroke.add', 'Add stroke', '{ids?, paint? (default black)}', true, (s, p) =>
    paint_list(s, p, false, true)
  ),
  spec('fill.remove', 'Remove fill', '{ids?, index}', true, (s, p) =>
    paint_list(s, p, true, false)
  ),
  spec('stroke.remove', 'Remove stroke', '{ids?, index}', true, (s, p) =>
    paint_list(s, p, false, false)
  ),
  spec(
    'fill.set',
    'Set fill',
    '{ids?, index?, paint | color, opacity?, visible?, blend?}',
    true,
    (s, p) => paint_set(s, p, true)
  ),
  spec(
    'stroke.set',
    'Set stroke',
    '{ids?, index?, paint | color, opacity?, visible?, blend?}',
    true,
    (s, p) => paint_set(s, p, false)
  ),
  spec('pattern.fill', 'Pattern fill', '{ids?, paint}', true, pattern_fill)
]
