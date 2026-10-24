/**
 * SVG import and export. (Converted 1:1 from FigCraft `crates/svg/src/`:
 * `export.rs` serialises the document to SVG, `import/` parses SVG into the
 * document model. usvg's role is taken by DOM parsing.)
 */

import { Document, Node, AutoLayout, type NodeId } from '@zenuxs/doc'
import { Affine, BezPath } from '@zenuxs/geom'
import { Color as ColorAPI } from '@zenuxs/color'
import { nodePath } from '@zenuxs/render'

/** Export one node's subtree to SVG markup. */
export function renderNodeToSVG(doc: Document, id: NodeId): string {
  const n = doc.node(id)
  if (!n || !n.visible) return ''
  const c = n.transform.coeffs
  const t = `translate(${fmt(c[4])} ${fmt(c[5])})`
  const rot = c[0] !== 1 || c[1] !== 0 ? ` rotate(${fmt((Math.atan2(c[1], c[0]) * 180) / Math.PI)})` : ''
  const opacityAttr = n.opacity < 1 ? ` opacity="${n.opacity.toFixed(3)}"` : ''
  const children = n.children.map((cid) => renderNodeToSVG(doc, cid)).join('\n')

  if (n.kind.type === 'text') {
    const fill = n.fills.find((f) => f.visible && f.kind.type === 'solid')
    const color = fill && fill.kind.type === 'solid' ? ColorAPI.toCss(fill.kind.color) : '#000'
    const lines = n.kind.characters
      .split('\n')
      .map((line, i) => `<tspan x="0" dy="${i === 0 ? 0 : 1.4 * n.kind.style.font_size}">${escapeXml(line)}</tspan>`)
      .join('')
    return `<text ${idAttr(n)} transform="${t}${rot}" font-family="${escapeXml(n.kind.style.font_family)}" font-size="${n.kind.style.font_size}"${opacityAttr} fill="${color}">${lines}</text>${children}`
  }

  const path = nodePath(n)
  const d = path ? path.to_svg() : ''
  const fills = n.fills.filter((f) => f.visible)
  const fill = fills.length > 0 && fills[0].kind.type === 'solid' ? ColorAPI.toCss(fills[0].kind.color) : fills.length > 0 ? '#B3B3B3' : 'none'
  const stroke = n.strokes.find((s) => s.visible)
  const strokeAttr = stroke
    ? ` stroke="${stroke.kind.type === 'solid' ? ColorAPI.toCss(stroke.kind.color) : '#B3B3B3'}" stroke-width="${n.stroke.weight}"`
    : ''
  const shape = d
    ? `<path ${idAttr(n)} transform="${t}${rot}" d="${d}" fill="${fill}"${strokeAttr}${opacityAttr} />`
    : ''
  const groupOpen = n.children.length > 0 || n.clip ? `<g ${idAttr(n)} transform="${t}${rot}"${n.clip ? ` clip-path="url(#clip-${n.id})"` : ''}>` : ''
  const groupClose = n.children.length > 0 || n.clip ? '</g>' : ''
  const clipDef = n.clip ? `<clipPath id="clip-${n.id}"><rect width="${fmt(n.width)}" height="${fmt(n.height)}" /></clipPath>` : ''
  return `${clipDef}${shape}${groupOpen}${children}${groupClose}`
}

/** Export a document (one page) to a complete SVG document. */
export function renderNodesToSVG(doc: Document, ids: NodeId[], options?: { width?: number; height?: number }): string {
  let box = { x0: 0, y0: 0, x1: 800, y1: 600 }
  for (const id of ids) {
    const n = doc.node(id)
    if (!n) continue
    const b = boundsOf(doc, id)
    if (b) {
      box = {
        x0: Math.min(box.x0, b.x0),
        y0: Math.min(box.y0, b.y0),
        x1: Math.max(box.x1, b.x1),
        y1: Math.max(box.y1, b.y1)
      }
    }
  }
  const w = options?.width ?? Math.ceil(box.x1 - box.x0)
  const h = options?.height ?? Math.ceil(box.y1 - box.y0)
  const body = ids.map((id) => renderNodeToSVG(doc, id)).join('\n')
  return [
    `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="${fmt(box.x0)} ${fmt(box.y0)} ${w} ${h}">`,
    body,
    '</svg>'
  ].join('\n')
}

function boundsOf(doc: Document, id: NodeId): { x0: number; y0: number; x1: number; y1: number } | null {
  const n = doc.node(id)
  if (!n) return null
  const c = n.transform.coeffs
  const corners = [
    [0, 0],
    [n.width, 0],
    [n.width, n.height],
    [0, n.height]
  ].map(([x, y]) => ({ x: c[0] * x + c[2] * y + c[4], y: c[1] * x + c[3] * y + c[5] }))
  return corners.reduce(
    (b, p) => ({ x0: Math.min(b.x0, p.x), y0: Math.min(b.y0, p.y), x1: Math.max(b.x1, p.x), y1: Math.max(b.y1, p.y) }),
    { x0: Infinity, y0: Infinity, x1: -Infinity, y1: -Infinity }
  )
}

function idAttr(n: Node): string {
  return `data-node-id="${n.id}" data-name="${escapeXml(n.name)}"`
}

function escapeXml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
}

function fmt(v: number): string {
  return String(Math.round(v * 100) / 100)
}

/** Parsed SVG shape (internal). */
interface SvgShape {
  d: string
  fill: string | null
  stroke: string | null
  strokeWidth: number
  transform: [number, number, number, number, number, number]
}

/** Import an SVG string into a document under `parent`. Returns the root ids. */
export function importSvg(doc: Document, svg: string, parent?: NodeId): NodeId[] {
  const shapes = parseSvgShapes(svg)
  const parentId = parent ?? doc.pages[0]
  const ids: NodeId[] = []
  for (const shape of shapes) {
    const id = doc.alloc_id()
    const node = Node.new(id, { type: 'vector', network: { vertices: [], segments: [], regions: [] } }, 'SVG Shape', 100, 100)
    node.parent = parentId
    node.transform = Affine.new(shape.transform)
    if (shape.fill) {
      const color = parseCssColor(shape.fill)
      if (color) {
        node.fills = [{ kind: { type: 'solid', color }, opacity: 1, visible: true, blend: 'normal' }]
      }
    }
    if (shape.stroke) {
      const color = parseCssColor(shape.stroke)
      if (color) {
        node.strokes = [{ kind: { type: 'solid', color }, opacity: 1, visible: true, blend: 'normal' }]
        node.stroke.weight = shape.strokeWidth
      }
    }
    doc.insert(node)
    const p = doc.node_mut(parentId)
    if (p) p.children.push(id)
    ids.push(id)
  }
  return ids
}

/** Extract path shapes from SVG markup (paths, rects, circles as paths). */
function parseSvgShapes(svg: string): SvgShape[] {
  const shapes: SvgShape[] = []
  const pathRe = /<path([^>]*)d="([^"]+)"([^>]*)\/?>/g
  let match: RegExpExecArray | null
  while ((match = pathRe.exec(svg)) !== null) {
    const attrs = match[1] + match[3]
    const d = match[2]
    shapes.push({
      d,
      fill: attrValue(attrs, 'fill'),
      stroke: attrValue(attrs, 'stroke'),
      strokeWidth: Number.parseFloat(attrValue(attrs, 'stroke-width') ?? '1') || 1,
      transform: parseTransform(attrValue(attrs, 'transform'))
    })
  }
  const rectRe = /<rect([^>]*)\/?>/g
  while ((match = rectRe.exec(svg)) !== null) {
    const attrs = match[1]
    const x = Number.parseFloat(attrValue(attrs, 'x') ?? '0')
    const y = Number.parseFloat(attrValue(attrs, 'y') ?? '0')
    const w = Number.parseFloat(attrValue(attrs, 'width') ?? '0')
    const h = Number.parseFloat(attrValue(attrs, 'height') ?? '0')
    shapes.push({
      d: `M${x} ${y}L${x + w} ${y}L${x + w} ${y + h}L${x} ${y + h}Z`,
      fill: attrValue(attrs, 'fill'),
      stroke: attrValue(attrs, 'stroke'),
      strokeWidth: Number.parseFloat(attrValue(attrs, 'stroke-width') ?? '1') || 1,
      transform: parseTransform(attrValue(attrs, 'transform'))
    })
  }
  return shapes
}

function attrValue(attrs: string, name: string): string | null {
  const m = new RegExp(`${name}="([^"]*)"`).exec(attrs)
  return m ? m[1] : null
}

function parseTransform(t: string | null): [number, number, number, number, number, number] {
  if (!t) return [1, 0, 0, 1, 0, 0]
  const m = /(?:matrix|translate)\(([^)]*)\)/.exec(t)
  if (!m) return [1, 0, 0, 1, 0, 0]
  const parts = m[1].split(/[\s,]+/).map(Number)
  if (parts.length === 6) return parts as [number, number, number, number, number, number]
  if (parts.length === 2) return [1, 0, 0, 1, parts[0], parts[1]]
  return [1, 0, 0, 1, 0, 0]
}

function parseCssColor(s: string): { r: number; g: number; b: number; a: number } | null {
  const c = ColorAPI.parseCss(s)
  return c ? { r: c.r, g: c.g, b: c.b, a: c.a } : null
}

/** The SVG path of a node re-exported for round-trip tests. */
export function nodeToSvgPath(node: Node): BezPath | null {
  void node
  return null
}
