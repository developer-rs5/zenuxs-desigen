/**
 * Node properties: strokes, effects, corners, constraints, auto layout and
 * grids. (Converted 1:1 from FigCraft `crates/doc/src/props.rs`.)
 */

import type { Color } from '@zenuxs/color'

/** Stroke alignment. */
export type StrokeAlign = 'inside' | 'center' | 'outside'
export type StrokeCap =
  | 'none'
  | 'round'
  | 'square'
  | 'arrowLines'
  | 'arrowTriangle'
  | 'arrowStick'
  | 'lineArrow'
  | 'ring'
export type StrokeJoin = 'miter' | 'bevel' | 'round'

export const STROKE_CAPS: readonly StrokeCap[] = [
  'none',
  'round',
  'square',
  'arrowLines',
  'arrowTriangle',
  'arrowStick',
  'lineArrow',
  'ring'
]

export const StrokeCap = {
  label(c: StrokeCap): string {
    switch (c) {
      case 'none':
        return 'None'
      case 'round':
        return 'Round'
      case 'square':
        return 'Square'
      case 'arrowLines':
        return 'Line arrow'
      case 'arrowTriangle':
        return 'Triangle arrow'
      case 'arrowStick':
        return 'Stick arrow'
      case 'lineArrow':
        return 'Line'
      case 'ring':
        return 'Ring'
    }
  },
  isArrow(c: StrokeCap): boolean {
    return c === 'arrowLines' || c === 'arrowTriangle' || c === 'arrowStick'
  }
}

/** Brush stroke presets and parameters. */
export interface Brush {
  preset: string
  /** Distance between dabs, as multiples of the weight. */
  spacing: number
  /** Size randomness, 0..1. */
  size_jitter: number
  /** Rotation randomness, 0..1. */
  rotation_jitter: number
  /** Scatter off the path, 0..4 (multiples of the weight). */
  scatter: number
  seed: number
}

export const BRUSH_PRESETS = ['taper', 'ink', 'ribbon', 'bristle', 'dots', 'stars', 'confetti', 'leaves'] as const

export const Brush = {
  new(preset: string): Brush {
    return { preset, ...Brush.default() }
  },

  default(): Omit<Brush, 'preset'> {
    return { spacing: 1.5, size_jitter: 0, rotation_jitter: 0, scatter: 0, seed: 0 }
  },

  /** Every value in range (NaN: the default). */
  sanitized(b: Brush): Brush {
    const c = (v: number, lo: number, hi: number, d: number): number =>
      Number.isFinite(v) ? Math.min(hi, Math.max(lo, v)) : d
    return {
      preset: b.preset,
      spacing: c(b.spacing, 0.1, 100, 1.5),
      size_jitter: c(b.size_jitter, 0, 1, 0),
      rotation_jitter: c(b.rotation_jitter, 0, 1, 0),
      scatter: c(b.scatter, 0, 4, 0),
      seed: b.seed
    }
  },

  /** How much wider than the stroke weight the brush can paint. */
  reach_factor(b: Brush): number {
    const s = Brush.sanitized(b)
    return 1 + s.size_jitter + 2 * s.scatter
  }
}

/** One point of a variable width profile. */
export interface WidthPoint {
  /** Position along the path by length: 0 start, 1 end (each subpath on its own). */
  t: number
  /** The stroke's width here as a multiple of the stroke weight. */
  scale: number
  /** How much wider the right side is than the left, -1..=1 (0: symmetric). */
  bias?: number
}

export type WidthSide = 'left' | 'right'

export const WidthSide = {
  fromId(s: string): WidthSide | null {
    const t = s.toLowerCase()
    return t === 'left' ? 'left' : t === 'right' ? 'right' : null
  },
  id(s: WidthSide): string {
    return s
  }
}

export const WidthPoint = {
  new(t: number, scale: number): WidthPoint {
    return { t, scale }
  },

  /** A point from its left and right side scales (negative or non-finite sides count as 0). */
  fromSides(t: number, left: number, right: number): WidthPoint {
    const clean = (v: number): number => (Number.isFinite(v) ? Math.max(0, v) : 0)
    const l = clean(left)
    const r = clean(right)
    const sum = l + r
    const bias = sum > 1e-12 ? Math.min(1, Math.max(-1, (r - l) / sum)) : 0
    return { t, scale: sum / 2, bias }
  },

  /** The left and right side scales. */
  sides(p: WidthPoint): [number, number] {
    const bias = p.bias ?? 0
    return [p.scale * (1 - bias), p.scale * (1 + bias)]
  },

  /** Whether both sides are as wide. */
  symmetric(p: WidthPoint): boolean {
    return (p.bias ?? 0) === 0
  }
}

/** A variable width profile: stroke widths at positions along the path (monotone cubic). */
export interface WidthProfile {
  /** Sorted by `t`. */
  points: WidthPoint[]
}

export const WidthProfile = {
  /** The most points a profile keeps. */
  MAX_POINTS: 64,
  /** The widest a point can be, as a multiple of the stroke weight. */
  MAX_SCALE: 1000,

  new(points: Iterable<[number, number]>): WidthProfile {
    return WidthProfile.sanitized({
      points: Array.from(points, ([t, s]) => WidthPoint.new(t, s))
    })
  },

  /** Uniform width with a point at each end (where the width tool starts from). */
  uniform(): WidthProfile {
    return WidthProfile.new([
      [0, 1],
      [1, 1]
    ])
  },

  default(): WidthProfile {
    return { points: [] }
  },

  /** Finite points only, `t` in 0..=1, scales bounded, sorted by `t`, at most MAX_POINTS. */
  sanitized(p: WidthProfile): WidthProfile {
    const points = p.points
      .filter((q) => Number.isFinite(q.t) && Number.isFinite(q.scale))
      .slice(0, WidthProfile.MAX_POINTS)
      .map((q) => ({
        t: Math.min(1, Math.max(0, q.t)),
        scale: Math.min(WidthProfile.MAX_SCALE, Math.max(0, q.scale)),
        bias: Number.isFinite(q.bias ?? 0) ? Math.min(1, Math.max(-1, q.bias ?? 0)) : 0
      }))
    points.sort((a, b) => (a.t < b.t ? -1 : a.t > b.t ? 1 : 0))
    return { points }
  },

  /** The width scale at `t` (0..1 along the path): the mean of the two sides' scales. */
  scaleAt(p: WidthProfile, t: number): number {
    const [l, r] = WidthProfile.sidesAt(p, t)
    return (l + r) / 2
  },

  /** The left and right side scales at `t`, each side interpolated on its own. */
  sidesAt(p: WidthProfile, t: number): [number, number] {
    if (WidthProfile.symmetric(p)) {
      const s = WidthProfile.interp(p, t, (q) => q.scale)
      return [s, s]
    }
    return [
      WidthProfile.interp(p, t, (q) => WidthPoint.sides(q)[0]),
      WidthProfile.interp(p, t, (q) => WidthPoint.sides(q)[1])
    ]
  },

  /** Whether every point is as wide on both sides. */
  symmetric(p: WidthProfile): boolean {
    return p.points.every(WidthPoint.symmetric)
  },

  /** `value` of the points at `t`: monotone cubic, held flat before the first and after the last. */
  interp(p: WidthProfile, t: number, value: (q: WidthPoint) => number): number {
    const pts = p.points
    const first = pts[0]
    const last = pts.at(-1)
    if (!first || !last) return 1
    if (!Number.isFinite(t) || t <= first.t) return value(first)
    if (t >= last.t) return value(last)
    let k = 0
    while (k < pts.length && pts[k].t <= t) k += 1
    k = Math.max(0, k - 1)
    const a = pts[k]
    const b = pts[k + 1]
    if (!a || !b) return value(last)
    const h = b.t - a.t
    if (h <= 1e-12) return value(b)
    const u = (t - a.t) / h
    const u2 = u * u
    const u3 = u2 * u
    const w =
      (2 * u3 - 3 * u2 + 1) * value(a) +
      (u3 - 2 * u2 + u) * h * WidthProfile.tangent(p, k, value) +
      (3 * u2 - 2 * u3) * value(b) +
      (u3 - u2) * h * WidthProfile.tangent(p, k + 1, value)
    return Math.max(0, w)
  },

  /** Slope of `value` from point `i` to `i + 1` (0 when they share a position). */
  secant(p: WidthProfile, i: number, value: (q: WidthPoint) => number): number {
    const a = p.points[i]
    const b = p.points[i + 1]
    if (a && b && b.t - a.t > 1e-12) return (value(b) - value(a)) / (b.t - a.t)
    return 0
  },

  /** Fritsch–Carlson style tangent at point `i` (keeps the curve monotone). */
  tangent(p: WidthProfile, i: number, value: (q: WidthPoint) => number): number {
    const last = Math.max(0, p.points.length - 1)
    if (i === 0) return WidthProfile.secant(p, 0, value)
    if (i >= last) return WidthProfile.secant(p, Math.max(0, last - 1), value)
    const d0 = WidthProfile.secant(p, i - 1, value)
    const d1 = WidthProfile.secant(p, i, value)
    return d0 * d1 <= 0 ? 0 : (2 * d0 * d1) / (d0 + d1)
  },

  /** The largest side scale (the interpolation never exceeds its points). */
  maxScale(p: WidthProfile): number {
    return p.points.reduce((m, q) => {
      const [l, r] = WidthPoint.sides(q)
      return Math.max(m, l, r)
    }, 0)
  },

  /** Add a symmetric point (kept sorted); returns its index. */
  insert(p: WidthProfile, t: number, scale: number): number {
    return WidthProfile.insertPoint(p, WidthPoint.new(t, (Number.isFinite(scale) ? scale : 1)))
  },

  /** Add a point at `t` as wide on each side as the stroke already is there. */
  insertHere(p: WidthProfile, t: number): number {
    const [l, r] = WidthProfile.sidesAt(p, t)
    return WidthProfile.insertPoint(p, WidthPoint.fromSides(t, l, r))
  },

  insertPoint(p: WidthProfile, point: WidthPoint): number {
    const q = { ...point }
    q.t = Number.isFinite(q.t) ? Math.min(1, Math.max(0, q.t)) : 0
    q.scale = Math.min(WidthProfile.MAX_SCALE, Math.max(0, q.scale))
    let i = 0
    while (i < p.points.length && p.points[i].t <= q.t) i += 1
    p.points.splice(i, 0, q)
    return i
  },

  /** Set one side of point `i` to side scale `scale`, keeping the other side. */
  setSide(p: WidthProfile, i: number, side: WidthSide, scale: number): boolean {
    const point = p.points[i]
    if (!point) return false
    if (!Number.isFinite(scale)) return true
    const s = Math.min(2 * WidthProfile.MAX_SCALE, Math.max(0, scale))
    const [l, r] = WidthPoint.sides(point)
    const q = side === 'left' ? WidthPoint.fromSides(point.t, s, r) : WidthPoint.fromSides(point.t, l, s)
    point.scale = Math.min(WidthProfile.MAX_SCALE, q.scale)
    point.bias = q.bias
    return true
  },

  /** Move point `i` along the path and/or change its scale. */
  setPoint(p: WidthProfile, i: number, t: number | null, scale: number | null): boolean {
    const lo = i > 0 ? (p.points[i - 1]?.t ?? 0) : 0
    const hi = p.points[i + 1]?.t ?? 1
    const point = p.points[i]
    if (!point) return false
    if (t !== null && Number.isFinite(t)) point.t = Math.min(Math.max(lo, hi), Math.max(lo, Math.min(hi, t)))
    if (scale !== null && Number.isFinite(scale)) point.scale = Math.min(WidthProfile.MAX_SCALE, Math.max(0, scale))
    return true
  },

  /** Apply a named width preset. */
  preset(p: WidthProfile, name: string): WidthProfile {
    const presets: Record<string, Array<[number, number, number?]>> = {
      taper: [
        [0, 0.05],
        [0.25, 0.6],
        [1, 1]
      ],
      blade: [
        [0, 0.02],
        [0.8, 0.8],
        [1, 1]
      ],
      calligraphy: [
        [0, 0.4],
        [0.5, 1],
        [1, 0.4]
      ],
      wedge: [
        [0, 1],
        [1, 0.05]
      ],
      dip: [
        [0, 0.6],
        [0.15, 1],
        [0.85, 1],
        [1, 0.35]
      ],
      flat: [
        [0, 1],
        [1, 1]
      ]
    }
    void p
    const found = presets[name]
    if (!found) return WidthProfile.sanitized(p)
    return WidthProfile.sanitized({
      points: found.map(([t, s, b]) => ({ t, scale: s, bias: b ?? 0 }))
    })
  }
}

/** Stroke properties. */
export interface StrokeProps {
  weight: number
  /** Per-side widths (variable-width strokes). */
  sides?: [number, number, number, number] | null
  align: StrokeAlign
  cap_start: StrokeCap
  cap_end: StrokeCap
  join: StrokeJoin
  miter_limit: number
  dashes: number[]
  /** Brush stroke parameters. */
  brush?: Brush | null
  /** Variable width profile. */
  width_profile?: WidthProfile | null
}

export const SPREAD_MITER_LIMIT = 4.0

export const StrokeProps = {
  default(): StrokeProps {
    return {
      weight: 1,
      align: 'inside',
      sides: null,
      cap_start: 'none',
      cap_end: 'none',
      join: 'miter',
      miter_limit: 4,
      dashes: [],
      width_profile: null,
      brush: null
    }
  },

  /** The variable width profile, when there is one with points. */
  profile(s: StrokeProps): WidthProfile | null {
    const p = s.width_profile
    return p && p.points.length > 0 ? p : null
  },

  /** The widest the stroke gets anywhere along the path. */
  maxWeight(s: StrokeProps): number {
    const prof = StrokeProps.profile(s)
    const base = prof ? s.weight * WidthProfile.maxScale(prof) : s.weight
    return base * (s.brush ? Brush.reach_factor(s.brush) : 1)
  },

  /** The miter limit as the angle (degrees) below which joins bevel. */
  miterAngle(s: StrokeProps): number {
    const limit = Math.min(100, Math.max(1, s.miter_limit))
    return (2 * Math.asin(1 / limit) * 180) / Math.PI
  },

  /** The miter limit for a miter angle in degrees (kept within the limit's 1–100 range). */
  miterLimitFor(angle: number): number {
    const a = Number.isFinite(angle) ? Math.min(180, Math.max(1, angle)) : 28.955
    return Math.min(100, Math.max(1, 1 / Math.sin(((a / 2) * Math.PI) / 180)))
  }
}

/** One shadow (drop or inner). */
export interface Shadow {
  offset: [number, number]
  radius: number
  spread: number
  color: Color
  show_behind: boolean
  blend: string
  visible: boolean
}

/** Noise effect parameters. */
export interface Noise {
  /** Monochrome, two-colour or multi-colour. */
  mode: 'mono' | 'duo' | 'multi'
  size: number
  density: number
  color: Color
  secondary: Color
  blend: string
  visible: boolean
}

/** Texture (noise with size). */
export interface Texture {
  noise: Noise
  visible: boolean
}

/** Glass (frosted refraction) effect parameters. */
export interface Glass {
  refraction: number
  frost: number
  light: number
  max_bend: number
  visible: boolean
}

export type BlurType = 'uniform' | 'progressive'

export const MAX_BLUR_RADIUS = 10_000

/** A blur. */
export interface Blur {
  kind: BlurType
  radius: number
  start?: number
  end?: number
  visible: boolean
}

export const Blur = {
  uniform(radius: number): Blur {
    return { kind: 'uniform', radius, visible: true }
  },
  isProgressive(b: Blur): boolean {
    return b.kind === 'progressive'
  },
  sanitized(b: Blur): Blur {
    return {
      kind: b.kind,
      radius: Number.isFinite(b.radius) ? Math.min(MAX_BLUR_RADIUS, Math.max(0, b.radius)) : 0,
      start: b.start !== undefined && Number.isFinite(b.start) ? Math.min(1, Math.max(0, b.start)) : undefined,
      end: b.end !== undefined && Number.isFinite(b.end) ? Math.min(1, Math.max(0, b.end)) : undefined,
      visible: b.visible
    }
  },
  maxRadius(b: Blur): number {
    return b.kind === 'progressive' ? Math.max(b.radius, b.end ?? 0) : b.radius
  }
}

/** What an effect does (serde `tag = "type"`). */
export type EffectKind =
  | { type: 'dropShadow'; shadow: Shadow }
  | { type: 'innerShadow'; shadow: Shadow }
  | { type: 'layerBlur'; blur: Blur }
  | { type: 'backgroundBlur'; blur: Blur }
  | { type: 'noise'; noise: Noise }
  | { type: 'texture'; texture: Texture }
  | { type: 'glass'; glass: Glass }

/** One effect of a node. */
export interface Effect {
  kind: EffectKind
  blend: string
  visible: boolean
  show_shadow_behind: boolean
}

export const EFFECT_TYPES: ReadonlyArray<readonly [string, string]> = [
  ['dropShadow', 'Drop shadow'],
  ['innerShadow', 'Inner shadow'],
  ['layerBlur', 'Layer blur'],
  ['backgroundBlur', 'Background blur'],
  ['noise', 'Noise'],
  ['texture', 'Texture'],
  ['glass', 'Glass']
]

export const Effect = {
  dropShadow(shadow: Shadow): Effect {
    return { kind: { type: 'dropShadow', shadow }, blend: 'normal', visible: true, show_shadow_behind: false }
  },
  innerShadow(shadow: Shadow): Effect {
    return { kind: { type: 'innerShadow', shadow }, blend: 'normal', visible: true, show_shadow_behind: false }
  },
  layerBlur(blur: Blur): Effect {
    return { kind: { type: 'layerBlur', blur }, blend: 'normal', visible: true, show_shadow_behind: false }
  },
  backgroundBlur(blur: Blur): Effect {
    return { kind: { type: 'backgroundBlur', blur }, blend: 'normal', visible: true, show_shadow_behind: false }
  },
  noise(noise: Noise): Effect {
    return { kind: { type: 'noise', noise }, blend: 'normal', visible: true, show_shadow_behind: false }
  },
  texture(texture: Texture): Effect {
    return { kind: { type: 'texture', texture }, blend: 'normal', visible: true, show_shadow_behind: false }
  },
  glass(glass: Glass): Effect {
    return { kind: { type: 'glass', glass }, blend: 'normal', visible: true, show_shadow_behind: false }
  },
  ofType(name: string): Effect | null {
    switch (name) {
      case 'dropShadow':
        return Effect.dropShadow({
          offset: [0, 4],
          radius: 8,
          spread: 0,
          color: { r: 0, g: 0, b: 0, a: 0.25 },
          show_behind: false,
          blend: 'normal',
          visible: true
        })
      case 'innerShadow':
        return Effect.innerShadow({
          offset: [0, 2],
          radius: 4,
          spread: 0,
          color: { r: 0, g: 0, b: 0, a: 0.25 },
          show_behind: false,
          blend: 'normal',
          visible: true
        })
      case 'layerBlur':
        return Effect.layerBlur(Blur.uniform(8))
      case 'backgroundBlur':
        return Effect.backgroundBlur(Blur.uniform(8))
      case 'noise':
        return Effect.noise({
          mode: 'mono',
          size: 1,
          density: 0.5,
          color: { r: 0, g: 0, b: 0, a: 1 },
          secondary: { r: 1, g: 1, b: 1, a: 1 },
          blend: 'normal',
          visible: true
        })
      case 'texture':
        return Effect.texture({
          noise: {
            mode: 'mono',
            size: 1,
            density: 0.5,
            color: { r: 0, g: 0, b: 0, a: 1 },
            secondary: { r: 1, g: 1, b: 1, a: 1 },
            blend: 'normal',
            visible: true
          },
          visible: true
        })
      case 'glass':
        return Effect.glass({ refraction: 0.5, frost: 0.2, light: 0.3, max_bend: 12, visible: true })
      default:
        return null
    }
  },
  label(e: Effect): string {
    return EFFECT_TYPES.find(([id]) => id === e.kind.type)?.[1] ?? e.kind.type
  },
  /** How far the effect reaches past the node's bounds (blur radius, shadow offset+radius+spread). */
  reach(e: Effect): number {
    switch (e.kind.type) {
      case 'layerBlur':
      case 'backgroundBlur':
        return Blur.maxRadius(e.kind.blur)
      case 'dropShadow':
      case 'innerShadow': {
        const s = e.kind.shadow
        return Math.hypot(s.offset[0], s.offset[1]) + s.radius + Math.abs(s.spread)
      }
      default:
        return 0
    }
  },
  blur(e: Effect): Blur | null {
    return e.kind.type === 'layerBlur' || e.kind.type === 'backgroundBlur' ? e.kind.blur : null
  },
  color(e: Effect): Color | null {
    return e.kind.type === 'dropShadow' || e.kind.type === 'innerShadow'
      ? e.kind.shadow.color
      : e.kind.type === 'noise'
        ? e.kind.noise.color
        : null
  },
  backdropRadius(e: Effect): number {
    return e.kind.type === 'backgroundBlur' ? Blur.maxRadius(e.kind.blur) : 0
  }
}

/** One corner-radius set with smoothing. */
export interface Corners {
  radii: [number, number, number, number]
  smoothing: number
}

export const Corners = {
  default(): Corners {
    return { radii: [0, 0, 0, 0], smoothing: 0 }
  },
  isDefault(c: Corners): boolean {
    return c.radii.every((r) => r === 0) && c.smoothing === 0
  }
}

/** Figma constraints. */
export interface Constraints {
  horizontal: 'left' | 'right' | 'center' | 'leftRight' | 'scale'
  vertical: 'top' | 'bottom' | 'center' | 'topBottom' | 'scale'
}

export const Constraints = {
  default(): Constraints {
    return { horizontal: 'left', vertical: 'top' }
  },
  isDefault(c: Constraints): boolean {
    return c.horizontal === 'left' && c.vertical === 'top'
  }
}

/** Auto layout sizing. */
export type Sizing = 'fixed' | 'hug' | 'fill'

export type LayoutMode = 'none' | 'horizontal' | 'vertical'

export type MainAlign = 'min' | 'center' | 'max' | 'spaceBetween'
export type CrossAlign = 'min' | 'center' | 'max' | 'stretch' | 'baseline'

export type CellAlign = 'auto' | 'min' | 'center' | 'max' | 'stretch'

/** Auto layout on a frame-like node. */
export interface AutoLayout {
  mode: LayoutMode
  spacing: number
  /** Padding left, top, right, bottom. */
  padding: [number, number, number, number]
  /** The frame's own sizing on (main, cross). */
  sizing: [Sizing, Sizing]
  /** Children's default sizing on (main, cross). */
  child_sizing: [Sizing, Sizing]
  align: MainAlign
  cross: CrossAlign
  /** Wrap and the gap between wrapped rows. */
  wraps: boolean
  row_gap: number
  reverse_z: boolean
}

export const AutoLayout = {
  default(): AutoLayout {
    return {
      mode: 'none',
      spacing: 0,
      padding: [0, 0, 0, 0],
      sizing: ['hug', 'hug'],
      child_sizing: ['fixed', 'fixed'],
      align: 'min',
      cross: 'min',
      wraps: false,
      row_gap: 0,
      reverse_z: false
    }
  },
  isDefault(a: AutoLayout): boolean {
    return (
      a.mode === 'none' &&
      a.spacing === 0 &&
      a.padding.every((v) => v === 0) &&
      a.sizing[0] === 'hug' &&
      a.sizing[1] === 'hug' &&
      a.child_sizing[0] === 'fixed' &&
      a.child_sizing[1] === 'fixed' &&
      a.align === 'min' &&
      a.cross === 'min' &&
      !a.wraps &&
      a.row_gap === 0 &&
      !a.reverse_z
    )
  }
}

/** Grid cell placement of a child. */
export interface ChildLayout {
  grow: number
  column_span: number
  row_span: number
}

export const ChildLayout = {
  default(): ChildLayout {
    return { grow: 0, column_span: 1, row_span: 1 }
  },
  isDefault(c: ChildLayout): boolean {
    return c.grow === 0 && c.column_span === 1 && c.row_span === 1
  }
}

/** A layout grid on a frame. */
export interface LayoutGrid {
  pattern: 'columns' | 'rows' | 'grid'
  count: number
  gutter: number
  margin: number
  section_size: number
  color: Color
  visible: boolean
}

export const LayoutGrid = {
  columns(count: number): LayoutGrid {
    return {
      pattern: 'columns',
      count,
      gutter: 20,
      margin: 0,
      section_size: 0,
      color: { r: 1, g: 0, b: 0, a: 0.1 },
      visible: true
    }
  },
  rows(count: number): LayoutGrid {
    return {
      pattern: 'rows',
      count,
      gutter: 20,
      margin: 0,
      section_size: 0,
      color: { r: 1, g: 0, b: 0, a: 0.1 },
      visible: true
    }
  },
  grid(sectionSize: number): LayoutGrid {
    return {
      pattern: 'grid',
      count: 0,
      gutter: 0,
      margin: 0,
      section_size: sectionSize,
      color: { r: 1, g: 0, b: 0, a: 0.1 },
      visible: true
    }
  }
}

/** Export formats. */
export type ExportFormat = 'png' | 'jpg' | 'svg' | 'pdf' | 'webp'

export interface ExportSetting {
  format: ExportFormat
  suffix: string
  scale: number
}
