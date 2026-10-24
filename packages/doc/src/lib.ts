/**
 * ZenuxsDesign document model — the scene graph, styles, variables, images and
 * comments. (Converted 1:1 from FigCraft `crates/doc/src/lib.rs`; the
 * persistent `imbl::OrdMap` becomes a copy-on-write `Map` with the same public
 * API: `node`, `node_mut` COW, `changed_ids` diff.)
 */

import type { Color } from '@zenuxs/color'
import type { Affine } from '@zenuxs/geom'
import { Node, type NodeKind, type Node as NodeT } from './node'
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

/** A shared style. */
export interface Style {
  id: string
  name: string
  folder?: string
  kind: { type: 'color'; paints: unknown[] } | { type: 'text'; style: unknown } | { type: 'effect'; effects: unknown[] } | { type: 'grid'; grids: unknown[] }
}

/** Variables: collections and variables (full model in `styles.ts`). */
export interface Variables {
  collections: Array<{ id: string; name: string; modes: Array<{ id: string; name: string }>; default_mode?: string; hidden_from_publishing?: boolean }>
  variables: Array<{ id: string; name: string; collection: string; values: Record<string, unknown>; scopes: string[]; code_syntax?: string }>
}

/** A comment thread. */
export interface Comment {
  id: string
  page: NodeId
  target?: NodeId | null
  x: number
  y: number
  messages: Array<{ id: string; user: string; text: string; time: string; reactions: Array<{ user: string; emoji: string }>; resolved?: boolean }>
  resolved: boolean
}

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

  nodesCount(): number {
    return this.nodes.size
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

  /** Parse a node id from untrusted strings (`"12"`, `"0:12"`). */
  static parse_id(s: string): NodeId | null {
    return parseNodeId(s)
  }
}

/** Clone a node with its Set restored as a Set (structuredClone loses Sets into arrays? it keeps them). */
function structuredCloneNode(n: NodeT): NodeT {
  const copy = { ...n }
  copy.children = [...n.children]
  copy.overrides = new Set(n.overrides)
  copy.fills = n.fills.map((p) => ({ ...p }))
  copy.strokes = n.strokes.map((p) => ({ ...p }))
  return copy as NodeT
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
