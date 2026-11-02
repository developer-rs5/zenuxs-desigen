/**
 * ZenuxsDesign engine — the command engine over the document model.
 *
 * Everything is a command: user-visible behaviour = a command spec (`spec()`)
 * executed by `Session.execute(id, params)`. Menus, shortcuts, the Actions
 * palette, the CLI, the control channel and the MCP server all dispatch the
 * same command ids. Undo is full-document snapshots (the document model is
 * cheap to clone). (Converted 1:1 from FigCraft `crates/engine/src/lib.rs`.)
 */

import { Document, type ImageData, type Node as NodeT, type NodeId } from '@zenuxs/doc'
import type { Rect as GeomRect } from '@zenuxs/geom'

import { normalize } from './normalize'

/** Deepest params nesting `resolveStepRefs` walks before giving up. */
const STEP_REF_MAX_DEPTH = 64

/**
 * Replace every `{"$step": n}` / `{"$step": n, "field": "…"}` in `value` with
 * that field (default `id`) of `results[n]`, the result of an earlier batch
 * step.
 */
export function resolveStepRefs(
  value: unknown,
  results: unknown[],
  step: number,
  depth: number
): Record<string, unknown> {
  if (depth > STEP_REF_MAX_DEPTH) {
    throw new EngineError(
      `command.batch: step ${step}: params nest deeper than ${STEP_REF_MAX_DEPTH} levels`
    )
  }
  if (Array.isArray(value)) {
    return value.map((x) => resolveStepRefs(x, results, step, depth + 1)) as never
  }
  if (typeof value !== 'object' || value === null) return value as Record<string, unknown>
  const obj = value as Record<string, unknown>
  if (!('$step' in obj)) {
    const out: Record<string, unknown> = {}
    for (const k of Object.keys(obj)) out[k] = resolveStepRefs(obj[k], results, step, depth + 1)
    return out
  }
  const extra = Object.keys(obj).find((k) => k !== '$step' && k !== 'field')
  if (extra !== undefined) {
    throw new EngineError(
      `command.batch: step ${step}: a \`$step\` reference takes only \`field\`, not \`${extra}\``
    )
  }
  const raw = obj.$step
  if (typeof raw !== 'number' || !Number.isInteger(raw) || raw < 0) {
    throw new EngineError(`command.batch: step ${step}: \`$step\` must be a step index (0, 1, …)`)
  }
  const field = obj.field === undefined ? 'id' : obj.field
  if (typeof field !== 'string') {
    throw new EngineError(`command.batch: step ${step}: \`field\` must be a string`)
  }
  const result = results[raw]
  if (result === undefined) {
    const range = step === 0 ? 'there is none before step 0' : `0 to ${step - 1}`
    throw new EngineError(
      `command.batch: step ${step}: \`$step\` ${raw} must be an earlier step (${range})`
    )
  }
  const picked =
    typeof result === 'object' && result !== null
      ? (result as Record<string, unknown>)[field]
      : undefined
  if (picked === undefined) {
    throw new EngineError(`command.batch: step ${step}: step ${raw}'s result has no \`${field}\``)
  }
  return picked as Record<string, unknown>
}

/** The commands that show or end a live text preview (they don't end the showing one). */
export const PREVIEW_COMMANDS: readonly string[] = ['text.preview', 'text.endPreview']

/**
 * Parameters as a plain object. Callers hand over whatever they parsed, so a
 * `null`, an array or a bare value reads as "no parameters" rather than
 * blowing up on the first property read.
 */
function toParams(params: unknown): Record<string, unknown> {
  if (typeof params !== 'object' || params === null || Array.isArray(params)) return {}
  return params as Record<string, unknown>
}

/**
 * End the live text preview, if any: the document is back as it was before it.
 * Returns whether one was showing. (Lives here so `execute` can end a preview
 * without importing the text modules.)
 */
export function endTextPreview(session: Session): boolean {
  const ds = session.ds()
  const base = ds.text_preview
  if (base === null) return false
  ds.text_preview = null
  ds.doc = base
  ds.bump()
  return true
}

/** One undo entry: the document as it was, its selection and page. */
export interface HistoryEntry {
  label: string
  doc: Document
  selection: NodeId[]
  page: NodeId
}

/** Undo/redo stacks (limit 1000, like FigCraft). */
export class History {
  undo: HistoryEntry[] = []
  redo: HistoryEntry[] = []
  limit = 1000

  /** Record the state *before* a command ran (push onto undo, clear redo). */
  record(label: string | null, entry: HistoryEntry): void {
    if (label !== null) {
      this.undo.push({ ...entry, label })
      if (this.undo.length > this.limit) this.undo.shift()
      this.redo = []
    }
  }

  can_undo(): boolean {
    return this.undo.length > 0
  }

  can_redo(): boolean {
    return this.redo.length > 0
  }
}

/** View state: viewport, zoom and the view toggles. */
export interface ViewState {
  cx: number
  cy: number
  zoom: number
  vw: number
  vh: number
  pixel_grid: boolean
  layout_grids: boolean
  rulers: boolean
  outlines: boolean
  /** Outline mode for the selected layers only (the rest draws normally). */
  outlines_selection: boolean
  /** Outline mode also outlines hidden layers. */
  outline_hidden: boolean
  /** Outline mode also draws every layer's box. */
  outline_bounds: boolean
  mask_outlines: boolean
  pixel_preview: boolean
  /** Pixel preview resolution: rendered pixels per page pixel (1 or 2). */
  pixel_scale: number
  show_slices: boolean
  frame_outlines: boolean
  /** Soft-proof sRGB: mark Display P3 colours an sRGB screen can't show. */
  proof_srgb: boolean
  comments: boolean
  multiplayer_cursors: boolean
  snap_geometry: boolean
  snap_objects: boolean
  snap_pixel: boolean
  ui_hidden: boolean
}

export const MIN_ZOOM = 0.02
export const MAX_ZOOM = 256

export const ViewState = {
  default(): ViewState {
    return {
      cx: 0,
      cy: 0,
      zoom: 1,
      vw: 1280,
      vh: 720,
      pixel_grid: false,
      layout_grids: true,
      rulers: true,
      outlines: false,
      outlines_selection: false,
      outline_hidden: false,
      outline_bounds: false,
      mask_outlines: false,
      pixel_preview: false,
      pixel_scale: 1,
      show_slices: false,
      frame_outlines: false,
      proof_srgb: false,
      comments: false,
      multiplayer_cursors: true,
      snap_geometry: true,
      snap_objects: true,
      snap_pixel: false,
      ui_hidden: false
    }
  },

  /** Set `zoom` keeping the point `ax, ay` (page coords) fixed on screen. */
  setZoomAt(v: ViewState, zoom: number, ax: number, ay: number): void {
    const z = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, zoom))
    if (z === v.zoom) return
    // The page point under the viewport centre moves so the anchor stays put.
    const px = v.cx - (v.vw / 2 - ax) / v.zoom
    void px
    v.cx += (ax - v.cx) * (1 - v.zoom / z)
    v.cy += (ay - v.cy) * (1 - v.zoom / z)
    v.zoom = z
  },

  /** Zoom to fit `rect` in the viewport (never above 1 like Figma's shift-1). */
  fit(v: ViewState, rect: { x0: number; y0: number; x1: number; y1: number }, maxZoom = 1): void {
    const w = Math.max(1, rect.x1 - rect.x0)
    const h = Math.max(1, rect.y1 - rect.y0)
    const vw = v.vw > 0 ? v.vw : 1280
    const vh = v.vh > 0 ? v.vh : 720
    const pad = 64
    const zoom = Math.min(maxZoom, Math.min((vw - pad) / w, (vh - pad) / h))
    v.zoom = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, zoom))
    v.cx = (rect.x0 + rect.x1) / 2
    v.cy = (rect.y0 + rect.y1) / 2
  }
}

/** The tools the engine can select (FigCraft's `ToolId`). */
export const TOOL_IDS = [
  'move',
  'scale',
  'hand',
  'frame',
  'section',
  'slice',
  'rectangle',
  'line',
  'arrow',
  'ellipse',
  'polygon',
  'star',
  'pen',
  'pencil',
  'text',
  'comment',
  'eyedropper',
  'shapeBuilder'
] as const

export type ToolId = (typeof TOOL_IDS)[number]

/** The command id of each tool (the eyedropper is `edit.pickColor`). */
export const TOOL_COMMAND: Record<ToolId, string> = {
  move: 'tool.move',
  scale: 'tool.scale',
  hand: 'tool.hand',
  frame: 'tool.frame',
  section: 'tool.section',
  slice: 'tool.slice',
  rectangle: 'tool.rectangle',
  line: 'tool.line',
  arrow: 'tool.arrow',
  ellipse: 'tool.ellipse',
  polygon: 'tool.polygon',
  star: 'tool.star',
  pen: 'tool.pen',
  pencil: 'tool.pencil',
  text: 'tool.text',
  comment: 'tool.comment',
  eyedropper: 'edit.pickColor',
  shapeBuilder: 'tool.shapeBuilder'
}

const TOOL_LABELS: Record<ToolId, string> = {
  move: 'Move',
  scale: 'Scale',
  hand: 'Hand tool',
  frame: 'Frame',
  section: 'Section',
  slice: 'Slice',
  rectangle: 'Rectangle',
  line: 'Line',
  arrow: 'Arrow',
  ellipse: 'Ellipse',
  polygon: 'Polygon',
  star: 'Star',
  pen: 'Pen',
  pencil: 'Pencil',
  text: 'Text',
  comment: 'Comment',
  eyedropper: 'Pick color',
  shapeBuilder: 'Shape builder'
}

export const ToolId = {
  /** The tool with id `id` (case-insensitive), or `null`. */
  fromId(id: string): ToolId | null {
    const k = id.trim().toLowerCase()
    return (TOOL_IDS as readonly string[]).includes(k) ? (k as ToolId) : null
  },

  label(t: ToolId): string {
    return TOOL_LABELS[t]
  }
}

/** The nine anchor points of a selection box, as `tl`…`br`. */
export const ANCHORS = ['tl', 't', 'tr', 'l', 'c', 'r', 'bl', 'b', 'br'] as const

/** An anchor's column and row (0 start, 1 middle, 2 end). */
export type Anchor = readonly [number, number]

/** The anchor named `name` (case-insensitive), or `null`. */
export function anchorOf(name: string): Anchor | null {
  const i = ANCHORS.indexOf(name.trim().toLowerCase() as (typeof ANCHORS)[number])
  return i < 0 ? null : [i % 3, Math.floor(i / 3)]
}

/** The name of anchor `(column, row)`. */
export function anchorName(a: Anchor): string {
  return ANCHORS[Math.min(2, a[1]) * 3 + Math.min(2, a[0])] ?? 'tl'
}

/** The engine's tool state (the selected tool and its options). */
export interface ToolState {
  tool: ToolId
  /** The Scale tool's anchor: the point of the selection box that stays put. */
  scale_anchor: Anchor
  /** The brush the Pencil draws with (`null`: a plain stroke). */
  pencil_brush: Record<string, unknown> | null
}

export const ToolState = {
  default(): ToolState {
    return { tool: 'move', scale_anchor: [1, 1], pencil_brush: null }
  }
}

/** App preferences the engine owns. */
export interface Prefs {
  nudge_small: number
  nudge_large: number
  keep_tool: boolean
  highlight_hover: boolean
  rename_duplicates: boolean
  show_dimensions: boolean
  number_keys_opacity: boolean
  reduce_motion: boolean
  auto_save: boolean
  start_on_home: boolean
  user_name: string
  language: string
  /** `'system'` by default; an explicit `'light'` or `'dark'` choice stays saved. */
  theme: string
  /** How large the whole interface is drawn, relative to the system display scale. */
  ui_scale: number
  panel_left: number
  panel_right: number
  /** View toggles the preferences keep for files opened or made later. */
  view: Record<string, boolean>
}

/** The limits of `pref.uiScale`. */
export const UI_SCALE_MIN = 0.75
export const UI_SCALE_MAX = 3

export const Prefs = {
  default(): Prefs {
    return {
      nudge_small: 1,
      nudge_large: 10,
      keep_tool: false,
      highlight_hover: true,
      rename_duplicates: false,
      show_dimensions: false,
      number_keys_opacity: true,
      reduce_motion: false,
      auto_save: true,
      start_on_home: false,
      user_name: '',
      language: 'en',
      theme: 'system',
      ui_scale: 1,
      panel_left: 240,
      panel_right: 240,
      view: {}
    }
  }
}

/** A text edit in progress. */
export interface TextEdit {
  /** The text layer being edited. */
  node: NodeId
  /** The caret's character index. */
  caret: number
  /** The anchor of a selection's other end; equal to `caret` for a collapsed selection. */
  anchor: number
  /** The IME composition shown at the caret, not yet part of the text. */
  preedit: string
  /** Where in `preedit` the composition's cursor sits. */
  preedit_cursor: number
  /** Whether this edit started the layer (an empty layer goes away when editing stops). */
  created: boolean
}

/**
 * The selection's rotation origin, when moved or shown (not saved).
 */
export interface RotationOrigin {
  /** The selection it belongs to. */
  ids: NodeId[]
  /** Where it was moved, in the first selected layer's own coordinates (so it
   * follows the layer); `null`: the centre. */
  at: { x: number; y: number } | null
  /** The handle shows and can be dragged (Alt+R toggles it, Escape hides it). */
  editing: boolean
}

/**
 * An in-progress vector edit: the layer being edited plus any others edited
 * with it (the full model lives in the vector-edit domain).
 */
export interface VectorEditState {
  id: NodeId
  others: Array<{ id: NodeId }>
  /** Re-clamp the edited vertices to their layers; false when a layer is gone. */
  clamp_doc(doc: Document): boolean
}

/** Layers duplicated last, and their copies, in the same order. */
export interface Duplicated {
  sources: NodeId[]
  copies: NodeId[]
}

export const Duplicated = {
  /** Whether the copies are exactly `selection`. */
  is_selection(d: Duplicated, selection: NodeId[]): boolean {
    if (d.copies.length === 0 || d.copies.length !== selection.length) return false
    const a = new Set(d.copies)
    for (const id of selection) if (!a.has(id)) return false
    return true
  },

  /**
   * The page offset from the sources to the copies, if both are still there
   * and the copies move freely (an auto layout places its own).
   */
  offset(d: Duplicated, doc: Document): [number, number] | null {
    const free = d.copies.every((c) => {
      const n = doc.node(c)
      if (!n) return false
      if (n.child_layout.absolute) return true
      const p = n.parent === null || n.parent === undefined ? null : doc.node(n.parent)
      return p === null || p.layout === null
    })
    if (!free) return null
    if ([...d.sources, ...d.copies].some((id) => !doc.contains(id))) return null
    const a = doc.bounds_of(d.sources)
    const b = doc.bounds_of(d.copies)
    if (!a || !b) return null
    const dx = b.x0 - a.x0
    const dy = b.y0 - a.y0
    if (!Number.isFinite(dx) || !Number.isFinite(dy)) return null
    if (dx === 0 && dy === 0) return null
    return [dx, dy]
  }
}

/** An in-progress gesture (drag, marquee…): the state to preview from. */
export interface Interaction {
  label: string
  doc: Document
  selection: NodeId[]
  page: NodeId
}

/** The next document id a {@link DocState} gets (it identifies the file within the session). */
let NEXT_UID = 1

/** The state of one open document tab. */
export class DocState {
  doc: Document
  selection: NodeId[] = []
  page: NodeId
  history = new History()
  saved_doc: Document
  path: string | null = null
  revision = 0
  view: ViewState
  interaction: Interaction | null = null
  text_edit: TextEdit | null = null
  /** The document as it was before `text.preview`, or null when nothing is previewed. */
  text_preview: Document | null = null
  hover: NodeId | null = null
  /** Identifies this document within the session (stable: clipboard pastes compare it). */
  uid: number
  /** An in-progress vector edit, if any. */
  vector_edit: VectorEditState | null = null
  /** The selection's rotation origin, when moved or shown. */
  rotation_origin: RotationOrigin | null = null
  /** The layers duplicated last and their copies (Alt-drag and Duplicate set it). */
  last_duplicate: Duplicated | null = null
  versions: Array<{ id: string; label: string; created: number }> = []
  branches: Array<{ id: string; name: string }> = []
  versions_changed = false
  focus: NodeId | null = null

  constructor(doc: Document = new Document()) {
    this.doc = doc
    this.page = doc.pages[0]
    this.saved_doc = doc
    this.view = ViewState.default()
    this.uid = NEXT_UID++
  }

  /** Whether the document differs from the last save (Arc::ptr_eq in Rust). */
  is_dirty(): boolean {
    return this.doc !== this.saved_doc
  }

  /** Mark the current state saved. */
  markSaved(): void {
    this.saved_doc = this.doc
    this.versions_changed = false
  }

  /** Bump the revision (the UI invalidates caches on it). */
  bump(): void {
    this.revision += 1
  }

  /** Snapshot `(doc, selection, page)` before a command runs (a COW doc copy). */
  snapshot(): HistoryEntry {
    return {
      label: '',
      doc: this.doc.clone(),
      selection: [...this.selection],
      page: this.page
    }
  }

  /** Restore a snapshot (undo/redo/cancel). */
  restoreTo(entry: HistoryEntry): void {
    this.doc = entry.doc
    this.selection = [...entry.selection]
    this.page = entry.page
    this.bump()
  }

  /** The layer the focus view shows, while it exists on the current page. */
  focused(): NodeId | null {
    const f = this.focus
    return f !== null && this.doc.page_of(f) === this.page ? f : null
  }

  /** Drop selected ids that no longer exist or aren't on the current page. */
  clean_selection(): void {
    const doc = this.doc
    const page = this.page
    this.selection = this.selection.filter(
      (id) => doc.contains(id) && doc.page_of(id) === page && id !== page
    )
    const seen = new Set<NodeId>()
    this.selection = this.selection.filter((id) => {
      if (seen.has(id)) return false
      seen.add(id)
      return true
    })
    if (this.text_edit !== null && !doc.contains(this.text_edit.node)) this.text_edit = null
    // Vector edit mode ends when its layer is gone (or no longer a vector, e.g. undone).
    const ve = this.vector_edit
    if (ve !== null && (doc.page_of(ve.id) !== page || !ve.clamp_doc(doc))) this.vector_edit = null
    // A moved rotation origin lasts as long as its selection.
    if (this.rotation_origin !== null && !sameIds(this.rotation_origin.ids, this.selection)) {
      this.rotation_origin = null
    }
    // So does the last duplicate (undo reuses ids: a new layer could take a copy's).
    if (
      this.last_duplicate !== null &&
      !Duplicated.is_selection(this.last_duplicate, this.selection)
    ) {
      this.last_duplicate = null
    }
  }
}

/** Whether two id lists hold the same ids (order matters, as in the reference). */
function sameIds(a: NodeId[], b: NodeId[]): boolean {
  if (a.length !== b.length) return false
  for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return false
  return true
}

/** Clipboard contents (internal; the UI mirrors to the system clipboard). */
export interface Clipboard {
  /** Copied subtrees: (root, nodes) in z-order. */
  nodes: Array<{ root: NodeId; nodes: NodeT[] }>
  images: Map<string, ImageData>
  /** Copied properties (Copy properties / Paste properties). */
  props: Record<string, unknown> | null
  /** The page-space bounds of the copied selection. */
  bounds: GeomRect | null
  /** The document id the copy came from. */
  source_doc: number
  /** Copied component/set roots, excluding cuts and originals discarded by undo (ids are reused). */
  copied_components: Set<NodeId>
  /** The document copied from (pastes into other files follow its mains). */
  source: Document | null
  source_path: string | null
}

export const Clipboard = {
  empty(): Clipboard {
    return {
      nodes: [],
      images: new Map(),
      props: null,
      bounds: null,
      source_doc: 0,
      copied_components: new Set(),
      source: null,
      source_path: null
    }
  }
}

/** A request the engine makes of the UI (a dialog, a toast…). */
export interface UiRequest {
  kind: string
  params?: Record<string, unknown>
}

/** The whole engine state: open documents, the active tab, prefs and tools. */
export class Session {
  docs: DocState[] = []
  active = 0
  prefs: Prefs
  tools: ToolState
  clipboard: Clipboard = Clipboard.empty()
  ui_requests: UiRequest[] = []
  journal: Array<[string, unknown]> = []
  /** The last undoable command executed through {@link Session.execute}, excluding "Repeat". */
  last_command: { id: string; params: Record<string, unknown> } | null = null
  message: string | null = null
  private commands: Map<string, CommandSpec> | null = null

  constructor(doc: Document = new Document()) {
    this.docs = [new DocState(doc)]
    this.prefs = Prefs.default()
    this.tools = ToolState.default()
  }

  /** The active tool. */
  tool(): ToolId {
    return this.tools.tool
  }

  /** Select `t` as the active tool. */
  set_tool(t: ToolId): void {
    this.tools.tool = t
  }

  /** The active document state. */
  ds(): DocState {
    return this.docs[this.active]
  }

  /** The active document. */
  doc(): Document {
    return this.ds().doc
  }

  /** The active document's selection (empty when no document is open). */
  selection(): NodeId[] {
    return [...this.ds().selection]
  }

  /** Replace the selection, dropping ids that no longer belong to the page. */
  set_selection(ids: NodeId[]): void {
    const ds = this.ds()
    ds.selection = [...ids]
    ds.clean_selection()
    ds.revision += 1
  }

  /** The current page of the active document. */
  page(): NodeId {
    return this.ds().page
  }

  /** All registered commands, built once. */
  all_commands(): CommandSpec[] {
    return registry().list
  }

  find_command(id: string): CommandSpec | null {
    return registry().index.get(id) ?? null
  }

  /**
   * Execute a command by id: snapshot → run → post-checks → record history;
   * on error roll the document back. Returns the command's JSON value.
   */
  execute(id: string, params: Record<string, unknown> = {}): Record<string, unknown> {
    const spec = this.find_command(id)
    if (!spec) {
      throw new EngineError(`unknown command \`${id}\``)
    }
    // Anything that isn't an object reads as "no parameters": a caller sending
    // `null` or an array gets a refusal from the command, never a crash.
    const args = toParams(params)
    const ds = this.ds()
    // A preview never outlives the command that follows it (`text.preview`/`text.endPreview` manage it themselves).
    if (!PREVIEW_COMMANDS.includes(id)) endTextPreview(this)
    const before = ds.snapshot()
    try {
      const result = spec.run(this, args)
      // Post-checks: the document must stay valid.
      const warnings = ds.doc.validate()
      if (warnings.length > 0) {
        console.warn(`[engine] ${id} repaired:`, warnings.join('; '))
      }
      // Derived state follows every edit (FigCraft's `after_command`): text
      // auto-size, group fit and auto-layout reflow.
      normalize(ds.doc, before.doc)
      // Derived selection state follows the document (FigCraft's `after_command`).
      ds.clean_selection()
      ds.bump()
      if (spec.history) {
        ds.history.record(spec.label, before)
      }
      if (spec.history && id !== 'edit.repeat') this.last_command = { id, params: args }
      this.journal.push([id, args])
      if (this.journal.length > 5000) this.journal.splice(0, 1000)
      this.message = null
      return result
    } catch (error) {
      // Guard: a failing command rolls the document back (Rust `guard::run`).
      ds.restoreTo(before)
      this.message = error instanceof Error ? error.message : String(error)
      throw error
    }
  }

  /** Undo the last command. */
  undo(): boolean {
    const ds = this.ds()
    const entry = ds.history.undo.pop()
    if (!entry) return false
    const current: HistoryEntry = {
      label: '',
      doc: ds.doc,
      selection: [...ds.selection],
      page: ds.page
    }
    ds.restoreTo(entry)
    ds.history.redo.push(current)
    return true
  }

  /** Redo the last undone command. */
  redo(): boolean {
    const ds = this.ds()
    const entry = ds.history.redo.pop()
    if (!entry) return false
    const current: HistoryEntry = {
      label: '',
      doc: ds.doc,
      selection: [...ds.selection],
      page: ds.page
    }
    ds.restoreTo(entry)
    ds.history.undo.push(current)
    return true
  }

  /** Request a dialog or toast from the UI. */
  request_ui(kind: string, params?: Record<string, unknown>): void {
    this.ui_requests.push({ kind, params })
  }

  /** Start a gesture: snapshot the state the UI previews from (nested calls keep the first). */
  begin_interaction(label: string): void {
    const ds = this.ds()
    if (ds.interaction) return
    ds.interaction = {
      label,
      doc: ds.doc.clone(),
      selection: [...ds.selection],
      page: ds.page
    }
  }

  /** Replace the document for a live preview during a gesture (`f` mutates the snapshot copy). */
  preview(f: (doc: Document, selection: NodeId[]) => void): void {
    const ds = this.ds()
    const interaction = ds.interaction
    if (!interaction) throw new EngineError('no gesture in progress')
    const doc = interaction.doc.clone()
    const selection = [...interaction.selection]
    f(doc, selection)
    ds.doc = doc
    ds.selection = selection
    ds.bump()
  }

  /** Finish a gesture: its whole change becomes one undo step. */
  commit_interaction(): void {
    const ds = this.ds()
    const interaction = ds.interaction
    if (!interaction) return
    ds.interaction = null
    ds.bump()
    if (interaction.doc !== ds.doc) {
      ds.history.record(interaction.label, interaction)
    }
  }

  /** Abandon a gesture, restoring the document. */
  cancel_interaction(): void {
    const ds = this.ds()
    const interaction = ds.interaction
    if (!interaction) return
    ds.interaction = null
    ds.restoreTo(interaction)
  }

  /**
   * Run several commands as one undo step. A param value `{"$step": n}` is
   * replaced by the `id` in the result of the earlier step `n`
   * (`{"$step": n, "field": "…"}` picks another field), so a step can target a
   * layer that an earlier step of the same batch created. Any object with a
   * `$step` key in a step's params is such a reference, except inside a nested
   * `command.batch` step: its references are to its own steps.
   */
  batch(label: string, cmds: Array<{ id: string; params: Record<string, unknown> }>): unknown[] {
    return this.grouped(label, () => {
      const results: unknown[] = []
      cmds.forEach((c, step) => {
        results.push(this.batch_step(results, step, c.id, c.params ?? {}))
      })
      return results
    })
  }

  /**
   * One step of a batch: `{"$step": n}` in `params` resolves against `results`
   * (the results of the steps before it), then the command runs.
   * {@link Session.batch} runs a list of these as one undo step; a caller with
   * its own list (the CLI's script runner) uses this so its steps resolve
   * `$step` the same way, inside its own {@link Session.grouped}.
   */
  batch_step(
    results: unknown[],
    step: number,
    id: string,
    params: Record<string, unknown>
  ): Record<string, unknown> {
    const resolved = id === 'command.batch' ? params : resolveStepRefs(params, results, step, 0)
    return this.execute(id, resolved)
  }

  /**
   * Run `f` as one undo step called `label`: the commands it executes push no
   * steps of their own, and when it fails the documents stay at their
   * group-start state.
   */
  /**
   * Run `f` as one undo step called `label`: the commands it executes push no
   * steps of their own, and when it fails the documents stay at their
   * group-start state.
   */
  grouped<T>(label: string, f: () => T): T {
    type Before = {
      uid: number
      doc: Document
      selection: NodeId[]
      page: NodeId
      undo: number
      limit: number
    }
    const before: Before[] = this.docs.map((ds) => ({
      uid: ds.uid,
      doc: ds.doc.clone(),
      selection: [...ds.selection],
      page: ds.page,
      undo: ds.history.undo.length,
      limit: ds.history.limit
    }))
    // An edit inside clears the redo steps; a failed group has to bring them back.
    const redoBefore = this.docs.map((ds) => ds.history.redo)
    const active = this.active
    const journalLen = this.journal.length
    // The steps inside are dropped again below, so they mustn't push the oldest ones out.
    for (const ds of this.docs) ds.history.limit = Number.MAX_SAFE_INTEGER
    let failed: unknown = null
    let result: T | null = null
    try {
      result = f()
    } catch (error) {
      failed = error ?? new Error('grouped: unknown failure')
    }
    if (failed !== null) {
      const keep = new Set(before.map((b) => b.uid))
      this.docs = this.docs.filter((ds) => keep.has(ds.uid))
      before.forEach((b, i) => {
        const ds = this.docs.find((d) => d.uid === b.uid)
        if (!ds) return
        ds.history.redo = redoBefore[i] ?? []
        ds.doc = b.doc
        ds.selection = [...b.selection]
        ds.page = b.page
        ds.history.undo.length = b.undo
        ds.history.limit = b.limit
      })
      this.active = active
      this.journal.length = journalLen
      throw failed
    }
    // A step that pushed an undo entry changed the document (the nested
    // `execute` calls already decided that).
    const changed = before.filter((b) => {
      const ds = this.docs.find((d) => d.uid === b.uid)
      return ds !== undefined && ds.interaction === null && ds.history.undo.length > b.undo
    })
    for (const ds of this.docs) {
      const b = before.find((x) => x.uid === ds.uid)
      if (!b) continue
      ds.history.limit = b.limit
      ds.history.undo.length = b.undo
    }
    for (const b of changed) {
      const ds = this.docs.find((d) => d.uid === b.uid)
      if (ds) ds.history.record(label, { label, doc: b.doc, selection: b.selection, page: b.page })
    }
    return result as T
  }

  registerCommands(cmds: CommandSpec[]): void {
    if (!this.commands) this.commands = new Map()
    for (const c of cmds) this.commands.set(c.id, c)
  }
}

/** An engine error (Rust `EngineError`). */
export class EngineError extends Error {
  name = 'EngineError'
}

/** One command: id, label, params doc, whether it records history, and its run. */
export interface CommandSpec {
  id: string
  label: string
  params: string
  history: boolean
  run: (session: Session, params: Record<string, unknown>) => Record<string, unknown>
}

/** Build a command spec (the `spec!` macro). */
export function spec(
  id: string,
  label: string,
  params: string,
  history: boolean,
  run: (session: Session, params: Record<string, unknown>) => Record<string, unknown>
): CommandSpec {
  return { id, label, params, history, run }
}

/** `{"ok": true}` — the standard command success value. */
export function ok(extra: Record<string, unknown> = {}): Record<string, unknown> {
  return { ok: true, ...extra }
}

interface Registry {
  list: CommandSpec[]
  index: Map<string, CommandSpec>
}

let REGISTRY: Registry | null = null

/** Register the engine's command set (called by the cmd modules' installer). */
export function registerRegistry(cmds: CommandSpec[]): Registry {
  const index = new Map<string, CommandSpec>()
  for (const c of cmds) index.set(c.id, c)
  REGISTRY = { list: cmds, index }
  return REGISTRY
}

/** The registry of all commands, built once on first use (FigCraft's OnceLock). */
export function registry(): Registry {
  if (!REGISTRY) {
    // Lazy: the cmd modules import this file, so the specs are pulled in on
    // first use rather than at module init (same semantics as OnceLock).
    const { allCoreSpecs } = require('./cmd/core') as typeof import('./cmd/core')
    REGISTRY = registerRegistry(allCoreSpecs())
  }
  return REGISTRY
}

/** Whether the registry has been initialised. */
export function registryReady(): boolean {
  return REGISTRY !== null
}
