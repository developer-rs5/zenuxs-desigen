/**
 * ZenuxsDesign document format: the `.zenuxs` file — a zip archive holding
 * `document.json` (the document model, JSON with omitted defaults), image
 * bytes under `images/<sha256>`, a `thumbnail.png`, and `versions/` snapshots
 * plus `branches/` when present. Plain `document.json` alone also opens.
 * (Converted 1:1 from FigCraft `crates/format/src/lib.rs`; fflate replaces
 * the Rust `zip` crate.)
 */

import { zipSync, unzipSync, strFromU8, strToU8 } from 'fflate'

import { Document } from '@zenuxs/doc'
import { Node, omitNodeDefaults, type Guide, type Node as NodeT } from '@zenuxs/doc'

export const FORMAT_VERSION = 1
export const DOCUMENT_ENTRY = 'document.json'
export const IMAGES_DIR = 'images/'
export const THUMBNAIL_ENTRY = 'thumbnail.png'
export const VERSIONS_ENTRY = 'versions/index.json'

/** A saved version in the file's history. */
export interface Version {
  id: string
  label: string
  created: number
}

/** A branch of the file. */
export interface Branch {
  id: string
  name: string
}

/** Serialize a node to the file's JSON shape (defaults omitted, kind flattened). */
export function nodeToJson(n: Node): Record<string, unknown> {
  return omitNodeDefaults(n)
}

/** Serialize a document to the `document.json` value. */
export function documentToJson(doc: Document): Record<string, unknown> {
  return {
    format: 'zenuxs',
    version: FORMAT_VERSION,
    name: doc.name,
    pages: doc.pages,
    nodes: [...doc.ids()].map((id) => {
      const n = doc.node(id)
      return n ? nodeToJson(n) : null
    }),
    current_page: doc.current_page,
    styles: doc.styles,
    variables: doc.variables,
    document_colors: doc.document_colors,
    comments: doc.comments,
    color_profile: doc.color_profile
  }
}

/** Parse `document.json` back into a Document (lenient, like FigCraft's reader). */
export function documentFromJson(json: unknown): Document {
  const doc = new Document()
  const o = (json ?? {}) as Record<string, unknown>
  if (typeof o.name === 'string') doc.name = o.name
  if (Array.isArray(o.pages)) doc.pages = o.pages.filter((x): x is number => typeof x === 'number')
  if (Array.isArray(o.nodes)) {
    // Clear the auto-created root; the file's nodes replace it.
    const own = doc.ids()
    for (const id of [...own]) doc.delete(id)
    doc.pages = []
    for (const raw of o.nodes) {
      if (!raw || typeof raw !== 'object') continue
      const nodeJson = raw as Record<string, unknown>
      const id = typeof nodeJson.id === 'number' ? nodeJson.id : null
      if (id === null) continue
      const kindType = typeof nodeJson.type === 'string' ? nodeJson.type : 'frame'
      const node = nodeFromJson(id, kindType, nodeJson)
      doc.insert(node)
      if (kindType === 'page') doc.pages.push(id)
    }
    doc.current_page = typeof o.current_page === 'number' ? o.current_page : (doc.pages[0] ?? null)
  }
  if (Array.isArray(o.styles)) doc.styles = o.styles as typeof doc.styles
  if (o.variables && typeof o.variables === 'object') doc.variables = o.variables as typeof doc.variables
  if (Array.isArray(o.document_colors)) doc.document_colors = o.document_colors as typeof doc.document_colors
  if (typeof o.color_profile === 'string') doc.color_profile = o.color_profile as typeof doc.color_profile
  const warnings = doc.validate()
  if (warnings.length > 0) console.warn('[format] document repaired:', warnings.join('; '))
  return doc
}

/** Build one node from its JSON shape (defaults filled back in). */
function nodeFromJson(id: number, kindType: string, json: Record<string, unknown>): NodeT {
  const width = typeof json.width === 'number' ? json.width : 0
  const height = typeof json.height === 'number' ? json.height : 0
  const name = typeof json.name === 'string' ? json.name : 'Layer'
  const kind = makeKind(kindType, json)
  const node = Node.new(id, kind, name, width, height)
  applyOptional(node, json)
  return node
}

function makeKind(type: string, json: Record<string, unknown>): NodeT['kind'] {
  switch (type) {
    case 'page':
      return {
        type: 'page',
        background: (json.background as Node['kind'] extends never ? never : { r: number; g: number; b: number; a: number }) ?? { r: 0.9608, g: 0.9608, b: 0.9608, a: 1 },
        flows: (json.flows as unknown[]) ?? [],
        prototype: (json.prototype as Record<string, unknown>) ?? {},
        guides: (json.guides as Guide[]) ?? []
      }
    case 'ellipse':
      return { type: 'ellipse', start: (json.start as number) ?? 0, sweep: (json.sweep as number) ?? Math.PI * 2, inner: (json.inner as number) ?? 0 }
    case 'polygon':
      return { type: 'polygon', count: (json.count as number) ?? 3 }
    case 'star':
      return { type: 'star', count: (json.count as number) ?? 5, inner_ratio: (json.inner_ratio as number) ?? 0.38 }
    case 'vector':
      return { type: 'vector', network: (json.network as never) ?? { vertices: [], segments: [], regions: [] } }
    case 'booleanOp':
      return { type: 'booleanOp', op: (json.op as 'union') ?? 'union' }
    case 'component':
      return { type: 'component', description: (json.description as string) ?? '', props: (json.props as Record<string, never>) ?? {} }
    case 'componentSet':
      return { type: 'componentSet', description: (json.description as string) ?? '' }
    case 'instance':
      return { type: 'instance', component: (json.component as number) ?? 0, props: (json.props as Record<string, unknown>) ?? {} }
    case 'section':
      return { type: 'section', contents_hidden: (json.contents_hidden as boolean) ?? false }
    case 'text':
      return json as unknown as Node['kind']
    default:
      return { type: 'frame' }
  }
}

function applyOptional(node: Node, json: Record<string, unknown>): void {
  if (json.parent !== null && json.parent !== undefined) node.parent = json.parent as number
  if (Array.isArray(json.children)) node.children = json.children.filter((x): x is number => typeof x === 'number')
  if (typeof json.visible === 'boolean') node.visible = json.visible
  if (typeof json.locked === 'boolean') node.locked = json.locked
  if (typeof json.opacity === 'number') node.opacity = json.opacity
  if (typeof json.blend === 'string') node.blend = json.blend as NodeT['blend']
  if (Array.isArray(json.transform)) {
    const t = json.transform as number[]
    if (t.length === 6) node.transform = { coeffs: [t[0], t[1], t[2], t[3], t[4], t[5]] }
  }
  if (Array.isArray(json.fills)) node.fills = json.fills as NodeT['fills']
  if (Array.isArray(json.strokes)) node.strokes = json.strokes as NodeT['strokes']
  if (json.stroke && typeof json.stroke === 'object') node.stroke = json.stroke as NodeT['stroke']
  if (Array.isArray(json.effects)) node.effects = json.effects
  if (json.corners && typeof json.corners === 'object') node.corners = json.corners as NodeT['corners']
  if (json.constraints && typeof json.constraints === 'object') node.constraints = json.constraints as NodeT['constraints']
  if (json.layout && typeof json.layout === 'object') node.layout = json.layout as NodeT['layout']
  if (json.child_layout && typeof json.child_layout === 'object') node.child_layout = json.child_layout as NodeT['child_layout']
  if (typeof json.clip === 'boolean') node.clip = json.clip
  if (typeof json.is_mask === 'boolean') node.is_mask = json.is_mask
  if (typeof json.mask_type === 'string') node.mask_type = json.mask_type as NodeT['mask_type']
  if (Array.isArray(json.grids)) node.grids = json.grids as NodeT['grids']
  if (Array.isArray(json.guides)) node.guides = json.guides as NodeT['guides']
  if (Array.isArray(json.exports)) node.exports = json.exports as NodeT['exports']
  if (Array.isArray(json.interactions)) node.interactions = json.interactions
  if (typeof json.overflow === 'string') node.overflow = json.overflow as NodeT['overflow']
  if (typeof json.scroll_position === 'string') node.scroll_position = json.scroll_position as NodeT['scroll_position']
  if (json.styles && typeof json.styles === 'object') node.styles = json.styles as NodeT['styles']
  if (json.bound && typeof json.bound === 'object') node.bound = json.bound as NodeT['bound']
  if (json.var_modes && typeof json.var_modes === 'object') node.var_modes = json.var_modes as NodeT['var_modes']
  if (typeof json.bool_op === 'string') node.bool_op = json.bool_op as NodeT['bool_op']
  if (typeof json.constrain_proportions === 'boolean') node.constrain_proportions = json.constrain_proportions
  if (json.source !== null && json.source !== undefined) node.source = json.source as number
  if (typeof json.exposed === 'boolean') node.exposed = json.exposed
  if (typeof json.dev_status === 'string') node.dev_status = json.dev_status as NodeT['dev_status']
  if (typeof json.dev_note === 'string') node.dev_note = json.dev_note
  if (Array.isArray(json.annotations)) node.annotations = json.annotations as NodeT['annotations']
  if (Array.isArray(json.code_links)) node.code_links = json.code_links as NodeT['code_links']
  if (Array.isArray(json.dev_resources)) node.dev_resources = json.dev_resources as NodeT['dev_resources']
}

/** Save a document (and its images/thumbnail) as `.zenuxs` bytes. */
export function saveZenuxs(
  doc: Document,
  options?: { images?: Map<string, Uint8Array>; thumbnail?: Uint8Array; versions?: Version[]; branches?: Branch[] }
): Uint8Array {
  const files: Record<string, Uint8Array> = {
    [DOCUMENT_ENTRY]: strToU8(JSON.stringify(documentToJson(doc)))
  }
  if (options?.images) {
    for (const [hash, bytes] of options.images) {
      files[`${IMAGES_DIR}${hash}`] = bytes
    }
  }
  if (options?.thumbnail) {
    files[THUMBNAIL_ENTRY] = options.thumbnail
  }
  if (options?.versions && options.versions.length > 0) {
    files[VERSIONS_ENTRY] = strToU8(JSON.stringify(options.versions))
  }
  if (options?.branches && options.branches.length > 0) {
    for (const b of options.branches) {
      files[`branches/${b.id}.json`] = strToU8(JSON.stringify(b))
    }
  }
  return zipSync(files, { level: 6 })
}

/** Open `.zenuxs` bytes: the zip archive, or a bare `document.json`. */
export function openZenuxs(bytes: Uint8Array): { doc: Document; images: Map<string, Uint8Array>; thumbnail: Uint8Array | null; versions: Version[]; branches: Branch[] } {
  const images = new Map<string, Uint8Array>()
  let thumbnail: Uint8Array | null = null
  let versions: Version[] = []
  let branches: Branch[] = []
  let json: unknown
  try {
    const unzipped = unzipSync(bytes)
    const docEntry = unzipped[DOCUMENT_ENTRY]
    if (!docEntry) throw new Error('no document.json')
    json = JSON.parse(strFromU8(docEntry))
    for (const [name, data] of Object.entries(unzipped)) {
      if (name.startsWith(IMAGES_DIR) && name.length > IMAGES_DIR.length) {
        images.set(name.slice(IMAGES_DIR.length), data)
      }
    }
    if (unzipped[THUMBNAIL_ENTRY]) thumbnail = unzipped[THUMBNAIL_ENTRY]
    if (unzipped[VERSIONS_ENTRY]) {
      try {
        versions = JSON.parse(strFromU8(unzipped[VERSIONS_ENTRY])) as Version[]
      } catch {}
    }
    for (const [name, data] of Object.entries(unzipped)) {
      if (name.startsWith('branches/') && name.endsWith('.json')) {
        try {
          branches.push(JSON.parse(strFromU8(data)) as Branch)
        } catch {}
      }
    }
  } catch {
    // A bare document.json also opens.
    json = JSON.parse(strFromU8(bytes))
  }
  return { doc: documentFromJson(json), images, thumbnail, versions, branches }
}
