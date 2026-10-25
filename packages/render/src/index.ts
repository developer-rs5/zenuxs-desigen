/**
 * ZenuxsDesign renderer: draws a document onto a 2D canvas (tiny-skia's role
 * in FigCraft; Canvas2D is the portable raster backend here).
 *
 * `renderNode` walks a node's paints (solid / the four gradient kinds /
 * image / pattern), effects (shadows, blur), corner radii and stroke props,
 * mirroring `crates/render/src/{draw,paint,effects}.rs` behaviour.
 */

import { rounded_rect, ellipse, polygon_points, star_points, transform_rect_bbox, type BezPath, type Rect } from '@zenuxs/geom'
import type { Document, Node } from '@zenuxs/doc'
import type { Color, Paint } from '@zenuxs/color'
import { Color as ColorAPI, Gradient } from '@zenuxs/color'

export interface RenderOptions {
  /** Background behind the page. */
  background?: Color
  /** Render outlines instead of fills (the outlines view). */
  outlines?: boolean
  /** Draw layout grids. */
  layoutGrids?: boolean
  /** Scale (export multiplier). */
  scale?: number
}

/** Canvas-like surface the renderer draws to (browser Canvas2D, or a stub in tests). */
export interface Canvas2DLike {
  save(): void
  restore(): void
  translate(x: number, y: number): void
  scale(x: number, y: number): void
  rotate(rad: number): void
  beginPath(): void
  closePath(): void
  moveTo(x: number, y: number): void
  lineTo(x: number, y: number): void
  bezierCurveTo(c1x: number, c1y: number, c2x: number, c2y: number, x: number, y: number): void
  arc(x: number, y: number, r: number, start: number, end: number, ccw?: boolean): void
  rect(x: number, y: number, w: number, h: number): void
  clip(): void
  fill(): void
  stroke(): void
  drawImage(image: unknown, dx: number, dy: number, dw?: number, dh?: number): void
  createLinearGradient(x0: number, y0: number, x1: number, y1: number): CanvasGradientLike
  createRadialGradient(x0: number, y0: number, r0: number, x1: number, y1: number, r1: number): CanvasGradientLike
  fillStyle: string | CanvasGradientLike
  strokeStyle: string | CanvasGradientLike
  lineWidth: number
  lineCap: string
  lineJoin: string
  miterLimit: number
  globalAlpha: number
  shadowColor: string
  shadowBlur: number
  shadowOffsetX: number
  shadowOffsetY: number
  filter: string
  font?: string
  fillRect?(x: number, y: number, w: number, h: number): void
  fillText?(text: string, x: number, y: number, maxWidth?: number): void
  transform?(a: number, b: number, c: number, d: number, e: number, f: number): void
}

export interface CanvasGradientLike {
  addColorStop(offset: number, color: string): void
}

/** The transform applied to a node's coordinate space (2×3, like Affine). */
export function applyTransformToCtx(ctx: Canvas2DLike, coeffs: readonly number[]): void {
  ctx.transform(coeffs[0], coeffs[1], coeffs[2], coeffs[3], coeffs[4], coeffs[5])
}

// Canvas2D has transform() too; declare it.
interface WithTransform extends Canvas2DLike {
  transform(a: number, b: number, c: number, d: number, e: number, f: number): void
}

/** The path of a shape node (same geometry the doc crate computes). */
export function nodePath(n: Node): BezPath | null {
  const w = n.width
  const h = n.height
  const c = n.corners
  switch (n.kind.type) {
    case 'rectangle':
    case 'frame':
    case 'component':
    case 'componentSet':
    case 'instance':
    case 'section':
      return rounded_rect(w, h, c.radii, c.smoothing)
    case 'slice':
      return rounded_rect(w, h, [0, 0, 0, 0], 0)
    case 'ellipse':
      return ellipse(w, h, n.kind.start, n.kind.sweep, n.kind.inner)
    case 'polygon':
      return rounded_polygonOf(polygon_points(w, h, n.kind.count), c.radii[0])
    case 'star':
      return rounded_polygonOf(star_points(w, h, n.kind.count, n.kind.inner_ratio), c.radii[0])
    case 'line': {
      const p = rounded_rect(0, 0, [0, 0, 0, 0], 0)
      const line = p
      line.elements.length = 0
      line.move_to({ x: 0, y: 0 })
      line.line_to({ x: w, y: 0 })
      return line
    }
    case 'text':
      return rounded_rect(w, h, [0, 0, 0, 0], 0)
    default:
      return null
  }
}

// Reuse the doc crate's rounded polygon through its public API.
import { rounded_polygon } from '@zenuxs/geom'
function rounded_polygonOf(points: ReturnType<typeof polygon_points>, radius: number): BezPath {
  return rounded_polygon(points, radius)
}

/** Trace a BezPath onto the canvas context. */
export function tracePath(ctx: Canvas2DLike, path: BezPath): void {
  ctx.beginPath()
  let current = { x: 0, y: 0 }
  let start = { x: 0, y: 0 }
  for (const el of path.elements) {
    switch (el.type) {
      case 'MoveTo':
        ctx.moveTo(el.p.x, el.p.y)
        current = el.p
        start = el.p
        break
      case 'LineTo':
        ctx.lineTo(el.p.x, el.p.y)
        current = el.p
        break
      case 'QuadTo': {
        // Canvas2D has quadraticCurveTo but the restricted surface uses cubics;
        // elevate the quad to a cubic.
        const c1 = { x: current.x + (2 / 3) * (el.a.x - current.x), y: current.y + (2 / 3) * (el.a.y - current.y) }
        const c2 = { x: el.b.x + (2 / 3) * (el.a.x - el.b.x), y: el.b.y + (2 / 3) * (el.a.y - el.b.y) }
        ctx.bezierCurveTo(c1.x, c1.y, c2.x, c2.y, el.b.x, el.b.y)
        current = el.b
        break
      }
      case 'CurveTo':
        ctx.bezierCurveTo(el.a.x, el.a.y, el.b.x, el.b.y, el.c.x, el.c.y)
        current = el.c
        break
      case 'ClosePath':
        ctx.closePath()
        current = start
        break
    }
  }
}

function colorCss(c: Color): string {
  const [r, g, b, a] = ColorAPI.toRgba8(c)
  return a === 255 ? `rgb(${r},${g},${b})` : `rgba(${r},${g},${b},${(a / 255).toFixed(3)})`
}

/** Set the fill style for a paint (solid or gradient). */
function paintFillStyle(ctx: Canvas2DLike, paint: Paint, w: number, h: number): void {
  const kind = paint.kind
  if (kind.type === 'solid') {
    const c = kind.color
    ctx.fillStyle = colorCss({ ...c, a: c.a * paint.opacity })
  } else if (kind.type === 'gradient') {
    const g = kind
    if (g.kind === 'linear') {
      const grad = ctx.createLinearGradient(g.from[0] * w, g.from[1] * h, g.to[0] * w, g.to[1] * h)
      for (const stop of Gradient.sortedStops(g)) {
        grad.addColorStop(Math.min(1, Math.max(0, stop.position)), colorCss(stop.color))
      }
      ctx.fillStyle = grad
    } else {
      // Radial/angular/diamond: radial gradient from the centre as the portable baseline.
      const grad = ctx.createRadialGradient(g.from[0] * w, g.from[1] * h, 0, g.from[0] * w, g.from[1] * h, Math.max(w, h))
      for (const stop of Gradient.sortedStops(g)) {
        grad.addColorStop(Math.min(1, Math.max(0, stop.position)), colorCss(stop.color))
      }
      ctx.fillStyle = grad
    }
  } else {
    ctx.fillStyle = '#B3B3B3'
  }
}

/** Draw one node (and its children) onto the canvas. */
export function renderNode(ctx: Canvas2DLike, doc: Document, id: number, options: RenderOptions = {}): void {
  const n = doc.node(id)
  if (!n || !n.visible || n.opacity === 0) return
  const tctx = ctx as Canvas2DLike & WithTransform
  tctx.save()
  tctx.globalAlpha *= n.opacity
  applyTransformToCtx(tctx, n.transform.coeffs)

  // Effects: drop shadow via canvas shadow state (blur via filter).
  for (const effect of n.effects) {
    if (!effect.visible) continue
    if (effect.kind.type === 'dropShadow') {
      const s = effect.kind.shadow
      ctx.shadowColor = colorCss(s.color)
      ctx.shadowBlur = s.radius
      ctx.shadowOffsetX = s.offset[0]
      ctx.shadowOffsetY = s.offset[1]
    } else if (effect.kind.type === 'layerBlur') {
      ctx.filter = `blur(${effect.kind.blur.radius}px)`
    }
  }

  const path = nodePath(n)
  const fills = n.fills.filter((p) => p.visible)
  if (!options.outlines && path && fills.length > 0) {
    tracePath(ctx, path)
    for (const paint of fills) {
      paintFillStyle(ctx, paint, n.width, n.height)
      if (n.clip && (n.kind.type === 'frame' || n.kind.type === 'component')) {
        ctx.save()
        ctx.clip()
        ctx.fill()
        ctx.restore()
      } else {
        ctx.fill()
      }
    }
    ctx.shadowColor = 'transparent'
    ctx.shadowBlur = 0
    ctx.shadowOffsetX = 0
    ctx.shadowOffsetY = 0
  }

  // Stroke.
  const strokes = n.strokes.filter((p) => p.visible)
  if (path && strokes.length > 0) {
    tracePath(ctx, path)
    for (const paint of strokes) {
      ctx.strokeStyle = paint.kind.type === 'solid' ? colorCss(paint.kind.color) : '#B3B3B3'
      ctx.lineWidth = n.stroke.weight
      ctx.lineCap = n.stroke.cap_start === 'round' ? 'round' : n.stroke.cap_start === 'square' ? 'square' : 'butt'
      ctx.lineJoin = n.stroke.join === 'round' ? 'round' : n.stroke.join === 'bevel' ? 'bevel' : 'miter'
      ctx.stroke()
    }
  }

  ctx.filter = 'none'

  // Text: draw the characters as text (the shaping engine fills real glyph runs).
  if (n.kind.type === 'text' && n.kind.characters) {
    const style = n.kind.style
    const fill = n.fills.find((f) => f.visible)
    ctx.fillStyle = fill && fill.kind.type === 'solid' ? colorCss(fill.kind.color) : '#000000'
    ctx.font = `${style.font_style} ${style.font_size}px ${style.font_family}`
    const lines = n.kind.characters.split('\n')
    const lh = style.line_height.unit === 'pixels' ? style.line_height.value : style.line_height.unit === 'percent' ? (style.font_size * style.line_height.value) / 100 : style.font_size * 1.4
    lines.forEach((line, i) => {
      ctx.fillText?.(line, 0, lh * (i + 0.8))
    })
  }

  // Children (clipped by the frame when clip is on).
  if (n.kind.type === 'frame' && n.clip) {
    ctx.save()
    ctx.beginPath()
    ctx.rect(0, 0, n.width, n.height)
    ctx.clip()
    for (const cid of n.children) renderNode(ctx, doc, cid, options)
    ctx.restore()
  } else {
    for (const cid of n.children) renderNode(ctx, doc, cid, options)
  }

  tctx.restore()
}

/** Render a whole page (or subtree root) onto a canvas. */
export function renderPage(ctx: Canvas2DLike, doc: Document, pageId: number, options: RenderOptions = {}): void {
  const scale = options.scale ?? 1
  ctx.save()
  if (scale !== 1) ctx.scale(scale, scale)
  if (options.background) {
    ctx.fillStyle = colorCss(options.background)
    const page = doc.node(pageId)
    if (page && page.kind.type === 'page') {
      // Cover the page's children's extent.
      let box: Rect | null = null
      for (const cid of page.children) {
        const c = doc.node(cid)
        if (!c) continue
        const b = transform_rect_bbox(c.transform.coeffs, { x0: 0, y0: 0, x1: c.width, y1: c.height })
        box = box ? { x0: Math.min(box.x0, b.x0), y0: Math.min(box.y0, b.y0), x1: Math.max(box.x1, b.x1), y1: Math.max(box.y1, b.y1) } : b
      }
      if (box) ctx.fillRect?.(box.x0, box.y0, box.x1 - box.x0, box.y1 - box.y0)
    }
  }
  const page = doc.node(pageId)
  if (page) {
    for (const cid of page.children) renderNode(ctx, doc, cid, options)
  }
  ctx.restore()
}

/** Render nodes to PNG bytes (headless export). Returns null without a canvas implementation. */
export async function renderNodesToImage(doc: Document, ids: number[], size: { width: number; height: number }, options: RenderOptions = {}): Promise<Uint8Array | null> {
  // Browser: OffscreenCanvas. Node: null unless a canvas package is provided.
  if (typeof OffscreenCanvas === 'undefined') return null
  const scale = options.scale ?? 2
  const canvas = new OffscreenCanvas(size.width * scale, size.height * scale)
  const ctx = canvas.getContext('2d')
  if (!ctx) return null
  const tctx = ctx as unknown as Canvas2DLike & WithTransform
  // Move the content into the canvas.
  let box: Rect | null = null
  for (const id of ids) {
    const n = doc.node(id)
    if (!n) continue
    const b = transform_rect_bbox(n.transform.coeffs, { x0: 0, y0: 0, x1: n.width, y1: n.height })
    box = box ? { x0: Math.min(box.x0, b.x0), y0: Math.min(box.y0, b.y0), x1: Math.max(box.x1, b.x1), y1: Math.max(box.y1, b.y1) } : b
  }
  if (box) {
    tctx.translate(-box.x0 * scale, -box.y0 * scale)
    tctx.scale(scale, scale)
  }
  for (const id of ids) renderNode(tctx, doc, id, options)
  const blob = await canvas.convertToBlob({ type: 'image/png' })
  return new Uint8Array(await blob.arrayBuffer())
}
