/** HSB (HSV) and HSL, the models the colour picker offers besides RGB and hex.
 * (Converted 1:1 from FigCraft `crates/color/src/hsx.rs`.) */

import type { Color } from './lib'
import { Color } from './lib'

/** Hue 0..360, saturation and brightness 0..1. */
export interface Hsb {
  h: number
  s: number
  b: number
}

/** Hue 0..360, saturation and lightness 0..1. */
export interface Hsl {
  h: number
  s: number
  l: number
}

function wrapHue(h: number): number {
  if (!Number.isFinite(h)) {
    return 0
  }
  const w = h % 360
  return w < 0 ? w + 360 : w
}

function c01(v: number): number {
  return Number.isFinite(v) ? Math.min(1, Math.max(0, v)) : 0
}

export const Hsb = {
  fromColor(c: Color): Hsb {
    const { r, g, b } = c
    const max = Math.max(r, g, b)
    const min = Math.min(r, g, b)
    const d = max - min
    const h = hue(r, g, b, max, d)
    const s = max <= 0 ? 0 : d / max
    return { h, s, b: max }
  },

  toColor(hsb: Hsb): Color {
    const h = wrapHue(hsb.h)
    const s = c01(hsb.s)
    const v = c01(hsb.b)
    const c = v * s
    const x = c * (1 - Math.abs(((h / 60) % 2) - 1))
    const m = v - c
    const [r, g, b] = sector(h, c, x)
    return Color.new(r + m, g + m, b + m, 1)
  }
}

export const Hsl = {
  fromColor(c: Color): Hsl {
    const { r, g, b } = c
    const max = Math.max(r, g, b)
    const min = Math.min(r, g, b)
    const d = max - min
    const l = (max + min) / 2
    const h = hue(r, g, b, max, d)
    const s = d <= 0 ? 0 : d / Math.max(1e-6, 1 - Math.abs(2 * l - 1))
    return { h, s: c01(s), l }
  },

  toColor(hsl: Hsl, alpha: number = 1): Color {
    const h = wrapHue(hsl.h)
    const s = c01(hsl.s)
    const l = c01(hsl.l)
    const c = (1 - Math.abs(2 * l - 1)) * s
    const x = c * (1 - Math.abs(((h / 60) % 2) - 1))
    const m = l - c / 2
    const [r, g, b] = sector(h, c, x)
    return Color.new(r + m, g + m, b + m, alpha)
  }
}

function hue(r: number, g: number, b: number, max: number, d: number): number {
  if (d <= 0) {
    return 0
  }
  let h: number
  if (Math.abs(max - r) < Number.EPSILON) {
    h = 60 * (((g - b) / d) % 6)
  } else if (Math.abs(max - g) < Number.EPSILON) {
    h = 60 * ((b - r) / d + 2)
  } else {
    h = 60 * ((r - g) / d + 4)
  }
  return wrapHue(h)
}

function sector(h: number, c: number, x: number): [number, number, number] {
  switch (Math.trunc(h / 60)) {
    case 0:
      return [c, x, 0]
    case 1:
      return [x, c, 0]
    case 2:
      return [0, c, x]
    case 3:
      return [0, x, c]
    case 4:
      return [x, 0, c]
    default:
      return [c, 0, x]
  }
}
