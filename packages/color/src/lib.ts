/**
 * ZenuxsDesign colour and paint (converted 1:1 from FigCraft `crates/color/src/lib.rs`).
 *
 * `Color` is non-premultiplied sRGB in `0..=1` floats (what a design panel
 * shows as hex + opacity). `Paint` is one entry of a node's fill or stroke
 * list: solid, the four gradient kinds, an image or a pattern (a layer tiled),
 * each with its own opacity, visibility and blend mode. `ColorProfile` says
 * which RGB space (sRGB or Display P3) a document's values are in and converts
 * between them.
 */

import { BlendMode } from './blend'
import { Hsl, Hsb } from './hsx'
import { lookup as namedLookup } from './named'
import { ColorProfile, type ProfileConversion } from './profile'

export { BlendMode, Hsb, Hsl, ColorProfile }
export type { ProfileConversion }

export interface Color {
  r: number
  g: number
  b: number
  a: number
}

function clamp01(v: number): number {
  if (Number.isNaN(v)) return 0
  return Math.min(1, Math.max(0, v))
}

export const Color = {
  BLACK: { r: 0, g: 0, b: 0, a: 1 } as Color,
  WHITE: { r: 1, g: 1, b: 1, a: 1 } as Color,
  TRANSPARENT: { r: 0, g: 0, b: 0, a: 0 } as Color,
  /** Figma's default shape fill (#D9D9D9). */
  DEFAULT_SHAPE: fromRgb8Const(0xd9, 0xd9, 0xd9),
  /** Default page background (#F5F5F5). */
  DEFAULT_PAGE: fromRgb8Const(0xf5, 0xf5, 0xf5),
  /** The background of a page made while the interface shows its dark theme (#1E1E1E). */
  DARK_PAGE: fromRgb8Const(0x1e, 0x1e, 0x1e),

  new(r: number, g: number, b: number, a: number): Color {
    return { r: clamp01(r), g: clamp01(g), b: clamp01(b), a: clamp01(a) }
  },

  default(): Color {
    return { ...Color.BLACK }
  },

  /**
   * Deserializes from `{r, g, b, a}`, `[r, g, b(, a)]`, or a CSS/hex string
   * (mirrors the custom serde `Deserialize` for `Color`).
   */
  deserialize(input: unknown): Color | Error {
    if (typeof input === 'string') {
      const parsed = Color.parseCss(input)
      return parsed ?? new Error(`not a colour: ${input}`)
    }
    if (Array.isArray(input)) {
      if (input.length === 3) return Color.new(input[0], input[1], input[2], 1)
      if (input.length === 4) return Color.new(input[0], input[1], input[2], input[3])
      return new Error('colour arrays have 3 or 4 components')
    }
    if (typeof input === 'object' && input !== null) {
      const o = input as { r?: unknown; g?: unknown; b?: unknown; a?: unknown }
      if (typeof o.r === 'number' && typeof o.g === 'number' && typeof o.b === 'number') {
        return Color.new(o.r, o.g, o.b, typeof o.a === 'number' ? o.a : 1)
      }
    }
    return new Error('invalid colour')
  },

  fromRgb8Const: fromRgb8Const,

  fromRgba8(r: number, g: number, b: number, a: number): Color {
    return { r: r / 255, g: g / 255, b: b / 255, a: a / 255 }
  },

  toRgba8(c: Color): [number, number, number, number] {
    const q = (v: number): number => Math.round(clamp01(v) * 255)
    return [q(c.r), q(c.g), q(c.b), q(c.a)]
  },

  withAlpha(c: Color, a: number): Color {
    return { r: c.r, g: c.g, b: c.b, a: clamp01(a) }
  },

  /** Clamp every component into range and replace NaN (untrusted input). */
  sanitized(c: Color): Color {
    return Color.new(c.r, c.g, c.b, c.a)
  },

  /** `RRGGBB` (upper-case, no `#`), the way the design panel shows colours. */
  toHex(c: Color): string {
    const [r, g, b] = Color.toRgba8(c)
    return hex2(r) + hex2(g) + hex2(b)
  },

  /** `#RRGGBB` or `#RRGGBBAA` when not opaque. */
  toCssHex(c: Color): string {
    const [r, g, b, a] = Color.toRgba8(c)
    return a === 255 ? `#${hex2(r)}${hex2(g)}${hex2(b)}` : `#${hex2(r)}${hex2(g)}${hex2(b)}${hex2(a)}`
  },

  /**
   * Parse hex the way the colour field does: `#` optional, 1, 2, 3, 4, 6 or 8
   * digits (`F` → `FFFFFF`, `AB` → `ABABAB`, `ABC` → `AABBCC`).
   */
  fromHex(s: string): Color | null {
    const t = s.trim().replace(/^#/, '')
    if (!/^[0-9a-fA-F]*$/.test(t) || t.length === 0) return null
    const digits = t.split('').map((ch) => Number.parseInt(ch, 16))
    const byte = (hi: number, lo: number): number => hi * 16 + lo
    let r: number, g: number, b: number, a: number
    switch (digits.length) {
      case 1: {
        const d = digits[0]
        r = byte(d, d)
        g = byte(d, d)
        b = byte(d, d)
        a = 255
        break
      }
      case 2: {
        const d0 = digits[0]
        const d1 = digits[1]
        r = byte(d0, d1)
        g = byte(d0, d1)
        b = byte(d0, d1)
        a = 255
        break
      }
      case 3: {
        const [d0 = 0, d1 = 0, d2 = 0] = digits
        r = byte(d0, d0)
        g = byte(d1, d1)
        b = byte(d2, d2)
        a = 255
        break
      }
      case 4: {
        const [d0 = 0, d1 = 0, d2 = 0, d3 = 0] = digits
        r = byte(d0, d0)
        g = byte(d1, d1)
        b = byte(d2, d2)
        a = byte(d3, d3)
        break
      }
      case 6: {
        const [r1 = 0, r2 = 0, g1 = 0, g2 = 0, b1 = 0, b2 = 0] = digits
        r = byte(r1, r2)
        g = byte(g1, g2)
        b = byte(b1, b2)
        a = 255
        break
      }
      case 8: {
        const [r1 = 0, r2 = 0, g1 = 0, g2 = 0, b1 = 0, b2 = 0, a1 = 0, a2 = 0] = digits
        r = byte(r1, r2)
        g = byte(g1, g2)
        b = byte(b1, b2)
        a = byte(a1, a2)
        break
      }
      default:
        return null
    }
    return Color.fromRgba8(r, g, b, a)
  },

  /**
   * What a colour field accepts: hex as `fromHex` reads it, or a CSS colour
   * name (`red` → `FF0000`, `Cornflower Blue` → `6495ED`; opaque).
   */
  fromHexOrName(s: string): Color | null {
    return Color.fromHex(s) ?? namedFrom(s)
  },

  /** Parse a CSS colour: hex, `rgb()/rgba()`, `hsl()/hsla()`, a CSS colour name or `transparent`. */
  parseCss(s: string): Color | null {
    const t = s.trim().toLowerCase()
    if (t.startsWith('#')) {
      return Color.fromHex(t)
    }
    const rgbMatch = /^(rgba?|hsla?)\(([^)]*)\)$/.exec(t)
    if (rgbMatch) {
      const fn = rgbMatch[1]
      const inner = rgbMatch[2]
      const parts = cssArgs(inner)
      if (fn === 'rgb' || fn === 'rgba') {
        const num = (i: number): number | null => {
          const p = parts[i]
          if (p === undefined) return null
          if (p.endsWith('%')) {
            const v = Number.parseFloat(p.slice(0, -1).trim())
            return Number.isFinite(v) ? v / 100 : null
          }
          const v = Number.parseFloat(p)
          return Number.isFinite(v) ? v / 255 : null
        }
        const alpha = parts[3] !== undefined ? parseAlpha(parts[3]) : 1
        if (alpha === null || parts.length > 4) return null
        const r = num(0)
        const g = num(1)
        const b = num(2)
        if (r === null || g === null || b === null) return null
        return Color.new(r, g, b, alpha)
      }
      // hsl / hsla
      const hRaw = parts[0]?.replace(/deg$/, '').trim() ?? ''
      const h = Number.parseFloat(hRaw)
      const sRaw = parts[1]?.replace(/%$/, '').trim() ?? ''
      const s = Number.parseFloat(sRaw) / 100
      const lRaw = parts[2]?.replace(/%$/, '').trim() ?? ''
      const l = Number.parseFloat(lRaw) / 100
      const alpha = parts[3] !== undefined ? parseAlpha(parts[3]) : 1
      if (!Number.isFinite(h) || !Number.isFinite(s) || !Number.isFinite(l) || alpha === null || parts.length > 4) {
        return null
      }
      return Hsl.toColor({ h, s, l }, alpha)
    }
    if (t === 'transparent') {
      return { ...Color.TRANSPARENT }
    }
    return Color.fromHexOrName(t)
  },

  /** CSS `rgba(...)` / hex text for copy-as-CSS. */
  toCss(c: Color): string {
    const [r, g, b] = Color.toRgba8(c)
    if (c.a >= 0.999) return Color.toCssHex(c)
    return `rgba(${r}, ${g}, ${b}, ${c.a.toFixed(2)})`
  },

  /** Linear interpolation in sRGB (as gradients render). */
  lerp(c: Color, other: Color, t: number): Color {
    const tt = clamp01(t)
    return Color.new(
      c.r + (other.r - c.r) * tt,
      c.g + (other.g - c.g) * tt,
      c.b + (other.b - c.b) * tt,
      c.a + (other.a - c.a) * tt
    )
  },

  /** Relative luminance (WCAG). */
  luminance(c: Color): number {
    const lin = (ch: number): number =>
      ch <= 0.04045 ? ch / 12.92 : Math.pow((ch + 0.055) / 1.055, 2.4)
    return 0.2126 * lin(c.r) + 0.7152 * lin(c.g) + 0.0722 * lin(c.b)
  },

  /** Whether black on this colour reads worse than white (a dark page: new text is white). */
  isDark(c: Color): boolean {
    return Color.contrast(c, Color.WHITE) > Color.contrast(c, Color.BLACK)
  },

  /** WCAG contrast ratio between two opaque colours. */
  contrast(c: Color, other: Color): number {
    const a = Color.luminance(c) + 0.05
    const b = Color.luminance(other) + 0.05
    return a > b ? a / b : b / a
  }
}

function hex2(v: number): string {
  return v.toString(16).toUpperCase().padStart(2, '0')
}

function fromRgb8Const(r: number, g: number, b: number): Color {
  return { r: r / 255, g: g / 255, b: b / 255, a: 1 }
}

function namedFrom(s: string): Color | null {
  const rgb = namedLookup(s)
  return rgb ? Color.fromRgba8(rgb[0], rgb[1], rgb[2], 255) : null
}

function cssArgs(inner: string): string[] {
  return inner
    .replace(/\//g, ',')
    .split(/[\s,]+/)
    .map((p) => p.trim())
    .filter((p) => p.length > 0)
}

function parseAlpha(a: string): number | null {
  if (a.endsWith('%')) {
    const v = Number.parseFloat(a.slice(0, -1))
    return Number.isFinite(v) ? v / 100 : null
  }
  const v = Number.parseFloat(a)
  return Number.isFinite(v) ? v : null
}

// ------------------------------ Gradient ------------------------------

/** One colour stop of a gradient. */
export interface ColorStop {
  /** Position along the gradient, 0..=1. */
  position: number
  color: Color
}

export type GradientKind = 'linear' | 'radial' | 'angular' | 'diamond'

export type XY = [number, number]

/**
 * A gradient paint. The three handles are in the node's unit box (0..1 on both
 * axes): `from` is the start (centre for radial/angular/diamond), `to` the end
 * of the main axis, `width` the end of the secondary axis (ellipse width for
 * radial).
 */
export interface Gradient {
  kind: GradientKind
  stops: ColorStop[]
  from: XY
  to: XY
  width: XY
}

export const Gradient = {
  /**
   * Figma's default gradient for `kind`: the default stop pair is the current
   * colour at 100% → the same at 0% opacity.
   */
  defaultFor(kind: GradientKind, base: Color): Gradient {
    let from: XY
    let to: XY
    let width: XY
    if (kind === 'linear') {
      // The width handle square to the axis from the start (colour bands across the axis).
      from = [0.5, 0]
      to = [0.5, 1]
      width = [-0.5, 0]
    } else {
      from = [0.5, 0.5]
      to = [0.5, 1]
      width = [1, 0.5]
    }
    return {
      kind,
      stops: [
        { position: 0, color: Color.withAlpha(base, 1) },
        { position: 1, color: Color.withAlpha(base, 0) }
      ],
      from,
      to,
      width
    }
  },

  /**
   * Put a linear gradient's width handle square to its axis in a `w`×`h` box,
   * so its colour bands cross the axis at right angles on screen (the canvas
   * has no handle for it; imported files can still skew it). Moving the start
   * or end handle calls this.
   */
  squareLinearWidth(g: Gradient, w0: number, h0: number): void {
    const ok = Number.isFinite(w0) && Number.isFinite(h0) && w0 > 0 && h0 > 0
    const w = ok ? w0 : 1
    const h = ok ? h0 : 1
    const dx = (g.to[0] - g.from[0]) * w
    const dy = (g.to[1] - g.from[1]) * h
    g.width = [g.from[0] - dy / w, g.from[1] + dx / h]
  },

  /** Stops sorted by position with NaNs removed; at least one stop. */
  sortedStops(g: Gradient): ColorStop[] {
    const s = g.stops
      .filter((stop) => Number.isFinite(stop.position))
      .map((stop) => ({ position: clamp01(stop.position), color: Color.sanitized(stop.color) }))
    s.sort((a, b) => (a.position < b.position ? -1 : a.position > b.position ? 1 : 0))
    if (s.length === 0) {
      s.push({ position: 0, color: { ...Color.BLACK } })
    }
    return s
  },

  /** The colour at `t` (0..1) along the gradient. */
  sample(g: Gradient, t0: number): Color {
    const stops = Gradient.sortedStops(g)
    const t = clamp01(t0)
    let prev = stops[0]
    if (!prev) return { ...Color.BLACK }
    if (t <= prev.position) {
      return prev.color
    }
    for (let i = 1; i < stops.length; i++) {
      const s = stops[i]
      if (t <= s.position) {
        const span = s.position - prev.position
        const f = span > 1e-6 ? (t - prev.position) / span : 1
        return Color.lerp(prev.color, s.color, f)
      }
      prev = s
    }
    return prev.color
  }
}

// ------------------------------ Image paints ------------------------------

export type ImageScaleMode = 'fill' | 'fit' | 'crop' | 'tile'

/** Image adjustments (all `-1..=1`, 0 = unchanged). */
export interface ImageFilters {
  exposure: number
  contrast: number
  saturation: number
  temperature: number
  tint: number
  highlights: number
  shadows: number
}

export const IMAGE_FILTER_NONE: ImageFilters = {
  exposure: 0,
  contrast: 0,
  saturation: 0,
  temperature: 0,
  tint: 0,
  highlights: 0,
  shadows: 0
}

/** The built-in adjustment presets: `(id, label, adjustments)`. "Reset" is the identity. */
export const IMAGE_FILTER_PRESETS: ReadonlyArray<readonly [string, string, ImageFilters]> = [
  ['vivid', 'Vivid', { ...IMAGE_FILTER_NONE, contrast: 0.2, saturation: 0.45, highlights: -0.1, shadows: 0.1 }],
  ['muted', 'Muted', { ...IMAGE_FILTER_NONE, contrast: -0.15, saturation: -0.45 }],
  ['warm', 'Warm', { ...IMAGE_FILTER_NONE, temperature: 0.5, tint: 0.1, saturation: 0.1 }],
  ['cool', 'Cool', { ...IMAGE_FILTER_NONE, temperature: -0.5, tint: -0.05 }],
  ['blackAndWhite', 'Black & white', { ...IMAGE_FILTER_NONE, saturation: -1, contrast: 0.15 }],
  ['fade', 'Fade', { ...IMAGE_FILTER_NONE, contrast: -0.35, saturation: -0.2, shadows: 0.35, highlights: -0.1 }],
  ['reset', 'Reset', { ...IMAGE_FILTER_NONE }]
]

export const ImageFilters = {
  isIdentity(f: ImageFilters): boolean {
    return (
      f.exposure === 0 &&
      f.contrast === 0 &&
      f.saturation === 0 &&
      f.temperature === 0 &&
      f.tint === 0 &&
      f.highlights === 0 &&
      f.shadows === 0
    )
  },

  /** The built-in preset `name` (its id or label, ignoring case, spaces, `-`, `_` and `&`). */
  preset(name: string): ImageFilters | null {
    const key = (s: string): string =>
      s
        .split('')
        .filter((c) => /[a-z0-9]/i.test(c))
        .join('')
        .toLowerCase()
    const k = key(name)
    const found = IMAGE_FILTER_PRESETS.find(
      ([id, label]) => key(id) === k || key(label) === k
    )
    return found ? { ...found[2] } : null
  },

  /** Every value clamped into `-1..=1` (NaN → 0). */
  sanitized(f: ImageFilters): ImageFilters {
    const c = (v: number): number => (Number.isFinite(v) ? Math.min(1, Math.max(-1, v)) : 0)
    return {
      exposure: c(f.exposure),
      contrast: c(f.contrast),
      saturation: c(f.saturation),
      temperature: c(f.temperature),
      tint: c(f.tint),
      highlights: c(f.highlights),
      shadows: c(f.shadows)
    }
  }
}

/**
 * An image paint: the image is referenced by its content hash in the
 * document's image store.
 */
export interface ImagePaint {
  image: string
  scale_mode: ImageScaleMode
  /** Tile scale (Tile mode), 1 = the image's own size. */
  scale: number
  /** Rotation in multiples of 90°. */
  rotation: number
  /** Crop transform (Crop mode): the unit-box → image-uv mapping as a 2×3 matrix. */
  crop: [number, number, number, number, number, number] | null
  filters: ImageFilters
}

export const ImagePaint = {
  /** Size of the image after its 90° rotation. */
  rotatedSize(p: ImagePaint, iw: number, ih: number): [number, number] {
    return ((p.rotation % 2) + 2) % 2 === 1 ? [ih, iw] : [iw, ih]
  },

  /**
   * The crop transform in effect: the stored one, or (when unset) the Fill
   * placement so that switching to Crop keeps the picture where it was.
   */
  effectiveCrop(
    p: ImagePaint,
    iw: number,
    ih: number,
    w: number,
    h: number
  ): [number, number, number, number, number, number] {
    if (
      p.crop &&
      p.crop.every((v) => Number.isFinite(v)) &&
      Math.abs(p.crop[0]) > 1e-9 &&
      Math.abs(p.crop[3]) > 1e-9
    ) {
      return [...p.crop] as [number, number, number, number, number, number]
    }
    const [rw, rh] = ImagePaint.rotatedSize(p, Math.max(1, iw), Math.max(1, ih))
    const wv = Math.max(1e-6, w)
    const hv = Math.max(1e-6, h)
    const s = Math.max(wv / rw, hv / rh)
    const x0 = (wv - rw * s) / 2
    const y0 = (hv - rh * s) / 2
    return [wv / (rw * s), 0, 0, hv / (rh * s), -x0 / (rw * s), -y0 / (rh * s)]
  },

  /** The image's rectangle in the node's unit box `(x0, y0, x1, y1)` for an axis-aligned crop. */
  cropRect(crop: readonly number[]): [number, number, number, number] {
    const a = crop[0]
    const d = crop[3]
    const e = crop[4]
    const f = crop[5]
    return [-e / a, -f / d, (1 - e) / a, (1 - f) / d]
  },

  /** The crop transform that places the image at `(x0, y0, x1, y1)` in the unit box. */
  cropFromRect(x0: number, y0: number, x1: number, y1: number): [number, number, number, number, number, number] {
    const a = 1 / Math.max(1e-6, Math.abs(x1 - x0))
    const d = 1 / Math.max(1e-6, Math.abs(y1 - y0))
    const x = Math.min(x0, x1)
    const y = Math.min(y0, y1)
    return [a, 0, 0, d, -x * a, -y * d]
  }
}

// ------------------------------ Pattern paints ------------------------------

/** How pattern tiles are laid out. */
export type PatternTile = 'grid' | 'horizontalHex' | 'verticalHex'

/**
 * Where the tile grid starts in the filled box: a tile in its top-left corner,
 * centre or bottom-right corner.
 */
export type PatternAlign = 'start' | 'center' | 'end'

/**
 * A pattern paint: a layer of the document (`source`, a node id) drawn as a
 * tile, repeated.
 */
export interface PatternPaint {
  source: number
  tile: PatternTile
  /** Tile scale, 1 = the source's own size. */
  scale: number
  /** Gap between tiles (horizontal, vertical), in document units. */
  spacing: [number, number]
  align: PatternAlign
}

/** One repeating cell of a pattern in the filled box's space: `size` repeats from `origin`, and
 * the source is drawn at each of `tiles` (its top-left), scaled by `scale`. */
export interface PatternCell {
  size: [number, number]
  origin: [number, number]
  tiles: Array<[number, number]>
  scale: number
}

export const PatternPaint = {
  /** The smallest and largest tile scale. */
  SCALE_RANGE: [0.01, 100] as const,
  /** The largest gap between tiles. */
  MAX_SPACING: 10_000,

  new(source: number): PatternPaint {
    return { source, tile: 'grid', scale: 1, spacing: [0, 0], align: 'start' }
  },

  /** The cell for a `tw`×`th` source filling a `w`×`h` box; `null` when the source has no size. */
  cell(p: PatternPaint, tw0: number, th0: number, w: number, h: number): PatternCell | null {
    const [lo, hi] = PatternPaint.SCALE_RANGE
    const scale = Number.isFinite(p.scale) ? Math.min(hi, Math.max(lo, p.scale)) : 1
    const gap = (v: number): number => (Number.isFinite(v) ? Math.min(PatternPaint.MAX_SPACING, Math.max(0, v)) : 0)
    const tw = tw0 * scale
    const th = th0 * scale
    if (!(Number.isFinite(tw) && Number.isFinite(th) && tw > 1e-6 && th > 1e-6)) {
      return null
    }
    const px = tw + gap(p.spacing[0])
    const py = th + gap(p.spacing[1])
    let size: [number, number]
    let tiles: Array<[number, number]>
    switch (p.tile) {
      case 'grid':
        size = [px, py]
        tiles = [[0, 0]]
        break
      case 'horizontalHex':
        // The shifted row is drawn on both sides so it wraps across the cell's edge.
        size = [px, py * 2]
        tiles = [
          [0, 0],
          [px / 2, py],
          [-px / 2, py]
        ]
        break
      case 'verticalHex':
        size = [px * 2, py]
        tiles = [
          [0, 0],
          [px, py / 2],
          [px, -py / 2]
        ]
        break
    }
    const k = p.align === 'start' ? 0 : p.align === 'center' ? 0.5 : 1
    const fin = (v: number): number => (Number.isFinite(v) ? v : 0)
    return {
      size,
      origin: [fin((w - tw) * k), fin((h - th) * k)],
      tiles,
      scale
    }
  }
}

// ------------------------------ Paint ------------------------------

/** What a paint paints with (serde `tag = "type"` flattened inside `Paint`). */
export type PaintKind =
  | { type: 'solid'; color: Color }
  | { type: 'gradient'; kind: GradientKind; stops: ColorStop[]; from: XY; to: XY; width: XY }
  | {
      type: 'image'
      image: string
      scale_mode: ImageScaleMode
      scale: number
      rotation: number
      crop: [number, number, number, number, number, number] | null
      filters: ImageFilters
    }
  | { type: 'pattern'; source: number; tile: PatternTile; scale: number; spacing: [number, number]; align: PatternAlign }

/** One fill or stroke paint. */
export interface Paint {
  kind: PaintKind
  opacity: number
  visible: boolean
  blend: BlendMode
}

export const Paint = {
  solid(color: Color): Paint {
    return {
      kind: { type: 'solid', color: Color.withAlpha(color, 1) },
      opacity: color.a,
      visible: true,
      blend: 'normal' as BlendMode
    }
  },

  gradient(g: Gradient): Paint {
    return { kind: { type: 'gradient', ...g }, opacity: 1, visible: true, blend: 'normal' as BlendMode }
  },

  image(hash: string, mode: ImageScaleMode): Paint {
    return {
      kind: {
        type: 'image',
        image: hash,
        scale_mode: mode,
        scale: 1,
        rotation: 0,
        crop: null,
        filters: { ...IMAGE_FILTER_NONE }
      },
      opacity: 1,
      visible: true,
      blend: 'normal' as BlendMode
    }
  },

  /** Layer `source` (a node id) tiled at its own size. */
  pattern(source: number): Paint {
    return {
      kind: { type: 'pattern', ...PatternPaint.new(source) },
      opacity: 1,
      visible: true,
      blend: 'normal' as BlendMode
    }
  },

  /** The solid colour (with the paint opacity folded into alpha), if solid. */
  solidColor(p: Paint): Color | null {
    if (p.kind.type !== 'solid') return null
    return Color.withAlpha(p.kind.color, p.kind.color.a * p.opacity)
  },

  /** A short label for the panel row ("D9D9D9", "Linear", "Image"). */
  label(p: Paint): string {
    switch (p.kind.type) {
      case 'solid':
        return Color.toHex(p.kind.color)
      case 'gradient':
        return p.kind.kind === 'linear'
          ? 'Linear'
          : p.kind.kind === 'radial'
            ? 'Radial'
            : p.kind.kind === 'angular'
              ? 'Angular'
              : 'Diamond'
      case 'image':
        return 'Image'
      case 'pattern':
        return 'Pattern'
    }
  },

  /** Visit every colour of this paint (the solid colour or the gradient stops). */
  forEachColorMut(p: Paint, f: (c: Color) => void): void {
    if (p.kind.type === 'solid') {
      f(p.kind.color)
    } else if (p.kind.type === 'gradient') {
      p.kind.stops.forEach((s) => f(s.color))
    }
  },

  /** A representative colour (for swatches and outlines). */
  previewColor(p: Paint): Color {
    switch (p.kind.type) {
      case 'solid':
        return Color.withAlpha(p.kind.color, p.kind.color.a * p.opacity)
      case 'gradient':
        return Gradient.sample(p.kind, 0)
      case 'image':
      case 'pattern':
        return fromRgb8Const(0xb3, 0xb3, 0xb3)
    }
  }
}

/** Serialize a `Color` the way serde does (object with r/g/b/a). */
export function serializeColor(c: Color): { r: number; g: number; b: number; a: number } {
  return { r: c.r, g: c.g, b: c.b, a: c.a }
}

export { Hsb as HSB, Hsl as HSL }

// ------------------------------ serde JSON shape ------------------------------

/**
 * Serialize a `Paint` the way serde does: the `kind`'s fields are flattened
 * into the paint object beside `opacity`, `visible` and `blend` (which always
 * serialize — the Rust struct has no `skip_serializing_if` on them).
 */
export function serializePaint(p: Paint): Record<string, unknown> {
  const kind = p.kind
  let flat: Record<string, unknown>
  if (kind.type === 'solid') {
    flat = { type: 'solid', color: { r: kind.color.r, g: kind.color.g, b: kind.color.b, a: kind.color.a } }
  } else if (kind.type === 'gradient') {
    flat = {
      type: 'gradient',
      kind: kind.kind,
      stops: kind.stops.map((s) => ({ position: s.position, color: { r: s.color.r, g: s.color.g, b: s.color.b, a: s.color.a } })),
      from: [...kind.from],
      to: [...kind.to],
      width: [...kind.width]
    }
  } else if (kind.type === 'image') {
    flat = {
      type: 'image',
      image: kind.image,
      scale_mode: kind.scale_mode,
      scale: kind.scale,
      rotation: kind.rotation,
      crop: kind.crop ? [...kind.crop] : null,
      filters: { ...kind.filters }
    }
  } else {
    flat = {
      type: 'pattern',
      source: kind.source,
      tile: kind.tile,
      scale: kind.scale,
      spacing: [...kind.spacing],
      align: kind.align
    }
  }
  return { ...flat, opacity: p.opacity, visible: p.visible, blend: p.blend }
}

/** Deserialize a `Paint` from its serde JSON shape (missing fields default). */
export function deserializePaint(input: unknown): Paint | Error {
  const o = input as Record<string, unknown> | null
  if (!o || typeof o !== 'object') return new Error('not a paint')
  const opacity = typeof o.opacity === 'number' ? o.opacity : 1
  const visible = typeof o.visible === 'boolean' ? o.visible : true
  const blend = (typeof o.blend === 'string' ? o.blend : 'normal') as Paint['blend']
  const kind = o.type
  let parsed: PaintKind | Error = new Error('unknown paint type')
  if (kind === 'solid') {
    const color = Color.deserialize(o.color)
    if (color instanceof Error) return color
    parsed = { type: 'solid', color }
  } else if (kind === 'gradient') {
    const stops = Array.isArray(o.stops)
      ? (o.stops as Array<{ position: number; color: unknown }>).map((s) => {
          const color = Color.deserialize(s.color)
          if (color instanceof Error) throw color
          return { position: s.position, color }
        })
      : []
    parsed = {
      type: 'gradient',
      kind: (o.kind as GradientKind) ?? 'linear',
      stops,
      from: (o.from as XY) ?? [0.5, 0],
      to: (o.to as XY) ?? [0.5, 1],
      width: (o.width as XY) ?? [1, 0.5]
    }
  } else if (kind === 'image') {
    parsed = {
      type: 'image',
      image: typeof o.image === 'string' ? o.image : '',
      scale_mode: (o.scale_mode as ImageScaleMode) ?? 'fill',
      scale: typeof o.scale === 'number' ? o.scale : 1,
      rotation: typeof o.rotation === 'number' ? o.rotation : 0,
      crop: Array.isArray(o.crop) ? ([...o.crop] as [number, number, number, number, number, number]) : null,
      filters: { ...IMAGE_FILTER_NONE, ...((o.filters as ImageFilters) ?? {}) }
    }
  } else if (kind === 'pattern') {
    parsed = {
      type: 'pattern',
      source: typeof o.source === 'number' ? o.source : 0,
      tile: (o.tile as PatternTile) ?? 'grid',
      scale: typeof o.scale === 'number' ? o.scale : 1,
      spacing: (o.spacing as [number, number]) ?? [0, 0],
      align: (o.align as PatternAlign) ?? 'start'
    }
  }
  if (parsed instanceof Error) return parsed
  return { kind: parsed, opacity, visible, blend }
}
