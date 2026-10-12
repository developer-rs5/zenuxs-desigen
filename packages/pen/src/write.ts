import type {
  LayoutAlign,
  LayoutCounterAlign,
  LayoutSizing,
  SceneGraph,
  SceneNode,
  Variable,
  VariableCollection,
  VariableValue
} from '@open-pencil/scene-graph'
import { vectorNetworkToSVGPaths } from '@open-pencil/scene-graph/parse-path'

import { formatColor } from './color'
import type { PenDocument, PenNode, PenVariable } from './convert'

/**
 * SceneGraph → `.pen`, the inverse of `read.ts`.
 *
 * Contract:
 * - Node ids are written verbatim (`pen.id` is read back into `SceneNode.id`),
 *   so prototype references embedded in `pluginData` stay valid with no remap.
 * - `pluginData` entries pass through untouched on both `PenDocument`
 *   (prototype flows, applied to `graph.rootId` on read) and `PenNode`.
 * - Instance nodes serialize as `ref` without materialized children; their
 *   per-child property overrides become `descendants`, the inverse of
 *   `applyOverrideProps`.
 *
 * Fields the `.pen` reader cannot express (gradients, blur effects, dash
 * patterns, extra variable collections, multi-page structure, …) are omitted
 * rather than approximated; they are listed in the round-trip report and
 * pinned by `tests/engine/pen/roundtrip.test.ts`.
 */

/** Written for new files; the reader does not consult `version`. */
const PEN_FILE_VERSION = '2.8'

interface WriteContext {
  graph: SceneGraph
  /**
   * id → name for variables in the one collection a `.pen` file can carry.
   * Bindings outside it degrade to literal colors so no value goes black.
   */
  variableNames: Map<string, string>
  collection: VariableCollection | undefined
}

export function writePenFile(graph: SceneGraph): string {
  const ctx = createWriteContext(graph)
  const doc: PenDocument = { version: PEN_FILE_VERSION, children: [] }

  const themesAndVariables = writeVariables(ctx)
  if (themesAndVariables.themes) doc.themes = themesAndVariables.themes
  if (themesAndVariables.variables) doc.variables = themesAndVariables.variables

  const root = graph.getNode(graph.rootId)
  if (root && root.pluginData.length > 0) doc.pluginData = [...root.pluginData]

  let themeMarker = activeThemeName(ctx)
  // `.pen` has no page model: the reader builds one page from `doc.children`,
  // so every page's children are flattened here (page grouping is not
  // representable; node identity and content are preserved).
  for (const page of graph.getPages()) {
    for (const childId of page.childIds) {
      const node = graph.getNode(childId)
      if (!node) continue
      doc.children.push(writeNode(ctx, node, themeMarker))
      themeMarker = undefined
    }
  }

  return JSON.stringify(doc, null, 2)
}

function createWriteContext(graph: SceneGraph): WriteContext {
  const collection = [...graph.variableCollections.values()].at(0)
  const variableNames = new Map<string, string>()
  if (collection) {
    for (const variableId of collection.variableIds) {
      const variable = graph.variables.get(variableId)
      if (variable) variableNames.set(variable.id, variable.name)
    }
  }
  return { graph, variableNames, collection }
}

/**
 * The reader restores the active mode from a `theme` marker on a node, but
 * only the first written node matters — markers are applied in document order.
 */
function activeThemeName(ctx: WriteContext): string | undefined {
  const collection = ctx.collection
  if (collection === undefined) return undefined
  const firstMode = collection.modes.at(0)
  if (!firstMode) return undefined
  const activeModeId = ctx.graph.activeMode.get(collection.id)
  const active = collection.modes.find((mode) => mode.modeId === activeModeId)
  return active && active.modeId !== firstMode.modeId ? active.name : undefined
}

function writeVariables(ctx: WriteContext): {
  themes?: Record<string, string[]>
  variables?: Record<string, PenVariable>
} {
  const collection = ctx.collection
  if (!collection) return {}

  const variables: Record<string, PenVariable> = {}
  for (const variableId of collection.variableIds) {
    const variable = ctx.graph.variables.get(variableId)
    if (!variable) continue
    variables[variable.name] = writeVariable(ctx, collection, variable)
  }

  return {
    themes: { theme: collection.modes.map((mode) => mode.name) },
    variables: Object.keys(variables).length > 0 ? variables : undefined
  }
}

/** `.pen` variable type; STRING and BOOLEAN both serialize as `string`. */
function penVariableType(type: Variable['type']): PenVariable['type'] {
  if (type === 'COLOR') return 'color'
  if (type === 'FLOAT') return 'number'
  return 'string'
}

/** Fallback value for a variable with no authored mode entries. */
function emptyPenValue(type: PenVariable['type']): string | number {
  if (type === 'color') return '#000000'
  if (type === 'number') return 0
  return ''
}

function writeVariable(
  ctx: WriteContext,
  collection: VariableCollection,
  variable: Variable
): PenVariable {
  const type = penVariableType(variable.type)
  const entries = collection.modes.flatMap((mode) => {
    const value = modeValue(ctx, variable, mode.modeId)
    if (value === undefined) return []
    const penValue = toPenValue(ctx, value)
    return penValue === undefined ? [] : [{ modeName: mode.name, value: penValue }]
  })

  if (entries.length <= 1) {
    const only = entries.at(0)
    if (only) return { type, value: only.value }
    return { type, value: emptyPenValue(type) }
  }
  return {
    type,
    value: entries.map((entry) => ({
      value: entry.value,
      theme: { theme: entry.modeName }
    }))
  }
}

/** Aliases resolve to concrete values: `.pen` stores values, not references. */
function modeValue(
  ctx: WriteContext,
  variable: Variable,
  modeId: string
): VariableValue | undefined {
  const value = variable.valuesByMode[modeId]
  if (typeof value === 'object' && 'aliasId' in value) {
    return ctx.graph.resolveVariable(value.aliasId, modeId)
  }
  return value
}

function toPenValue(ctx: WriteContext, value: VariableValue): string | number | undefined {
  if (typeof value === 'number' || typeof value === 'string') return value
  if (typeof value === 'boolean') return String(value)
  if ('aliasId' in value) {
    const resolved = ctx.graph.resolveVariable(value.aliasId)
    return resolved === undefined ? undefined : toPenValue(ctx, resolved)
  }
  return formatColor(value)
}

function variableRef(ctx: WriteContext, node: SceneNode, field: string): string | undefined {
  const variableId = node.boundVariables[field]
  if (!variableId) return undefined
  const name = ctx.variableNames.get(variableId)
  return name === undefined ? undefined : `$${name}`
}

function penType(node: SceneNode): string {
  switch (node.type) {
    case 'RECTANGLE':
      return 'rectangle'
    case 'ELLIPSE':
      return 'ellipse'
    case 'TEXT':
      return 'text'
    case 'VECTOR':
      return 'path'
    case 'INSTANCE':
      return 'ref'
    default:
      return 'frame'
  }
}

function layoutToken(mode: SceneNode['layoutMode']): string {
  if (mode === 'HORIZONTAL') return 'horizontal'
  if (mode === 'VERTICAL') return 'vertical'
  return 'none'
}

function justifyToken(align: LayoutAlign): string {
  if (align === 'CENTER') return 'center'
  if (align === 'MAX') return 'end'
  if (align === 'SPACE_BETWEEN') return 'space-between'
  return 'start'
}

function alignToken(align: LayoutCounterAlign): string {
  if (align === 'CENTER') return 'center'
  if (align === 'MAX') return 'end'
  if (align === 'STRETCH') return 'stretch'
  // The reader has no baseline token; it reads unknown values as `start`.
  return 'start'
}

function ownSizing(node: SceneNode, axis: 'width' | 'height'): LayoutSizing {
  if (node.layoutMode === 'NONE') return 'FIXED'
  const primaryIsWidth = node.layoutMode === 'HORIZONTAL'
  const primary = primaryIsWidth ? node.primaryAxisSizing : node.counterAxisSizing
  const counter = primaryIsWidth ? node.counterAxisSizing : node.primaryAxisSizing
  return axis === 'width' ? primary : counter
}

/**
 * Omitted fields are how the reader derives `HUG`, so `HUG` writes nothing;
 * `FILL` keeps the laid-out size as the `fill_container(N)` fallback.
 */
function writeSize(node: SceneNode, axis: 'width' | 'height'): number | string | undefined {
  const sizing = ownSizing(node, axis)
  const value = axis === 'width' ? node.width : node.height
  if (sizing === 'HUG') return undefined
  if (sizing === 'FILL') return `fill_container(${value})`
  return value
}

function writePadding(node: SceneNode): NonNullable<PenNode['padding']> | undefined {
  const top = node.paddingTop
  const right = node.paddingRight
  const bottom = node.paddingBottom
  const left = node.paddingLeft
  if (top === 0 && right === 0 && bottom === 0 && left === 0) return undefined
  if (top === bottom && left === right) return top === left ? top : [top, left]
  return [top, right, bottom, left]
}

function writeFills(ctx: WriteContext, node: SceneNode): NonNullable<PenNode['fill']> {
  const entries = node.fills.map((fill, index) => ({
    ref: variableRef(ctx, node, `fills[${index}]`),
    // `.pen` carries one alpha (the color's); the renderer reads `fill.opacity`,
    // so the written alpha is the effective one.
    color: formatColor({ ...fill.color, a: fill.opacity }),
    enabled: fill.visible
  }))
  if (entries.length === 0) return []
  if (entries.length === 1) {
    const only = entries.at(0)
    if (!only) return []
    const color = only.ref ?? only.color
    return only.enabled ? color : { type: 'solid', color, enabled: false }
  }
  // Mixed string/array shapes are not representable; array form takes objects.
  return entries.map((entry) => ({
    type: 'solid',
    color: entry.ref ?? entry.color,
    enabled: entry.enabled
  }))
}

/** `.pen` stroke align; unknown runtime values degrade to `center`. */
function strokeAlign(align: 'INSIDE' | 'CENTER' | 'OUTSIDE'): 'inside' | 'center' | 'outside' {
  if (align === 'INSIDE') return 'inside'
  if (align === 'OUTSIDE') return 'outside'
  return 'center'
}

function writeStroke(
  ctx: WriteContext,
  node: SceneNode
): NonNullable<PenNode['stroke']> | undefined {
  const stroke = node.strokes.at(0)
  if (!stroke || !stroke.visible) return undefined
  const fill =
    variableRef(ctx, node, 'strokes[0]') ?? formatColor({ ...stroke.color, a: stroke.opacity })
  const thickness = node.independentStrokeWeights
    ? {
        top: node.borderTopWeight,
        right: node.borderRightWeight,
        bottom: node.borderBottomWeight,
        left: node.borderLeftWeight
      }
    : stroke.weight
  const result: NonNullable<PenNode['stroke']> = {
    align: strokeAlign(stroke.align),
    thickness,
    fill
  }
  // Widened copies keep the falsy runtime guard the raw truthiness check gave:
  // plugin-written values are not guaranteed to be schema literals.
  const join: string | undefined = node.strokeJoin
  if (join && join !== 'MITER') {
    result.join = join.toLowerCase()
  }
  const cap: string | undefined = node.strokeCap
  if (cap && cap !== 'NONE') {
    result.cap = cap.toLowerCase()
  }
  return result
}

/** Only shadows are expressible; the reader drops every other effect type. */
function writeEffects(node: SceneNode) {
  const effects = node.effects.flatMap((effect) => {
    if (effect.type !== 'DROP_SHADOW' && effect.type !== 'INNER_SHADOW') return []
    if (!effect.visible) return []
    return [
      {
        type: 'shadow',
        shadowType: effect.type === 'INNER_SHADOW' ? 'inner' : 'drop',
        color: formatColor(effect.color),
        offset: effect.offset,
        blur: effect.radius,
        spread: effect.spread
      }
    ]
  })
  return effects.length > 0 ? effects : []
}

function writeRadius(pen: PenNode, node: SceneNode): void {
  if (node.independentCorners) {
    pen.cornerRadius = [
      node.topLeftRadius,
      node.topRightRadius,
      node.bottomRightRadius,
      node.bottomLeftRadius
    ]
    return
  }
  if (node.cornerRadius !== 0) pen.cornerRadius = node.cornerRadius
}

function writeText(pen: PenNode, ctx: WriteContext, node: SceneNode): void {
  pen.content = node.text
  pen.fontFamily = variableRef(ctx, node, 'fontFamily') ?? node.fontFamily
  pen.fontSize = node.fontSize
  pen.fontWeight = node.fontWeight
  if (node.lineHeight !== null) pen.lineHeight = node.lineHeight
  if (node.letterSpacing !== 0) pen.letterSpacing = node.letterSpacing
  if (node.textAlignHorizontal !== 'LEFT') {
    pen.textAlign = node.textAlignHorizontal.toLowerCase()
  }
  if (node.textAlignVertical !== 'TOP') {
    pen.textAlignVertical = node.textAlignVertical.toLowerCase()
  }
  if (node.textAutoResize === 'HEIGHT') pen.textGrowth = 'fixed-width'
}

function writeGeometry(node: SceneNode): string | undefined {
  const network = node.vectorNetwork
  if (!network || network.vertices.length === 0) return undefined
  return vectorNetworkToSVGPaths(network, null).join('')
}

function fillsEqual(left: SceneNode['fills'], right: SceneNode['fills']): boolean {
  return JSON.stringify(left) === JSON.stringify(right)
}

/**
 * Inverse of `applyOverrideProps`: only the fields the reader can restore are
 * diffed against the component child, keyed by that child's id (ids are
 * verbatim in `.pen`, so the keys survive the round trip).
 */
function diffOverride(
  ctx: WriteContext,
  child: SceneNode,
  source: SceneNode
): Partial<PenNode> | undefined {
  const override: Partial<PenNode> = {}
  if (child.name !== source.name) override.name = child.name
  if (child.x !== source.x) override.x = child.x
  if (child.y !== source.y) override.y = child.y
  if (child.width !== source.width) override.width = child.width
  if (child.height !== source.height) override.height = child.height
  if (child.rotation !== source.rotation) override.rotation = child.rotation
  if (child.visible !== source.visible) override.enabled = child.visible
  if (child.text !== source.text) override.content = child.text
  if (!fillsEqual(child.fills, source.fills)) override.fill = writeFills(ctx, child)
  return Object.keys(override).length > 0 ? override : undefined
}

function writeDescendants(
  ctx: WriteContext,
  node: SceneNode
): Record<string, Partial<PenNode>> | undefined {
  if (node.type !== 'INSTANCE' || !node.componentId) return undefined
  const result: Record<string, Partial<PenNode>> = {}
  for (const childId of node.childIds) {
    const child = ctx.graph.getNode(childId)
    if (!child?.componentId) continue
    const source = ctx.graph.getNode(child.componentId)
    if (!source) continue
    const override = diffOverride(ctx, child, source)
    if (override) result[child.componentId] = override
  }
  return Object.keys(result).length > 0 ? result : undefined
}

// eslint-disable-next-line complexity -- one node maps onto many format fields
function writeNode(ctx: WriteContext, node: SceneNode, themeMarker?: string): PenNode {
  const pen: PenNode = {
    type: penType(node),
    id: node.id,
    name: node.name,
    x: node.x,
    y: node.y
  }
  if (themeMarker !== undefined) pen.theme = { theme: themeMarker }

  const width = writeSize(node, 'width')
  if (width !== undefined) pen.width = width
  const height = writeSize(node, 'height')
  if (height !== undefined) pen.height = height

  pen.layout = layoutToken(node.layoutMode)
  if (node.layoutMode !== 'NONE') {
    pen.justifyContent = justifyToken(node.primaryAxisAlign)
    pen.alignItems = alignToken(node.counterAxisAlign)
    pen.gap = node.itemSpacing
  }
  const padding = writePadding(node)
  if (padding !== undefined) pen.padding = padding

  if (node.opacity !== 1) pen.opacity = node.opacity
  if (!node.visible) pen.enabled = false
  if (node.rotation !== 0) pen.rotation = node.rotation
  if (node.flipX) pen.flipX = true
  if (node.flipY) pen.flipY = true
  if (node.clipsContent) pen.clip = true

  pen.fill = writeFills(ctx, node)
  const stroke = writeStroke(ctx, node)
  if (stroke) pen.stroke = stroke
  const effects = writeEffects(node)
  if (effects.length > 0) pen.effect = effects
  writeRadius(pen, node)

  if (node.type === 'TEXT') writeText(pen, ctx, node)
  if (node.type === 'VECTOR') {
    const geometry = writeGeometry(node)
    if (geometry !== undefined) pen.geometry = geometry
  }
  if (node.type === 'COMPONENT') pen.reusable = true
  if (node.type === 'INSTANCE') {
    if (node.componentId) pen.ref = node.componentId
    const descendants = writeDescendants(ctx, node)
    if (descendants) pen.descendants = descendants
  }
  if (node.pluginData.length > 0) pen.pluginData = [...node.pluginData]

  // Instance children are derived from the component on read, so they are
  // represented through `ref` + `descendants` instead of `children`.
  if (node.type !== 'INSTANCE' && node.childIds.length > 0) {
    const children: PenNode[] = []
    for (const childId of node.childIds) {
      const child = ctx.graph.getNode(childId)
      if (child) children.push(writeNode(ctx, child))
    }
    if (children.length > 0) pen.children = children
  }

  return pen
}
