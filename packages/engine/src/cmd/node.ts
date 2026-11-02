/**
 * Layer properties: reading and writing the fields `node.set` accepts.
 * (Converted from FigCraft `crates/engine/src/cmd/{edit,props}.rs`; the long
 * property catalog lands with the props domain.)
 */

import type { BlendMode } from '@zenuxs/color'
import type { Node, NodeId } from '@zenuxs/doc'
import { Affine } from '@zenuxs/geom'

import { EngineError, ok, spec, type CommandSpec } from '../lib'
import { bad, boundBefore, detachEdited, idOf, num, optId, paintsOf } from './params'

/** The property names `node.set` understands (mirrors the documented catalog). */
export const KEYS =
  "name, visible, locked, opacity (0-1), blend, x, y (relative to the parent frame; groups don't count), width, height, rotation (degrees), " +
  'fills (paints or colours), fill (colour), strokes, stroke (colour), strokeWeight, strokeAlign (inside|center|outside), ' +
  'cornerRadius (n or [tl,tr,br,bl]), cornerSmoothing (0-1), clip, isMask, grids, exports, characters, fontFamily, fontSize'

/** Properties only frames, components and instances take. */
export const LAYOUT_KEYS: readonly string[] = [
  'gap',
  'itemSpacing',
  'columnGap',
  'crossGap',
  'counterAxisSpacing',
  'rowGap',
  'padding',
  'paddingTop',
  'paddingRight',
  'paddingBottom',
  'paddingLeft',
  'paddingHorizontal',
  'paddingVertical',
  'mainAlign',
  'primaryAxisAlignItems',
  'crossAlign',
  'counterAxisAlignItems',
  'contentAlign',
  'counterAxisAlignContent',
  'wrap',
  'gridColumns',
  'gridRows',
  'strokesIncluded',
  'reverseZ',
  'columnTracks',
  'gridColumnTracks',
  'rowTracks',
  'gridRowTracks'
]

function frameLike(n: Node): boolean {
  const t = n.kind.type
  return t === 'frame' || t === 'component' || t === 'componentSet' || t === 'instance'
}

function numOrNull(v: unknown): number | null {
  return typeof v === 'number' && Number.isFinite(v) ? v : null
}

function boolOrNull(v: unknown): boolean | null {
  return typeof v === 'boolean' ? v : null
}

function radiiOf(v: unknown): [number, number, number, number] | null {
  if (typeof v === 'number' && Number.isFinite(v)) return [v, v, v, v]
  if (Array.isArray(v) && v.length === 4) {
    const out = v.map((x) => (typeof x === 'number' && Number.isFinite(x) ? x : null))
    if (out.some((x) => x === null)) return null
    return out as [number, number, number, number]
  }
  return null
}

/**
 * Apply one layer's properties. Returns warnings for keys skipped because the
 * layer can't have them.
 */
export function apply(
  doc: Parameters<typeof boundBefore>[0],
  id: NodeId,
  props: Record<string, unknown>,
  warnings: string[]
): void {
  const n = doc.node_mut(id)
  if (!n) throw new EngineError(`no such node ${id}`)
  if (LAYOUT_KEYS.some((k) => k in props) && !frameLike(n)) {
    const keys = LAYOUT_KEYS.filter((k) => k in props).map((k) => `\`${k}\``)
    warnings.push(
      `${keys.join(', ')} skipped on ${n.id} “${n.name}” (${n.kind.type}): only frames, components and instances have auto layout`
    )
  }
  const name = props.name
  if (typeof name === 'string') n.name = name
  const width = numOrNull(props.width)
  if (width !== null) n.width = Math.max(0, width)
  const height = numOrNull(props.height)
  if (height !== null) n.height = Math.max(0, height)
  const radius = radiiOf(props.cornerRadius)
  if (radius !== null) n.corners = { ...n.corners, radii: radius }
  const smoothing = numOrNull(props.cornerSmoothing)
  if (smoothing !== null)
    n.corners = { ...n.corners, smoothing: Math.min(1, Math.max(0, smoothing)) }
  const fills = paintsOf(props.fills ?? props.fill)
  if (fills !== null) n.fills = fills
  const strokes = paintsOf(props.strokes ?? props.stroke)
  if (strokes !== null) n.strokes = strokes
  const weight = numOrNull(props.strokeWeight)
  if (weight !== null) n.stroke = { ...n.stroke, weight: Math.max(0, weight) }
  const opacity = numOrNull(props.opacity)
  if (opacity !== null) n.opacity = Math.min(1, Math.max(0, opacity))
  const visible = boolOrNull(props.visible)
  if (visible !== null) n.visible = visible
  const locked = boolOrNull(props.locked)
  if (locked !== null) n.locked = locked
  const clip = boolOrNull(props.clip)
  if (clip !== null) n.clip = clip
  const mask = boolOrNull(props.isMask)
  if (mask !== null) n.is_mask = mask
  const blend = props.blend
  if (typeof blend === 'string') n.blend = blend as BlendMode
  const x = numOrNull(props.x)
  const y = numOrNull(props.y)
  if (x !== null || y !== null) {
    const c = [...n.transform.coeffs] as [number, number, number, number, number, number]
    if (x !== null) c[4] = x
    if (y !== null) c[5] = y
    n.transform = Affine.new(c)
  }
}

export const NODE_SPECS: CommandSpec[] = [
  spec('node.set', 'Set properties', KEYS, true, (s, p) => {
    const raw = p.props
    let props: Record<string, unknown>
    if (raw !== null && typeof raw === 'object' && !Array.isArray(raw)) {
      props = raw as Record<string, unknown>
    } else {
      // Allow flat params: {"id": 3, "fill": "#f00"}.
      props = { ...p }
      delete props.id
      delete props.ids
    }
    if (Object.keys(props).length === 0) throw bad('node.set', 'no properties given')
    const ids = targetIds(s, p)
    const doc = s.doc()
    const before = boundBefore(doc, ids)
    const warnings: string[] = []
    for (const i of ids) apply(doc, i, props, warnings)
    detachEdited(doc, before)
    return warnings.length === 0 ? ok() : { ok: true, warnings }
  }),
  spec('node.get', 'Get layer', '{id}', false, (s, p) => {
    const i = optId('node.get', p, 'id') ?? s.selection()[0] ?? null
    const n = i === null ? null : s.doc().node(i)
    if (!n) throw new EngineError('no such node')
    const c = n.transform.coeffs
    return {
      id: n.id,
      name: n.name,
      type: n.kind.type,
      x: c[4],
      y: c[5],
      width: n.width,
      height: n.height,
      visible: n.visible,
      locked: n.locked,
      opacity: n.opacity
    }
  })
]

/** `ids` (array), a single `id`, or the current selection. */
function targetIds(s: Parameters<CommandSpec['run']>[0], p: Record<string, unknown>): NodeId[] {
  const ids = p.ids
  if (Array.isArray(ids)) return ids.map(idOf).filter((x): x is NodeId => x !== null)
  const one = num(p, 'id')
  if (one !== null) return [one]
  return s.selection()
}
