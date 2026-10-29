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
  type NodeKind as ZenuxsNodeKind,
  type StrokeCap as ZenuxsStrokeCap,
  type StrokeJoin as ZenuxsStrokeJoin,
  type Transition as ZenuxsTransition,
  type VectorNetwork as ZenuxsVectorNetwork
} from '@zenuxs/doc'

import {
  readNodeInteractions,
  INTERACTIONS_PLUGIN_KEY,
  PROTOTYPE_PLUGIN_ID,
  SceneGraph,
  type Color,
  type Fill,
  type NodeType,
  type PluginDataEntry,
  type PrototypeInteraction,
  type PrototypeTransition,
  type SceneNode,
  type Stroke,
  type VectorNetwork as SceneGraphVectorNetwork
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

  /**
   * Pins `strId` to an id that already exists on the engine side, so a
   * round-trip can adopt engine-owned ids (for example the document's
   * built-in root page) instead of allocating a second, phantom one.
   */
  bind(strId: string, numId: NodeId): void {
    const previousStr = this.numToStr.get(numId)
    if (previousStr !== undefined && previousStr !== strId) this.strToNum.delete(previousStr)
    const previousNum = this.strToNum.get(strId)
    if (previousNum !== undefined && previousNum !== numId) this.numToStr.delete(previousNum)
    this.strToNum.set(strId, numId)
    this.numToStr.set(numId, strId)
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

const zenuxsCapsToSceneGraph: Record<ZenuxsStrokeCap, string> = {
  none: 'NONE',
  round: 'ROUND',
  square: 'SQUARE',
  arrowLines: 'ARROW_LINES',
  arrowTriangle: 'ARROW_EQUILATERAL',
  arrowStick: 'ARROW_STICK',
  lineArrow: 'LINE_ARROW',
  ring: 'RING'
}

const sceneGraphCapsToZenuxs: Record<string, ZenuxsStrokeCap> = {
  NONE: 'none',
  ROUND: 'round',
  SQUARE: 'square',
  ARROW_LINES: 'arrowLines',
  ARROW_EQUILATERAL: 'arrowTriangle',
  ARROW_STICK: 'arrowStick',
  LINE_ARROW: 'lineArrow',
  RING: 'ring'
}

const zenuxsJoinsToSceneGraph: Record<ZenuxsStrokeJoin, string> = {
  miter: 'MITER',
  bevel: 'BEVEL',
  round: 'ROUND'
}

const sceneGraphJoinsToZenuxs: Record<string, ZenuxsStrokeJoin> = {
  MITER: 'miter',
  BEVEL: 'bevel',
  ROUND: 'round'
}

function sceneMirrorToZenuxs(
  mirror: SceneGraphVectorNetwork['vertices'][number]['handleMirroring']
): ZenuxsVectorNetwork['vertices'][number]['mirror'] {
  switch (mirror) {
    case 'ANGLE':
      return 'angle'
    case 'ANGLE_AND_LENGTH':
      return 'angleAndLength'
    case 'NONE':
      return 'none'
    default:
      return undefined
  }
}

function zenuxsMirrorToScene(
  mirror: ZenuxsVectorNetwork['vertices'][number]['mirror']
): SceneGraphVectorNetwork['vertices'][number]['handleMirroring'] {
  switch (mirror) {
    case 'angle':
      return 'ANGLE'
    case 'angleAndLength':
      return 'ANGLE_AND_LENGTH'
    case 'none':
      return 'NONE'
    default:
      return undefined
  }
}

function prototypeDirectionToZenuxs(
  direction: 'left' | 'right' | 'up' | 'down'
): 'left' | 'right' | 'top' | 'bottom' {
  switch (direction) {
    case 'up':
      return 'top'
    case 'down':
      return 'bottom'
    default:
      return direction
  }
}

function zenuxsDirectionToPrototype(
  direction: 'left' | 'right' | 'top' | 'bottom'
): 'left' | 'right' | 'up' | 'down' {
  switch (direction) {
    case 'top':
      return 'up'
    case 'bottom':
      return 'down'
    default:
      return direction
  }
}

function vectorNetworkToZenuxs(
  network: SceneGraphVectorNetwork | null
): ZenuxsVectorNetwork | null {
  if (!network) return null
  return {
    vertices: network.vertices.map((vertex) => {
      const cap = vertex.strokeCap ? sceneGraphCapsToZenuxs[vertex.strokeCap] : undefined
      if (vertex.strokeCap && !cap) {
        throw new Error(`unsupported vector vertex cap "${vertex.strokeCap}"`)
      }
      const join = vertex.strokeJoin ? sceneGraphJoinsToZenuxs[vertex.strokeJoin] : undefined
      if (vertex.strokeJoin && !join) {
        throw new Error(`unsupported vector vertex join "${vertex.strokeJoin}"`)
      }
      const mappedVertex: ZenuxsVectorNetwork['vertices'][number] = {
        x: vertex.x,
        y: vertex.y,
        radius: vertex.cornerRadius ?? 0
      }
      const mirror = sceneMirrorToZenuxs(vertex.handleMirroring)
      if (mirror !== undefined) mappedVertex.mirror = mirror
      if (cap !== undefined) mappedVertex.cap = cap
      if (join !== undefined) mappedVertex.join = join
      return mappedVertex
    }),
    segments: network.segments.map((segment) => ({
      a: segment.start,
      b: segment.end,
      ta: [segment.tangentStart.x, segment.tangentStart.y],
      tb: [segment.tangentEnd.x, segment.tangentEnd.y]
    })),
    regions: network.regions.map((region) => ({
      loops: region.loops.map((loop) => [...loop]),
      winding: region.windingRule === 'EVENODD' ? 'evenOdd' : 'nonZero'
    }))
  }
}

function vectorNetworkFromZenuxs(network: unknown): SceneGraphVectorNetwork | null {
  if (network === null || network === undefined) return null
  const vectorNetwork = network as ZenuxsVectorNetwork
  return {
    vertices: vectorNetwork.vertices.map((vertex) => {
      const mappedVertex: SceneGraphVectorNetwork['vertices'][number] = {
        x: vertex.x,
        y: vertex.y,
        cornerRadius: vertex.radius
      }
      const mirror = zenuxsMirrorToScene(vertex.mirror)
      if (mirror !== undefined) mappedVertex.handleMirroring = mirror
      if (vertex.cap !== undefined && vertex.cap !== null) {
        mappedVertex.strokeCap = zenuxsCapsToSceneGraph[vertex.cap]
      }
      if (vertex.join !== undefined && vertex.join !== null) {
        mappedVertex.strokeJoin = zenuxsJoinsToSceneGraph[vertex.join]
      }
      return mappedVertex
    }),
    segments: vectorNetwork.segments.map((segment) => ({
      start: segment.a,
      end: segment.b,
      tangentStart: { x: segment.ta[0], y: segment.ta[1] },
      tangentEnd: { x: segment.tb[0], y: segment.tb[1] }
    })),
    regions: vectorNetwork.regions.map((region) => ({
      loops: region.loops.map((loop) => [...loop]),
      windingRule: region.winding === 'evenOdd' ? 'EVENODD' : 'NONZERO'
    }))
  }
}

function prototypeTransitionToZenuxs(transition: PrototypeTransition): {
  transition: ZenuxsTransition
  durationMs?: number
} {
  if ('easing' in transition && transition.easing !== undefined) {
    throw new Error('unsupported prototype transition easing')
  }
  switch (transition.kind) {
    case 'instant':
      return { transition: { type: 'instant' } }
    case 'dissolve':
    case 'smartAnimate':
      return { transition: { type: transition.kind }, durationMs: transition.durationMs }
    case 'moveIn':
    case 'moveOut':
    case 'push':
    case 'slideIn':
    case 'slideOut':
      return {
        transition: {
          type: transition.kind,
          direction: prototypeDirectionToZenuxs(transition.direction)
        },
        durationMs: transition.durationMs
      }
    case 'fade':
    case 'slide':
    case 'spring':
      throw new Error(`unsupported prototype transition "${transition.kind}"`)
    default:
      throw new Error('unsupported prototype transition')
  }
}

function prototypeInteractionToZenuxs(
  interaction: PrototypeInteraction,
  idMap: NodeIdMap
): ZenuxsInteraction {
  if (interaction.guard) throw new Error('unsupported prototype interaction guard')
  if (interaction.trigger !== 'click') {
    throw new Error(`unsupported prototype trigger "${interaction.trigger}"`)
  }
  if (interaction.delayMs !== undefined) {
    throw new Error('unsupported prototype interaction delay')
  }
  if (interaction.action.type !== 'navigate') {
    throw new Error(`unsupported prototype action "${interaction.action.type}"`)
  }

  const mappedTransition = interaction.transition
    ? prototypeTransitionToZenuxs(interaction.transition)
    : undefined
  const action: ZenuxsInteraction['actions'][number] = {
    type: 'navigate',
    dest: idMap.toNum(interaction.action.destinationId)
  }
  if (interaction.action.preserveScroll !== undefined) {
    action.preserve_scroll = interaction.action.preserveScroll
  }
  const mappedInteraction: ZenuxsInteraction = {
    trigger: { type: 'onClick' },
    actions: [action]
  }
  if (mappedTransition) {
    mappedInteraction.transition = mappedTransition.transition
    if (mappedTransition.durationMs !== undefined) {
      mappedInteraction.duration_ms = mappedTransition.durationMs
    }
  }
  return mappedInteraction
}

function zenuxsTransitionToPrototype(
  interaction: ZenuxsInteraction
): PrototypeTransition | undefined {
  const transition = interaction.transition
  if (!transition) {
    return undefined
  }
  if (interaction.easing !== undefined) throw new Error('unsupported Zenuxs transition easing')
  if (transition.type === 'instant') return { kind: 'instant' }
  const durationMs = interaction.duration_ms ?? 300
  switch (transition.type) {
    case 'dissolve':
    case 'smartAnimate': {
      return {
        kind: transition.type,
        durationMs
      }
    }
    case 'moveIn':
    case 'moveOut':
    case 'push':
    case 'slideIn':
    case 'slideOut': {
      return {
        kind: transition.type,
        direction: zenuxsDirectionToPrototype(transition.direction),
        durationMs
      }
    }
    default:
      throw new Error('unsupported Zenuxs transition')
  }
}

function zenuxsInteractionToPrototype(
  interaction: ZenuxsInteraction,
  index: number,
  ownerId: string,
  idMap: NodeIdMap
): PrototypeInteraction {
  if (interaction.actions.length !== 1) {
    throw new Error('unsupported Zenuxs interaction with multiple actions')
  }
  const [action] = interaction.actions
  if (action.type !== 'navigate') {
    throw new Error(`unsupported Zenuxs action "${action.type}"`)
  }
  if (interaction.trigger.type !== 'onClick') {
    throw new Error(`unsupported Zenuxs trigger "${interaction.trigger.type}"`)
  }
  if (interaction.delay_ms !== undefined) {
    throw new Error('unsupported Zenuxs interaction delay')
  }
  const mappedAction: PrototypeInteraction['action'] = {
    type: 'navigate',
    destinationId: idMap.toStr(action.dest)
  }
  if (action.preserve_scroll !== undefined) {
    mappedAction.preserveScroll = action.preserve_scroll
  }
  const mappedInteraction: PrototypeInteraction = {
    id: `${ownerId}:${index}`,
    trigger: 'click',
    action: mappedAction
  }
  const transition = zenuxsTransitionToPrototype(interaction)
  if (transition !== undefined) mappedInteraction.transition = transition
  return mappedInteraction
}

function pluginDataWithInteractions(
  existing: PluginDataEntry[],
  interactions: ZenuxsInteraction[],
  ownerId: string,
  idMap: NodeIdMap
): PluginDataEntry[] {
  const pluginData = existing.filter(
    (entry) => entry.pluginId !== PROTOTYPE_PLUGIN_ID || entry.key !== INTERACTIONS_PLUGIN_KEY
  )
  if (interactions.length > 0) {
    pluginData.push({
      pluginId: PROTOTYPE_PLUGIN_ID,
      key: INTERACTIONS_PLUGIN_KEY,
      value: JSON.stringify(
        interactions.map((interaction, index) =>
          zenuxsInteractionToPrototype(interaction, index, ownerId, idMap)
        )
      )
    })
  }
  return pluginData
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
      return { type: 'vector', network: vectorNetworkToZenuxs(n.vectorNetwork) }
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

  // Find root pages. A fresh engine document ships with its own root page; the
  // graph owns the real ones, so adopt the graph's pages instead of keeping
  // both (otherwise every command targets a page that has no canvas).
  const rootNode = graph.getNode(graph.rootId)
  const graphPages = (rootNode?.childIds ?? [])
    .map((childId) => graph.getNode(childId))
    .filter((pageNode): pageNode is SceneNode => pageNode?.type === 'CANVAS')

  if (graphPages.length > 0) {
    const placeholders = [...doc.pages]
    doc.pages = []
    for (const placeholder of placeholders) doc.delete(placeholder)

    for (const pageNode of graphPages) {
      const numId = idMap.toNum(pageNode.id)
      if (!doc.pages.includes(numId)) doc.pages.push(numId)
    }
    doc.current_page = doc.pages[0] ?? null
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
      zn.interactions = interactions.map((interaction) =>
        prototypeInteractionToZenuxs(interaction, idMap)
      )
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
      clipsContent: pn.clip,
      pluginData: pluginDataWithInteractions([], pn.interactions, pageStrId, idMap)
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
      text: zn.kind.type === 'text' ? zn.kind.characters : '',
      ...(zn.kind.type === 'vector'
        ? { vectorNetwork: vectorNetworkFromZenuxs(zn.kind.network) }
        : {}),
      pluginData: pluginDataWithInteractions([], zn.interactions, strId, idMap)
    })
  }

  return graph
}

/** Fields the bridge carries from a Zenuxs node back into a SceneNode. */
function engineNodeFields(
  zn: ZenuxsNode,
  existing: SceneNode | undefined,
  idMap: NodeIdMap
): Partial<SceneNode> {
  const fields: Partial<SceneNode> = {
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
    pluginData: pluginDataWithInteractions(
      existing?.pluginData ?? [],
      zn.interactions,
      idMap.toStr(zn.id),
      idMap
    )
  }
  if (zn.kind.type === 'text') fields.text = zn.kind.characters
  if (zn.kind.type === 'vector') fields.vectorNetwork = vectorNetworkFromZenuxs(zn.kind.network)
  return fields
}

function sameFieldValue(a: unknown, b: unknown): boolean {
  if (a === b) return true
  if (typeof a === 'object' && typeof b === 'object' && a !== null && b !== null) {
    return JSON.stringify(a) === JSON.stringify(b)
  }
  return false
}

function changedFields(
  current: Partial<SceneNode>,
  next: Partial<SceneNode>
): Partial<SceneNode> | null {
  const changes: Record<string, unknown> = {}
  let any = false
  for (const [key, value] of Object.entries(next)) {
    if (!sameFieldValue((current as Record<string, unknown>)[key], value)) {
      changes[key] = value
      any = true
    }
  }
  return any ? (changes as Partial<SceneNode>) : null
}

/** SceneNode overrides for recreating a node without touching identity or order. */
function nodeOverrides(node: SceneNode): Partial<SceneNode> {
  const { id: _id, parentId: _parentId, childIds: _childIds, ...rest } = node
  return rest
}

function collectSubtree(graph: SceneGraph, id: string, out: SceneNode[]): void {
  const node = graph.getNode(id)
  if (!node) return
  out.push(structuredClone(node))
  for (const childId of node.childIds) collectSubtree(graph, childId, out)
}

/** A single engine-sourced property change, with both sides for undo/redo. */
export interface EngineFieldChange {
  id: string
  before: Partial<SceneNode>
  after: Partial<SceneNode>
}

export interface EngineParentMove {
  id: string
  before: string
  after: string
}

export interface EngineCreatedNode {
  parentId: string
  node: SceneNode
}

export interface EngineDeletedSubtree {
  parentId: string
  nodes: SceneNode[]
}

/** Everything a plugin run changed in the live graph, invertible as one undo step. */
export interface EngineGraphPatch {
  changed: boolean
  fieldChanges: EngineFieldChange[]
  parentMoves: EngineParentMove[]
  created: EngineCreatedNode[]
  deleted: EngineDeletedSubtree[]
}

export function emptyEngineGraphPatch(): EngineGraphPatch {
  return { changed: false, fieldChanges: [], parentMoves: [], created: [], deleted: [] }
}

interface EngineEntry {
  id: string
  node: ZenuxsNode
  parentId: string
  depth: number
}

function engineEntries(doc: ZenuxsDocument, idMap: NodeIdMap): EngineEntry[] {
  const depths = new Map<number, number>()
  const depthOf = (id: number): number => {
    const cached = depths.get(id)
    if (cached !== undefined) return cached
    const zn = doc.node(id)
    if (!zn || !zn.parent) {
      depths.set(id, 0)
      return 0
    }
    const depth = depthOf(zn.parent) + 1
    depths.set(id, depth)
    return depth
  }

  const entries: EngineEntry[] = []
  for (const pageId of doc.pages) {
    const node = doc.node(pageId)
    if (!node) continue
    entries.push({ id: idMap.toStr(pageId), node, parentId: doc.pages[0] ? '' : '', depth: 0 })
  }
  for (const pageId of doc.pages) {
    const node = doc.node(pageId)
    if (!node) continue
    const entry = entries.find((candidate) => candidate.node === node)
    if (entry) entry.parentId = ''
  }

  for (const id of doc.ids()) {
    if (doc.pages.includes(id)) continue
    const node = doc.node(id)
    if (!node) continue
    const parentId = node.parent ? idMap.toStr(node.parent) : ''
    entries.push({ id: idMap.toStr(id), node, parentId, depth: depthOf(id) })
  }
  return entries
}

/**
 * Applies the engine document (as mutated by a plugin run) back onto the live
 * SceneGraph. Only the fields the bridge carries are compared, so strokes,
 * effects, vectors and other OpenPencil-only data survive untouched.
 */
export function applyEngineDocToGraph(
  graph: SceneGraph,
  doc: ZenuxsDocument,
  idMap: NodeIdMap,
  syncedIds: Iterable<string> = graph.nodes.keys()
): EngineGraphPatch {
  const patch = emptyEngineGraphPatch()
  const entries = engineEntries(doc, idMap)
  const engineIds = new Set(entries.map((entry) => entry.id))
  const pageIds = new Set(doc.pages.map((pageId) => idMap.toStr(pageId)))
  const before = new Set(syncedIds)

  const ordered = [...entries].sort((a, b) => a.depth - b.depth)

  for (const entry of ordered) {
    const parentId = entry.parentId || graph.rootId
    const existing = graph.getNode(entry.id)
    const isPage = pageIds.has(entry.id)
    const type = isPage ? 'CANVAS' : mapZenuxsKindToNodeType(entry.node.kind)
    const fields = engineNodeFields(entry.node, existing, idMap)

    if (!existing) {
      const created = graph.createNodeWithId(entry.id, type, parentId, fields)
      patch.created.push({ parentId, node: structuredClone(created) })
      patch.changed = true
      continue
    }

    const changes = changedFields(existing, fields)
    if (changes) {
      // `updateNode` mutates the live node in place, so the "before" side has
      // to be read first or the undo entry would record the new values.
      const existingRecord = existing as unknown as Record<string, unknown>
      const beforeFields = Object.fromEntries(
        Object.keys(changes).map((key) => [key, existingRecord[key]])
      ) as Partial<SceneNode>
      graph.updateNode(entry.id, changes)
      patch.fieldChanges.push({ id: entry.id, before: beforeFields, after: changes })
      patch.changed = true
    }

    const currentParent = existing.parentId ?? graph.rootId
    if (currentParent !== parentId && graph.getNode(parentId)) {
      graph.reparentNode(entry.id, parentId)
      patch.parentMoves.push({ id: entry.id, before: currentParent, after: parentId })
      patch.changed = true
    }
  }

  const deletedRoots = [...before].filter((id) => {
    if (id === graph.rootId || engineIds.has(id)) return false
    const node = graph.getNode(id)
    if (!node || node.type === 'CANVAS') return false
    const parentId = node.parentId
    return !parentId || !before.has(parentId) || engineIds.has(parentId)
  })

  for (const id of deletedRoots) {
    const node = graph.getNode(id)
    if (!node) continue
    const nodes: SceneNode[] = []
    collectSubtree(graph, id, nodes)
    patch.deleted.push({ parentId: node.parentId ?? graph.rootId, nodes })
    graph.deleteNode(id)
    patch.changed = true
  }

  return patch
}

/** Reverts a plugin patch, restoring every node and property it touched. */
export function revertEnginePatch(graph: SceneGraph, patch: EngineGraphPatch): void {
  for (const created of patch.created) {
    if (graph.getNode(created.node.id)) graph.deleteNode(created.node.id)
  }

  for (const fieldChange of patch.fieldChanges) {
    if (graph.getNode(fieldChange.id)) graph.updateNode(fieldChange.id, fieldChange.before)
  }

  for (const move of patch.parentMoves) {
    if (graph.getNode(move.id) && graph.getNode(move.before)) {
      graph.reparentNode(move.id, move.before)
    }
  }

  for (const subtree of patch.deleted) {
    for (const node of subtree.nodes) {
      const parentId =
        node.parentId && graph.getNode(node.parentId) ? node.parentId : subtree.parentId
      if (graph.getNode(node.id) || !graph.getNode(parentId)) continue
      graph.createNodeWithId(node.id, node.type, parentId, nodeOverrides(node))
    }
  }
}

/** Re-applies a plugin patch for redo. */
export function reapplyEnginePatch(graph: SceneGraph, patch: EngineGraphPatch): void {
  for (const created of patch.created) {
    if (graph.getNode(created.node.id)) continue
    const declaredParent = created.node.parentId
    const parentId = declaredParent && graph.getNode(declaredParent) ? declaredParent : graph.rootId
    graph.createNodeWithId(
      created.node.id,
      created.node.type,
      parentId,
      nodeOverrides(created.node)
    )
  }

  for (const fieldChange of patch.fieldChanges) {
    if (graph.getNode(fieldChange.id)) graph.updateNode(fieldChange.id, fieldChange.after)
  }

  for (const move of patch.parentMoves) {
    if (graph.getNode(move.id) && graph.getNode(move.after)) {
      graph.reparentNode(move.id, move.after)
    }
  }

  for (const subtree of patch.deleted) {
    const root = subtree.nodes[0]
    if (!root) continue
    // Recreate the subtree when it is absent (a redo without a preceding
    // revert), then remove it again from its recorded root.
    for (const node of subtree.nodes) {
      if (graph.getNode(node.id)) continue
      const parentId =
        node.parentId && graph.getNode(node.parentId) ? node.parentId : subtree.parentId
      graph.createNodeWithId(node.id, node.type, parentId, nodeOverrides(node))
    }
    if (graph.getNode(root.id)) graph.deleteNode(root.id)
  }
}

/**
 * Live bidirectional bridge between SceneGraph and Zenuxs Engine.
 */
export class ZenuxsBridge {
  private idMap = new NodeIdMap()
  private syncedIds: Set<string> | null = null

  /** Synchronizes the current SceneGraph into the Zenuxs engine. */
  syncToZenuxs(graph: SceneGraph, currentPageId?: string): ZenuxsDocument {
    const { doc, idMap } = sceneGraphToZenuxsDoc(graph, this.idMap)
    this.idMap = idMap
    this.syncedIds = new Set(graph.nodes.keys())
    // Engine-allocated ids must not collide with the ids the graph already owns.
    let highest = 0
    for (const id of doc.ids()) highest = Math.max(highest, id)
    doc.next_id.next = Math.max(doc.next_id.next, highest + 1)
    const session = getZenuxsEngine()
    const state = session.ds()
    state.doc = doc
    // Commands insert into `ds.page`, so it has to be the page the user sees.
    const activePage =
      currentPageId && idMap.hasStr(currentPageId) ? idMap.toNum(currentPageId) : doc.pages[0]
    if (activePage !== undefined) state.page = activePage
    state.selection = []
    return doc
  }

  /**
   * Writes engine-side mutations (for example a plugin run) back to the live
   * graph and returns an invertible patch for the caller's undo stack.
   */
  applyEngineChanges(graph: SceneGraph): EngineGraphPatch {
    const session = getZenuxsEngine()
    const patch = applyEngineDocToGraph(
      graph,
      session.doc(),
      this.idMap,
      this.syncedIds ?? graph.nodes.keys()
    )
    this.syncedIds = null
    return patch
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
