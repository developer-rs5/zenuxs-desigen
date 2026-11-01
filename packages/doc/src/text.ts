/**
 * Text node data: characters plus a base style and styled runs.
 * (Converted 1:1 from FigCraft `crates/doc/src/text.rs`.)
 */

import type { Paint } from '@zenuxs/color'

/** Line height: auto (the font's natural ratio), pixels or percent. */
export type LineHeight = { unit: 'auto' } | { unit: 'pixels'; value: number } | { unit: 'percent'; value: number }

export const LineHeight = {
  AUTO: { unit: 'auto' } as LineHeight,

  /** Resolved line height in px for `font_size` (`auto` uses the font's natural ratio). */
  resolve(lh: LineHeight, font_size: number, natural_ratio: number): number {
    switch (lh.unit) {
      case 'auto':
        return font_size * natural_ratio
      case 'pixels':
        return Math.max(0, lh.value)
      case 'percent':
        return (font_size * Math.max(0, lh.value)) / 100
    }
  },

  label(lh: LineHeight): string {
    switch (lh.unit) {
      case 'auto':
        return 'Auto'
      case 'pixels':
        return trimNum(lh.value)
      case 'percent':
        return `${trimNum(lh.value)}%`
    }
  },

  equal(a: LineHeight, b: LineHeight): boolean {
    if (a.unit !== b.unit) return false
    if (a.unit === 'auto' || b.unit === 'auto') return true
    return a.value === b.value
  }
}

/** Letter spacing: pixels or percent of the font size. */
export type LetterSpacing = { unit: 'pixels'; value: number } | { unit: 'percent'; value: number }

export const LetterSpacing = {
  default(): LetterSpacing {
    return { unit: 'percent', value: 0 }
  },
  resolve(ls: LetterSpacing, font_size: number): number {
    return ls.unit === 'pixels' ? ls.value : (font_size * ls.value) / 100
  },
  label(ls: LetterSpacing): string {
    return ls.unit === 'pixels' ? trimNum(ls.value) : `${trimNum(ls.value)}%`
  }
}

/** `42.5` not `42.50000` — trims float noise for display. */
export function trimNum(v: number): string {
  const r = Math.round(v * 100) / 100
  return String(r === 0 ? 0 : r)
}

export type TextDecoration = 'none' | 'underline' | 'strikethrough'
export type DecorationStyle = 'solid' | 'dotted' | 'wavy'

/** A decoration length: `auto` (the font's own value), pixels, or a percentage of the font size. */
export type DecorationLength = LineHeight

/** How a decoration looks beyond its kind. */
export interface DecorationLook {
  style: DecorationStyle
  /** Offset from the natural position (negative: above the baseline). */
  offset: DecorationLength
  /** Thickness of the line. */
  thickness: DecorationLength
  /** Underlines break where descenders cross them. */
  skip_ink: boolean
  /** The line's own colour (null: the text's fills). */
  color?: string | null
}

export const DecorationLook = {
  default(): DecorationLook {
    return { style: 'solid', offset: LineHeight.AUTO, thickness: LineHeight.AUTO, skip_ink: false, color: null }
  },

  /** Structural equality (the look holds only plain data). */
  equal(a: DecorationLook, b: DecorationLook): boolean {
    return (
      a.style === b.style &&
      a.skip_ink === b.skip_ink &&
      a.color === b.color &&
      LineHeight.equal(a.offset, b.offset) &&
      LineHeight.equal(a.thickness, b.thickness)
    )
  }
}

export type TextCase = 'original' | 'upper' | 'lower' | 'title' | 'smallCaps'
export type TextAlignH = 'left' | 'center' | 'right' | 'justify'
export type TextAlignV = 'top' | 'center' | 'bottom'
export type TextAutoResize = 'none' | 'widthAndHeight' | 'height' | 'truncate'
export type LeadingTrim = 'none' | 'capHeight'
export type ListStyle = 'none' | 'bullet' | 'numbered'

/** The deepest a list nests. */
export const MAX_LIST_INDENT = 8

/** A paragraph's list style and indent level. */
export interface ParaList {
  kind: ListStyle
  indent: number
}

/** One character style. */
export interface TextStyle {
  font_family: string
  font_style: string
  font_features: Record<string, boolean>
  variation_axes: Record<string, number>
  font_size: number
  line_height: LineHeight
  letter_spacing: LetterSpacing
  decoration: TextDecoration
  decoration_look: DecorationLook
  text_case: TextCase
  /** The hyperlink this text opens (null: none). */
  link: string | null
  /** Fills of its own, overriding the layer's (null: the layer's fills). */
  fills: Paint[] | null
  /** The text style it is linked to (null: none). */
  style_id: string | null
}

export const STYLE_AXES = ['wght', 'ital', 'slnt'] as const

export const TextStyle = {
  default(): TextStyle {
    return {
      font_family: 'Inter',
      font_style: 'Regular',
      font_features: {},
      variation_axes: {},
      font_size: 16,
      line_height: LineHeight.AUTO,
      letter_spacing: LetterSpacing.default(),
      decoration: 'none',
      decoration_look: DecorationLook.default(),
      text_case: 'original',
      link: null,
      fills: null,
      style_id: null
    }
  },

  /** The weight a style name implies ("Bold" → 700). */
  style_weight(style: string): number {
    const s = style.toLowerCase().replace(/[ -]/g, '')
    const table: Array<[string, number]> = [
      ['thin', 100],
      ['extralight', 200],
      ['ultralight', 200],
      ['light', 300],
      ['medium', 500],
      ['semibold', 600],
      ['demibold', 600],
      ['extrabold', 800],
      ['ultrabold', 800],
      ['black', 900]
    ]
    for (const [name, weight] of table) if (s.includes(name)) return weight
    if (s.includes('bold')) return 700
    if (s.includes('heavy')) return 900
    return 400
  },

  /** Whether a style name implies an italic or oblique face. */
  style_italic(style: string): boolean {
    const s = style.toLowerCase()
    return s.includes('italic') || s.includes('oblique')
  },

  /** The style name a weight implies ("Bold"), optionally with an italic suffix. */
  styled_name(weight: string, italic: boolean): string {
    if (!italic) return weight
    return weight === 'Regular' ? 'Italic' : `${weight} Italic`
  },

  /** The style name a numeric weight implies (700 → "Bold"). */
  weight_name(weight: number): string {
    if (weight <= 149) return 'Thin'
    if (weight <= 249) return 'Extra Light'
    if (weight <= 349) return 'Light'
    if (weight <= 449) return 'Regular'
    if (weight <= 549) return 'Medium'
    if (weight <= 649) return 'Semi Bold'
    if (weight <= 749) return 'Bold'
    if (weight <= 849) return 'Extra Bold'
    return 'Black'
  }
}

/** A styled range: `[start, end)` styled `style` (merged, non-overlapping, sorted). */
export interface StyleRun {
  start: number
  end: number
  style: TextStyle
}

/** Text on a path: the baseline follows `d`. */
export interface TextPath {
  /** SVG path data in the layer's own space. */
  d: string
  /** Where the text starts along the path, 0..1 by length. */
  start: number
  /** On the other side of the path, running the other way. */
  flip: boolean
}

export const TextPath = {
  default(): TextPath {
    return { d: '', start: 0, flip: false }
  }
}

/** Text node data. */
export interface TextData {
  characters: string
  style: TextStyle
  /** Ranges whose style differs from `style`; full styles, non-overlapping, sorted. */
  runs: StyleRun[]
  auto_resize: TextAutoResize
  align_h: TextAlignH
  align_v: TextAlignV
  paragraph_spacing: number
  paragraph_indent: number
  /** The list style of paragraphs `paragraphs` doesn't cover. */
  list: ListStyle
  /** Per-paragraph list settings, by paragraph index. */
  paragraphs: ParaList[]
  /** Space between two items of a list (px). */
  list_spacing: number
  /** Opening and closing punctuation at a line's aligned edge sits outside the box. */
  hanging_punctuation: boolean
  /** List bullets and numbers sit outside the box. */
  hanging_list: boolean
  /** Vertical trim. */
  leading_trim: LeadingTrim
  /** Max lines when truncating (0 = as many as fit). */
  max_lines: number
  /** OpenType feature toggles (e.g. "liga": false). */
  features: Record<string, boolean>
  /** The path the text follows (text on a path); null: lines in the box. */
  path: TextPath | null
}

/** A text node's kind: the loose record the node model stores text data in. */
export type TextKind = { type: 'text'; characters: string; style: unknown; runs: unknown[] } & Record<string, unknown>

export const TextData = {
  default(): TextData {
    return {
      characters: '',
      style: TextStyle.default(),
      runs: [],
      auto_resize: 'widthAndHeight',
      align_h: 'left',
      align_v: 'top',
      paragraph_spacing: 0,
      paragraph_indent: 0,
      list: 'none',
      paragraphs: [],
      list_spacing: 0,
      hanging_punctuation: false,
      hanging_list: false,
      leading_trim: 'none',
      max_lines: 0,
      features: {},
      path: null
    }
  },

  isDefault(t: TextData): boolean {
    return (
      t.runs.length === 0 &&
      t.auto_resize === 'widthAndHeight' &&
      t.align_h === 'left' &&
      t.align_v === 'top' &&
      t.paragraph_spacing === 0 &&
      t.paragraph_indent === 0 &&
      t.list === 'none' &&
      t.paragraphs.length === 0 &&
      t.list_spacing === 0 &&
      !t.hanging_punctuation &&
      !t.hanging_list &&
      t.leading_trim === 'none' &&
      t.max_lines === 0 &&
      Object.keys(t.features).length === 0 &&
      t.path === null
    )
  },

  /** Paragraph count of `characters`. */
  paragraphCount(t: TextData): number {
    return t.characters.split('\n').length
  },

  /** Character count of `characters`. */
  charCount(t: TextData): number {
    return t.characters.length
  },

  /** The list style of paragraph `index` (per-paragraph first, else `list`). */
  listAt(t: TextData, index: number): ParaList {
    const p = t.paragraphs[index]
    return p ?? { kind: t.list, indent: 0 }
  },

  /**
   * Replace `range` in `characters` with `text`, keeping runs and paragraphs in
   * step (the Rust `replace_range`).
   */
  replaceRange(t: TextData, start: number, end: number, text: string): void {
    const chars = t.characters
    const clampedStart = Math.min(Math.max(0, start), chars.length)
    const clampedEnd = Math.min(Math.max(clampedStart, end), chars.length)
    const delta = text.length - (clampedEnd - clampedStart)
    t.characters = chars.slice(0, clampedStart) + text + chars.slice(clampedEnd)

    // Shift runs.
    for (const run of t.runs) {
      if (run.end <= clampedStart) continue
      if (run.start >= clampedEnd) {
        run.start += delta
        run.end += delta
      } else {
        run.end += delta
        run.start = Math.min(run.start, clampedStart)
      }
    }
    t.runs = t.runs.filter((r) => r.end > r.start)

    // Paragraph list entries follow their paragraph index.
    const removedBreaks = countBreaks(chars, clampedStart, clampedEnd)
    const addedBreaks = countBreaks(text, 0, text.length)
    const net = addedBreaks - removedBreaks
    if (net !== 0 && t.paragraphs.length > 0) {
      const firstPara = countBreaks(chars, 0, clampedStart)
      const newParagraphs: ParaList[] = []
      for (let i = 0; i < t.paragraphs.length; i++) {
        const entry = t.paragraphs[i]
        if (!entry) continue
        if (i < firstPara) newParagraphs.push(entry)
        else if (i >= firstPara + removedBreaks) newParagraphs.push(entry)
        else if (net > 0) for (let k = 0; k <= net; k++) newParagraphs.push(entry)
      }
      t.paragraphs = newParagraphs
    }
  },

  /** The style at character `index` (a run's, else the base style). */
  styleAt(t: TextData, index: number): TextStyle {
    const run = t.runs.find((r) => index >= r.start && index < r.end)
    return run ? run.style : t.style
  },

  /** Spans of uniform style covering the whole text: `[start, end, style]`. */
  spans(t: TextData): Array<[number, number, TextStyle]> {
    const n = t.characters.length
    const out: Array<[number, number, TextStyle]> = []
    let pos = 0
    const runs = t.runs.filter((r) => r.start < r.end && r.start < n).sort((a, b) => a.start - b.start)
    for (const run of runs) {
      const start = Math.max(run.start, pos)
      const end = Math.min(run.end, n)
      if (start >= end) continue
      if (start > pos) out.push([pos, start, t.style])
      out.push([start, end, run.style])
      pos = end
    }
    if (pos < n || out.length === 0) out.push([pos, n, t.style])
    return out
  },

  /** Apply `f` to the style of characters `start..end` (all of them for a whole or empty range). */
  restyle(t: TextData, start: number, end: number, f: (style: TextStyle) => void): void {
    const n = t.characters.length
    const a = Math.min(start, n)
    const b = Math.min(end, n)
    if (n === 0 || (a === 0 && b >= n)) {
      f(t.style)
      for (const run of t.runs) f(run.style)
      TextData.normalize(t)
      return
    }
    if (a >= b) return
    const per: TextStyle[] = []
    for (let i = 0; i < n; i++) per.push(structuredClone(TextData.styleAt(t, i)))
    for (let i = a; i < b; i++) {
      const style = per[i]
      if (style) f(style)
    }
    t.runs = []
    let i = 0
    while (i < n) {
      const style = per[i]
      if (!style) break
      let j = i + 1
      while (j < n && textStyleEqual(per[j], style)) j += 1
      if (!textStyleEqual(style, t.style)) t.runs.push({ start: i, end: j, style })
      i = j
    }
  },

  /** Drop empty/out-of-range runs and runs equal to the base style; merge touching equal runs. */
  normalize(t: TextData): void {
    const n = t.characters.length
    const base = t.style
    t.runs = t.runs.filter((r) => r.start < r.end && r.start < n && !textStyleEqual(r.style, base))
    for (const run of t.runs) run.end = Math.min(run.end, n)
    t.runs.sort((a, b) => a.start - b.start)
    const merged: StyleRun[] = []
    for (const run of t.runs) {
      const prev = merged[merged.length - 1]
      if (prev && prev.end === run.start && textStyleEqual(prev.style, run.style)) prev.end = run.end
      else merged.push(run)
    }
    t.runs = merged
  },

  /** Apply `f` to every distinct style (the base and each run), merging runs that became equal. */
  eachStyle(t: TextData, f: (style: TextStyle) => void): void {
    f(t.style)
    for (const run of t.runs) f(run.style)
    TextData.normalize(t)
  },

  /** The paragraph character index `i` is in. */
  paraOf(t: TextData, i: number): number {
    let n = 0
    const end = Math.min(i, t.characters.length)
    for (let k = 0; k < end; k++) if (t.characters[k] === '\n') n += 1
    return n
  },

  /** Paragraph `p`'s list settings (per-paragraph first, else the layer default). */
  paraList(t: TextData, p: number): ParaList {
    return t.paragraphs[p] ?? { kind: t.list, indent: 0 }
  },

  /**
   * The paragraph range characters `start..end` touch (a caret: its paragraph; a
   * selection ending just after a newline leaves the next paragraph out).
   */
  paraSpan(t: TextData, start: number, end: number): [number, number] {
    const s = Math.min(start, end)
    const e = Math.max(start, end)
    const a = TextData.paraOf(t, s)
    const b = TextData.paraOf(t, e)
    const endsAtStart = e > s && b > a && t.characters[e - 1] === '\n'
    return [a, endsAtStart ? b - 1 : b]
  },

  /**
   * Apply `f` to the list settings of the paragraphs characters `start..end`
   * touch, folding one uniform plain style back into `list`.
   */
  setParaLists(t: TextData, start: number, end: number, f: (list: ParaList) => void): void {
    const [a, b] = TextData.paraSpan(t, start, end)
    const count = TextData.paragraphCount(t)
    const fill = { kind: t.list, indent: 0 }
    while (t.paragraphs.length < count) t.paragraphs.push({ ...fill })
    t.paragraphs.length = count
    for (let p = a; p <= b && p < count; p++) {
      const entry = t.paragraphs[p]
      if (!entry) continue
      f(entry)
      if (entry.kind === 'none') entry.indent = 0
      entry.indent = Math.min(entry.indent, MAX_LIST_INDENT)
    }
    const first = t.paragraphs[0]
    if (first && first.indent === 0 && t.paragraphs.every((p) => p.kind === first.kind && p.indent === 0)) {
      t.list = first.kind
      t.paragraphs = []
    }
  },

  /** The list style and level shared by the paragraphs `start..end` touch, or null when they differ. */
  commonParaList(t: TextData, start: number, end: number): ParaList | null {
    const [a, b] = TextData.paraSpan(t, start, end)
    const first = TextData.paraList(t, a)
    for (let p = a; p <= b; p++) {
      const list = TextData.paraList(t, p)
      if (list.kind !== first.kind || list.indent !== first.indent) return null
    }
    return first
  },

  /** The largest font size used, capped like layout caps it. */
  maxSize(t: TextData): number {
    let max = 0
    for (const [, , style] of TextData.spans(t)) {
      if (Number.isFinite(style.font_size)) max = Math.max(max, style.font_size)
    }
    return Math.min(max, 5000)
  }
}

/** Structural equality of two character styles (they hold only plain data). */
export function textStyleEqual(a: TextStyle, b: TextStyle): boolean {
  return a === b || JSON.stringify(a) === JSON.stringify(b)
}

/** The weight a style name implies, as a number. */
export function styleWeight(style: string): number {
  return TextStyle.style_weight(style)
}

/** Whether a style name implies an italic or oblique face. */
export function styleItalic(style: string): boolean {
  return TextStyle.style_italic(style)
}

/** The style name a weight implies, optionally with an italic suffix. */
export function styledName(weight: string, italic: boolean): string {
  return TextStyle.styled_name(weight, italic)
}

/** The style name a numeric weight implies (700 → "Bold"). */
export function weightName(weight: number): string {
  return TextStyle.weight_name(weight)
}

/** Change how the decoration looks (the default look is stored as `DecorationLook.default()`). */
export function setLook(style: TextStyle, f: (look: DecorationLook) => void): void {
  const look = { ...style.decoration_look }
  f(look)
  style.decoration_look = DecorationLook.equal(look, DecorationLook.default()) ? DecorationLook.default() : look
}

/** Switch to the named style, dropping custom values of the axes the name implies. */
export function setFontStyle(style: TextStyle, name: string): void {
  style.font_style = name
  for (const tag of STYLE_AXES) delete style.variation_axes[tag]
}

/** Whether `tag` is a valid OpenType feature tag (four printable ASCII chars). */
export function validFeatureTag(tag: string): boolean {
  return tag.length === 4 && [...tag].every((c) => c.charCodeAt(0) >= 0x20 && c.charCodeAt(0) < 0x7f)
}

/** Whether `tag` is a valid OpenType variation axis tag (same shape as a feature tag). */
export function validAxisTag(tag: string): boolean {
  return validFeatureTag(tag)
}

/** A text node's characters, style and runs as `TextData` (fills unknown fields with defaults). */
export function textOf(kind: TextKind): TextData {
  const base = TextData.default()
  return {
    characters: kind.characters,
    style: isTextStyle(kind.style) ? coerceStyle(kind.style) : base.style,
    runs: Array.isArray(kind.runs)
      ? (kind.runs.filter(isStyleRun).map((r) => ({ start: r.start, end: r.end, style: coerceStyle(r.style) })) as StyleRun[])
      : [],
    auto_resize: isValue(kind.auto_resize, AUTORESIZE) ?? base.auto_resize,
    align_h: isValue(kind.align_h, ALIGN_H) ?? base.align_h,
    align_v: isValue(kind.align_v, ALIGN_V) ?? base.align_v,
    paragraph_spacing: isNumber(kind.paragraph_spacing) ?? base.paragraph_spacing,
    paragraph_indent: isNumber(kind.paragraph_indent) ?? base.paragraph_indent,
    list: isValue(kind.list, LIST_STYLE) ?? base.list,
    paragraphs: Array.isArray(kind.paragraphs) ? (kind.paragraphs as ParaList[]) : [],
    list_spacing: isNumber(kind.list_spacing) ?? base.list_spacing,
    hanging_punctuation: kind.hanging_punctuation === true,
    hanging_list: kind.hanging_list === true,
    leading_trim: kind.leading_trim === 'capHeight' ? 'capHeight' : 'none',
    max_lines: isNumber(kind.max_lines) ?? base.max_lines,
    features: isFeatureMap(kind.features) ? kind.features : {},
    path: isTextPath(kind.path) ? kind.path : null
  }
}

/** Fill a style's missing fields from the defaults (documents written before a field existed). */
function coerceStyle(raw: TextStyle & { links?: Record<string, string> }): TextStyle {
  const base = TextStyle.default()
  return {
    font_family: typeof raw.font_family === 'string' ? raw.font_family : base.font_family,
    font_style: typeof raw.font_style === 'string' ? raw.font_style : base.font_style,
    font_features: isFeatureMap(raw.font_features) ? { ...raw.font_features } : {},
    variation_axes: isFeatureMap(raw.variation_axes) ? { ...(raw.variation_axes as Record<string, number>) } : {},
    font_size: isNumber(raw.font_size) ?? base.font_size,
    line_height: isLineHeight(raw.line_height) ? raw.line_height : base.line_height,
    letter_spacing: isLetterSpacing(raw.letter_spacing) ? raw.letter_spacing : base.letter_spacing,
    decoration: isValue(raw.decoration, DECORATION) ?? base.decoration,
    decoration_look: coerceLook(raw.decoration_look),
    text_case: isValue(raw.text_case, TEXT_CASE) ?? base.text_case,
    link: typeof raw.link === 'string' ? raw.link : firstLink(raw.links),
    fills: Array.isArray(raw.fills) ? (raw.fills as Paint[]) : null,
    style_id: typeof raw.style_id === 'string' ? raw.style_id : null
  }
}

/** Legacy styles kept `links` (char index → URL); the first entry is the single link. */
function firstLink(links: unknown): string | null {
  if (typeof links !== 'object' || links === null) return null
  const values = Object.values(links as Record<string, unknown>).filter((v): v is string => typeof v === 'string')
  return values[0] ?? null
}

function coerceLook(raw: unknown): DecorationLook {
  const base = DecorationLook.default()
  if (typeof raw !== 'object' || raw === null) return base
  const look = raw as Partial<DecorationLook>
  return {
    style: isValue(look.style, DECORATION_STYLE) ?? base.style,
    offset: isDecorationLength(look.offset) ?? base.offset,
    thickness: isDecorationLength(look.thickness) ?? base.thickness,
    skip_ink: look.skip_ink === true,
    color: typeof look.color === 'string' ? look.color : null
  }
}

function isDecorationLength(value: unknown): DecorationLength | null {
  if (isNumber(value) !== null) return { unit: 'pixels', value: value as number }
  return isLineHeight(value) ? value : null
}

function isLineHeight(value: unknown): value is LineHeight {
  if (typeof value !== 'object' || value === null) return false
  const lh = value as LineHeight
  if (lh.unit === 'auto') return true
  return (lh.unit === 'pixels' || lh.unit === 'percent') && isNumber(lh.value) !== null
}

function isLetterSpacing(value: unknown): value is LetterSpacing {
  if (typeof value !== 'object' || value === null) return false
  const ls = value as LetterSpacing
  return (ls.unit === 'pixels' || ls.unit === 'percent') && isNumber(ls.value) !== null
}

/** Write `TextData` back onto a text kind, keeping the kind's tag. */
export function setTextOf(kind: TextKind, data: TextData): void {
  Object.assign(kind, data)
}

function isTextStyle(value: unknown): value is TextStyle {
  return typeof value === 'object' && value !== null && typeof (value as TextStyle).font_family === 'string'
}

function isStyleRun(value: unknown): value is StyleRun {
  if (typeof value !== 'object' || value === null) return false
  const run = value as StyleRun
  return typeof run.start === 'number' && typeof run.end === 'number' && isTextStyle(run.style)
}

/** Every auto-resize mode (for lenient parsing). */
export const AUTORESIZE = ['none', 'widthAndHeight', 'height', 'truncate'] as const
export const ALIGN_H = ['left', 'center', 'right', 'justify'] as const
export const ALIGN_V = ['top', 'center', 'bottom'] as const
export const LIST_STYLE = ['none', 'bullet', 'numbered'] as const
export const DECORATION = ['none', 'underline', 'strikethrough'] as const
export const DECORATION_STYLE = ['solid', 'dotted', 'wavy'] as const
export const TEXT_CASE = ['original', 'upper', 'lower', 'title', 'smallCaps'] as const

function isNumber(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null
}

function isValue<T extends string>(value: unknown, allowed: readonly T[]): T | null {
  return typeof value === 'string' && (allowed as readonly string[]).includes(value) ? (value as T) : null
}

function isFeatureMap(value: unknown): value is Record<string, boolean> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function isTextPath(value: unknown): value is TextPath {
  return typeof value === 'object' && value !== null && typeof (value as TextPath).d === 'string'
}

function countBreaks(s: string, from: number, to: number): number {
  let n = 0
  for (let i = from; i < to && i < s.length; i++) {
    if (s[i] === '\n') n += 1
  }
  return n
}
