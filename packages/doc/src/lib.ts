/**
 * ZenuxsDesign document model — the scene graph, styles, variables, images and
 * comments. (Converted 1:1 from FigCraft `crates/doc/src/lib.rs`; the
 * persistent `imbl::OrdMap` becomes a copy-on-write `Map` with the same public
 * API: `node`, `node_mut` COW, `changed_ids` diff.)
 */

import type { Color } from '@zenuxs/color'
import {
  Affine,
  RectMath,
  transform_rect_bbox,
  type Affine as AffineT,
  type Rect as GeomRect
} from '@zenuxs/geom'

import type { Comment } from './comments'
import { parseNodeId, type NodeId } from './ids'
import { Node, type NodeKind, type Node as NodeT } from './node'
import type { Interaction, Action } from './proto'
import { walk_mut } from './proto'
import type { Variables, Style } from './styles'

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

  /** Never hand out `id` (or anything below it in this space) again. */
  reserve(id: NodeId): void {
    if (this.client === 0) {
      if (id >= this.next) this.next = id + 1
      return
    }
    const local = id - Math.floor(id / 2 ** 32) * 2 ** 32
    if (Math.floor(id / 2 ** 32) === this.client && local >= this.next) this.next = local + 1
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
    const root = Node.new(
      id,
      {
        type: 'page',
        background: { r: 0.9608, g: 0.9608, b: 0.9608, a: 1 },
        flows: [],
        prototype: {},
        guides: []
      },
      'Page 1',
      0,
      0
    )
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
    if (this.is_ancestor(id, new_parent))
      throw new DocError('cycle', `${id} cannot go inside itself`)
    const np = this.nodes.get(new_parent)
    if (!np) throw new DocError('no_node', `no node ${new_parent}`)
    if (!Node.is_container(np.kind))
      throw new DocError('not_container', `${new_parent} takes no children`)
    const node = this.nodes.get(id)
    if (!node) throw new DocError('no_node', `no node ${id}`)
    if (node.kind.type === 'page') throw new DocError('invalid', "pages can't be moved into nodes")
    if (node.kind.type === 'section' && !this.takes_sections(new_parent)) {
      throw new DocError(
        'invalid',
        'sections go on the page or in other sections, not in frames or groups'
      )
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
   * Move `id` under `parent` at `index` (clamped) keeping its local transform,
   * unlike `reparent`, which keeps its place on the page.
   */
  place(id: NodeId, parent: NodeId, index: number): void {
    const node = this.nodes.get(id)
    if (!node) throw new DocError('no_node', `no node ${id}`)
    if (node.kind.type === 'page') throw new DocError('invalid', "pages can't be moved into nodes")
    const p = this.nodes.get(parent)
    if (!p) throw new DocError('no_node', `no node ${parent}`)
    if (!Node.is_container(p.kind))
      throw new DocError('not_container', `${parent} takes no children`)
    if (this.is_ancestor(id, parent)) throw new DocError('cycle', `${id} cannot go inside itself`)
    const old = node.parent
    if (old !== null && old !== undefined) {
      const op = this.node_mut(old)
      if (op) op.children = op.children.filter((c) => c !== id)
    }
    const target = this.node_mut(parent)
    if (!target) throw new DocError('no_node', `no node ${parent}`)
    const at = Math.min(Math.max(0, index), target.children.length)
    target.children.splice(at, 0, id)
    const moved = this.node_mut(id)
    if (moved) moved.parent = parent
  }

  /** Reorder `id` within its parent to `index`. */
  reorder(id: NodeId, index: number): void {
    const node = this.nodes.get(id)
    if (!node) throw new DocError('no_node', `no node ${id}`)
    const parent = node.parent
    if (parent === null || parent === undefined) throw new DocError('invalid', 'page')
    const p = this.node_mut(parent)
    if (!p) throw new DocError('no_node', `no node ${parent}`)
    p.children = p.children.filter((c) => c !== id)
    const at = Math.min(Math.max(0, index), p.children.length)
    p.children.splice(at, 0, id)
  }

  /** Set `id`'s transform so that its world transform becomes `world`. */
  set_world_transform(id: NodeId, world: AffineT): void {
    const node = this.nodes.get(id)
    if (!node) throw new DocError('no_node', `no node ${id}`)
    const parent = node.parent
    const pw =
      parent !== null && parent !== undefined ? this.world_transform(parent) : Affine.IDENTITY
    const inv = inverseOrIdentity(pw)
    const n = this.node_mut(id)
    if (n) n.transform = Affine.mul(inv, world)
  }

  /** Axis-aligned bounds of the node's box in page coordinates. */
  world_bounds(id: NodeId): GeomRect | null {
    const n = this.nodes.get(id)
    if (!n) return null
    if (n.kind.type === 'page') return this.page_content_bounds(id)
    return transform_rect_bbox(this.world_transform(id), RectMath.new(0, 0, n.width, n.height))
  }

  /**
   * Bounds of everything painted by a node, effects and strokes included (page
   * coordinates): a clipping frame's own area, else that and what its visible
   * children show (masked children only within their mask). A group is what its
   * children show, grown by its effects.
   */
  world_render_bounds(id: NodeId): GeomRect | null {
    const n = this.nodes.get(id)
    if (!n) return null
    const own = Node.own_paint_bounds(n, this.world_transform(id))
    if (n.clip && Node.is_frame_like(n.kind) && !Node.bounds_follow_children(n.kind)) return own
    const kids = this.children_render_bounds(n)
    if (kids === null) return own
    return n.kind.type === 'group' ? Node.grow_by_effects(n, kids) : RectMath.union(own, kids)
  }

  /** What `n`'s visible children show, together: each mask's run within the mask's bounds. */
  private children_render_bounds(n: NodeT): GeomRect | null {
    let out: GeomRect | null = null
    for (const run of this.paint_runs(n)) {
      const ids = n.children.slice(run.start, run.end)
      const first = ids[0]
      const firstNode = first === undefined ? null : (this.nodes.get(first) ?? null)
      const mask = firstNode && firstNode.is_mask && firstNode.visible ? first : null
      let r: GeomRect | null = null
      for (const i of ids) {
        const c = this.nodes.get(i)
        if (!c || !c.visible || c.is_mask) continue
        const b = this.world_render_bounds(i)
        if (b !== null) r = r === null ? b : RectMath.union(r, b)
      }
      if (mask !== null) {
        const mb = this.world_render_bounds(mask)
        const cut = r !== null && mb !== null ? RectMath.intersect(r, mb) : null
        r = cut !== null && RectMath.width(cut) > 0 && RectMath.height(cut) > 0 ? cut : null
      }
      out = out === null ? r : r === null ? out : RectMath.union(out, r)
    }
    return out
  }

  /** Union of the top-level nodes' bounds on a page. */
  page_content_bounds(page: NodeId): GeomRect | null {
    const p = this.nodes.get(page)
    if (!p) return null
    let out: GeomRect | null = null
    for (const c of p.children) {
      const b = this.world_bounds(c)
      if (b !== null) out = out === null ? b : RectMath.union(out, b)
    }
    return out
  }

  /** Union of several nodes' world bounds. */
  bounds_of(ids: NodeId[]): GeomRect | null {
    let out: GeomRect | null = null
    for (const id of ids) {
      const b = this.world_bounds(id)
      if (b !== null) out = out === null ? b : RectMath.union(out, b)
    }
    return out
  }

  /**
   * Deep-copy `id`'s subtree under `parent` (at `index`), returning the new root
   * id. The copy keeps the original's local transform; ids are fresh.
   */
  duplicate_into(id: NodeId, parent: NodeId, index: number | null): NodeId {
    const map = new Map<NodeId, NodeId>()
    const src = this.subtreeNodes(id)
    for (const n of src) map.set(n.id, this.alloc_id())
    return this.paste_nodes(src, map, id, parent, index)
  }

  /**
   * Deep-copy each of `ids`' subtrees to the end of `parent`, in order. One id
   * map covers every copy, so references between the copies resolve.
   */
  duplicate_all_into(ids: NodeId[], parent: NodeId): NodeId[] {
    const map = new Map<NodeId, NodeId>()
    const trees: Array<{ id: NodeId; nodes: NodeT[] }> = []
    for (const id of ids) {
      const src = this.subtreeNodes(id)
      for (const n of src) map.set(n.id, this.alloc_id())
      trees.push({ id, nodes: src })
    }
    return trees.map((t) => this.paste_nodes(t.nodes, map, t.id, parent, null))
  }

  /** `id`'s subtree as detached node copies (the source of a duplicate or a copy). */
  subtreeNodes(id: NodeId): NodeT[] {
    const out: NodeT[] = []
    for (const i of this.subtree(id)) {
      const n = this.nodes.get(i)
      if (n) out.push(structuredCloneNode(n))
    }
    return out
  }

  /**
   * Insert copies of `nodes` (a subtree rooted at `root`, from this or another
   * document) with ids remapped by `map`. Interactions, instance references and
   * pattern sources pointing inside the subtree are remapped too.
   */
  paste_nodes(
    nodes: NodeT[],
    map: Map<NodeId, NodeId>,
    root: NodeId,
    parent: NodeId,
    index: number | null
  ): NodeId {
    const p = this.nodes.get(parent)
    if (!p) throw new DocError('no_node', `no node ${parent}`)
    if (!Node.is_container(p.kind))
      throw new DocError('not_container', `${parent} takes no children`)
    const new_root = map.get(root)
    if (new_root === undefined) throw new DocError('no_node', `no node ${root}`)
    for (const n of nodes) {
      const new_id = map.get(n.id)
      if (new_id === undefined) continue
      const c = structuredCloneNode(n)
      c.id = new_id
      c.children = n.children.map((k) => map.get(k)).filter((k): k is NodeId => k !== undefined)
      if (n.id === root) {
        c.parent = parent
      } else {
        const mapped = n.parent === null || n.parent === undefined ? undefined : map.get(n.parent)
        c.parent = mapped ?? null
      }
      for (const it of c.interactions) {
        walkMutActions(it, (a) => remapAction(a, map))
      }
      if (c.kind.type === 'instance') {
        const m = map.get(c.kind.component)
        if (m !== undefined) c.kind = { ...c.kind, component: m }
      }
      // A pattern tiling a layer of the copy tiles the copy's layer.
      for (const paint of [...c.fills, ...c.strokes]) {
        if (paint.kind.type === 'pattern') {
          const m = map.get(paint.kind.source)
          if (m !== undefined) paint.kind = { ...paint.kind, source: m }
        }
      }
      this.reserve_ids(new_id)
      this.nodes.set(new_id, c)
      this.dirty.add(new_id)
    }
    const target = this.node_mut(parent)
    if (!target) throw new DocError('no_node', `no node ${parent}`)
    const at = Math.min(index ?? target.children.length, target.children.length)
    target.children.splice(at, 0, new_root)
    return new_root
  }

  /** Keep the id allocator ahead of `id` (ids adopted from another document). */
  reserve_ids(id: NodeId): void {
    this.next_id.reserve(id)
  }

  /** Find nodes on `page` (or all pages) whose name contains `query` (case-insensitive). */
  find_by_name(query: string, page: NodeId | null): NodeId[] {
    const q = query.toLowerCase()
    const roots = page === null ? [...this.pages] : [page]
    const out: NodeId[] = []
    for (const r of roots) {
      for (const i of this.subtree(r)) {
        const n = this.nodes.get(i)
        if (n && n.kind.type !== 'page' && n.name.toLowerCase().includes(q)) out.push(i)
      }
    }
    return out
  }

  /** The nearest frame-like ancestor (excluding `id` itself). */
  containing_frame(id: NodeId): NodeId | null {
    for (const a of this.ancestors(id)) {
      const n = this.nodes.get(a)
      if (n && (Node.is_frame_like(n.kind) || n.kind.type === 'section')) return a
    }
    return null
  }

  /**
   * The top-level frame containing `id` (or `id` if it is one): the outermost
   * frame, on the page or in a section (sections nest and hold top-level frames).
   */
  top_level_frame(id: NodeId): NodeId | null {
    const chain = [id, ...this.ancestors(id)]
    // The chain ends with the page; below it, past any sections, is the top-level node.
    const page_pos = chain.findIndex((c) => this.nodes.get(c)?.kind.type === 'page')
    if (page_pos < 0) return null
    let top: NodeId | null = null
    for (let i = page_pos - 1; i >= 0; i--) {
      const c = chain[i]
      if (c !== undefined && this.nodes.get(c)?.kind.type !== 'section') {
        top = c
        break
      }
    }
    if (top === null) return null
    const n = this.nodes.get(top)
    return n && Node.is_frame_like(n.kind) ? top : null
  }

  /** Top-level frames of a page (also those in sections), in reading order. */
  top_frames(page: NodeId): NodeId[] {
    return this.frames_in(page)
  }

  /**
   * The top-level frames inside page or section `container` (and its sections,
   * at any depth), in reading order.
   */
  frames_in(container: NodeId): NodeId[] {
    const found: Array<{ id: NodeId; b: GeomRect }> = []
    const walk = (id: NodeId, depth: number): void => {
      const n = this.nodes.get(id)
      if (!n) return
      for (const c of n.children) {
        const cn = this.nodes.get(c)
        if (!cn) continue
        if (Node.is_frame_like(cn.kind)) {
          const b = this.world_bounds(c)
          if (b !== null) found.push({ id: c, b })
        } else if (cn.kind.type === 'section' && depth < 64) {
          walk(c, depth + 1)
        }
      }
    }
    walk(container, 0)
    found.sort((a, b) => (a.b.y0 !== b.b.y0 ? a.b.y0 - b.b.y0 : a.b.x0 - b.b.x0))
    return found.map((f) => f.id)
  }

  /** The sections on page `page` (nested ones after their section), in layer order. */
  sections_in(page: NodeId): NodeId[] {
    const out: NodeId[] = []
    const walk = (id: NodeId, depth: number): void => {
      const n = this.nodes.get(id)
      if (!n) return
      for (const c of n.children) {
        if (this.nodes.get(c)?.kind.type === 'section' && depth < 64) {
          out.push(c)
          walk(c, depth + 1)
        }
      }
    }
    walk(page, 0)
    return out
  }

  /** A unique name like "Frame 3" for a new node of a kind. */
  next_name(base: string): string {
    let max = 0
    const taken = new Set<number>()
    for (const id of this.nodes.keys()) {
      const n = this.nodes.get(id)
      if (!n || !n.name.startsWith(base)) continue
      const rest = n.name.slice(base.length)
      if (!rest.startsWith(' ')) continue
      const num = rest.slice(1)
      if (!/^\d+$/.test(num)) continue
      const k = Number(num)
      if (!Number.isSafeInteger(k)) continue
      max = Math.max(max, k)
      taken.add(k)
    }
    let next = max + 1
    if (!Number.isSafeInteger(next)) {
      next = 1
      while (taken.has(next)) next += 1
    }
    return `${base} ${next}`
  }

  /**
   * `n`'s children as paint runs (index ranges into `n.children`), bottom to
   * top: a visible mask with the layers above it up to the next mask, or a
   * single layer. An auto layout frame whose first child paints on top paints
   * the runs in reverse.
   */
  paint_runs(n: NodeT): Array<{ start: number; end: number }> {
    const runs: Array<{ start: number; end: number }> = []
    const len = n.children.length
    let i = 0
    while (i < len) {
      let j = i + 1
      const first = this.nodes.get(n.children[i] ?? 0)
      if (first && first.is_mask && first.visible) {
        while (j < len) {
          const next = this.nodes.get(n.children[j] ?? 0)
          if (next && next.is_mask) break
          j += 1
        }
      }
      runs.push({ start: i, end: j })
      i = j
    }
    if (n.layout?.reverse_z === true) runs.reverse()
    return runs
  }

  /**
   * Bounds of a group/boolean so its box tightly wraps its children (children
   * keep world position).
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
      const r = transform_rect_bbox(
        Affine.mul(inv, this.world_transform(c)),
        RectMath.new(0, 0, cn.width, cn.height)
      )
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

/** `xf`'s inverse, or the identity when it is singular (a flattened parent). */
function inverseOrIdentity(xf: AffineT): AffineT {
  const det = Affine.determinant(xf)
  if (!Number.isFinite(det) || Math.abs(det) < 1e-12) return Affine.IDENTITY
  return Affine.inverse(xf)
}

/** Point `dest` of the actions that navigate somewhere at the copy's node. */
function remapAction(a: Action, map: Map<NodeId, NodeId>): void {
  switch (a.type) {
    case 'navigate':
    case 'scrollTo':
    case 'openOverlay':
    case 'swapOverlay':
    case 'changeTo': {
      const m = map.get(a.dest)
      if (m !== undefined) a.dest = m
      break
    }
    default:
      break
  }
}

/** Call `f` on every action, descending into conditional blocks. */
function walkMutActions(i: Interaction, f: (a: Action) => void): void {
  walk_mut(i.actions, f)
}

export { Node }
export type { NodeT, NodeKind, Affine }
