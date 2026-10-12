import { converter, formatHex, formatHex8, parse } from 'culori'

import { BLACK } from '@open-pencil/scene-graph/constants'
import type { Color } from '@open-pencil/scene-graph/primitives'

const rgbConverter = converter('rgb')

export function parseColor(input: string): Color {
  const parsedColor = parse(input)
  const rgbColor = parsedColor ? rgbConverter(parsedColor) : null

  return rgbColor
    ? {
        r: rgbColor.r,
        g: rgbColor.g,
        b: rgbColor.b,
        a: parsedColor?.alpha ?? 1
      }
    : structuredClone(BLACK)
}

/**
 * Inverse of {@link parseColor} for the writer. `.pen` stores colors as CSS
 * hex (`#rrggbb` / `#rrggbbaa`), the same shape its own fixtures use; the
 * reader parses both back exactly.
 */
export function formatColor(color: Color): string {
  const rgb = { mode: 'rgb' as const, r: color.r, g: color.g, b: color.b }
  return color.a < 1 ? formatHex8({ ...rgb, alpha: color.a }) : formatHex(rgb)
}
