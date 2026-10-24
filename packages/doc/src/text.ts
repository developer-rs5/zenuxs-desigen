/**
 * Text node data: characters plus a base style and styled runs.
 * (Converted 1:1 from FigCraft `crates/doc/src/text.rs`.)
 */

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
export type DecorationStyle = 'solid' | 'dashed' | 'dotted' | 'wavy'

/** How a decoration looks beyond its kind. */
export interface DecorationLook {
  style: DecorationStyle
  /** Offset from the natural position, in px. */
  offset: number
  /** Thickness as a multiple of the stroke weight. */
  thickness: number
  color?: string | null
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
  /** Character index → link URL (sorted by index). */
  links: Record<string, string>
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
      decoration_look: { style: 'solid', offset: 0, thickness: 1, color: null },
      text_case: 'original',
      links: {}
    }
  },

  /** The weight a style name implies ("Bold" → 700). */
  style_weight(style: string): number {
    const s = style.toLowerCase()
    if (s.includes('thin')) return 100
    if (s.includes('extralight')) return 200
    if (s.includes('light')) return 300
    if (s.includes('medium')) return 500
    if (s.includes('semibold')) return 600
    if (s.includes('extrabold') || s.includes('heavy')) return 800
    if (s.includes('black')) return 900
    if (s.includes('bold')) return 700
    return 400
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
  }
}

function countBreaks(s: string, from: number, to: number): number {
  let n = 0
  for (let i = from; i < to && i < s.length; i++) {
    if (s[i] === '\n') n += 1
  }
  return n
}
