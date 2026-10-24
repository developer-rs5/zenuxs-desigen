/**
 * Colour profiles: the RGB space a document's colour values live in (sRGB or
 * Display P3), the conversion between them and the ICC profile and PNG `cICP`
 * code points that tag exports. (Converted 1:1 from FigCraft
 * `crates/color/src/profile.rs`.)
 *
 * Both spaces share the D65 white point and the sRGB transfer function; they
 * differ only in their primaries. A conversion decodes the transfer function,
 * maps linear RGB through XYZ with the two primaries matrices (derived here
 * from the published chromaticities) and re-encodes. Colours a smaller space
 * can't hold are clipped per channel.
 */

import type { Color } from './lib'
import { Color } from './lib'
import { matrixTrcProfile, type Mat3 } from './icc'

export type ColorProfileId = 'srgb' | 'displayP3'

/** A 3×3 matrix, row-major. */
export type Mat3Public = Mat3

const IDENTITY: Mat3 = [
  [1, 0, 0],
  [0, 1, 0],
  [0, 0, 1]
]

/** The D65 white point (CIE 1931 xy) both spaces use. */
const D65: [number, number] = [0.3127, 0.329]

export type ProfileConversionData = { m: Mat3 | null }

export interface ProfileConversion {
  isIdentity(): boolean
  apply(c: Color): Color
  clips(c: Color): boolean
  clippedPixels(rgba: Uint8Array): boolean[]
  applyPixels(rgba: Uint8Array): void
}

function profileData(profile: ColorProfileId): { toXyz(): Mat3; conversionTo(to: ColorProfileId): ProfileConversionData } {
  return {
    toXyz: () => rgbToXyz(primaries(profile), D65),
    conversionTo: (to) => {
      if (profile === to) {
        return { m: null }
      }
      const m = mul(inverse(profileData(to).toXyz()) ?? IDENTITY, profileData(profile).toXyz())
      return { m }
    }
  }
}

function primaries(profile: ColorProfileId): Array<[number, number]> {
  return profile === 'srgb'
    ? [
        [0.64, 0.33],
        [0.3, 0.6],
        [0.15, 0.06]
      ]
    : [
        [0.68, 0.32],
        [0.265, 0.69],
        [0.15, 0.06]
      ]
}

export const ColorProfile = {
  ALL: ['srgb', 'displayP3'] as const,

  default(): ColorProfileId {
    return 'srgb'
  },

  /** The id used in commands and files (`srgb`, `displayP3`). */
  id(p: ColorProfileId): string {
    return p
  },

  label(p: ColorProfileId): string {
    return p === 'srgb' ? 'sRGB' : 'Display P3'
  },

  /** Parse an id or label, ignoring case, spaces, `-` and `_`. */
  parse(s: string): ColorProfileId | null {
    const k = s
      .split('')
      .filter((c) => c !== ' ' && c !== '-' && c !== '_')
      .join('')
      .toLowerCase()
    if (k === 'srgb') return 'srgb'
    if (k === 'displayp3' || k === 'p3') return 'displayP3'
    return null
  },

  isSrgb(p: ColorProfileId): boolean {
    return p === 'srgb'
  },

  /** Linear RGB → CIE XYZ (D65). */
  toXyz(p: ColorProfileId): Mat3 {
    return profileData(p).toXyz()
  },

  /** The conversion that keeps a colour's appearance when its values move from this space to `to`. */
  conversionTo(p: ColorProfileId, to: ColorProfileId): ProfileConversion {
    const data = profileData(p).conversionTo(to)
    return makeProfileConversion(data)
  },

  /** PNG `cICP` code points (ITU-T H.273). */
  cicp(p: ColorProfileId): [number, number, number, number] {
    return p === 'srgb' ? [1, 13, 0, 1] : [12, 13, 0, 1]
  },

  /** An ICC v4 matrix/TRC display profile for this space (generated, not copied from anywhere). */
  icc(p: ColorProfileId): Uint8Array {
    return matrixTrcProfile(ColorProfile.label(p), profileData(p).toXyz(), D65)
  }
}

/** A colour conversion between two profiles (see `ColorProfile.conversionTo`). */
function makeProfileConversion(data: ProfileConversionData): ProfileConversion {
  const m = data.m
  return {
    isIdentity(): boolean {
      return m === null
    },

    /** `c` in the target space (alpha unchanged; out-of-gamut channels clip). */
    apply(c: Color): Color {
      if (!m) return c
      const lin = [decode(c.r), decode(c.g), decode(c.b)]
      const [r, g, b] = apply(m, lin)
      return Color.new(encode(r), encode(g), encode(b), c.a)
    },

    /**
     * Whether `c` falls outside the target space: a channel clips by more than
     * two 8-bit steps (the colour picker's gamut warning).
     */
    clips(c: Color): boolean {
      if (!m) return false
      return apply(m, [decode(c.r), decode(c.g), decode(c.b)]).some(outside)
    },

    /**
     * Which premultiplied 8-bit RGBA pixels fall outside the target space: the
     * canvas's soft proof.
     */
    clippedPixels(rgba: Uint8Array): boolean[] {
      const pixels = Math.floor(rgba.length / 4)
      if (!m) return new Array<boolean>(pixels).fill(false)
      const toLinear: number[] = []
      for (let i = 0; i < 256; i++) toLinear.push(decode(i / 255))
      const lin = (v: number): number => toLinear[v] ?? 0
      const out: boolean[] = []
      for (let i = 0; i < pixels; i++) {
        const r = rgba[i * 4]
        const g = rgba[i * 4 + 1]
        const b = rgba[i * 4 + 2]
        const a = rgba[i * 4 + 3]
        out.push(a !== 0 && apply(m, [lin(straight(r, a)), lin(straight(g, a)), lin(straight(b, a))]).some(outside))
      }
      return out
    },

    /** Convert premultiplied 8-bit RGBA pixels in place (table-driven; a no-op for the identity). */
    applyPixels(rgba: Uint8Array): void {
      if (!m) return
      const toLinear: number[] = []
      for (let i = 0; i < 256; i++) toLinear.push(decode(i / 255))
      const ENCODE_STEPS = 4096
      const toEncoded: number[] = []
      for (let i = 0; i < ENCODE_STEPS; i++) {
        toEncoded.push(Math.round(encode(i / (ENCODE_STEPS - 1)) * 255))
      }
      const lin = (v: number): number => toLinear[v] ?? 0
      const enc = (l: number): number =>
        toEncoded[Math.round(Math.min(1, Math.max(0, l)) * (ENCODE_STEPS - 1))] ?? 0
      const pixels = Math.floor(rgba.length / 4)
      for (let i = 0; i < pixels; i++) {
        const r = rgba[i * 4]
        const g = rgba[i * 4 + 1]
        const b = rgba[i * 4 + 2]
        const a = rgba[i * 4 + 3]
        if (a === 0) continue
        const v = [lin(straight(r, a)), lin(straight(g, a)), lin(straight(b, a))]
        const out = [
          enc(m[0][0] * v[0] + m[0][1] * v[1] + m[0][2] * v[2]),
          enc(m[1][0] * v[0] + m[1][1] * v[1] + m[1][2] * v[2]),
          enc(m[2][0] * v[0] + m[2][1] * v[1] + m[2][2] * v[2])
        ]
        const alpha = a
        const premul = (c: number): number => (alpha === 255 ? c : Math.trunc((c * alpha + 127) / 255))
        rgba[i * 4] = premul(out[0])
        rgba[i * 4 + 1] = premul(out[1])
        rgba[i * 4 + 2] = premul(out[2])
      }
    }
  }
}

/** A premultiplied 8-bit channel without its alpha (`a` > 0). */
function straight(c: number, a: number): number {
  const alpha = Math.max(1, a)
  if (alpha === 255) return c
  return Math.min(255, Math.trunc((c * 255 + alpha / 2) / alpha))
}

/**
 * A linear channel the target space can't hold: below 0 or above 1 by more
 * than two 8-bit steps once encoded (smaller excesses are the rounding of
 * 8-bit values in the other space).
 */
function outside(l: number): boolean {
  const SLACK = 2 / 255
  const enc = (x: number): number =>
    x <= 0.003_130_8 ? x * 12.92 : 1.055 * Math.pow(x, 1 / 2.4) - 0.055
  return (l < 0 && enc(-l) > SLACK) || (l > 1 && enc(l) > 1 + SLACK)
}

/** The sRGB transfer function, encoded value → linear light. */
function decode(v: number): number {
  const c = Number.isFinite(v) ? Math.min(1, Math.max(0, v)) : 0
  return c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4)
}

/** The sRGB transfer function, linear light → encoded value (clipped to 0..=1; f32 out like Rust). */
function encode(l0: number): number {
  const l = Number.isFinite(l0) ? Math.min(1, Math.max(0, l0)) : 0
  const v = l <= 0.003_130_8 ? l * 12.92 : 1.055 * Math.pow(l, 1 / 2.4) - 0.055
  // Rust returns f32: `1.055 - 0.055` in f64 is 0.9999999999999999, which an
  // f32 cast snaps back to exactly 1.0 (and f32 rounding matches elsewhere).
  return Math.fround(v)
}

/** The XYZ of chromaticity `(x, y)` at luminance 1. */
export function xyToXyz(x0: number, y0: number): [number, number, number] {
  const y = Math.abs(y0) < 1e-12 ? 1e-12 : y0
  return [x0 / y, 1, (1 - x0 - y0) / y]
}

/** The linear RGB → XYZ matrix of an RGB space from its primaries and white point. */
function rgbToXyz(primaries_: Array<[number, number]>, white: [number, number]): Mat3 {
  const [r, g, b] = primaries_.map(([x, y]) => xyToXyz(x, y))
  const p: Mat3 = [
    [r[0], g[0], b[0]],
    [r[1], g[1], b[1]],
    [r[2], g[2], b[2]]
  ]
  // Scale each primary so that RGB (1, 1, 1) lands on the white point.
  const s = apply(inverse(p) ?? IDENTITY, xyToXyz(white[0], white[1]))
  return [
    [p[0][0] * s[0], p[0][1] * s[1], p[0][2] * s[2]],
    [p[1][0] * s[0], p[1][1] * s[1], p[1][2] * s[2]],
    [p[2][0] * s[0], p[2][1] * s[1], p[2][2] * s[2]]
  ]
}

export function mul(a: Mat3, b: Mat3): Mat3 {
  const out: Mat3 = [
    [0, 0, 0],
    [0, 0, 0],
    [0, 0, 0]
  ]
  for (let i = 0; i < 3; i++) {
    for (let j = 0; j < 3; j++) {
      let sum = 0
      for (let k = 0; k < 3; k++) sum += a[i][k] * b[k][j]
      out[i][j] = sum
    }
  }
  return out
}

export function apply(m: Mat3, v: [number, number, number]): [number, number, number] {
  return [
    m[0][0] * v[0] + m[0][1] * v[1] + m[0][2] * v[2],
    m[1][0] * v[0] + m[1][1] * v[1] + m[1][2] * v[2],
    m[2][0] * v[0] + m[2][1] * v[1] + m[2][2] * v[2]
  ]
}

export function inverse(m: Mat3): Mat3 | null {
  const [[a, b, c], [d, e, f], [g, h, i]] = m
  const co = [e * i - f * h, f * g - d * i, d * h - e * g]
  const det = a * co[0] + b * co[1] + c * co[2]
  if (!Number.isFinite(det) || Math.abs(det) < 1e-12) {
    return null
  }
  const inv = 1 / det
  return [
    [co[0] * inv, (c * h - b * i) * inv, (b * f - c * e) * inv],
    [co[1] * inv, (a * i - c * g) * inv, (c * d - a * f) * inv],
    [co[2] * inv, (b * g - a * h) * inv, (a * e - b * d) * inv]
  ]
}
