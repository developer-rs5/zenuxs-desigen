/**
 * ZenuxsDesign nodes: one struct with the properties every node can have, and
 * a kind with per-type data. (Converted 1:1 from FigCraft
 * `crates/doc/src/node.rs`; serde `skip_serializing_if` becomes omitted keys
 * reproduced by `omitNodeDefaults`.)
 */

import type { Color, Paint, BlendMode } from '@zenuxs/color'
import { RectMath, transform_rect_bbox, type Affine, type Rect as GeomRect } from '@zenuxs/geom'

import {
  ChildLayout,
  Effect,
  SPREAD_MITER_LIMIT,
  StrokeCap,
  StrokeProps,
  type Corners,
  type Constraints,
  type AutoLayout,
  type LayoutGrid,
  type ExportSetting
} from './props'
import type { Interaction, Overflow, ScrollPosition } from './proto'
import { TextData, textOf, type TextKind } from './text'

export type { Overflow, ScrollPosition }
import type { NodeId } from './ids'
export type { NodeId }

/** Boolean operation of a boolean group. */
export type BoolOp = 'union' | 'subtract' | 'intersect' | 'exclude'

export const BoolOp = {
  label(op: BoolOp): string {
    return op === 'union'
      ? 'Union'
      : op === 'subtract'
        ? 'Subtract'
        : op === 'intersect'
          ? 'Intersect'
          : 'Exclude'
  },
  default(): BoolOp {
    return 'union'
  }
}

/** A component property definition (serde `tag = "type"`). */
export type PropDef =
  | { type: 'boolean'; default: boolean }
  | { type: 'text'; default: string }
  | { type: 'instanceSwap'; default: NodeId; preferred?: NodeId[] }
  | { type: 'variant'; options: string[]; default: string }
  | { type: 'slot'; preferred?: NodeId[] }

/** What a node is, with per-type data (serde `tag = "type"`, camelCase). */
export type NodeKind =
  | { type: 'page'; background: Color; flows: unknown[]; prototype: unknown; guides: Guide[] }
  | { type: 'frame' }
  | { type: 'group' }
  | { type: 'section'; contents_hidden: boolean }
  | { type: 'rectangle' }
  | { type: 'ellipse'; start: number; sweep: number; inner: number }
  | { type: 'polygon'; count: number }
  | { type: 'star'; count: number; inner_ratio: number }
  | { type: 'line' }
  | { type: 'vector'; network: unknown }
  | { type: 'text'; characters: string; style: unknown; runs: unknown[]; [k: string]: unknown }
  | { type: 'booleanOp'; op: BoolOp }
  | { type: 'component'; description: string; props: Record<string, PropDef> }
  | { type: 'componentSet'; description: string }
  | { type: 'instance'; component: NodeId; props: Record<string, unknown> }
  | { type: 'slice' }

/** How a mask masks. */
export type MaskType = 'alpha' | 'vector' | 'luminance'

export const MaskType = {
  isAlpha(m: MaskType): boolean {
    return m === 'alpha'
  },
  default(): MaskType {
    return 'alpha'
  }
}

/** Handoff status of a frame or section. */
export type DevStatus = 'none' | 'readyForDev' | 'completed'

export const DevStatus = {
  isNone(d: DevStatus): boolean {
    return d === 'none'
  },
  default(): DevStatus {
    return 'none'
  }
}

/** A canvas annotation. */
export interface Annotation {
  label: string
  properties: string[]
  category?: string
}

/** A code component link. */
export interface CodeLink {
  language: string
  import_path: string
  name: string
  template: string
}

/** A dev resource link. */
export interface DevResource {
  url: string
  name: string
}

/** A ruler guide (vertical or horizontal, at `offset`). */
export interface Guide {
  vertical: boolean
  offset: number
}

/** Prototype overflow and scroll behaviour (re-exported types from proto). */

/** One node of the scene graph. Fields at their default value are omitted from JSON. */
export interface Node {
  id: NodeId
  name: string
  kind: NodeKind
  parent?: NodeId | null
  children: NodeId[]
  visible: boolean
  locked: boolean
  opacity: number
  blend: BlendMode
  /** Transform relative to the parent (the page for top-level nodes). */
  transform: Affine
  width: number
  height: number
  fills: Paint[]
  strokes: Paint[]
  stroke: StrokeProps
  effects: unknown[]
  corners: Corners
  constraints: Constraints
  /** Auto layout (frame-like nodes only). */
  layout: AutoLayout | null
  child_layout: ChildLayout
  /** Clip content (frames). */
  clip: boolean
  /** This node masks the siblings above it. */
  is_mask: boolean
  mask_type: MaskType
  grids: LayoutGrid[]
  guides: Guide[]
  exports: ExportSetting[]
  interactions: Interaction[]
  overflow: Overflow
  scroll_position: ScrollPosition
  styles: Record<string, string>
  /** Variable bindings: field name → variable id. */
  bound: Record<string, string>
  /** Explicit variable modes (collection → mode) set on this container. */
  var_modes: Record<string, string>
  /** In a boolean group: how this operand combines with the operands below it. */
  bool_op: BoolOp | null
  /** Lock aspect ratio when resizing from the panel. */
  constrain_proportions: boolean
  /** Inside an instance: the node of the main component this one mirrors. */
  source: NodeId | null
  /** A nested instance whose properties show on the main's instances. */
  exposed: boolean
  dev_status: DevStatus
  dev_changed: boolean
  dev_note: string
  /** Inside an instance: property groups overridden locally. */
  overrides: Set<string>
  /** Component property references. */
  prop_refs: Record<string, string>
  /** Free-form plugin / agent data. */
  plugin_data: Record<string, string>
  annotations: Annotation[]
  code_links: CodeLink[]
  dev_resources: DevResource[]
}

export const Node = {
  /** A node with Figma's defaults for its kind. */
  new(id: NodeId, kind: NodeKind, name: string, width: number, height: number): Node {
    const fills: Paint[] = kind.type === 'frame' || kind.type === 'component' ? [] : []
    return {
      id,
      name,
      kind,
      parent: null,
      children: [],
      visible: true,
      locked: false,
      opacity: 1,
      blend: 'passThrough',
      transform: { coeffs: [1, 0, 0, 1, 0, 0] },
      width,
      height,
      fills,
      strokes: [],
      stroke: {
        weight: 1,
        align: kind.type === 'line' || kind.type === 'vector' ? 'center' : 'outside',
        cap_start: 'none',
        cap_end: 'none',
        join: 'miter',
        miter_limit: 4,
        dashes: []
      },
      effects: [],
      corners: { radii: [0, 0, 0, 0], smoothing: 0 },
      constraints: { horizontal: 'left', vertical: 'top' },
      layout: null,
      child_layout: {
        sizing_h: 'fixed',
        sizing_v: 'fixed',
        absolute: false,
        min_w: null,
        max_w: null,
        min_h: null,
        max_h: null,
        grid_column: null,
        grid_row: null,
        grid_column_span: 0,
        grid_row_span: 0,
        grid_align_h: null,
        grid_align_v: null
      },
      clip: false,
      is_mask: false,
      mask_type: 'alpha',
      grids: [],
      guides: [],
      exports: [],
      interactions: [],
      overflow: 'none',
      scroll_position: 'scrolls',
      styles: {},
      bound: {},
      var_modes: {},
      bool_op: null,
      constrain_proportions: false,
      source: null,
      exposed: false,
      dev_status: 'none',
      dev_changed: false,
      dev_note: '',
      overrides: new Set(),
      prop_refs: {},
      plugin_data: {},
      annotations: [],
      code_links: [],
      dev_resources: []
    }
  },

  type_name(kind: NodeKind): string {
    return kind.type
  },

  is_frame_like(kind: NodeKind): boolean {
    return (
      kind.type === 'frame' ||
      kind.type === 'component' ||
      kind.type === 'componentSet' ||
      kind.type === 'instance'
    )
  },

  is_container(kind: NodeKind): boolean {
    return (
      Node.is_frame_like(kind) ||
      kind.type === 'page' ||
      kind.type === 'group' ||
      kind.type === 'booleanOp' ||
      kind.type === 'section'
    )
  },

  bounds_follow_children(kind: NodeKind): boolean {
    return kind.type === 'group' || kind.type === 'booleanOp'
  },

  is_shape(kind: NodeKind): boolean {
    return (
      kind.type === 'rectangle' ||
      kind.type === 'ellipse' ||
      kind.type === 'polygon' ||
      kind.type === 'star' ||
      kind.type === 'line' ||
      kind.type === 'vector'
    )
  },

  has_corner_radius(kind: NodeKind): boolean {
    return (
      Node.is_shape(kind) ||
      kind.type === 'frame' ||
      kind.type === 'component' ||
      kind.type === 'instance' ||
      kind.type === 'section'
    )
  },

  has_independent_corners(kind: NodeKind): boolean {
    return (
      Node.has_corner_radius(kind) &&
      !(kind.type === 'polygon' || kind.type === 'star' || kind.type === 'vector')
    )
  },

  is_page(n: Node): boolean {
    return n.kind.type === 'page'
  },

  /** Whether painted strokes are present. */
  has_visible_stroke(n: Node): boolean {
    return n.strokes.some((p) => p.visible) && n.stroke.weight > 0
  },

  /** Maximum distance (in local units) painting can reach outside the node box. */
  paint_reach(n: Node): number {
    let fx = 0
    for (const e of effectsOf(n)) fx = Math.max(fx, Effect.reach(e))
    return Node.outline_reach(n) + fx + Node.spread_miter_reach(n)
  },

  /**
   * The page-space area this node paints itself under `world` (its children
   * aside): its box grown by its strokes and glyphs, then by its effects.
   */
  own_paint_bounds(n: Node, world: Affine): GeomRect {
    const o = Node.outline_reach(n)
    const box = RectMath.new(0, 0, n.width, n.height)
    return Node.grow_by_effects(n, transform_rect_bbox(world, RectMath.inflate(box, o, o)))
  },

  /**
   * Page-space area `b` grown by what this node's visible effects paint around
   * it: blurs all round, drop shadows towards their offset.
   */
  grow_by_effects(n: Node, b: GeomRect): GeomRect {
    const miter = Node.spread_miter_reach(n)
    let r = b
    for (const e of effectsOf(n)) {
      if (!e.visible) continue
      if (e.kind.type === 'dropShadow') {
        const s = e.kind.shadow
        const g = Math.abs(s.radius) * 1.5 + Math.max(0, s.spread) + miter
        const [dx, dy] = s.offset
        if (Number.isFinite(g) && Number.isFinite(dx) && Number.isFinite(dy)) {
          r = RectMath.union(
            r,
            RectMath.inflate(RectMath.new(b.x0 + dx, b.y0 + dy, b.x1 + dx, b.y1 + dy), g, g)
          )
        }
      } else {
        const g = Effect.reach(e)
        if (Number.isFinite(g) && g > 0) r = RectMath.union(r, RectMath.inflate(b, g, g))
      }
    }
    return r
  },

  /** How far (local units) strokes and glyphs reach outside the box. */
  outline_reach(n: Node): number {
    let stroke = 0
    if (Node.has_visible_stroke(n)) {
      const sides = n.stroke.sides
      const w = sides ? sides.reduce((a, b) => Math.max(a, b), 0) : StrokeProps.maxWeight(n.stroke)
      const base = n.stroke.align === 'inside' ? 0 : n.stroke.align === 'center' ? w / 2 : w
      // Arrowheads are sized by the weight, whatever a width profile does.
      const pointArrows =
        n.kind.type === 'vector' &&
        (
          n.kind.network as { vertices?: Array<{ cap?: StrokeCap | null }> } | undefined
        )?.vertices?.some(
          (v) => v.cap !== null && v.cap !== undefined && StrokeCap.isArrow(v.cap)
        ) === true
      const caps =
        StrokeCap.isArrow(n.stroke.cap_start) || StrokeCap.isArrow(n.stroke.cap_end) || pointArrows
          ? Math.max(w, n.stroke.weight) * 3
          : w
      // Right-angled or smooth outlines (boxes, ellipses) end their mitres on the grown box.
      const boxy =
        n.kind.type === 'rectangle' ||
        n.kind.type === 'ellipse' ||
        n.kind.type === 'section' ||
        Node.is_frame_like(n.kind)
      const miter = boxy ? 1 : Math.min(4, Math.max(1, n.stroke.miter_limit))
      const lineLike = n.kind.type === 'line' || n.kind.type === 'vector'
      stroke = Math.max(base, lineLike ? caps : 0) * miter
    }
    const glyphs = textReach(n)
    return stroke + glyphs
  },

  /**
   * How much further than its spread a drop shadow can reach at the outline's
   * sharp corners. Rectangles, frames and ellipses grow by exactly the spread.
   */
  spread_miter_reach(n: Node): number {
    if (
      n.kind.type === 'rectangle' ||
      n.kind.type === 'ellipse' ||
      n.kind.type === 'section' ||
      Node.is_frame_like(n.kind)
    ) {
      return 0
    }
    let max = 0
    for (const e of effectsOf(n)) {
      if (!e.visible) continue
      if (e.kind.type === 'dropShadow' && Number.isFinite(e.kind.shadow.spread)) {
        max = Math.max(max, Math.max(0, e.kind.shadow.spread) * (SPREAD_MITER_LIMIT - 1))
      }
    }
    return max
  }
}

/** A node's effects as `Effect[]` (the model stores them loosely). */
function effectsOf(n: Node): Effect[] {
  return n.effects as Effect[]
}

/** How far a text layer's glyphs paint past its box. */
function textReach(n: Node): number {
  if (n.kind.type !== 'text') return 0
  const t = textOf(n.kind as TextKind)
  return TextData.pathReach(t) + TextData.trimReach(t)
}

/** Fields at their default value are left out of the JSON (serde parity). */
export function omitNodeDefaults(n: Node): Record<string, unknown> {
  const out: Record<string, unknown> = { id: n.id, name: n.name, ...n.kind }
  if (n.parent !== null && n.parent !== undefined) out.parent = n.parent
  if (n.children.length > 0) out.children = [...n.children]
  if (!n.visible) out.visible = n.visible
  if (n.locked) out.locked = n.locked
  if (n.opacity !== 1) out.opacity = n.opacity
  if (n.blend !== 'passThrough') out.blend = n.blend
  const [a, b, c, d, e, f] = n.transform.coeffs
  if (a !== 1 || b !== 0 || c !== 0 || d !== 1 || e !== 0 || f !== 0) {
    out.transform = [a, b, c, d, e, f]
  }
  if (n.width !== 0) out.width = n.width
  if (n.height !== 0) out.height = n.height
  if (n.fills.length > 0) out.fills = n.fills
  if (n.strokes.length > 0) out.strokes = n.strokes
  if (JSON.stringify(n.stroke) !== JSON.stringify(Node.new(0, n.kind, '', 0, 0).stroke))
    out.stroke = n.stroke
  if (n.effects.length > 0) out.effects = n.effects
  if (n.corners.radii.some((r) => r !== 0) || n.corners.smoothing !== 0) out.corners = n.corners
  if (n.constraints.horizontal !== 'left' || n.constraints.vertical !== 'top')
    out.constraints = n.constraints
  if (n.layout !== null) out.layout = n.layout
  if (!ChildLayout.isDefault(n.child_layout)) out.child_layout = n.child_layout
  if (n.clip) out.clip = n.clip
  if (n.is_mask) out.is_mask = n.is_mask
  if (n.mask_type !== 'alpha') out.mask_type = n.mask_type
  if (n.grids.length > 0) out.grids = n.grids
  if (n.guides.length > 0) out.guides = n.guides
  if (n.exports.length > 0) out.exports = n.exports
  if (n.interactions.length > 0) out.interactions = n.interactions
  if (n.overflow !== 'none') out.overflow = n.overflow
  if (n.scroll_position !== 'scrolls') out.scroll_position = n.scroll_position
  if (Object.keys(n.styles).length > 0) out.styles = n.styles
  if (Object.keys(n.bound).length > 0) out.bound = n.bound
  if (Object.keys(n.var_modes).length > 0) out.var_modes = n.var_modes
  if (n.bool_op !== null) out.bool_op = n.bool_op
  if (n.constrain_proportions) out.constrain_proportions = n.constrain_proportions
  if (n.source !== null && n.source !== undefined) out.source = n.source
  if (n.exposed) out.exposed = n.exposed
  if (n.dev_status !== 'none') out.dev_status = n.dev_status
  if (n.dev_changed) out.dev_changed = n.dev_changed
  if (n.dev_note !== '') out.dev_note = n.dev_note
  if (n.overrides.size > 0) out.overrides = [...n.overrides]
  if (Object.keys(n.prop_refs).length > 0) out.prop_refs = n.prop_refs
  if (Object.keys(n.plugin_data).length > 0) out.plugin_data = n.plugin_data
  if (n.annotations.length > 0) out.annotations = n.annotations
  if (n.code_links.length > 0) out.code_links = n.code_links
  if (n.dev_resources.length > 0) out.dev_resources = n.dev_resources
  return out
}
