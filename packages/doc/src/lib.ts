/**
 * ZenuxsDesign document model — the scene graph, styles, variables, images and
 * comments. (Converted 1:1 from FigCraft `crates/doc/src/lib.rs`; the
 * persistent `imbl::OrdMap` becomes a copy-on-write `Map` with the same public
 * API: `node`, `node_mut` COW, `changed_ids` diff.)
 */

import type { Color } from '@zenuxs/color'
import { Affine, RectMath, transform_rect_bbox, type Affine as AffineT, type Rect as GeomRect } from '@zenuxs/geom'
import { Node, type NodeKind, type Node as NodeT } from './node'
import type { Comment } from './comments'
import type { Variables, Style } from './styles'
import { parseNodeId, type NodeId } from './ids'

/** Document errors (Rust `DocError` variants). */
export type DocErrorCode = 'no_node' | 'not_container' | 'cycle' | 'invalid'

export class DocError extends Error {
  code: DocErrorCode
  constructor(code: DocErrorCode, message?: string) {
    super(message ?? code)
    this.code = code
    this.name = 'DocError'
  }
}

/** `Dirty`: the node ids changed since the last revision, plus cached facts. */
export class Dirty {
  ids = new Set<NodeId>()
  private masksCache: boolean | null = null
  private backdropCache: number | null = null

  add(id: NodeId): void {
    this.ids.add(id)
    this.masksCache = null
    this.backdropCache = null
  }

  has_masks(): boolean {
    return this.masksCache ?? false
  }

  max_backdrop_radius(): number {
    return this.backdropCache ?? 0
  }

  clear(): void {
    this.ids.clear()
    this.masksCache = null
    this.backdropCache = null
  }
}

/** Id allocation: counts up; in collab the high 32 bits are the client id. */
export class IdAlloc {
  next: number
  client: number

  constructor(next = 1, client = 0) {
    this.next = next
    this.client = client
  }

  alloc(): NodeId {
    const id = this.client * 2 ** 32 + this.next
    this.next += 1
    return id
  }
}

/** Image bytes by content hash (saved separately by the format layer). */
export interface ImageData {
  bytes: Uint8Array
  width: number
  height: number
}

/** Shared styles and variables (full model in `styles.ts`). */
export { Variables } from './styles'
export type { Style } from './styles'

/** A comment thread. */

/** The document. */
export class Document {
  name: string
  pages: NodeId[]
  private nodes: Map<NodeId, NodeT>
  dirty: Dirty
  next_id: IdAlloc
  styles: Style[]
  variables: Variables
  images: Map<string, ImageData>
  current_page: NodeId | null
  document_colors: Color[]
  comments: Comment[]
  color_profile: 'srgb' | 'displayP3'

  constructor() {
    this.name = 'Untitled'
    this.pages = []
    this.nodes = new Map()
    this.dirty = new Dirty()
    this.next_id = new IdAlloc()
    this.styles = []
    this.variables = { collections: [], variables: [] }
    this.images = new Map()
    this.current_page = null
    this.document_colors = []
    this.comments = []
    this.color_profile = 'srgb'
    this.init_root()
  }

  /** The root page node every document starts with (id 1). */
  private init_root(): void {
    const id = this.next_id.alloc()
    const root = Node.new(id, { type: 'page', background: { r: 0.9608, g: 0.9608, b: 0.9608, a: 1 }, flows: [], prototype: {}, guides: [] }, 'Page 1', 0, 0)
    this.nodes.set(id, root)
    this.pages.push(id)
    this.current_page = id
  }

  /** The root node (the first page acts as the tree root's container list). */
  root(): NodeT | null {
    return this.nodes.get(this.pages[0] ?? 0) ?? null
  }

  /** The node `id`, or null. */
  node(id: NodeId): NodeT | null {
    return this.nodes.get(id) ?? null
  }

  /** All node ids in storage order. */
  ids(): Iterable<NodeId> {
    return this.nodes.keys()
  }

  /** Every node, in storage order. */
  allNodes(): Iterable<NodeT> {
    return this.nodes.values()
  }

  nodesCount(): number {
    return this.nodes.size
  }

  /** The page `id` sits on (the node itself for a page). */
  page_of(id: NodeId): NodeId | null {
    let cur: NodeId | null | undefined = id
    while (cur !== null && cur !== undefined) {
      const n = this.nodes.get(cur)
      if (!n) return null
      if (n.kind.type === 'page') return n.id
      cur = n.parent
    }
    return null
  }

  /** The style with `id`, or null. */
  style(id: string): Style | null {
    return this.styles.find((s) => s.id === id) ?? null
  }

  /** Whether `id` is a node of this document. */
  contains(id: NodeId): boolean {
    return this.nodes.has(id)
  }

  /** The node for `id`, throwing when it is unknown (Rust `get`). */
  get(id: NodeId): NodeT {
    const n = this.nodes.get(id)
    if (!n) throw new DocError('no_node', `no node ${id}`)
    return n
  }

  /** A mutable copy of `id`, throwing when it is unknown (Rust `get_mut`). */
  get_mut(id: NodeId): NodeT {
    const n = this.node_mut(id)
    if (!n) throw new DocError('no_node', `no node ${id}`)
    return n
  }

  /**
   * Restore `old` when the node hasn't really changed since it was captured
   * (a layout pass that left it where it was): the id also drops out of the
   * dirty set when it wasn't dirty before. Returns whether it did.
   */
  keep_if_unchanged(old: NodeT, was_dirty: boolean): boolean {
    const now = this.nodes.get(old.id)
    if (!now || !nodesEqual(now, old)) return false
    this.nodes.set(old.id, old)
    if (!was_dirty) this.dirty.ids.delete(old.id)
    return true
  }

  /**
   * Copy-on-write access: clones `node` into a fresh mutable copy (Rust
   * `Arc::make_mut`) and marks it dirty. Returns null when the id is unknown.
   */
  node_mut(id: NodeId): NodeT | null {
    const existing = this.nodes.get(id)
    if (!existing) return null
    const copy = structuredCloneNode(existing)
    this.nodes.set(id, copy)
    this.dirty.add(id)
    return copy
  }

  /** Insert a node built by the caller (id from `alloc_id`). */
  insert(node: NodeT): void {
    this.nodes.set(node.id, node)
    this.dirty.add(node.id)
  }

  alloc_id(): NodeId {
    return this.next_id.alloc()
  }

  /**
   * A copy-on-write snapshot: the node map is copied (nodes stay shared until
   * `node_mut` clones them), so undo history entries capture real state the
   * way Rust's `Arc<Document>` clones do.
   */
  clone(): Document {
    const copy = new Document()
    // Replace the auto-created root with the source's contents.
    for (const [id, node] of this.nodes) copy.nodes.set(id, structuredCloneNode(node))
    copy.nodes.delete(copy.pages[0] ?? 0)
    if (!copy.nodes.has(copy.pages[0] ?? 0) && this.pages[0] !== undefined) {
      const root = this.nodes.get(this.pages[0])
      if (root) copy.nodes.set(copy.pages[0], structuredCloneNode(root))
    }
    copy.pages = [...this.pages]
    copy.name = this.name
    copy.current_page = this.current_page
    copy.styles = structuredClone(this.styles)
    copy.variables = structuredClone(this.variables)
    copy.document_colors = this.document_colors.map((c) => ({ ...c }))
    copy.color_profile = this.color_profile
    copy.next_id = new IdAlloc(this.next_id.next, this.next_id.client)
    return copy
  }

  /** Delete `id` (and detach it from its parent); children come with it. */
  delete(id: NodeId): boolean {
    const n = this.nodes.get(id)
    if (!n) return false
    if (n.parent !== null && n.parent !== undefined) {
      const p = this.nodes.get(n.parent)
      if (p) {
        const copy = structuredCloneNode(p)
        copy.children = copy.children.filter((c) => c !== id)
        this.nodes.set(p.id, copy)
        this.dirty.add(p.id)
      }
    }
    const remove = (rid: NodeId): void => {
      const rn = this.nodes.get(rid)
      if (rn) for (const c of rn.children) remove(c)
      this.nodes.delete(rid)
      this.dirty.add(rid)
    }
    remove(id)
    return true
  }

  /**
   * The ids whose subtree differs between `before` and now (Rust
   * `changed_ids` via `imbl::OrdMap::diff`).
   */
  changed_ids(before: Map<NodeId, NodeT>): NodeId[] {
    const changed = new Set<NodeId>()
    for (const [id, node] of this.nodes) {
      const was = before.get(id)
      if (!was || !nodesEqual(was, node)) {
        changed.add(id)
        if (node.parent !== null && node.parent !== undefined) changed.add(node.parent)
      }
    }
    for (const id of before.keys()) {
      if (!this.nodes.has(id)) {
        changed.add(id)
        const was = before.get(id)
        if (was && was.parent !== null && was.parent !== undefined) changed.add(was.parent)
      }
    }
    return [...changed]
  }

  /** Whether `ancestor` contains `id` (or is `id`). */
  contains_id(id: NodeId): boolean {
    return this.nodes.has(id)
  }

  is_ancestor(ancestor: NodeId, id: NodeId): boolean {
    let cur: NodeId | null | undefined = id
    while (cur !== null && cur !== undefined) {
      if (cur === ancestor) return true
      cur = this.nodes.get(cur)?.parent
    }
    return false
  }

  subtree(id: NodeId): NodeId[] {
    const out: NodeId[] = [id]
    const walk = (nid: NodeId): void => {
      const n = this.nodes.get(nid)
      if (!n) return
      for (const c of n.children) {
        out.push(c)
        walk(c)
      }
    }
    walk(id)
    return out
  }

  /**
   * Enforce tree invariants after an untrusted load: parent links match
   * children lists, no cycles, children are containers' children (Rust
   * `validate` / `repair`).
   */
  validate(): string[] {
    const warnings: string[] = []
    // Parent links ↔ children lists.
    for (const [id, n] of this.nodes) {
      if (n.children.includes(id)) {
        warnings.push(`node ${id} lists itself as a child`)
        n.children = n.children.filter((c) => c !== id)
      }
      for (const c of n.children) {
        const child = this.nodes.get(c)
        if (!child) {
          warnings.push(`node ${id} lists missing child ${c}`)
        } else if (child.parent !== id) {
          const fixed = this.node_mut(c)
          if (fixed) fixed.parent = id
        }
      }
      if (n.parent !== null && n.parent !== undefined) {
        const p = this.nodes.get(n.parent)
        if (!p) {
          const fixed = this.node_mut(id)
          if (fixed) fixed.parent = null
          warnings.push(`node ${id} has missing parent ${n.parent}`)
        }
      }
    }
    // Cycle detection.
    for (const id of this.nodes.keys()) {
      const seen = new Set<NodeId>()
      let cur: NodeId | null | undefined = id
      while (cur !== null && cur !== undefined) {
        if (seen.has(cur)) {
          const fixed = this.node_mut(id)
          if (fixed) fixed.parent = null
          warnings.push(`node ${id} is in a parent cycle`)
          break
        }
        seen.add(cur)
        cur = this.nodes.get(cur)?.parent
      }
    }
    if (warnings.length > 0) this.dirty.clear()
    return warnings
  }

  /** Ancestors from the parent up to (and including) the page. */
  ancestors(id: NodeId): NodeId[] {
    const out: NodeId[] = []
    let cur = this.nodes.get(id)?.parent ?? null
    while (cur !== null && cur !== undefined && out.length <= 10_000) {
      out.push(cur)
      cur = this.nodes.get(cur)?.parent ?? null
    }
    return out
  }

  /** Node ids touched since the last call, clearing the record. */
  take_dirty(): Set<NodeId> {
    const ids = new Set(this.dirty.ids)
    this.dirty.clear()
    return ids
  }

  /** Record `ids` as touched, for passes that follow the dirty set. */
  mark_dirty(ids: Iterable<NodeId>): void {
    for (const id of ids) this.dirty.add(id)
  }

  /** Index of `id` among its siblings. */
  index_in_parent(id: NodeId): number | null {
    const parent = this.nodes.get(id)?.parent
    if (parent === null || parent === undefined) return null
    const p = this.nodes.get(parent)
    if (!p) return null
    const at = p.children.indexOf(id)
    return at < 0 ? null : at
  }

  /** Transform from `id`'s local space to its page. */
  world_transform(id: NodeId): AffineT {
    let xf = Affine.IDENTITY
    let cur: NodeId | null | undefined = id
    let guard = 0
    while (cur !== null && cur !== undefined) {
      const n = this.nodes.get(cur)
      if (!n || n.kind.type === 'page') break
      xf = Affine.mul(n.transform, xf)
      cur = n.parent
      guard += 1
      if (guard > 10_000) break
    }
    return xf
  }

  /** The node's own box in its local space. */
  local_rect(id: NodeId): GeomRect | null {
    const n = this.nodes.get(id)
    return n ? RectMath.new(0, 0, n.width, n.height) : null
  }

  /** Remove a node and its subtree. Pages can only be removed while another page remains. */
  remove(id: NodeId): void {
    const node = this.nodes.get(id)
    if (!node) throw new DocError('no_node', `no node ${id}`)
    if (node.kind.type === 'page') {
      if (this.pages.length <= 1) throw new DocError('invalid', 'a file needs at least one page')
      this.pages = this.pages.filter((p) => p !== id)
      if (this.current_page === id) this.current_page = this.pages[0] ?? null
    }
    const parent = node.parent
    if (parent !== null && parent !== undefined) {
      const p = this.node_mut(parent)
      if (p) p.children = p.children.filter((c) => c !== id)
    }
    for (const d of this.subtree(id)) {
      this.nodes.delete(d)
      this.dirty.add(d)
    }
  }

  /** Whether sections may go in `parent`: a page or another section. */
  takes_sections(parent: NodeId): boolean {
    const p = this.nodes.get(parent)
    return p !== undefined && (p.kind.type === 'page' || p.kind.type === 'section')
  }

  /**
   * Move `id` under `new_parent` at `index` (null = top), keeping its world
   * position.
   */
  reparent(id: NodeId, new_parent: NodeId, index: number | null): void {
    if (this.is_ancestor(id, new_parent)) throw new DocError('cycle', `${id} cannot go inside itself`)
    const np = this.nodes.get(new_parent)
    if (!np) throw new DocError('no_node', `no node ${new_parent}`)
    if (!Node.is_container(np.kind)) throw new DocError('not_container', `${new_parent} takes no children`)
    const node = this.nodes.get(id)
    if (!node) throw new DocError('no_node', `no node ${id}`)
    if (node.kind.type === 'page') throw new DocError('invalid', "pages can't be moved into nodes")
    if (node.kind.type === 'section' && !this.takes_sections(new_parent)) {
      throw new DocError('invalid', 'sections go on the page or in other sections, not in frames or groups')
    }
    const world = this.world_transform(id)
    const old_parent = node.parent ?? null
    const old_index = this.index_in_parent(id)
    if (old_parent !== null) {
      const p = this.node_mut(old_parent)
      if (p) p.children = p.children.filter((c) => c !== id)
    }
    const parent_world = this.world_transform(new_parent)
    const target = this.node_mut(new_parent)
    if (!target) throw new DocError('no_node', `no node ${new_parent}`)
    let at = index ?? target.children.length
    if (old_parent === new_parent && old_index !== null && index !== null && old_index < at) {
      at = Math.max(0, at - 1)
    }
    at = Math.min(at, target.children.length)
    target.children.splice(at, 0, id)
    const moved = this.node_mut(id)
    if (!moved) throw new DocError('no_node', `no node ${id}`)
    moved.parent = new_parent
    moved.transform = Affine.mul(Affine.inverse(parent_world), world)
  }

  /**
   * Resize a group/boolean so its box tightly wraps its children (children keep
   * world position).
   */
  fit_to_children(id: NodeId): void {
    const n = this.nodes.get(id)
    if (!n || n.children.length === 0) return
    const world = this.world_transform(id)
    const inv = Affine.inverse(world)
    let local: GeomRect | null = null
    for (const c of n.children) {
      const cn = this.nodes.get(c)
      if (!cn) continue
      const r = transform_rect_bbox(Affine.mul(inv, this.world_transform(c)), RectMath.new(0, 0, cn.width, cn.height))
      local = local === null ? r : RectMath.union(local, r)
    }
    if (local === null) return
    const children = [...n.children]
    const childWorlds = children.map((c) => [c, this.world_transform(c)] as const)
    const shift = Affine.translate({ x: local.x0, y: local.y0 })
    const nw = Affine.mul(world, shift)
    const g = this.node_mut(id)
    if (!g) return
    g.transform = Affine.mul(g.transform, shift)
    g.width = local.x1 - local.x0
    g.height = local.y1 - local.y0
    const ninv = Affine.inverse(nw)
    for (const [c, w] of childWorlds) {
      const cn = this.node_mut(c)
      if (cn) cn.transform = Affine.mul(ninv, w)
    }
  }

  /** Fit every group/boolean ancestor of `id` (innermost first). */
  fit_ancestors(id: NodeId): void {
    for (const a of this.ancestors(id)) {
      const n = this.nodes.get(a)
      if (n && Node.bounds_follow_children(n.kind)) this.fit_to_children(a)
      else break
    }
  }

  /** `id`'s transform in the space of the frame it is in: groups fold in (Rust `frame_relative`). */
  frame_relative(id: NodeId): AffineT {
    const n = this.nodes.get(id)
    if (!n) return Affine.IDENTITY
    let t = n.transform
    let parent = n.parent
    while (parent !== null && parent !== undefined) {
      const p = this.nodes.get(parent)
      if (!p || !Node.bounds_follow_children(p.kind)) break
      t = Affine.mul(p.transform, t)
      parent = p.parent
    }
    return t
  }

  /**
   * The children that make up `n`'s box: all of them, except layers a
   * visible mask below them masks (the mask's part stands in).
   */
  box_children(n: NodeT): Array<[NodeId, NodeT]> {
    let masked = false
    const out: Array<[NodeId, NodeT]> = []
    for (const c of n.children) {
      const k = this.nodes.get(c)
      if (!k) continue
      if (k.is_mask) {
        masked = k.visible
        out.push([c, k])
        continue
      }
      if (masked) continue
      out.push([c, k])
    }
    return out
  }

  /** Parse a node id from untrusted strings (`"12"`, `"0:12"`). */
  static parse_id(s: string): NodeId | null {
    return parseNodeId(s)
  }
}

/**
 * A deep copy of a node, so a snapshot and the live document never share a
 * mutable field. The kind, its per-type data and every nested record are
 * mutated in place by commands, so a shallow copy would let an edit reach back
 * into the snapshot that undo restores.
 */
function structuredCloneNode(n: NodeT): NodeT {
  const copy = structuredClone(n)
  copy.overrides = new Set(n.overrides)
  return copy
}

/** Structural equality for nodes (Rust derives PartialEq). */
function nodesEqual(a: NodeT, b: NodeT): boolean {
  return (
    a.id === b.id &&
    a.name === b.name &&
    a.kind.type === b.kind.type &&
    JSON.stringify(kindData(a.kind)) === JSON.stringify(kindData(b.kind)) &&
    a.parent === b.parent &&
    a.children.length === b.children.length &&
    a.children.every((c, i) => c === b.children[i]) &&
    a.visible === b.visible &&
    a.locked === b.locked &&
    a.opacity === b.opacity &&
    a.width === b.width &&
    a.height === b.height &&
    a.fills.length === b.fills.length &&
    a.strokes.length === b.strokes.length &&
    JSON.stringify(a.transform.coeffs) === JSON.stringify(b.transform.coeffs)
  )
}

function kindData(kind: NodeKind): unknown {
  const { type: _type, ...rest } = kind
  return rest
}

export { Node }
export type { NodeT, NodeKind, Affine }
