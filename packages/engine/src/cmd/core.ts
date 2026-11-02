/**
 * The engine's commands: create, edit, arrange, structure, page, view, proto.
 * Command ids follow the incumbent's menu catalog (the parity metric).
 * (Converted 1:1 from FigCraft `crates/engine/src/cmd/{create,edit,arrange,structure,page,view,proto}.rs`.)
 */

import { AutoLayout, Node, TextData, VectorNetwork, type NodeId } from '@zenuxs/doc'
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

import { FONT_SPECS } from '../fonts'
import { ok, spec, type CommandSpec, type Session } from '../lib'
import { PREVIEW_SPECS } from '../textpreview'
import { allAdvancedSpecs } from './advanced'
import { ARRANGE_SPECS } from './arrange'
import { BOARD_SPECS } from './boards'
import { CLIPBOARD_SPECS } from './clipboard'
import { CODEGEN_SPECS } from './codegen'
import { EDIT_SPECS as EDIT_MODULE_SPECS } from './edit'
import { LIST_SPECS } from './lists'
import { NODE_SPECS } from './node'
import { PAINT_SPECS } from './paint'
import { bad, optId, optIndex } from './params'
import { SELECT_SPECS } from './select'
import { STRUCTURE_EXTENDED_SPECS } from './structure'
import { TEMPLATE_SPECS } from './templates'
import { TEXT_SPECS } from './text'
import { VECTOREDIT_SPECS } from './vectoredit'
import { VIEW_TOOL_SPECS } from './view'

// ------------------------------ create.rs ------------------------------

/**
 * Insert a shape of `kind` built by `make` into `parent` (the page by default),
 * at `index` (the end by default), and select it unless `select` is false.
 */
function createNode(
  session: Session,
  cmd: string,
  name: string,
  w: number,
  h: number,
  kind: Node['kind'],
  params?: Record<string, unknown>
): NodeId {
  const ds = session.ds()
  const doc = ds.doc
  const page = ds.page
  const parent = optId(cmd, params ?? {}, 'parent') ?? page
  const pn = doc.node(parent)
  if (!pn) throw bad(cmd, `no such parent ${parent}`)
  if (!Node.is_container(pn.kind)) throw bad(cmd, `${parent} can't contain layers`)
  if (kind.type === 'section' && !doc.takes_sections(parent)) {
    throw bad(cmd, 'sections go on the page or in other sections')
  }
  const index = optIndex(cmd, params ?? {}, 'index')
  const id = doc.alloc_id()
  const node = Node.new(
    id,
    kind,
    typeof params?.name === 'string' && params.name.length > 0 ? params.name : name,
    w,
    h
  )
  node.parent = parent
  doc.insert(node)
  const target = doc.node_mut(parent)
  if (target) {
    const at = index === null ? target.children.length : Math.min(index, target.children.length)
    target.children.splice(at, 0, id)
  }
  if (params?.select !== false) ds.selection = [id]
  return id
}

/**
 * A shape's `x`/`y` are in the frame's space: a group parent has none of its
 * own, so the placement folds the groups above it in.
 */
function placeNode(s: Session, id: NodeId, p: Record<string, unknown>): void {
  const n = s.ds().doc.node_mut(id)
  if (!n) return
  const local = Affine.new([1, 0, 0, 1, numParam(p, 'x', 0), numParam(p, 'y', 0)])
  const parent = n.parent
  const pn = parent === null || parent === undefined ? null : s.doc().node(parent)
  const folded = pn && Node.bounds_follow_children(pn.kind) ? s.doc().frame_relative(pn.id) : null
  n.transform = folded ? Affine.mul(Affine.inverse(folded), local) : local
}

function numParam(params: Record<string, unknown>, key: string, d: number): number {
  const v = params[key]
  return typeof v === 'number' && Number.isFinite(v) ? v : d
}

function radiiFrom(params: Record<string, unknown>): Radii {
  const r = numParam(params, 'cornerRadius', 0)
  return [r, r, r, r]
}

export const CREATE_SPECS: CommandSpec[] = [
  spec('shape.frame', 'Frame', '{x?, y?, width?, height?, cornerRadius?}', true, (s, p) => {
    const w = numParam(p, 'width', 100)
    const h = numParam(p, 'height', 100)
    const id = createNode(s, 'shape.frame', 'Frame', w, h, { type: 'frame' }, p)
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
    placeNode(s, id, p)
    return { ok: true, id }
  }),
  spec('shape.rectangle', 'Rectangle', '{x?, y?, width?, height?, cornerRadius?}', true, (s, p) => {
    const w = numParam(p, 'width', 100)
    const h = numParam(p, 'height', 100)
    const id = createNode(s, 'shape.rectangle', 'Rectangle', w, h, { type: 'rectangle' }, p)
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
    placeNode(s, id, p)
    return { ok: true, id }
  }),
  spec('shape.ellipse', 'Ellipse', '{x?, y?, width?, height?}', true, (s, p) => {
    const w = numParam(p, 'width', 100)
    const h = numParam(p, 'height', 100)
    const id = createNode(
      s,
      'shape.ellipse',
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
    placeNode(s, id, p)
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
      const id = createNode(s, 'shape.polygon', 'Polygon', w, h, { type: 'polygon', count }, p)
      const n = s.ds().doc.node_mut(id)!
      n.corners = { radii: radiiFrom(p), smoothing: 0 }
      placeNode(s, id, p)
      return { ok: true, id }
    }
  ),
  spec('shape.star', 'Star', '{x?, y?, width?, height?, count?, innerRatio?}', true, (s, p) => {
    const w = numParam(p, 'width', 100)
    const h = numParam(p, 'height', 100)
    const id = createNode(
      s,
      'shape.star',
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
    placeNode(s, id, p)
    return { ok: true, id }
  }),
  spec('shape.line', 'Line', '{x?, y?, width?}', true, (s, p) => {
    const w = numParam(p, 'width', 100)
    const id = createNode(s, 'shape.line', 'Line', w, 0, { type: 'line' }, p)
    placeNode(s, id, p)
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
    const id = createNode(s, 'shape.vector', 'Vector', 100, 100, { type: 'vector', network }, p)
    return { ok: true, id }
  }),
  spec('text.create', 'Text', '{x?, y?, characters?, fontSize?}', true, (s, p) => {
    const characters = typeof p.characters === 'string' ? p.characters : 'Text'
    const fontSize = numParam(p, 'fontSize', 16)
    const data = TextData.default()
    data.characters = characters
    data.style.font_size = fontSize
    const id = createNode(
      s,
      'text.create',
      characters.slice(0, 20) || 'Text',
      200,
      fontSize * 1.4,
      { type: 'text', ...data },
      p
    )
    placeNode(s, id, p)
    return { ok: true, id }
  }),
  spec('frame.presets', 'Frame presets', '{preset?, x?, y?}', true, (s, p) => {
    const presets: Record<string, [number, number]> = {
      phone: [390, 844],
      desktop: [1440, 1024],
      tablet: [834, 1112]
    }
    const size = presets[typeof p.preset === 'string' ? p.preset : 'phone'] ?? [100, 100]
    const id = createNode(s, 'frame.presets', 'Frame', size[0], size[1], { type: 'frame' }, p)
    placeNode(s, id, p)
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

function setSizeKeepTransform(n: Node, w: number, h: number): void {
  n.width = w
  n.height = h
}

// ------------------------------ edit.rs ------------------------------

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
    ...EDIT_MODULE_SPECS,
    ...CLIPBOARD_SPECS,
    ...PAINT_SPECS,
    ...NODE_SPECS,
    ...ARRANGE_SPECS,
    ...STRUCTURE_SPECS,
    ...STRUCTURE_EXTENDED_SPECS,
    ...PAGE_SPECS,
    ...VIEW_TOOL_SPECS,
    ...PROTO_SPECS,
    ...BOARD_SPECS,
    ...VECTOREDIT_SPECS,
    ...CODEGEN_SPECS,
    ...TEMPLATE_SPECS,
    ...TEXT_SPECS,
    ...FONT_SPECS,
    ...PREVIEW_SPECS,
    ...SELECT_SPECS,
    ...LIST_SPECS,
    ...allAdvancedSpecs()
  ]
}
