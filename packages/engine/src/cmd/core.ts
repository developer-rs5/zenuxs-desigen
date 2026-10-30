/**
 * The engine's commands: create, edit, arrange, structure, page, view, proto.
 * Command ids follow the incumbent's menu catalog (the parity metric).
 * (Converted 1:1 from FigCraft `crates/engine/src/cmd/{create,edit,arrange,structure,page,view,proto}.rs`.)
 */

import { AutoLayout, Node, VectorNetwork, type NodeId } from '@zenuxs/doc'
import {
  Affine,
  RectMath,
  rounded_rect,
  ellipse,
  polygon_points,
  star_points,
  transform_rect_bbox,
  type Radii
} from '@zenuxs/geom'

import { ok, spec, type CommandSpec, type Session } from '../lib'
import { allAdvancedSpecs } from './advanced'
import { ARRANGE_EXTENDED_SPECS } from './arrange'
import { BOARD_SPECS } from './boards'
import { CODEGEN_SPECS } from './codegen'
import { STRUCTURE_EXTENDED_SPECS } from './structure'
import { TEMPLATE_SPECS } from './templates'
import { VECTOREDIT_SPECS } from './vectoredit'
import { VIEW_TOOL_SPECS } from './view'

// ------------------------------ create.rs ------------------------------

/** Insert a shape of `kind` built by `make` into the current page. */
function createNode(
  session: Session,
  name: string,
  w: number,
  h: number,
  kind: Node['kind'],
  params?: Record<string, unknown>
): NodeId {
  const ds = session.ds()
  const id = ds.doc.alloc_id()
  const node = Node.new(
    id,
    kind,
    typeof params?.name === 'string' && params.name.length > 0 ? params.name : name,
    w,
    h
  )
  node.parent = ds.page
  ds.doc.insert(node)
  const page = ds.doc.node_mut(ds.page)
  if (page) page.children.push(id)
  ds.selection = [id]
  return id
}

function numParam(params: Record<string, unknown>, key: string, d: number): number {
  const v = params[key]
  return typeof v === 'number' && Number.isFinite(v) ? v : d
}

function radiiFrom(params: Record<string, unknown>): Radii {
  const r = numParam(params, 'cornerRadius', 0)
  return [r, r, r, r]
}

function solidFillsParam(value: unknown): Node['fills'] | null {
  if (!Array.isArray(value)) return null
  const fills: Node['fills'] = []
  for (const fill of value) {
    if (!fill || typeof fill !== 'object' || Array.isArray(fill)) return null
    const record = fill as Record<string, unknown>
    const color = record.color
    if (!color || typeof color !== 'object' || Array.isArray(color)) return null
    const channels = color as Record<string, unknown>
    const { r, g, b, a } = channels
    if (
      record.type !== 'SOLID' ||
      typeof r !== 'number' ||
      !Number.isFinite(r) ||
      r < 0 ||
      r > 1 ||
      typeof g !== 'number' ||
      !Number.isFinite(g) ||
      g < 0 ||
      g > 1 ||
      typeof b !== 'number' ||
      !Number.isFinite(b) ||
      b < 0 ||
      b > 1 ||
      (a !== undefined && (typeof a !== 'number' || !Number.isFinite(a) || a < 0 || a > 1)) ||
      (record.opacity !== undefined &&
        (typeof record.opacity !== 'number' ||
          !Number.isFinite(record.opacity) ||
          record.opacity < 0 ||
          record.opacity > 1)) ||
      (record.visible !== undefined && typeof record.visible !== 'boolean')
    ) {
      return null
    }

    fills.push({
      kind: {
        type: 'solid',
        color: { r, g, b, a: typeof a === 'number' ? a : 1 }
      },
      opacity: typeof record.opacity === 'number' ? record.opacity : 1,
      visible: typeof record.visible === 'boolean' ? record.visible : true,
      blend: 'normal'
    })
  }
  return fills
}

export const CREATE_SPECS: CommandSpec[] = [
  spec('shape.frame', 'Frame', '{x?, y?, width?, height?, cornerRadius?}', true, (s, p) => {
    const w = numParam(p, 'width', 100)
    const h = numParam(p, 'height', 100)
    const id = createNode(s, 'Frame', w, h, { type: 'frame' }, p)
    const n = s.ds().doc.node_mut(id)!
    n.fills = [
      {
        kind: { type: 'solid', color: { r: 1, g: 1, b: 1, a: 1 } },
        opacity: 1,
        visible: true,
        blend: 'normal'
      }
    ]
    n.corners = { radii: radiiFrom(p), smoothing: 0 }
    moveNode(n, p)
    return { ok: true, id }
  }),
  spec('shape.rectangle', 'Rectangle', '{x?, y?, width?, height?, cornerRadius?}', true, (s, p) => {
    const w = numParam(p, 'width', 100)
    const h = numParam(p, 'height', 100)
    const id = createNode(s, 'Rectangle', w, h, { type: 'rectangle' }, p)
    const n = s.ds().doc.node_mut(id)!
    n.fills = [
      {
        kind: { type: 'solid', color: { r: 0.851, g: 0.851, b: 0.851, a: 1 } },
        opacity: 1,
        visible: true,
        blend: 'normal'
      }
    ]
    n.corners = { radii: radiiFrom(p), smoothing: 0 }
    moveNode(n, p)
    return { ok: true, id }
  }),
  spec('shape.ellipse', 'Ellipse', '{x?, y?, width?, height?}', true, (s, p) => {
    const w = numParam(p, 'width', 100)
    const h = numParam(p, 'height', 100)
    const id = createNode(
      s,
      'Ellipse',
      w,
      h,
      { type: 'ellipse', start: 0, sweep: Math.PI * 2, inner: 0 },
      p
    )
    const n = s.ds().doc.node_mut(id)!
    n.fills = [
      {
        kind: { type: 'solid', color: { r: 0.851, g: 0.851, b: 0.851, a: 1 } },
        opacity: 1,
        visible: true,
        blend: 'normal'
      }
    ]
    moveNode(n, p)
    return { ok: true, id }
  }),
  spec(
    'shape.polygon',
    'Polygon',
    '{x?, y?, width?, height?, count?, cornerRadius?}',
    true,
    (s, p) => {
      const w = numParam(p, 'width', 100)
      const h = numParam(p, 'height', 100)
      const count = Math.min(120, Math.max(3, numParam(p, 'count', 3)))
      const id = createNode(s, 'Polygon', w, h, { type: 'polygon', count }, p)
      const n = s.ds().doc.node_mut(id)!
      n.corners = { radii: radiiFrom(p), smoothing: 0 }
      moveNode(n, p)
      return { ok: true, id }
    }
  ),
  spec('shape.star', 'Star', '{x?, y?, width?, height?, count?, innerRatio?}', true, (s, p) => {
    const w = numParam(p, 'width', 100)
    const h = numParam(p, 'height', 100)
    const id = createNode(
      s,
      'Star',
      w,
      h,
      {
        type: 'star',
        count: Math.min(120, Math.max(3, numParam(p, 'count', 5))),
        inner_ratio: numParam(p, 'innerRatio', 0.38)
      },
      p
    )
    moveNode(s.ds().doc.node_mut(id)!, p)
    return { ok: true, id }
  }),
  spec('shape.line', 'Line', '{x?, y?, width?}', true, (s, p) => {
    const w = numParam(p, 'width', 100)
    const id = createNode(s, 'Line', w, 0, { type: 'line' }, p)
    moveNode(s.ds().doc.node_mut(id)!, p)
    return { ok: true, id }
  }),
  spec('shape.vector', 'Vector', '{points, closed?}', true, (s, p) => {
    if (!Array.isArray(p.points)) throw new Error('points must be an array')
    if (p.points.length < 2) throw new Error('a vector needs at least two points')

    const points: Array<[number, number]> = []
    for (const [index, point] of p.points.entries()) {
      if (!Array.isArray(point) || point.length !== 2) {
        throw new Error(`point ${index} must be a coordinate pair`)
      }
      const x = point[0]
      const y = point[1]
      if (
        typeof x !== 'number' ||
        !Number.isFinite(x) ||
        typeof y !== 'number' ||
        !Number.isFinite(y)
      ) {
        throw new Error(`point ${index} must contain finite coordinates`)
      }
      points.push([x, y])
    }

    if (p.closed !== undefined && typeof p.closed !== 'boolean') {
      throw new Error('closed must be a boolean')
    }
    const closed = p.closed === true
    if (closed && points.length < 3) {
      throw new Error('a closed vector needs at least three points')
    }

    const network = VectorNetwork.from_points(points, closed)
    const id = createNode(s, 'Vector', 100, 100, { type: 'vector', network }, p)
    return { ok: true, id }
  }),
  spec('text.create', 'Text', '{x?, y?, characters?, fontSize?}', true, (s, p) => {
    const characters = typeof p.characters === 'string' ? p.characters : 'Text'
    const fontSize = numParam(p, 'fontSize', 16)
    const id = createNode(s, characters.slice(0, 20) || 'Text', 200, fontSize * 1.4, {
      type: 'text',
      characters,
      style: {
        font_family: 'Inter',
        font_style: 'Regular',
        font_features: {},
        variation_axes: {},
        font_size: fontSize,
        line_height: { unit: 'auto' },
        letter_spacing: { unit: 'percent', value: 0 },
        decoration: 'none',
        decoration_look: { style: 'solid', offset: 0, thickness: 1, color: null },
        text_case: 'original',
        links: {}
      },
      runs: [],
      auto_resize: 'widthAndHeight',
      align_h: 'left',
      align_v: 'top',
      paragraph_spacing: 0,
      paragraph_indent: 0,
      list: 'none',
      paragraphs: [],
      list_spacing: 0,
      hanging_punctuation: false,
      hanging_list: false,
      leading_trim: 'none',
      max_lines: 0,
      features: {},
      path: null
    }, p)
    moveNode(s.ds().doc.node_mut(id)!, p)
    return { ok: true, id }
  }),
  spec('frame.presets', 'Frame presets', '{preset?, x?, y?}', true, (s, p) => {
    const presets: Record<string, [number, number]> = {
      phone: [390, 844],
      desktop: [1440, 1024],
      tablet: [834, 1112]
    }
    const size = presets[typeof p.preset === 'string' ? p.preset : 'phone'] ?? [100, 100]
    const id = createNode(s, 'Frame', size[0], size[1], { type: 'frame' })
    moveNode(s.ds().doc.node_mut(id)!, p)
    return { ok: true, id }
  }),
  spec('frame.swapOrientation', 'Swap frame orientation', '{}', true, (s) => {
    for (const id of s.ds().selection) {
      const n = s.ds().doc.node_mut(id)
      if (n && n.kind.type === 'frame') {
        const w = n.width
        setSizeKeepTransform(n, n.height, w)
      }
    }
    return ok()
  })
]

function moveNode(n: Node, p: Record<string, unknown>): void {
  const x = typeof p.x === 'number' ? p.x : 0
  const y = typeof p.y === 'number' ? p.y : 0
  n.transform = Affine.new([1, 0, 0, 1, x, y])
}

function setSizeKeepTransform(n: Node, w: number, h: number): void {
  n.width = w
  n.height = h
}

// ------------------------------ edit.rs ------------------------------

export const EDIT_SPECS: CommandSpec[] = [
  spec('edit.delete', 'Delete', '{}', true, (s) => {
    const ds = s.ds()
    for (const id of [...ds.selection]) {
      const n = ds.doc.node(id)
      if (!n) continue
      // A page's direct children are removed from the page list too.
      ds.doc.delete(id)
    }
    ds.selection = []
    return ok()
  }),
  spec('edit.duplicate', 'Duplicate', '{dx?, dy?}', true, (s, p) => {
    const ds = s.ds()
    const dx = numParam(p, 'dx', 10)
    const dy = numParam(p, 'dy', 10)
    const copies: NodeId[] = []
    for (const id of ds.selection) {
      const src = ds.doc.node(id)
      if (!src) continue
      const copy = structuredClone(src)
      copy.id = ds.doc.alloc_id()
      copy.name = `${src.name} copy`
      const c = copy.transform.coeffs
      copy.transform = Affine.new([c[0], c[1], c[2], c[3], c[4] + dx, c[5] + dy])
      ds.doc.insert(copy)
      if (copy.parent !== null && copy.parent !== undefined) {
        const parent = ds.doc.node_mut(copy.parent)
        if (parent) parent.children.push(copy.id)
      }
      copies.push(copy.id)
    }
    ds.selection = copies
    return { ok: true, ids: copies }
  }),
  spec('object.rename', 'Rename', '{name}', true, (s, p) => {
    const name = typeof p.name === 'string' ? p.name : ''
    for (const id of s.ds().selection) {
      const n = s.ds().doc.node_mut(id)
      if (n) n.name = name
    }
    return ok()
  }),
  spec('object.toggleVisible', 'Toggle visibility', '{}', true, (s) => {
    for (const id of s.ds().selection) {
      const n = s.ds().doc.node_mut(id)
      if (n) n.visible = !n.visible
    }
    return ok()
  }),
  spec('object.toggleLock', 'Toggle lock', '{}', true, (s) => {
    for (const id of s.ds().selection) {
      const n = s.ds().doc.node_mut(id)
      if (n) n.locked = !n.locked
    }
    return ok()
  }),
  spec('node.set', 'Set node properties', '{id?, props}', true, (s, p) => {
    const ds = s.ds()
    const ids = nodeIdsParam(p.id) ?? ds.selection
    const props = (p.props ?? {}) as Record<string, unknown>
    const fills = props.fills === undefined ? undefined : solidFillsParam(props.fills)
    if (fills === null) throw new Error('fills must be an array of solid fills')
    for (const id of ids) {
      const n = ds.doc.node_mut(id)
      if (!n) continue
      if (typeof props.name === 'string') n.name = props.name
      if (typeof props.width === 'number') n.width = props.width
      if (typeof props.height === 'number') n.height = props.height
      if (typeof props.cornerRadius === 'number' && Number.isFinite(props.cornerRadius)) {
        const radius = props.cornerRadius
        n.corners = { ...n.corners, radii: [radius, radius, radius, radius] }
      }
      if (fills !== undefined) n.fills = fills
      if (typeof props.opacity === 'number') n.opacity = Math.min(1, Math.max(0, props.opacity))
      if (typeof props.visible === 'boolean') n.visible = props.visible
      if (typeof props.locked === 'boolean') n.locked = props.locked
      if (typeof props.clip === 'boolean') n.clip = props.clip
      if (typeof props.x === 'number' || typeof props.y === 'number') {
        const c = [...n.transform.coeffs] as [number, number, number, number, number, number]
        if (typeof props.x === 'number') c[4] = props.x
        if (typeof props.y === 'number') c[5] = props.y
        n.transform = Affine.new(c)
      }
    }
    return ok()
  }),
  spec('node.get', 'Get node properties', '{id}', false, (s, p) => {
    const ds = s.ds()
    const id = nodeIdParam(p.id) ?? ds.selection[0]
    const n = ds.doc.node(id)
    if (!n) throw new Error('no such node')
    const c = n.transform.coeffs
    return {
      id: n.id,
      name: n.name,
      type: n.kind.type,
      x: c[4],
      y: c[5],
      width: n.width,
      height: n.height,
      visible: n.visible,
      locked: n.locked,
      opacity: n.opacity
    }
  }),
  spec('select.set', 'Set selection', '{ids?}', false, (s, p) => {
    s.ds().selection = idList(p.ids) ?? []
    return ok()
  }),
  spec('select.all', 'Select all', '{}', false, (s) => {
    const ds = s.ds()
    ds.selection = [...(ds.doc.node(ds.page)?.children ?? [])]
    return ok()
  }),
  spec('select.none', 'Deselect', '{}', false, (s) => {
    s.ds().selection = []
    return ok()
  }),
  spec('command.batch', 'Batch commands', '{commands}', true, (s, p) => {
    const commands = Array.isArray(p.commands)
      ? (p.commands as Array<{ id: string; params?: Record<string, unknown> }>)
      : []
    const results: unknown[] = []
    for (const c of commands) {
      results.push(s.execute(c.id, c.params ?? {}))
    }
    return { ok: true, results }
  }),
  spec('fill.set', 'Set fill', '{id?, fill}', true, (s, p) => {
    const ds = s.ds()
    const ids = nodeIdsParam(p.id) ?? ds.selection
    const fill = p.fill as
      | { type?: string; color?: { r: number; g: number; b: number; a?: number } }
      | undefined
    for (const id of ids) {
      const n = ds.doc.node_mut(id)
      if (!n) continue
      if (fill && fill.color) {
        n.fills = [
          {
            kind: {
              type: 'solid',
              color: { r: fill.color.r, g: fill.color.g, b: fill.color.b, a: fill.color.a ?? 1 }
            },
            opacity: 1,
            visible: true,
            blend: 'normal'
          }
        ]
      } else if (fill === null) {
        n.fills = []
      }
    }
    return ok()
  })
]

function idList(v: unknown): NodeId[] | null {
  if (!Array.isArray(v)) return null
  return v
    .map((x) =>
      typeof x === 'string' ? Number(x.split(':').at(-1)) : typeof x === 'number' ? x : null
    )
    .filter((x): x is NodeId => x !== null && Number.isFinite(x))
}

/** One node id from a param (string `"0:12"`, `"12"` or number). */
function nodeIdParam(v: unknown): NodeId | null {
  if (typeof v === 'number' && Number.isFinite(v)) return v
  if (typeof v === 'string') {
    const n = Number(v.split(':').at(-1))
    return Number.isFinite(n) ? n : null
  }
  return null
}

/** Node ids from a param (single id or array). */
function nodeIdsParam(v: unknown): NodeId[] | null {
  if (Array.isArray(v)) return idList(v)
  const one = nodeIdParam(v)
  return one === null ? null : [one]
}

// ------------------------------ arrange.rs ------------------------------

export const ARRANGE_SPECS: CommandSpec[] = [
  spec('transform.move', 'Move', '{ids?, dx, dy}', true, (s, p) => {
    const ds = s.ds()
    const ids = idList(p.ids) ?? ds.selection
    const dx = numParam(p, 'dx', 0)
    const dy = numParam(p, 'dy', 0)
    for (const id of ids) {
      const n = ds.doc.node(id)
      if (!n) continue
      const c = [...n.transform.coeffs] as [number, number, number, number, number, number]
      c[4] += dx
      c[5] += dy
      const mut = ds.doc.node_mut(id)
      if (mut) mut.transform = Affine.new(c)
    }
    return ok()
  }),
  spec('transform.resize', 'Resize', '{ids?, width, height}', true, (s, p) => {
    const ds = s.ds()
    const ids = idList(p.ids) ?? ds.selection
    for (const id of ids) {
      const n = ds.doc.node_mut(id)
      if (!n) continue
      if (typeof p.width === 'number') n.width = Math.max(0, p.width)
      if (typeof p.height === 'number') n.height = Math.max(0, p.height)
    }
    return ok()
  }),
  spec('align.left', 'Align left', '{ids?}', true, (s, p) => {
    return alignAxis(s, p, 'min', 'x')
  }),
  spec('align.right', 'Align right', '{ids?}', true, (s, p) => {
    return alignAxis(s, p, 'max', 'x')
  }),
  spec('align.hcenter', 'Align horizontal centers', '{ids?}', true, (s, p) => {
    return alignAxis(s, p, 'center', 'x')
  }),
  spec('align.top', 'Align top', '{ids?}', true, (s, p) => {
    return alignAxis(s, p, 'min', 'y')
  }),
  spec('align.bottom', 'Align bottom', '{ids?}', true, (s, p) => {
    return alignAxis(s, p, 'max', 'y')
  }),
  spec('align.vcenter', 'Align vertical centers', '{ids?}', true, (s, p) => {
    return alignAxis(s, p, 'center', 'y')
  }),
  spec('arrange.front', 'Bring to front', '{ids?}', true, (s, p) => {
    return reorder(s, p, 'front')
  }),
  spec('arrange.back', 'Send to back', '{ids?}', true, (s, p) => {
    return reorder(s, p, 'back')
  })
]

function boundsOf(
  session: Session,
  ids: NodeId[]
): { min0: number; min1: number; max0: number; max1: number } | null {
  let box: { x0: number; y0: number; x1: number; y1: number } | null = null
  for (const id of ids) {
    const n = session.ds().doc.node(id)
    if (!n) continue
    const b = transform_rect_bbox(
      { coeffs: n.transform.coeffs },
      RectMath.new(0, 0, n.width, n.height)
    )
    box = box ? RectMath.union(box, b) : b
  }
  if (!box) return null
  return { min0: box.x0, min1: box.y0, max0: box.x1, max1: box.y1 }
}

function alignAxis(
  s: Session,
  p: Record<string, unknown>,
  mode: 'min' | 'center' | 'max',
  axis: 'x' | 'y'
): Record<string, unknown> {
  const ds = s.ds()
  const ids = idList(p.ids) ?? ds.selection
  const b = boundsOf(s, ids)
  if (!b) return ok()
  const i0 = axis === 'x' ? 4 : 5
  for (const id of ids) {
    const n = ds.doc.node(id)
    if (!n) continue
    const nb = transform_rect_bbox(
      { coeffs: n.transform.coeffs },
      RectMath.new(0, 0, n.width, n.height)
    )
    const cur = axis === 'x' ? (nb.x0 + nb.x1) / 2 : (nb.y0 + nb.y1) / 2
    const span = axis === 'x' ? nb.x1 - nb.x0 : nb.y1 - nb.y0
    const target =
      mode === 'min'
        ? axis === 'x'
          ? b.min0
          : b.min1
        : mode === 'max'
          ? (axis === 'x' ? b.max0 : b.max1) - span
          : (axis === 'x' ? b.min0 + b.max0 : b.min1 + b.max1) / 2 - span / 2
    const delta = target - (axis === 'x' ? (mode === 'center' ? cur - span / 2 : cur) : cur)
    void i0
    void delta
    const c = [...n.transform.coeffs] as [number, number, number, number, number, number]
    if (axis === 'x')
      c[4] += target - (mode === 'center' ? nb.x0 + span / 2 : mode === 'min' ? nb.x0 : nb.x1)
    else c[5] += target - (mode === 'center' ? nb.y0 + span / 2 : mode === 'min' ? nb.y0 : nb.y1)
    const mut = ds.doc.node_mut(id)
    if (mut) mut.transform = Affine.new(c)
  }
  return ok()
}

function reorder(
  s: Session,
  p: Record<string, unknown>,
  to: 'front' | 'back'
): Record<string, unknown> {
  const ds = s.ds()
  const ids = idList(p.ids) ?? ds.selection
  for (const id of ids) {
    const n = ds.doc.node(id)
    if (!n || n.parent === null || n.parent === undefined) continue
    const parent = ds.doc.node_mut(n.parent)
    if (!parent) continue
    parent.children = parent.children.filter((c) => c !== id)
    if (to === 'front') parent.children.push(id)
    else parent.children.unshift(id)
  }
  return ok()
}

// ------------------------------ structure.rs ------------------------------

export const STRUCTURE_SPECS: CommandSpec[] = [
  spec('object.group', 'Group selection', '{name?}', true, (s, p) => {
    const ds = s.ds()
    if (ds.selection.length < 2) return ok()
    const parent = ds.doc.node(ds.selection[0])?.parent ?? ds.page
    const box = boundsOf(s, ds.selection)
    if (!box) return ok()
    const gid = ds.doc.alloc_id()
    const group = Node.new(
      gid,
      { type: 'group' },
      typeof p.name === 'string' ? p.name : 'Group',
      box.max0 - box.min0,
      box.max1 - box.min1
    )
    group.parent = parent
    group.transform = Affine.new([1, 0, 0, 1, box.min0, box.min1])
    ds.doc.insert(group)
    for (const id of ds.selection) {
      const n = ds.doc.node(id)
      if (!n) continue
      const old = ds.doc.node_mut(id)
      if (old) {
        const c = old.transform.coeffs
        old.transform = Affine.new([c[0], c[1], c[2], c[3], c[4] - box.min0, c[5] - box.min1])
        old.parent = gid
      }
      const p2 = ds.doc.node_mut(parent)
      if (p2) p2.children = p2.children.filter((c) => c !== id)
      const g = ds.doc.node_mut(gid)
      if (g) g.children.push(id)
    }
    const p3 = ds.doc.node_mut(parent)
    if (p3) p3.children.push(gid)
    ds.selection = [gid]
    return { ok: true, id: gid }
  }),
  spec('object.ungroup', 'Ungroup', '{}', true, (s) => {
    const ds = s.ds()
    for (const id of [...ds.selection]) {
      const n = ds.doc.node(id)
      if (!n || (n.kind.type !== 'group' && n.kind.type !== 'booleanOp')) continue
      const parent = n.parent ?? ds.page
      const gp = ds.doc.node_mut(parent)
      const gc = n.transform.coeffs
      if (gp) {
        const at = gp.children.indexOf(id)
        gp.children.splice(at, 1, ...n.children)
      }
      for (const c of n.children) {
        const child = ds.doc.node_mut(c)
        if (child) {
          const cc = child.transform.coeffs
          child.transform = Affine.new([cc[0], cc[1], cc[2], cc[3], cc[4] + gc[4], cc[5] + gc[5]])
          child.parent = parent
        }
      }
      ds.doc.delete(id)
      ds.selection = [...n.children]
    }
    return ok()
  }),
  spec('object.frameSelection', 'Frame selection', '{name?}', true, (s, p) => {
    const ds = s.ds()
    const box = boundsOf(s, ds.selection)
    if (!box) return ok()
    const fid = ds.doc.alloc_id()
    const frame = Node.new(
      fid,
      { type: 'frame' },
      typeof p.name === 'string' ? p.name : 'Frame',
      box.max0 - box.min0,
      box.max1 - box.min1
    )
    frame.parent = ds.page
    frame.transform = Affine.new([1, 0, 0, 1, box.min0, box.min1])
    frame.fills = [
      {
        kind: { type: 'solid', color: { r: 1, g: 1, b: 1, a: 1 } },
        opacity: 1,
        visible: true,
        blend: 'normal'
      }
    ]
    ds.doc.insert(frame)
    for (const id of [...ds.selection]) {
      const n = ds.doc.node(id)
      if (!n) continue
      const old = ds.doc.node_mut(id)
      if (old) {
        const c = old.transform.coeffs
        old.transform = Affine.new([c[0], c[1], c[2], c[3], c[4] - box.min0, c[5] - box.min1])
        old.parent = fid
      }
      const page = ds.doc.node_mut(ds.page)
      if (page) page.children = page.children.filter((c) => c !== id)
      const f = ds.doc.node_mut(fid)
      if (f) f.children.push(id)
    }
    const page = ds.doc.node_mut(ds.page)
    if (page) page.children.push(fid)
    ds.selection = [fid]
    return { ok: true, id: fid }
  }),
  spec('layout.add', 'Add auto layout', '{}', true, (s) => {
    for (const id of s.ds().selection) {
      const n = s.ds().doc.node_mut(id)
      if (n && (n.kind.type === 'frame' || n.kind.type === 'component')) {
        n.layout = AutoLayout.default()
      }
    }
    return ok()
  }),
  spec('layout.remove', 'Remove auto layout', '{}', true, (s) => {
    for (const id of s.ds().selection) {
      const n = s.ds().doc.node_mut(id)
      if (n) n.layout = null
    }
    return ok()
  })
]

// ------------------------------ page.rs ------------------------------

export const PAGE_SPECS: CommandSpec[] = [
  spec('page.add', 'Add page', '{name?}', true, (s, p) => {
    const ds = s.ds()
    const id = ds.doc.alloc_id()
    const name = typeof p.name === 'string' ? p.name : `Page ${ds.doc.pages.length + 1}`
    ds.doc.insert(
      Node.new(
        id,
        {
          type: 'page',
          background: { r: 0.9608, g: 0.9608, b: 0.9608, a: 1 },
          flows: [],
          prototype: {},
          guides: []
        },
        name,
        0,
        0
      )
    )
    ds.doc.pages.push(id)
    return { ok: true, id }
  }),
  spec('page.select', 'Select page', '{id}', false, (s, p) => {
    const id = Number(p.id)
    const ds = s.ds()
    if (!ds.doc.pages.includes(id)) throw new Error('no such page')
    ds.page = id
    ds.selection = []
    return ok()
  }),
  spec('page.rename', 'Rename page', '{id?, name}', true, (s, p) => {
    const ds = s.ds()
    const id = typeof p.id === 'number' ? p.id : ds.page
    const n = ds.doc.node_mut(id)
    if (n && typeof p.name === 'string') n.name = p.name
    return ok()
  }),
  spec('page.list', 'List pages', '{}', false, (s) => {
    const ds = s.ds()
    return {
      ok: true,
      pages: ds.doc.pages.map((id) => ({ id, name: ds.doc.node(id)?.name ?? '' }))
    }
  })
]

// ------------------------------ view.rs ------------------------------

/** The view, tool and preference commands (see `cmd/view.ts`). */
export { VIEW_TOOL_SPECS, applyKeptToggles, viewChecked, PAN_STEP_PX } from './view'

// ------------------------------ proto.rs ------------------------------

export const PROTO_SPECS: CommandSpec[] = [
  spec(
    'proto.interaction.add',
    'Add interaction',
    '{id?, dest, trigger?, transition?, durationMs?}',
    true,
    (s, p) => {
      const ds = s.ds()
      const ids = nodeIdsParam(p.id) ?? ds.selection
      const dest =
        typeof p.dest === 'string'
          ? Number(p.dest.split(':').at(-1))
          : typeof p.dest === 'number'
            ? p.dest
            : null
      if (dest === null || !ds.doc.contains_id(dest)) throw new Error('no destination')
      const trigger = (typeof p.trigger === 'string' ? p.trigger : 'onClick') as 'onClick'
      const transition = typeof p.transition === 'string' ? p.transition : 'instant'
      const duration = numParam(p, 'durationMs', 300)
      for (const id of ids) {
        const n = ds.doc.node_mut(id)
        if (!n) continue
        n.interactions.push({
          trigger: { type: trigger },
          actions: [{ type: 'navigate', dest }],
          transition: { type: transition as 'instant' },
          duration_ms: duration
        })
      }
      return ok()
    }
  ),
  spec('proto.interaction.remove', 'Remove interaction', '{id?, index}', true, (s, p) => {
    const ds = s.ds()
    const ids = nodeIdsParam(p.id) ?? ds.selection
    const index = typeof p.index === 'number' ? p.index : 0
    for (const id of ids) {
      const n = ds.doc.node_mut(id)
      if (n && n.interactions.length > 0 && index < n.interactions.length) {
        n.interactions.splice(index, 1)
      }
    }
    return ok()
  }),
  spec('proto.interaction.clear', 'Clear interactions', '{ids?}', true, (s, p) => {
    const ds = s.ds()
    const ids = idList(p.ids) ?? ds.selection
    for (const id of ids) {
      const n = ds.doc.node_mut(id)
      if (n) n.interactions = []
    }
    return ok()
  }),
  spec('proto.flow.add', 'Add flow', '{start?, name?}', true, (s, p) => {
    const ds = s.ds()
    const start = typeof p.start === 'number' ? p.start : (ds.selection[0] ?? ds.page)
    const n = ds.doc.node(start)
    if (!n) throw new Error('no start frame')
    const pageNow = ds.doc.node(ds.page)
    const flowCount = pageNow && pageNow.kind.type === 'page' ? pageNow.kind.flows.length : 0
    const name = typeof p.name === 'string' ? p.name : `Flow ${flowCount + 1}`
    const page = ds.doc.node_mut(ds.page)
    if (page && page.kind.type === 'page') {
      page.kind.flows.push({ name, start, description: '' })
    }
    return ok()
  }),
  spec('proto.present', 'Present', '{start?}', false, (s, p) => {
    const ds = s.ds()
    const start = typeof p.start === 'number' ? p.start : ds.selection[0]
    s.request_ui('present', { start })
    return { ok: true, start }
  }),
  spec('proto.preview', 'Preview prototype', '{start?}', false, (s, p) => {
    const ds = s.ds()
    const start = typeof p.start === 'number' ? p.start : ds.selection[0]
    s.request_ui('preview', { start })
    return { ok: true, start }
  })
]

// ------------------------------ shape geometry helpers ------------------------------

export function rectanglePath(w: number, h: number, radii: Radii): ReturnType<typeof rounded_rect> {
  return rounded_rect(w, h, radii, 0)
}

export function ellipsePath(w: number, h: number): ReturnType<typeof ellipse> {
  return ellipse(w, h, 0, Math.PI * 2, 0)
}

export function polygonPath(
  w: number,
  h: number,
  count: number
): ReturnType<typeof polygon_points> {
  return polygon_points(w, h, count)
}

export function starPath(
  w: number,
  h: number,
  count: number,
  inner: number
): ReturnType<typeof star_points> {
  return star_points(w, h, count, inner)
}

/** All command specs registered by this module set. */
export function allCoreSpecs(): CommandSpec[] {
  return [
    ...CREATE_SPECS,
    ...EDIT_SPECS,
    ...ARRANGE_SPECS,
    ...ARRANGE_EXTENDED_SPECS,
    ...STRUCTURE_SPECS,
    ...STRUCTURE_EXTENDED_SPECS,
    ...PAGE_SPECS,
    ...VIEW_TOOL_SPECS,
    ...PROTO_SPECS,
    ...BOARD_SPECS,
    ...VECTOREDIT_SPECS,
    ...CODEGEN_SPECS,
    ...TEMPLATE_SPECS,
    ...allAdvancedSpecs()
  ]
}
