/**
 * Clipboard: duplicate, copy/cut/paste, paste over or to replace, and copying
 * properties between layers. The clipboard itself lives on the `Session`, so
 * the UI can mirror it to the system clipboard.
 * (Converted 1:1 from FigCraft `crates/engine/src/cmd/edit.rs`.)
 */

import {
  Node,
  type Document,
  type ImageData,
  type Node as NodeT,
  type NodeId,
  type NodeKind
} from '@zenuxs/doc'
import { Affine, Vec2Math, type Rect as GeomRect } from '@zenuxs/geom'

import { EngineError, ok, spec, type CommandSpec, type Session } from '../lib'
import { apply } from './node'
import { bad, num, optId, reqTargets } from './params'
import { roots, z_sorted } from './select'

/** A copied layer: its root id and the detached subtree's nodes. */
type CopiedNodes = Array<{ root: NodeId; nodes: NodeT[] }>

/** The name a duplicate gets: `"X 12"` → `"X 13"`, anything else `"X 2"`. */
export function bumpName(n: string): string {
  const at = n.lastIndexOf(' ')
  if (at > 0) {
    const num = n.slice(at + 1)
    if (/^\d+$/.test(num)) {
      const next = Number(num) + 1
      if (Number.isSafeInteger(next)) return `${n.slice(0, at)} ${next}`
    }
  }
  return `${n} 2`
}

/** The copied form of `ids`: page-space transforms, the images they use, and their bounds. */
function copied(
  doc: Document,
  ids: NodeId[]
): { nodes: CopiedNodes; images: Map<string, ImageData>; bounds: GeomRect | null } {
  const order = z_sorted(doc, roots(doc, ids))
  const nodes: CopiedNodes = []
  const images = new Map<string, ImageData>()
  for (const i of order) {
    const world = doc.world_transform(i)
    const sub = doc.subtreeNodes(i)
    const first = sub[0]
    // Store the root's transform in page space so pastes land where it was.
    if (first) first.transform = world
    for (const n of sub) {
      for (const p of [...n.fills, ...n.strokes]) {
        if (p.kind.type !== 'image') continue
        const d = doc.images.get(p.kind.image)
        if (d) images.set(p.kind.image, d)
      }
    }
    nodes.push({ root: i, nodes: sub })
  }
  return { nodes, images, bounds: doc.bounds_of(order) }
}

/** The copied form of the selection, stored on the clipboard. */
export function copyToClipboard(s: Session, cmd: string, ids: NodeId[]): void {
  const ds = s.ds()
  // Pages are not layers: they can't be pasted anywhere.
  const layers = ids.filter((i) => {
    const n = ds.doc.node(i)
    return n === null || !Node.is_page(n)
  })
  if (layers.length === 0 && ids.length > 0) {
    throw new EngineError(
      `command \`${cmd}\` is not available right now: pages can't be copied; use page.duplicate`
    )
  }
  const { nodes, images, bounds } = copied(ds.doc, layers)
  s.clipboard.source = ds.doc.clone()
  s.clipboard.source_path = ds.path
  s.clipboard.source_doc = ds.uid
  s.clipboard.copied_components = new Set(
    nodes
      .filter(({ nodes: sub }) => {
        const first = sub[0]
        return (
          cmd === 'edit.copy' &&
          first !== undefined &&
          (first.kind.type === 'component' || first.kind.type === 'componentSet')
        )
      })
      .map(({ root }) => root)
  )
  s.clipboard.nodes = nodes
  s.clipboard.images = images
  s.clipboard.bounds = bounds
}

/** Copy `id` within its own file under `parent` at `index`. */
function copyInFile(doc: Document, id: NodeId, parent: NodeId, index: number | null): NodeId {
  const n = doc.node(id)
  if (!n) throw new Error(`no such node ${id}`)
  const inSet = doc.node(parent)?.kind.type === 'componentSet'
  // A file has one main per component, so a main's copy is an instance of it.
  if (n.kind.type !== 'component' || inSet) return doc.duplicate_into(id, parent, index)
  const transform = n.transform
  const instance = createInstanceAt(doc, id, parent, 0, 0, index)
  const made = doc.node_mut(instance)
  if (made) made.transform = transform
  return instance
}

/** Put an instance of `component` under `parent`, its layers rebuilt from the main. */
function createInstanceAt(
  doc: Document,
  component: NodeId,
  parent: NodeId,
  x: number,
  y: number,
  index: number | null
): NodeId {
  const comp = doc.node(component)
  if (!comp) throw new Error(`no such node ${component}`)
  if (comp.kind.type !== 'component') throw new Error(`${component} is not a component`)
  if (doc.is_ancestor(component, parent)) {
    throw new Error("an instance can't be placed inside its own main component")
  }
  const id = doc.alloc_id()
  const root = structuredClone(comp)
  root.id = id
  root.name = defaultInstanceName(doc, component)
  root.kind = { type: 'instance', component, props: defaultProps(comp) }
  root.children = []
  root.parent = null
  root.source = component
  root.overrides = new Set()
  root.transform = Affine.translate(Vec2Math.new(x, y))
  root.prop_refs = {}
  root.annotations = []
  root.code_links = []
  root.dev_resources = []
  root.interactions = []
  root.var_modes = {}
  doc.insert(root)
  const p = doc.node_mut(parent)
  if (!p) throw new Error(`no such node ${parent}`)
  const kids = [...p.children]
  kids.splice(index === null ? kids.length : Math.min(index, kids.length), 0, id)
  p.children = kids
  syncInstance(doc, id)
  return id
}

/** The name an instance of `component` gets (`"Badge"` → `"Badge 1"`). */
function defaultInstanceName(doc: Document, component: NodeId): string {
  const base = doc.node(component)?.name ?? 'Instance'
  let k = 1
  for (;;) {
    const candidate = `${base} ${k}`
    if (doc.find_by_name(candidate, null).length === 0) return candidate
    k += 1
  }
}

/** The property values an instance starts with (the main's defaults). */
function defaultProps(comp: NodeT): Record<string, unknown> {
  const out: Record<string, unknown> = {}
  if (comp.kind.type !== 'component') return out
  for (const [k, v] of Object.entries(comp.kind.props)) {
    const def = v !== null && typeof v === 'object' ? (v as { default?: unknown }) : null
    if (def && 'default' in def) out[k] = def.default
  }
  return out
}

/**
 * Rebuild `inst`'s layers from its main component, keeping overridden
 * property groups. Instances never gain or lose layers of their own, so their
 * structure always follows the main.
 */
export function syncInstance(doc: Document, inst: NodeId): void {
  syncInstanceDepth(doc, inst, 0)
}

const MAX_INSTANCE_DEPTH = 16

function syncInstanceDepth(doc: Document, inst: NodeId, depth: number): void {
  if (depth > MAX_INSTANCE_DEPTH) return
  const root = doc.node(inst)
  if (!root || root.kind.type !== 'instance') return
  const main = doc.node(root.kind.component)
  if (!main) return
  // Its own place, size and name stay; everything inside comes from the main.
  const previous = new Map<NodeId, NodeT>()
  for (const i of doc.subtree(inst)) {
    const n = doc.node(i)
    if (n && i !== inst) previous.set(i, n)
  }
  const kept = new Map<string, NodeT>()
  for (const n of previous.values()) {
    if (n.source !== null && n.source !== undefined) kept.set(`${n.source}`, n)
  }
  for (const child of [...root.children]) doc.remove(child)
  for (const mainChild of main.children) {
    const made = cloneFromMain(doc, mainChild, inst, kept)
    if (made !== null) applyOverrides(doc, made, previous)
  }
  const again = doc.node(inst)
  if (again) again.overrides = new Set(again.overrides)
  for (const child of doc.node(inst)?.children ?? []) syncInstanceDepth(doc, child, depth + 1)
}

/** Deep-copy `mainId`'s subtree under `parent`, recording each copy's source. */
function cloneFromMain(
  doc: Document,
  mainId: NodeId,
  parent: NodeId,
  kept: Map<string, NodeT>
): NodeId | null {
  const src = doc.subtreeNodes(mainId)
  const map = new Map<NodeId, NodeId>()
  for (const n of src) {
    const reuse = kept.get(`${n.id}`)
    map.set(n.id, reuse ? reuse.id : doc.alloc_id())
  }
  try {
    const root = doc.paste_nodes(src, map, mainId, parent, null)
    for (const [oldId, newId] of map) {
      const made = doc.node_mut(newId)
      if (made && oldId === mainId) made.source = mainId
    }
    return root
  } catch {
    return null
  }
}

/**
 * Re-apply the property groups the instance had overridden. Overrides are
 * matched by source id, so a rebuild keeps them.
 */
function applyOverrides(doc: Document, made: NodeId, previous: Map<NodeId, NodeT>): void {
  const n = doc.node(made)
  if (!n) return
  const old = previous.get(made)
  if (!old || old.overrides.size === 0) return
  const next = doc.node_mut(made)
  if (!next) return
  for (const group of old.overrides) {
    switch (group) {
      case 'fills':
        next.fills = old.fills
        break
      case 'strokes':
        next.strokes = old.strokes
        break
      case 'stroke':
        next.stroke = old.stroke
        break
      case 'effects':
        next.effects = old.effects
        break
      case 'opacity':
        next.opacity = old.opacity
        break
      case 'blend':
        next.blend = old.blend
        break
      case 'visible':
        next.visible = old.visible
        break
      case 'name':
        next.name = old.name
        break
      case 'corners':
        next.corners = old.corners
        break
      case 'characters':
        if (next.kind.type === 'text' && old.kind.type === 'text') {
          next.kind = { ...next.kind, characters: old.kind.characters, runs: old.kind.runs }
        }
        break
      case 'textStyle':
        if (next.kind.type === 'text' && old.kind.type === 'text') {
          next.kind = { ...next.kind, style: old.kind.style }
        }
        break
      case 'grids':
        next.grids = old.grids
        break
      case 'exports':
        next.exports = old.exports
        break
      case 'interactions':
        next.interactions = old.interactions
        break
      default:
        break
    }
  }
}

/** Paste the clipboard under `parent` with the copied top-left at `at` (page coords). */
export function pasteInto(s: Session, parent: NodeId, at: [number, number] | null): NodeId[] {
  const clip = s.clipboard
  if (clip.nodes.length === 0) {
    throw new EngineError('command `edit.paste` is not available right now: the clipboard is empty')
  }
  const ds = s.ds()
  // From another file: its instances follow the mains this file can have.
  const foreign = clip.source !== null && ds.uid !== clip.source_doc ? clip.source : null
  const copyLocal = ds.uid === clip.source_doc
  const doc = ds.doc
  for (const [k, v] of clip.images) if (!doc.images.has(k)) doc.images.set(k, v)
  // Sections go on the page (or in sections), never in the frame being pasted into.
  const page = doc.page_of(parent) ?? parent
  const shift =
    at !== null && clip.bounds !== null
      ? Affine.translate(Vec2Math.new(at[0] - clip.bounds.x0, at[1] - clip.bounds.y0))
      : Affine.IDENTITY
  const out: NodeId[] = []
  for (const entry of clip.nodes) {
    const first = entry.nodes[0]
    if (!first) continue
    // A copied main component pastes as an instance of it within its own file.
    if (
      copyLocal &&
      clip.copied_components.has(entry.root) &&
      first.kind.type === 'component' &&
      doc.node(entry.root)?.kind.type === 'component'
    ) {
      const instance = createInstanceAt(doc, entry.root, parent, 0, 0, null)
      const made = doc.node_mut(instance)
      if (made) {
        made.transform = Affine.mul(
          Affine.inverse(doc.world_transform(parent)),
          Affine.mul(shift, first.transform)
        )
      }
      out.push(instance)
      continue
    }
    const map = new Map<NodeId, NodeId>()
    const nodes = entry.nodes.map((n) => {
      const copy = structuredClone(n)
      map.set(n.id, doc.alloc_id())
      return copy
    })
    const section = nodes[0]?.kind.type === 'section'
    const into = section && !doc.takes_sections(parent) ? page : parent
    const root = nodes[0]
    if (root) {
      root.transform = Affine.mul(
        Affine.inverse(doc.world_transform(into)),
        Affine.mul(shift, root.transform)
      )
    }
    out.push(doc.paste_nodes(nodes, map, entry.root, into, null))
  }
  if (foreign !== null) adoptPasted(doc, foreign, clip.source_path, doc)
  return out
}

/**
 * Make the instances pasted from another file follow this file's mains: a
 * same-named component here takes over; otherwise the main is copied in.
 */
function adoptPasted(
  doc: Document,
  source: Document,
  _sourcePath: string | null,
  _target: Document
): void {
  const sourceComponents = new Map<string, NodeId>()
  for (const n of source.allNodes()) {
    if (n.kind.type === 'component') sourceComponents.set(n.name, n.id)
  }
  if (sourceComponents.size === 0) return
  const localComponents = new Map<string, NodeId>()
  for (const n of doc.allNodes()) {
    if (n.kind.type === 'component') localComponents.set(n.name, n.id)
  }
  // Only same-named mains are adopted; the rest keep their own main, which
  // arrives with the paste when it was part of the copied layers.
  for (const [name, localId] of localComponents) {
    const remoteId = sourceComponents.get(name)
    if (remoteId === undefined || remoteId === localId) continue
    for (const n of [...doc.allNodes()]) {
      if (n.kind.type !== 'instance' || n.kind.component !== remoteId) continue
      const made = doc.node_mut(n.id)
      if (made && made.kind.type === 'instance') {
        made.kind = { type: 'instance', component: localId, props: made.kind.props }
      }
    }
  }
}

// ------------------------------ duplicate ------------------------------

/** Layers duplicated last (Duplicate or Alt-drag) and their copies, in order. */
export interface Duplicated {
  sources: NodeId[]
  copies: NodeId[]
}

export const Duplicated = {
  is_selection(d: Duplicated, sel: NodeId[]): boolean {
    const a = new Set(d.copies)
    const b = new Set(sel)
    if (d.copies.length === 0 || a.size !== b.size) return false
    for (const id of a) if (!b.has(id)) return false
    return true
  },

  /** The page offset from the sources to the copies, if both are there and the copies move freely. */
  offset(d: Duplicated, doc: Document): [number, number] | null {
    const free = d.copies.every((c) => {
      const n = doc.node(c)
      if (!n) return false
      const parent = n.parent === null || n.parent === undefined ? null : doc.node(n.parent)
      return n.child_layout.absolute || parent === null || parent.layout === null
    })
    if (!free) return null
    for (const i of [...d.sources, ...d.copies]) if (!doc.contains(i)) return null
    const a = doc.bounds_of(d.sources)
    const b = doc.bounds_of(d.copies)
    if (a === null || b === null) return null
    const dx = b.x0 - a.x0
    const dy = b.y0 - a.y0
    if (!Number.isFinite(dx) || !Number.isFinite(dy)) return null
    return dx !== 0 || dy !== 0 ? [dx, dy] : null
  }
}

/** Move `id` by `(dx, dy)` in page space (auto layout keeps its own placement). */
function moveWorld(doc: Document, id: NodeId, dx: number, dy: number): void {
  const n = doc.node(id)
  if (!n) throw new Error(`no such node ${id}`)
  const world = doc.world_transform(id)
  const moved = Affine.mul(Affine.translate(Vec2Math.new(dx, dy)), world)
  doc.set_world_transform(id, moved)
}

// ------------------------------ specs ------------------------------

const DUPLICATE_SPECS: CommandSpec[] = [
  spec(
    'edit.duplicate',
    'Duplicate',
    "{ids?, dx?, dy? (page offset; default: the offset of the last duplicate when ids are its copies, still selected; else top-level frames to the right with a 100 gap, everything else in place)}  a main component's copy is an instance of it (a variant stays a new variant in its set)",
    true,
    (s, p) => {
      const ids = reqTargets('edit.duplicate', s, p)
      const rename = s.prefs.rename_duplicates
      const explicit = num(p, 'dx') !== null || num(p, 'dy') !== null
      const ds = s.ds()
      const rootsNow = z_sorted(ds.doc, roots(ds.doc, ids))
      const last = ds.last_duplicate
      const repeat =
        last !== null && !explicit && Duplicated.is_selection(last, rootsNow)
          ? Duplicated.offset(last, ds.doc)
          : null
      const doc = ds.doc
      const out: NodeId[] = []
      for (const i of rootsNow) {
        const n = doc.node(i)
        if (!n) throw bad('edit.duplicate', `no such node ${i}`)
        const parent = n.parent
        if (parent === null || parent === undefined) {
          throw bad('edit.duplicate', 'pages are duplicated with page.duplicate')
        }
        const parentNode = doc.node(parent)
        const topFrame =
          parentNode !== null &&
          Node.is_page(parentNode) &&
          (n.kind.type === 'frame' || n.kind.type === 'section')
        const at = doc.index_in_parent(i)
        const idx = at === null ? null : at + 1
        const w = n.width
        const nid = copyInFile(doc, i, parent, idx)
        const dx = num(p, 'dx')
        const dy = num(p, 'dy')
        if (repeat !== null) {
          moveWorld(doc, nid, repeat[0], repeat[1])
        } else {
          const [ox, oy] =
            dx !== null ? [dx, dy ?? 0] : dy !== null ? [0, dy] : topFrame ? [w + 100, 0] : [0, 0]
          const made = doc.node_mut(nid)
          if (made) {
            made.transform = Affine.mul(Affine.translate(Vec2Math.new(ox, oy)), made.transform)
          }
        }
        // An instance keeps the name instances get by default.
        const after = doc.node(nid)
        if (rename && after !== null && after.kind.type !== 'instance') {
          const made = doc.node_mut(nid)
          if (made) made.name = bumpName(made.name)
        }
        out.push(nid)
      }
      s.set_selection(out)
      s.ds().last_duplicate = { sources: rootsNow, copies: out }
      return ok({ ids: out })
    }
  )
]

const COPY_SPECS: CommandSpec[] = [
  spec('edit.copy', 'Copy', '{ids?}', false, (s, p) => {
    const ids = reqTargets('edit.copy', s, p)
    copyToClipboard(s, 'edit.copy', ids)
    return ok({ copied: s.clipboard.nodes.length })
  }),
  spec('edit.cut', 'Cut', '{ids?}', true, (s, p) => {
    const ids = reqTargets('edit.cut', s, p)
    copyToClipboard(s, 'edit.cut', ids)
    const doc = s.doc()
    const layers = ids.filter((i) => {
      const n = doc.node(i)
      return n === null || !Node.is_page(n)
    })
    for (const i of z_sorted(doc, roots(doc, layers)).reverse()) doc.remove(i)
    s.set_selection([])
    return ok({ deleted: layers })
  }),
  spec(
    'edit.paste',
    'Paste',
    '{parent?, x?, y? (page coordinates of the pasted top-left)}  a copied main component pastes as an instance of it within its file (cut ones, and pastes into other files, keep the component)',
    true,
    (s, p) => {
      const page = s.page()
      const sel = s.selection()
      const doc = s.doc()
      const copyLocal = s.ds().uid === s.clipboard.source_doc
      const explicit = optId('edit.paste', p, 'parent')
      const first = sel[0]
      const auto =
        first !== undefined &&
        sel.length === 1 &&
        (doc.node(first)?.kind.type === 'frame' || doc.node(first)?.kind.type === 'section') &&
        doc.node(first)?.kind.type !== 'instance' &&
        (!copyLocal ||
          ![...s.clipboard.copied_components].some((root) => doc.is_ancestor(root, first)))
          ? first
          : null
      const target = explicit ?? auto
      const parent = target ?? page
      const x = num(p, 'x')
      const y = num(p, 'y')
      let at: [number, number] | null
      if (x !== null && y !== null) {
        at = [x, y]
      } else {
        const b = s.clipboard.bounds
        if (target !== null && b !== null) {
          const tb = doc.world_bounds(target)
          if (tb === null) {
            at = null
          } else if (
            b.x0 >= tb.x0 &&
            b.x0 <= tb.x1 &&
            b.y0 >= tb.y0 &&
            b.y0 <= tb.y1 &&
            b.x1 >= tb.x0 &&
            b.x1 <= tb.x1 &&
            b.y1 >= tb.y0 &&
            b.y1 <= tb.y1
          ) {
            at = null
          } else {
            const c = { x: (tb.x0 + tb.x1) / 2, y: (tb.y0 + tb.y1) / 2 }
            at = [c.x - (b.x1 - b.x0) / 2, c.y - (b.y1 - b.y0) / 2]
          }
        } else if (target === null && b !== null) {
          // Off-screen originals paste at the viewport centre.
          const v = s.ds().view
          const z = Math.max(v.zoom, 1e-9)
          const vr = {
            x0: v.cx - v.vw / 2 / z,
            y0: v.cy - v.vh / 2 / z,
            x1: v.cx + v.vw / 2 / z,
            y1: v.cy + v.vh / 2 / z
          }
          const hit = intersectRect(vr, b)
          const zeroArea = hit === null || hit.x1 <= hit.x0 || hit.y1 <= hit.y0
          at = zeroArea ? [v.cx - (b.x1 - b.x0) / 2, v.cy - (b.y1 - b.y0) / 2] : null
        } else {
          at = null
        }
      }
      const ids = pasteInto(s, parent, at)
      s.set_selection(ids)
      return ok({ ids })
    }
  ),
  spec('edit.pasteOver', 'Paste over selection', '{}', true, (s) => {
    const sel = s.selection()
    const page = s.page()
    const doc = s.doc()
    const first = sel[0]
    const parent = first === undefined ? page : (doc.node(first)?.parent ?? page)
    const b = first === undefined ? null : doc.world_bounds(first)
    const ids = pasteInto(s, parent, b === null ? null : [b.x0, b.y0])
    s.set_selection(ids)
    return ok({ ids })
  }),
  spec('edit.pasteReplace', 'Paste to replace', '{ids?}', true, (s, p) => {
    const targets = reqTargets('edit.pasteReplace', s, p)
    const out: NodeId[] = []
    for (const t of targets) {
      const doc = s.doc()
      const n = doc.node(t)
      if (!n) continue
      const parent = n.parent
      if (parent === null || parent === undefined) {
        throw bad('edit.pasteReplace', "can't replace a page")
      }
      const idx = doc.index_in_parent(t)
      const b = doc.world_bounds(t)
      const ids = pasteInto(s, parent, b === null ? null : [b.x0, b.y0])
      const again = s.doc()
      ids.forEach((i, k) => {
        if (idx !== null) again.reorder(i, idx + k)
      })
      again.remove(t)
      out.push(...ids)
    }
    s.set_selection(out)
    return ok({ ids: out })
  }),
  spec(
    'edit.pasteDesignLayers',
    'Paste design layers',
    '{html?, data?, parent?, x?, y?}',
    true,
    () => {
      throw bad(
        'edit.pasteDesignLayers',
        "reading another app's design data needs the format layer"
      )
    }
  )
]

function intersectRect(a: GeomRect, b: GeomRect): GeomRect | null {
  const x0 = Math.max(a.x0, b.x0)
  const y0 = Math.max(a.y0, b.y0)
  const x1 = Math.min(a.x1, b.x1)
  const y1 = Math.min(a.y1, b.y1)
  if (x0 > x1 || y0 > y1) return null
  return { x0, y0, x1, y1 }
}

// ------------------------------ properties ------------------------------

/** The property groups Copy properties takes from `id`. */
export function copyPropsOf(doc: Document, id: NodeId): Record<string, unknown> | null {
  const n = doc.node(id)
  if (!n) return null
  const out: Record<string, unknown> = {
    fills: n.fills,
    strokes: n.strokes,
    strokeWeight: n.stroke.weight,
    strokeAlign: n.stroke.align,
    effects: n.effects,
    opacity: n.opacity,
    blend: n.blend,
    cornerRadius: n.corners.radii,
    cornerSmoothing: n.corners.smoothing
  }
  if (n.kind.type === 'text') {
    const st = n.kind.style as Record<string, unknown>
    out.fontFamily = st.font_family
    out.fontStyle = st.font_style
    out.fontSize = st.font_size
    out.fontVariations = st.variations
    out.lineHeight = st.line_height
    out.letterSpacing = st.letter_spacing
  }
  return out
}

const PROP_SPECS: CommandSpec[] = [
  spec('edit.copyProperties', 'Copy properties', '{id?}', false, (s, p) => {
    const id = reqFirstSelection(s, p, 'edit.copyProperties')
    const v = copyPropsOf(s.doc(), id)
    s.clipboard.props = v
    return v ?? ok()
  }),
  spec('edit.pasteProperties', 'Paste properties', '{ids?}', true, (s, p) => {
    const props = s.clipboard.props
    if (props === null) {
      throw new EngineError(
        'command `edit.pasteProperties` is not available right now: no copied properties'
      )
    }
    const ids = reqTargets('edit.pasteProperties', s, p)
    const doc = s.doc()
    for (const i of ids) {
      const n = doc.node(i)
      if (!n) continue
      const m: Record<string, unknown> = { ...props }
      if (n.kind.type !== 'text') {
        for (const k of Object.keys(m)) {
          if (k.startsWith('font') || k === 'lineHeight' || k === 'letterSpacing') delete m[k]
        }
      }
      if (!cornerRadiusApplies(n.kind)) {
        delete m.cornerRadius
        delete m.cornerSmoothing
      }
      apply(doc, i, m, [])
    }
    return ok()
  }),
  spec('edit.setDefaultProperties', 'Set default properties', '{id?}', false, (s, p) => {
    const id = reqFirstSelection(s, p, 'edit.setDefaultProperties')
    s.clipboard.props = copyPropsOf(s.doc(), id)
    return ok()
  })
]

/** Whether a kind takes a corner radius. */
function cornerRadiusApplies(kind: NodeKind): boolean {
  return (
    kind.type === 'frame' ||
    kind.type === 'rectangle' ||
    kind.type === 'component' ||
    kind.type === 'componentSet' ||
    kind.type === 'instance'
  )
}

function reqFirstSelection(s: Session, p: Record<string, unknown>, cmd: string): NodeId {
  const one = optId(cmd, p, 'id')
  if (one !== null) return one
  const first = s.ds().selection[0]
  if (first === undefined) throw bad(cmd, 'select one layer')
  return first
}

export const CLIPBOARD_SPECS: CommandSpec[] = [...DUPLICATE_SPECS, ...COPY_SPECS, ...PROP_SPECS]
