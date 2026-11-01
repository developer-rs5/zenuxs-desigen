/**
 * Parameter parsing helpers shared by commands (lenient: agents send numbers
 * as strings, ids as `"12"`, colours as hex or CSS).
 * (Converted 1:1 from FigCraft `crates/engine/src/params.rs`.)
 */

import { Color, Paint, deserializePaint } from '@zenuxs/color'
import {
  Document,
  LineHeight,
  LetterSpacing,
  TextData,
  TextStyle,
  textOf,
  validAxisTag,
  validFeatureTag,
  type DecorationStyle,
  type Node as NodeT,
  type NodeId,
  type TextDecoration,
  type TextStyle as TextStyleT
} from '@zenuxs/doc'

import { EngineError, type Session } from '../lib'

/** `p[key]` when it is there and not null. */
export function get(p: Record<string, unknown>, key: string): unknown {
  const v = p[key]
  return v === null || v === undefined ? undefined : v
}

/** A number from a value: a finite number, a numeric string (`"12px"`, `"50%"`), or a bool. */
export function f64Of(v: unknown): number | null {
  if (typeof v === 'number') return Number.isFinite(v) ? v : null
  if (typeof v === 'string') {
    const t = v.trim().replace(/px$/, '').replace(/%$/, '').trim()
    const n = Number(t)
    return t.length > 0 && Number.isFinite(n) ? n : null
  }
  if (typeof v === 'boolean') return v ? 1 : 0
  return null
}

export function num(p: Record<string, unknown>, key: string): number | null {
  const v = get(p, key)
  return v === undefined ? null : f64Of(v)
}

export function numOr(p: Record<string, unknown>, key: string, d: number): number {
  return num(p, key) ?? d
}

export function reqNum(cmd: string, p: Record<string, unknown>, key: string): number {
  const v = num(p, key)
  if (v === null) throw bad(cmd, `\`${key}\` must be a number`)
  return v
}

/** A list index from params: a whole number, never negative. */
export function reqIndex(cmd: string, p: Record<string, unknown>, key: string): number {
  const k = reqNum(cmd, p, key)
  if (k < 0 || k >= 1e9 || !Number.isInteger(k)) throw bad(cmd, `\`${key}\` out of range`)
  return k
}

export function string(p: Record<string, unknown>, key: string): string | null {
  const v = get(p, key)
  if (v === undefined) return null
  if (typeof v === 'string') return v
  if (typeof v === 'number') return String(v)
  if (typeof v === 'boolean') return String(v)
  return null
}

export function reqString(cmd: string, p: Record<string, unknown>, key: string): string {
  const v = string(p, key)
  if (v === null) throw bad(cmd, `\`${key}\` must be a string`)
  return v
}

export function boolean(p: Record<string, unknown>, key: string): boolean | null {
  const v = get(p, key)
  return v === undefined ? null : boolOf(v)
}

/** A lenient boolean: `true`, `1`, `"yes"`, `"on"`… */
export function boolOf(v: unknown): boolean | null {
  if (typeof v === 'boolean') return v
  if (typeof v === 'number') return v !== 0
  if (typeof v === 'string') {
    switch (v.toLowerCase()) {
      case 'true':
      case 'yes':
      case 'on':
      case '1':
        return true
      case 'false':
      case 'no':
      case 'off':
      case '0':
        return false
      default:
        return null
    }
  }
  return null
}

export function idOf(v: unknown): NodeId | null {
  if (typeof v === 'number') return Number.isInteger(v) && v >= 0 ? v : null
  if (typeof v === 'string') {
    const n = Number(v.trim())
    return Number.isInteger(n) && n >= 0 ? n : null
  }
  return null
}

export function id(p: Record<string, unknown>, key: string): NodeId | null {
  const v = get(p, key)
  return v === undefined ? null : idOf(v)
}

export function reqId(cmd: string, p: Record<string, unknown>, key: string): NodeId {
  const v = id(p, key)
  if (v === null) throw bad(cmd, `\`${key}\` must be a node id`)
  return v
}

/** The offending value for an error message, cut short. */
function shown(v: unknown): string {
  const text = JSON.stringify(v) ?? String(v)
  return text.length > 40 ? `${text.slice(0, 40)}…` : text
}

/** `key` when it is there: a layer id, or an error naming it. */
export function optId(cmd: string, p: Record<string, unknown>, key: string): NodeId | null {
  const v = get(p, key)
  if (v === undefined) return null
  const parsed = idOf(v)
  if (parsed === null) throw bad(cmd, `\`${key}\` must be a node id (got ${shown(v)})`)
  return parsed
}

/** `key` when it is there: a whole, non-negative number, or an error. */
export function optIndex(cmd: string, p: Record<string, unknown>, key: string): number | null {
  const v = get(p, key)
  if (v === undefined) return null
  return reqIndex(cmd, p, key)
}

/** `ids` (array), `id` (single), or the current selection. */
export function targets(s: Session, p: Record<string, unknown>): NodeId[] {
  const ids = get(p, 'ids')
  if (Array.isArray(ids)) return ids.map(idOf).filter((x): x is NodeId => x !== null)
  const one = id(p, 'id')
  if (one !== null) return [one]
  return [...s.ds().selection]
}

/**
 * Like `targets` but an unparseable `ids` entry, an unparseable `id`, or an
 * empty result is an error.
 */
export function reqTargets(cmd: string, s: Session, p: Record<string, unknown>): NodeId[] {
  const ids = get(p, 'ids')
  if (Array.isArray(ids)) {
    const badEntry = ids.find((v) => idOf(v) === null)
    if (badEntry !== undefined)
      throw bad(cmd, `\`ids\`: every entry must be a node id (got ${shown(badEntry)})`)
  } else if (ids === undefined) {
    const raw = get(p, 'id')
    if (raw !== undefined && idOf(raw) === null)
      throw bad(cmd, `\`id\` must be a node id (got ${shown(raw)})`)
  } else {
    throw bad(cmd, `\`ids\` must be an array (got ${shown(ids)})`)
  }
  const t = targets(s, p)
  if (t.length === 0)
    throw new EngineError(
      `command \`${cmd}\` is not available right now: nothing is selected (pass \`ids\`)`
    )
  const doc = s.doc()
  for (const i of t) {
    if (!doc.contains_id(i)) throw new EngineError(`no such node ${i}`)
  }
  return t
}

/** A colour from a value: a CSS string, `{r,g,b,a}`, or `[r,g,b,a]` (0..1 floats). */
export function colorOf(v: unknown): Color | null {
  if (typeof v === 'string') return Color.parseCss(v)
  if (Array.isArray(v)) {
    const c = v.map((x) => (typeof x === 'number' ? x : null))
    if (c.some((x) => x === null)) return null
    const [r, g, b, a] = c as number[]
    if (r === undefined || g === undefined || b === undefined) return null
    return { r, g, b, a: a ?? 1 }
  }
  if (v && typeof v === 'object') {
    const o = v as Record<string, unknown>
    const r = f64Of(o.r)
    const g = f64Of(o.g)
    const b = f64Of(o.b)
    if (r === null || g === null || b === null) return null
    return { r, g, b, a: f64Of(o.a) ?? 1 }
  }
  return null
}

export function color(p: Record<string, unknown>, key: string): Color | null {
  const v = get(p, key)
  return v === undefined ? null : colorOf(v)
}

/** One paint from the friendlier JSON the docs describe (`{"type":"solid","color":"#fff"}`). */
function paintOf(v: unknown): Paint | null {
  if (typeof v === 'string') {
    const c = Color.parseCss(v)
    return c === null ? null : Paint.solid(c)
  }
  if (!v || typeof v !== 'object') return null
  const o = { ...(v as Record<string, unknown>) }
  if (typeof o.color === 'string') {
    const c = Color.parseCss(o.color)
    if (c) o.color = c
  }
  const type = typeof o.type === 'string' ? o.type.toLowerCase() : ''
  if (type.includes('gradient')) {
    if (type !== 'gradient') {
      const kind = type.replace(/gradient$/, '')
      o.type = 'gradient'
      o.kind = o.kind ?? (kind.length > 0 ? kind : 'linear')
    }
    o.kind = o.kind ?? 'linear'
    const linear = o.kind === 'linear'
    o.from = o.from ?? (linear ? [0.5, 0] : [0.5, 0.5])
    o.to = o.to ?? [0.5, 1]
    o.width = o.width ?? (linear ? [-0.5, 0] : [1, 0.5])
    if (Array.isArray(o.stops)) {
      const stops = o.stops as Array<Record<string, unknown>>
      const step = stops.length > 1 ? 1 / (stops.length - 1) : 0
      stops.forEach((s, i) => {
        if (typeof s.color === 'string') {
          const c = Color.parseCss(s.color)
          if (c) s.color = c
        }
        s.position = s.position ?? i * step
      })
    }
  }
  const parsed = deserializePaint(o)
  if (parsed instanceof Error) return null
  parsed.opacity = Number.isFinite(parsed.opacity) ? Math.min(1, Math.max(0, parsed.opacity)) : 1
  return parsed
}

/** Paints from a value: an array of them, or one. */
export function paintsOf(v: unknown): Paint[] | null {
  if (Array.isArray(v)) {
    const out: Paint[] = []
    for (const item of v) {
      const parsed = paintOf(item)
      if (parsed === null) return null
      out.push(parsed)
    }
    return out
  }
  const one = paintOf(v)
  return one === null ? null : [one]
}

// ------------------------------ text style params ------------------------------

/** `\r\n`, `\r`, `\u2028`, `\u2029` all become `\n`. */
export function normalizeLineEndings(s: string): string {
  return s.replace(/\r\n/g, '\n').replace(/[\r\u2028\u2029]/g, '\n')
}

/** `snake_case` → `snakeCase`. */
function camel(s: string): string {
  return s.replace(/[_\-\s]+([a-zA-Z0-9])/g, (_m, c: string) => c.toUpperCase())
}

/** Match `raw` against `options` leniently (`"small_caps"` → `"smallCaps"`). */
export function enumOf<T extends string>(raw: string, options: readonly T[]): T | null {
  const c = camel(raw.trim())
  for (const o of options) if (o.toLowerCase() === c.toLowerCase()) return o
  return null
}

/** A line height from a value: `"auto"`, `"150%"`, `{unit, value}`, or pixels. */
export function lineHeightOf(v: unknown): LineHeight | null {
  if (typeof v === 'string') {
    const t = v.trim().toLowerCase()
    if (t === 'auto') return LineHeight.AUTO
    const n = f64Of(t)
    if (n === null) return null
    return t.endsWith('%') ? { unit: 'percent', value: n } : { unit: 'pixels', value: n }
  }
  if (typeof v === 'number') return Number.isFinite(v) ? { unit: 'pixels', value: v } : null
  if (v && typeof v === 'object') {
    const o = v as Record<string, unknown>
    const unit = typeof o.unit === 'string' ? o.unit.toLowerCase() : ''
    if (unit === 'auto') return LineHeight.AUTO
    const value = f64Of(o.value)
    if (value === null) return null
    if (unit === 'percent' || unit === '%') return { unit: 'percent', value }
    return { unit: 'pixels', value }
  }
  return null
}

/** A letter spacing from a value: `"2%"`, `{unit, value}`, or pixels. */
export function letterSpacingOf(v: unknown): LetterSpacing | null {
  if (typeof v === 'string') {
    const t = v.trim()
    const n = f64Of(t)
    if (n === null) return null
    return t.endsWith('%') ? { unit: 'percent', value: n } : { unit: 'pixels', value: n }
  }
  if (typeof v === 'number') return Number.isFinite(v) ? { unit: 'pixels', value: v } : null
  if (v && typeof v === 'object') {
    const o = v as Record<string, unknown>
    const value = f64Of(o.value)
    if (value === null) return null
    const unit = typeof o.unit === 'string' ? o.unit.toLowerCase() : ''
    return unit === 'percent' || unit === '%'
      ? { unit: 'percent', value }
      : { unit: 'pixels', value }
  }
  return null
}

/** OpenType feature toggles from `{tag: bool | null}` (`null`: the font's default). */
export function featuresOf(cmd: string, v: unknown): Array<[string, boolean | null]> {
  if (v === undefined || v === null) throw bad(cmd, 'features: {tag: bool}, e.g. {"liga": false}')
  if (typeof v !== 'object' || Array.isArray(v))
    throw bad(cmd, 'features: {tag: bool}, e.g. {"liga": false}')
  const out: Array<[string, boolean | null]> = []
  for (const [tag, raw] of Object.entries(v as Record<string, unknown>)) {
    if (!validFeatureTag(tag))
      throw bad(cmd, `\`${tag}\` is not a 4-character OpenType feature tag`)
    if (raw === null) out.push([tag, null])
    else {
      const n = f64Of(raw)
      if (n === null) throw bad(cmd, `feature \`${tag}\` must be true, false or null`)
      out.push([tag, n !== 0])
    }
  }
  return out
}

/** Variable font axis values from `{tag: number | null}` (`null`: back to the style's value). */
export function variationsOf(cmd: string, v: unknown): Array<[string, number | null]> {
  if (v === null) return []
  if (typeof v !== 'object' || Array.isArray(v))
    throw bad(cmd, 'variations: {axis: number}, e.g. {"wght": 550, "wdth": 85}')
  const out: Array<[string, number | null]> = []
  for (const [tag, raw] of Object.entries(v as Record<string, unknown>)) {
    if (!validAxisTag(tag)) throw bad(cmd, `\`${tag}\` is not a 4-character OpenType axis tag`)
    if (raw === null) {
      out.push([tag, null])
      continue
    }
    const n = f64Of(raw)
    if (n === null || Math.abs(n) > 1e6) throw bad(cmd, `axis \`${tag}\` must be a number or null`)
    out.push([tag, n])
  }
  return out
}

/** Replace `[start, end)` of `t` with the style changes in `patch`. */
export function applyTextStylePatch(
  t: TextData,
  start: number,
  end: number,
  patch: Partial<TextStyleT>
): void {
  TextData.restyle(t, start, end, (s) => Object.assign(s, patch))
}

const DECORATIONS = ['none', 'underline', 'strikethrough'] as const
const DECORATION_STYLES = ['solid', 'dotted', 'wavy'] as const
const TEXT_CASES = ['original', 'upper', 'lower', 'title', 'smallCaps'] as const

/** Apply one `text.style` key/value to `[start, end)` of `t` (unknown keys are ignored). */
export function applyTextStyle(
  cmd: string,
  t: TextData,
  start: number,
  end: number,
  key: string,
  value: unknown
): void {
  const patch = (f: (s: TextStyleT) => void): void => TextData.restyle(t, start, end, f)
  switch (key) {
    case 'fontFamily': {
      const family = typeof value === 'string' ? value : null
      if (family === null) return
      patch((s) => {
        s.font_family = family
      })
      return
    }
    case 'fontStyle': {
      if (typeof value !== 'string') return
      patch((s) => {
        s.font_style = value
      })
      return
    }
    case 'fontWeight': {
      const w = f64Of(value)
      if (w === null) return
      const weight = Math.min(1000, Math.max(1, w))
      patch((s) => {
        const italic = TextStyle.style_italic(s.font_style)
        s.font_style = TextStyle.styled_name(TextStyle.weight_name(weight), italic)
      })
      return
    }
    case 'fontVariations':
    case 'variationSettings': {
      const axes = variationsOf(cmd, value)
      const map: Record<string, number> = {}
      for (const [tag, axis] of axes) if (axis !== null) map[tag] = axis
      patch((s) => {
        s.variation_axes = map
      })
      return
    }
    case 'fontSize': {
      const n = f64Of(value)
      if (n === null) return
      const size = Math.min(5000, Math.max(1, n))
      patch((s) => {
        s.font_size = size
      })
      return
    }
    case 'lineHeight': {
      const lh = lineHeightOf(value)
      if (lh === null) return
      patch((s) => {
        s.line_height = lh
      })
      return
    }
    case 'letterSpacing': {
      const ls = letterSpacingOf(value)
      if (ls === null) return
      patch((s) => {
        s.letter_spacing = ls
      })
      return
    }
    case 'textDecoration': {
      const d: TextDecoration | null = typeof value === 'string' ? enumOf(value, DECORATIONS) : null
      if (d === null) return
      patch((s) => {
        s.decoration = d
      })
      return
    }
    case 'textDecorationStyle': {
      const d: DecorationStyle | null =
        typeof value === 'string' ? enumOf(value, DECORATION_STYLES) : null
      if (d === null) return
      patch((s) => {
        s.decoration_look.style = d
      })
      return
    }
    case 'textDecorationThickness':
    case 'textDecorationOffset': {
      const lh = lineHeightOf(value)
      if (lh === null) return
      if (lh.unit !== 'auto' && lh.value > 10_000) return
      patch((s) => {
        if (key === 'textDecorationThickness') s.decoration_look.thickness = lh
        else s.decoration_look.offset = lh
      })
      return
    }
    case 'textDecorationSkipInk': {
      const b = boolOf(value)
      if (b === null) return
      patch((s) => {
        s.decoration_look.skip_ink = b
      })
      return
    }
    case 'textDecorationColor': {
      if (value === null || value === 'auto') {
        patch((s) => {
          s.decoration_look.color = null
        })
        return
      }
      const c = colorOf(value)
      if (c === null) return
      const hex = `#${[c.r, c.g, c.b]
        .map((x) =>
          Math.round(Math.min(1, Math.max(0, x)) * 255)
            .toString(16)
            .padStart(2, '0')
        )
        .join('')}`
      patch((s) => {
        s.decoration_look.color = hex
      })
      return
    }
    case 'textCase': {
      const c = typeof value === 'string' ? enumOf(value, TEXT_CASES) : null
      if (c === null) return
      patch((s) => {
        s.text_case = c
      })
      return
    }
    case 'hyperlink': {
      const link = typeof value === 'string' ? value : null
      patch((s) => {
        s.link = link
      })
      return
    }
    case 'textFills': {
      const fills = value === null ? null : paintsOf(value)
      patch((s) => {
        s.fills = fills
      })
      return
    }
    default:
      void cmd
      return
  }
}

// ------------------------------ bindings ------------------------------

/** Clones of the nodes among `ids` that carry variable bindings. */
export function boundBefore(doc: Document, ids: NodeId[]): Map<NodeId, NodeT> {
  const out = new Map<NodeId, NodeT>()
  for (const id of ids) {
    const n = doc.node(id)
    if (n && Object.keys(n.bound).length > 0) out.set(id, structuredClone(n))
  }
  return out
}

/**
 * The stored value a layer-level binding writes, comparable (`null`: the layer
 * has no such field).
 */
export function boundField(n: NodeT, field: string): string | null {
  const text = (f: (s: TextStyleT) => string): string | null => {
    if (n.kind.type !== 'text') return null
    const t = textOf(n.kind)
    return [t.style, ...t.runs.map((r) => r.style)].map(f).join(',')
  }
  const layout = n.layout
  const pad = (i: number): number | undefined => layout?.padding[i]
  const opt = (v: unknown): string => JSON.stringify(v ?? null)
  switch (field) {
    case 'width':
      return String(n.width)
    case 'height':
      return String(n.height)
    case 'minWidth':
      return opt(n.child_layout.min_w)
    case 'maxWidth':
      return opt(n.child_layout.max_w)
    case 'minHeight':
      return opt(n.child_layout.min_h)
    case 'maxHeight':
      return opt(n.child_layout.max_h)
    case 'opacity':
      return String(n.opacity)
    case 'visible':
      return String(n.visible)
    case 'gap':
    case 'columnGap':
      return opt(layout?.gap)
    case 'crossGap':
    case 'rowGap':
      return opt(layout?.cross_gap)
    case 'padding':
      return opt(layout?.padding)
    case 'paddingTop':
      return opt(pad(0))
    case 'paddingRight':
      return opt(pad(1))
    case 'paddingBottom':
      return opt(pad(2))
    case 'paddingLeft':
      return opt(pad(3))
    case 'paddingHorizontal':
      return opt([pad(1), pad(3)])
    case 'paddingVertical':
      return opt([pad(0), pad(2)])
    case 'cornerRadius':
      return opt(n.corners.radii)
    case 'topLeftRadius':
      return opt(n.corners.radii[0])
    case 'topRightRadius':
      return opt(n.corners.radii[1])
    case 'bottomRightRadius':
      return opt(n.corners.radii[2])
    case 'bottomLeftRadius':
      return opt(n.corners.radii[3])
    case 'strokeWeight':
      return opt([n.stroke.weight, n.stroke.sides ?? null])
    case 'strokeTopWeight':
    case 'strokeRightWeight':
    case 'strokeBottomWeight':
    case 'strokeLeftWeight':
      return opt(n.stroke.sides ?? null)
    case 'arcStart':
    case 'arcSweep':
    case 'arcInner': {
      if (n.kind.type !== 'ellipse') return null
      const v =
        field === 'arcStart' ? n.kind.start : field === 'arcSweep' ? n.kind.sweep : n.kind.inner
      return String(v)
    }
    case 'characters':
      return n.kind.type === 'text' ? textOf(n.kind).characters : null
    case 'paragraphSpacing':
    case 'paragraphIndent': {
      if (n.kind.type !== 'text') return null
      const t = textOf(n.kind)
      return String(field === 'paragraphSpacing' ? t.paragraph_spacing : t.paragraph_indent)
    }
    case 'fontFamily':
      return text((s) => s.font_family)
    case 'fontStyle':
      return text((s) => s.font_style)
    case 'fontWeight':
      return text((s) => String(TextStyle.style_weight(s.font_style)))
    case 'fontSize':
      return text((s) => String(s.font_size))
    case 'lineHeight':
      return text((s) => JSON.stringify(s.line_height))
    case 'letterSpacing':
      return text((s) => JSON.stringify(s.letter_spacing))
    default:
      return null
  }
}

/**
 * An explicit edit sticks: each layer's own bound field whose value the edit
 * changed drops its binding, which would otherwise write the variable's value
 * back. Compared by value, so keys written unchanged keep their bindings.
 */
export function detachEdited(doc: Document, before: Map<NodeId, NodeT>): void {
  for (const [id, old] of before) {
    const n = doc.node(id)
    if (!n) continue
    const edited = Object.keys(n.bound).filter((f) => {
      if (old.bound[f] !== n.bound[f]) return false
      if (f.startsWith('bound:')) return false
      return boundField(old, f) !== boundField(n, f)
    })
    if (edited.length === 0) continue
    const mut = doc.node_mut(id)
    if (!mut) continue
    for (const f of edited) delete mut.bound[f]
  }
}

/** Raise a `bad params` error for `cmd`. */
export function bad(cmd: string, msg: string): EngineError {
  return new EngineError(`invalid parameters for \`${cmd}\`: ${msg}`)
}
