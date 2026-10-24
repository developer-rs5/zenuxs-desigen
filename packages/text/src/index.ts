/**
 * Text layout: shaping and line breaking over the document's text data.
 * (Converted 1:1 from FigCraft `crates/text/src/layout.rs`; HarfBuzz shaping
 * is injected by the platform — the layout algorithms are pure.)
 */

import type { Document, TextData, TextStyle } from '@zenuxs/doc'
import { LineHeight } from '@zenuxs/doc'
import type { NodeId } from '@zenuxs/geom'

/** A shaped glyph run: the measured result of one line. */
export interface LineRun {
  text: string
  width: number
  /** Character range in the text data. */
  start: number
  end: number
}

/** One laid-out line. */
export interface LayoutLine {
  runs: LineRun[]
  width: number
  /** Distance from the line's top to its baseline. */
  baseline: number
}

/** Measures and shapes text (the HarfBuzz seam). */
export interface Shaper {
  /** The width of `text` at `fontSize` in the style's font. */
  measure(text: string, style: TextStyle): number
}

/** A shaper that estimates width from character counts (tests, headless). */
export const EstimateShaper: Shaper = {
  measure(text: string, style: TextStyle): number {
    // Rough monospaced estimate: 0.6em per character.
    return text.length * style.font_size * 0.6
  }
}

export interface TextLayout {
  lines: LayoutLine[]
  width: number
  height: number
}

/** The resolved line height in px. */
export function resolvedLineHeight(style: TextStyle): number {
  return LineHeight.resolve(style.line_height, style.font_size, 1.4)
}

/** Break `text` into lines at hard breaks, wrapped to `width` when finite. */
function breakLines(text: string, style: TextStyle, shaper: Shaper, width: number): string[][] {
  const hard = text.split('\n')
  if (!Number.isFinite(width) || width <= 0) return hard.map((l) => [l])
  const out: string[][] = []
  for (const paragraph of hard) {
    const words = paragraph.split(/(\s+)/).filter((w) => w.length > 0)
    let line: string[] = []
    let lineText = ''
    for (const word of words) {
      const candidate = lineText + word
      if (line.length > 0 && shaper.measure(candidate.trim(), style) > width) {
        out.push(line)
        line = []
        lineText = ''
      }
      line.push(word)
      lineText = candidate
    }
    out.push(line)
  }
  return out
}

/** Lay out a text node's data at a given width. */
export function layoutText(data: TextData, width: number, shaper: Shaper = EstimateShaper): TextLayout {
  const style = data.style
  const lh = resolvedLineHeight(style)
  // Wrap at the given width (the caller decides the box width; auto-size text passes Infinity).
  const paragraphs = breakLines(data.characters, style, shaper, width)
  const lines: LayoutLine[] = []
  let maxW = 0
  for (const paragraph of paragraphs) {
    const text = paragraph.join('')
    const runs: LineRun[] = [{ text, width: shaper.measure(text, style), start: 0, end: text.length }]
    const w = runs.reduce((s, r) => s + r.width, 0)
    maxW = Math.max(maxW, w)
    lines.push({ runs, width: w, baseline: lh * 0.8 })
  }
  const spacing = data.paragraph_spacing
  const height = lines.length * lh + Math.max(0, lines.length - 1) * spacing
  return { lines, width: maxW, height }
}

/** The height a text node needs at `width` (the Measure implementation). */
export function textHeight(data: TextData, width: number, shaper: Shaper = EstimateShaper): number {
  return layoutText(data, width, shaper).height
}

/** The natural (unwrapped) size of a text node. */
export function textSize(data: TextData, shaper: Shaper = EstimateShaper): [number, number] {
  const layout = layoutText(data, Infinity, shaper)
  return [layout.width, layout.height]
}

/** The document-measure implementation the engine's layout uses. */
export function createDocMeasure(shaper: Shaper = EstimateShaper): {
  textHeight(doc: Document, id: NodeId, width: number): number | null
  textSize(doc: Document, id: NodeId): [number, number] | null
  textBaseline(doc: Document, id: NodeId): number | null
} {
  return {
    textHeight(doc, id, width) {
      const n = doc.node(id)
      if (!n || n.kind.type !== 'text') return null
      return textHeight(n.kind, width, shaper)
    },
    textSize(doc, id) {
      const n = doc.node(id)
      if (!n || n.kind.type !== 'text') return null
      return textSize(n.kind, shaper)
    },
    textBaseline(doc, id) {
      const n = doc.node(id)
      if (!n || n.kind.type !== 'text') return null
      return resolvedLineHeight(n.kind.style) * 0.8
    }
  }
}
