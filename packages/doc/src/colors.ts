/**
 * Document-colour helpers: the swatch list a document collects, and the image
 * presets the panel offers. (Converted 1:1 from FigCraft
 * `crates/doc/src/colors.rs`.)
 */

import type { Color } from '@zenuxs/color'
import { Color as ColorAPI, ImageFilters, IMAGE_FILTER_NONE } from '@zenuxs/color'

/** One preset of image adjustments by id. */
export interface ImagePreset {
  id: string
  name: string
  filters: ImageFilters
}

/** The built-in image presets (the document stores user-created ones beside them). */
export const BUILTIN_IMAGE_PRESETS: ReadonlyArray<readonly [string, string, ImageFilters]> = [
  ['vivid', 'Vivid', { ...IMAGE_FILTER_NONE, contrast: 0.2, saturation: 0.45, highlights: -0.1, shadows: 0.1 }],
  ['muted', 'Muted', { ...IMAGE_FILTER_NONE, contrast: -0.15, saturation: -0.45 }],
  ['warm', 'Warm', { ...IMAGE_FILTER_NONE, temperature: 0.5, tint: 0.1, saturation: 0.1 }],
  ['cool', 'Cool', { ...IMAGE_FILTER_NONE, temperature: -0.5, tint: -0.05 }],
  ['blackAndWhite', 'Black & white', { ...IMAGE_FILTER_NONE, saturation: -1, contrast: 0.15 }],
  ['fade', 'Fade', { ...IMAGE_FILTER_NONE, contrast: -0.35, saturation: -0.2, shadows: 0.35, highlights: -0.1 }],
  ['reset', 'Reset', { ...IMAGE_FILTER_NONE }]
]

/** Collect the colours used by paints into `out` (deduplicated by rgba key). */
export function collectColors(paints: Array<{ kind: { type: string; color?: Color; stops?: Array<{ color: Color }> } }>, out: Color[]): void {
  for (const p of paints) {
    if (p.kind.type === 'solid' && p.kind.color) {
      push(out, p.kind.color)
    } else if (p.kind.type === 'gradient' && p.kind.stops) {
      for (const s of p.kind.stops) push(out, s.color)
    }
  }
}

function push(out: Color[], c: Color): void {
  const key = ColorAPI.toCssHex(c)
  if (!out.some((existing) => ColorAPI.toCssHex(existing) === key)) out.push(c)
}
