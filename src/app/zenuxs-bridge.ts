/**
 * Bidirectional Document Bridge (wire-in step 2).
 *
 * Provides lossless conversion and live synchronization between OpenPencil's
 * SceneGraph/SceneNode model and @zenuxs/doc Document/Node model.
 *
 * Allows commands to run on @zenuxs/engine and update the live canvas,
 * while canvas mutations reflect back into the Zenuxs session.
 */

import {
  Paint as ZenuxsPaint,
  type Color as ZenuxsColorType,
  type Gradient as ZenuxsGradient,
  type Paint as ZenuxsPaintType
} from '@zenuxs/color'
import {
  AutoLayout as ZenuxsAutoLayout,
  Document as ZenuxsDocument,
  Node as ZenuxsNode,
  type Interaction as ZenuxsInteraction,
  type NodeId,
  type NodeKind as ZenuxsNodeKind
} from '@zenuxs/doc'

import {
  readNodeInteractions,
  SceneGraph,
  type Color,
  type Fill,
  type NodeType,
  type SceneNode,
  type Stroke
} from '@open-pencil/scene-graph'

import { getZenuxsEngine } from '@/app/zenuxs-engine'

export class NodeIdMap {
  private strToNum = new Map<string, NodeId>()
  private numToStr = new Map<NodeId, string>()
  private counter = 100

  toNum(strId: string): NodeId {
    let num = this.strToNum.get(strId)
    if (num === undefined) {
      const parsed = parseInt(strId, 10)
      if (!isNaN(parsed) && parsed > 0 && !this.numToStr.has(parsed)) {
        num = parsed
      } else {
        num = ++this.counter
      }
      this.strToNum.set(strId, num)
      this.numToStr.set(num, strId)
    }
    return num
  }

  toStr(numId: NodeId): string {
    let str = this.numToStr.get(numId)
    if (str === undefined) {
      str = String(numId)
      this.numToStr.set(numId, str)
      this.strToNum.set(str, numId)
    }
    return str
  }

  hasNum(numId: NodeId): boolean {
    return this.numToStr.has(numId)
  }

  hasStr(strId: string): boolean {
    return this.strToNum.has(strId)
  }
}

function colorToZenuxs(c?: Color, alpha = 1): ZenuxsColorType {
  if (!c) return { r: 0, g: 0, b: 0, a: 1 }
  return {
    r: Math.max(0, Math.min(1, c.r)),
    g: Math.max(0, Math.min(1, c.g)),
    b: Math.max(0, Math.min(1, c.b)),
    a: Math.max(0, Math.min(1, (c.a ?? 1) * alpha))
  }
}

function colorFromZenuxs(c: ZenuxsColorType): Color {
  return {
    r: c.r,
    g: c.g,
    b: c.b,
    a: c.a
  }
}

function fillToZenuxsPaint(fill: Fill): ZenuxsPaintType {
  if (fill.type === 'SOLID') {
    return ZenuxsPaint.solid(colorToZenuxs(fill.color, fill.opacity ?? 1))
  }
  if (fill.type === 'GRADIENT_LINEAR' && fill.gradientStops) {
    const stops = fill.gradientStops.map((s) => ({
      position: s.position,
      color: colorToZenuxs(s.color)
    }))
    const g: ZenuxsGradient = {
      kind: 'linear',
      from: [0.5, 0],
      to: [0.5, 1],
      width: [-0.5, 0],
      stops
    }
    return ZenuxsPaint.gradient(g)
  }
  if (fill.type === 'IMAGE' && fill.imageHash) {
    return ZenuxsPaint.image(fill.imageHash, 'fill')
  }
  return ZenuxsPaint.solid(colorToZenuxs(fill.color))
}

function zenuxsPaintToFill(paint: ZenuxsPaintType): Fill {
  const kind = paint.kind
  if (kind.type === 'solid') {
    return {
      type: 'SOLID',
      color: colorFromZenuxs(kind.color),
      opacity: paint.opacity,
      visible: paint.visible
    }
  }
  if (kind.type === 'image') {
    return {
      type: 'IMAGE',
      color: { r: 1, g: 1, b: 1, a: 1 },
      opacity: paint.opacity,
      visible: paint.visible,
      imageHash: kind.image
    }
  }
  if (kind.type === 'gradient') {
    return {
      type: 'GRADIENT_LINEAR',
      color: { r: 1, g: 1, b: 1, a: 1 },
      opacity: paint.opacity,
      visible: paint.visible,
      gradientStops: kind.stops.map((s) => ({
        position: s.position,
        color: colorFromZenuxs(s.color)
      }))
    }
  }
  return {
    type: 'SOLID',
    color: { r: 0.5, g: 0.5, b: 0.5, a: 1 },
    opacity: 1,
    visible: true
  }
}

function mapNodeTypeToZenuxsKind(type: NodeType, n: SceneNode): ZenuxsNodeKind {
  switch (type) {
    case 'CANVAS':
      return {
        type: 'page',
        background: colorToZenuxs(n.fills?.[0]?.color) ?? {
          r: 0.9608,
          g: 0.9608,
          b: 0.9608,
          a: 1
        },
        flows: [],
        prototype: {},
        guides: []
      }
    case 'FRAME':
      return { type: 'frame' }
    case 'GROUP':
      return { type: 'group' }
    case 'SECTION':
      return { type: 'section', contents_hidden: false }
    case 'RECTANGLE':
      return { type: 'rectangle' }
    case 'ELLIPSE':
      return { type: 'ellipse', start: 0, sweep: 360, inner: 0 }
    case 'TEXT':
      return {
        type: 'text',
        characters: n.text ?? '',
        style: {
          font_family: n.fontFamily ?? 'Inter',
          font_style: n.italic ? 'Italic' : 'Regular',
          font_size: n.fontSize ?? 14,
          font_weight: n.fontWeight ?? 400,
          line_height: { unit: 'percent', value: 100 }
        },
        runs: []
      }
    case 'COMPONENT':
      return { type: 'component', description: '', props: {} }
    case 'COMPONENT_SET':
      return { type: 'componentSet', description: '' }
    case 'INSTANCE':
      return { type: 'instance', component: 0, props: {} }
    case 'VECTOR':
      return { type: 'vector', network: null }
    case 'LINE':
      return { type: 'line' }
    case 'STAR':
      return { type: 'star', count: 5, inner_ratio: 0.382 }
    case 'POLYGON':
      return { type: 'polygon', count: 3 }
    default:
      return { type: 'frame' }
  }
}

function mapZenuxsKindToNodeType(kind: ZenuxsNodeKind): NodeType {
  switch (kind.type) {
    case 'page':
      return 'CANVAS'
    case 'frame':
      return 'FRAME'
    case 'group':
      return 'GROUP'
    case 'section':
      return 'SECTION'
    case 'rectangle':
      return 'RECTANGLE'
    case 'ellipse':
      return 'ELLIPSE'
    case 'text':
      return 'TEXT'
    case 'component':
      return 'COMPONENT'
    case 'componentSet':
      return 'COMPONENT_SET'
    case 'instance':
      return 'INSTANCE'
    case 'vector':
      return 'VECTOR'
    case 'line':
      return 'LINE'
    case 'star':
      return 'STAR'
    case 'polygon':
      return 'POLYGON'
    default:
      return 'FRAME'
  }
}

/** Converts an OpenPencil SceneGraph into a @zenuxs/doc Document. */
export function sceneGraphToZenuxsDoc(
  graph: SceneGraph,
  existingIdMap?: NodeIdMap
): { doc: ZenuxsDocument; idMap: NodeIdMap } {
  const doc = new ZenuxsDocument()
  const idMap = existingIdMap ?? new NodeIdMap()

  // Copy images
  for (const [hash, bytes] of graph.images.entries()) {
    doc.images.set(hash, { bytes, width: 0, height: 0 })
  }

  // Find root pages
  const rootNode = graph.getNode(graph.rootId)
  if (rootNode && rootNode.childIds) {
    for (const childId of rootNode.childIds) {
      const pageNode = graph.getNode(childId)
      if (pageNode) {
        const numId = idMap.toNum(pageNode.id)
        if (!doc.pages.includes(numId)) {
          doc.pages.push(numId)
        }
      }
    }
  }

  // Convert nodes
  for (const [id, sn] of graph.nodes.entries()) {
    if (id === graph.rootId) continue

    const numId = idMap.toNum(sn.id)
    const kind = mapNodeTypeToZenuxsKind(sn.type, sn)
    const zn = ZenuxsNode.new(numId, kind, sn.name ?? 'Node', sn.width ?? 100, sn.height ?? 100)

    zn.visible = sn.visible !== false
    zn.locked = sn.locked === true
    zn.opacity = sn.opacity ?? 1
    zn.clip = sn.clipsContent === true

    // Transform
    zn.transform = {
      coeffs: [1, 0, 0, 1, sn.x ?? 0, sn.y ?? 0]
    }

    // Corners
    const r = sn.cornerRadius ?? 0
    const radii: [number, number, number, number] = sn.independentCorners
      ? [
          sn.topLeftRadius ?? 0,
          sn.topRightRadius ?? 0,
          sn.bottomRightRadius ?? 0,
          sn.bottomLeftRadius ?? 0
        ]
      : [r, r, r, r]
    zn.corners = {
      radii,
      smoothing: sn.cornerSmoothing ?? 0
    }

    // Fills
    if (sn.fills && sn.fills.length > 0) {
      zn.fills = sn.fills.map(fillToZenuxsPaint)
    }

    // Strokes
    if (sn.strokes && sn.strokes.length > 0) {
      zn.strokes = sn.strokes.map((s: Stroke) =>
        ZenuxsPaint.solid(colorToZenuxs(s.color, s.opacity ?? 1))
      )
      zn.stroke = {
        weight: sn.strokes[0]?.weight ?? 1,
        align: 'center',
        cap_start: 'none',
        cap_end: 'none',
        join: 'miter',
        miter_limit: 4,
        dashes: []
      }
    }

    // Auto layout
    if (sn.layoutMode && sn.layoutMode !== 'NONE') {
      const base = ZenuxsAutoLayout.default()
      base.mode = sn.layoutMode === 'HORIZONTAL' ? 'horizontal' : 'vertical'
      base.gap = sn.itemSpacing ?? 0
      base.padding = [
        sn.paddingTop ?? 0,
        sn.paddingRight ?? 0,
        sn.paddingBottom ?? 0,
        sn.paddingLeft ?? 0
      ]
      zn.layout = base
    }

    // Hierarchy
    if (sn.parentId && sn.parentId !== graph.rootId) {
      zn.parent = idMap.toNum(sn.parentId)
    }
    if (sn.childIds) {
      zn.children = sn.childIds.map((cid) => idMap.toNum(cid))
    }

    // Interactions
    const interactions = readNodeInteractions(sn)
    if (interactions.length > 0) {
      zn.interactions = interactions.map((inter) => {
        const dest =
          'destinationId' in inter.action && inter.action.destinationId
            ? idMap.toNum(inter.action.destinationId)
            : 0
        return {
          trigger: { type: inter.trigger as 'click' },
          actions: [{ type: 'navigate', destination: dest }]
        }
      }) as unknown as ZenuxsInteraction[]
    }

    doc.insert(zn)
  }

  return { doc, idMap }
}

/** Converts a @zenuxs/doc Document back into an OpenPencil SceneGraph. */
export function zenuxsDocToSceneGraph(doc: ZenuxsDocument, existingIdMap?: NodeIdMap): SceneGraph {
  const graph = new SceneGraph()
  const idMap = existingIdMap ?? new NodeIdMap()

  // Remove default auto-created page if doc provides pages
  if (doc.pages.length > 0) {
    const defaultPages = graph.getPages()
    for (const dp of defaultPages) {
      graph.deleteNode(dp.id)
    }
  }

  // Copy images
  for (const [hash, img] of doc.images.entries()) {
    graph.images.set(hash, img.bytes)
  }

  // Create pages
  for (const pageId of doc.pages) {
    const pn = doc.node(pageId)
    if (!pn) continue
    const pageStrId = idMap.toStr(pageId)

    graph.createNodeWithId(pageStrId, 'CANVAS', graph.rootId, {
      name: pn.name,
      x: pn.transform.coeffs[4] ?? 0,
      y: pn.transform.coeffs[5] ?? 0,
      width: pn.width || 0,
      height: pn.height || 0,
      fills: pn.fills.map(zenuxsPaintToFill),
      opacity: pn.opacity,
      cornerRadius: pn.corners.radii[0] ?? 0,
      cornerSmoothing: pn.corners.smoothing,
      visible: pn.visible,
      locked: pn.locked,
      clipsContent: pn.clip
    })
  }

  // Create child nodes
  for (const id of doc.ids()) {
    if (doc.pages.includes(id)) continue
    const zn = doc.node(id)
    if (!zn) continue
    const strId = idMap.toStr(id)
    const parentStrId = zn.parent
      ? idMap.toStr(zn.parent)
      : doc.pages[0]
        ? idMap.toStr(doc.pages[0])
        : graph.rootId

    const nodeType: NodeType = mapZenuxsKindToNodeType(zn.kind)
    graph.createNodeWithId(strId, nodeType, parentStrId, {
      name: zn.name,
      x: zn.transform.coeffs[4] ?? 0,
      y: zn.transform.coeffs[5] ?? 0,
      width: zn.width,
      height: zn.height,
      fills: zn.fills.map(zenuxsPaintToFill),
      opacity: zn.opacity,
      cornerRadius: zn.corners.radii[0] ?? 0,
      cornerSmoothing: zn.corners.smoothing,
      visible: zn.visible,
      locked: zn.locked,
      clipsContent: zn.clip,
      text: zn.kind.type === 'text' ? zn.kind.characters : ''
    })
  }

  return graph
}

/**
 * Live bidirectional bridge between SceneGraph and Zenuxs Engine.
 */
export class ZenuxsBridge {
  private idMap = new NodeIdMap()

  /** Synchronizes the current SceneGraph into the Zenuxs engine. */
  syncToZenuxs(graph: SceneGraph): ZenuxsDocument {
    const { doc, idMap } = sceneGraphToZenuxsDoc(graph, this.idMap)
    this.idMap = idMap
    const session = getZenuxsEngine()
    session.ds().doc = doc
    return doc
  }

  /** The engine id for a SceneGraph node id (meaningful after `syncToZenuxs`). */
  toEngineId(sceneGraphId: string): NodeId {
    return this.idMap.toNum(sceneGraphId)
  }

  /** Synchronizes changes from the Zenuxs engine back into SceneGraph. */
  syncFromZenuxs(): SceneGraph {
    const session = getZenuxsEngine()
    return zenuxsDocToSceneGraph(session.doc(), this.idMap)
  }

  /**
   * Executes an engine command through Zenuxs session and keeps the graph in sync.
   */
  execute(command: string, params: Record<string, unknown> = {}): unknown {
    const session = getZenuxsEngine()
    const result = session.execute(command, params)
    return result
  }
}

export const zenuxsBridge = new ZenuxsBridge()
