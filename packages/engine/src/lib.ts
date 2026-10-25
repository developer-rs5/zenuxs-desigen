/**
 * ZenuxsDesign engine — the command engine over the document model.
 *
 * Everything is a command: user-visible behaviour = a command spec (`spec()`)
 * executed by `Session.execute(id, params)`. Menus, shortcuts, the Actions
 * palette, the CLI, the control channel and the MCP server all dispatch the
 * same command ids. Undo is full-document snapshots (the document model is
 * cheap to clone). (Converted 1:1 from FigCraft `crates/engine/src/lib.rs`.)
 */

import { Document, type NodeId } from '@zenuxs/doc'

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
  outlines_selection: boolean
  mask_outlines: boolean
  pixel_preview: boolean
  frame_outlines: boolean
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
      mask_outlines: false,
      pixel_preview: false,
      frame_outlines: false,
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

/** App preferences the engine owns. */
export interface Prefs {
  nudge_small: number
  nudge_large: number
  keep_tool: boolean
  highlight_hover: boolean
  rename_duplicates: boolean
  show_dimensions: boolean
  number_keys_opacity: number
  reduce_motion: boolean
  auto_save: boolean
  user_name: string
  language: string
  dark: boolean | null
  panel_left: number
  panel_right: number
}

export const Prefs = {
  default(): Prefs {
    return {
      nudge_small: 1,
      nudge_large: 10,
      keep_tool: false,
      highlight_hover: true,
      rename_duplicates: false,
      show_dimensions: false,
      number_keys_opacity: 0.5,
      reduce_motion: false,
      auto_save: true,
      user_name: '',
      language: 'en',
      dark: null,
      panel_left: 240,
      panel_right: 240
    }
  }
}

/** A text edit in progress. */
export interface TextEdit {
  node: NodeId
  caret: number
}

/** An in-progress gesture (drag, marquee…): the state to preview from. */
export interface Interaction {
  label: string
  doc: Document
  selection: NodeId[]
  page: NodeId
}

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
  hover: NodeId | null = null
  uid = 1
  versions: Array<{ id: string; label: string; created: number }> = []
  branches: Array<{ id: string; name: string }> = []
  versions_changed = false
  focus: NodeId | null = null

  constructor(doc: Document = new Document()) {
    this.doc = doc
    this.page = doc.pages[0]
    this.saved_doc = doc
    this.view = ViewState.default()
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
    this.uid += 1
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
  ui_requests: UiRequest[] = []
  journal: Array<[string, unknown]> = []
  message: string | null = null
  private commands: Map<string, CommandSpec> | null = null

  constructor(doc: Document = new Document()) {
    this.docs = [new DocState(doc)]
    this.prefs = Prefs.default()
  }

  /** The active document state. */
  ds(): DocState {
    return this.docs[this.active]
  }

  /** The active document. */
  doc(): Document {
    return this.ds().doc
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
      throw new EngineError(`unknown command: ${id}`)
    }
    const ds = this.ds()
    const before = ds.snapshot()
    try {
      const result = spec.run(this, params)
      // Post-checks: the document must stay valid.
      const warnings = ds.doc.validate()
      if (warnings.length > 0) {
        console.warn(`[engine] ${id} repaired:`, warnings.join('; '))
      }
      ds.bump()
      if (spec.history) {
        ds.history.record(spec.label, before)
      }
      this.journal.push([id, params])
      if (this.journal.length > 5000) this.journal.shift()
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
    const current: HistoryEntry = { label: '', doc: ds.doc, selection: [...ds.selection], page: ds.page }
    ds.restoreTo(entry)
    ds.history.redo.push(current)
    return true
  }

  /** Redo the last undone command. */
  redo(): boolean {
    const ds = this.ds()
    const entry = ds.history.redo.pop()
    if (!entry) return false
    const current: HistoryEntry = { label: '', doc: ds.doc, selection: [...ds.selection], page: ds.page }
    ds.restoreTo(entry)
    ds.history.undo.push(current)
    return true
  }

  /** Request a dialog or toast from the UI. */
  request_ui(kind: string, params?: Record<string, unknown>): void {
    this.ui_requests.push({ kind, params })
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
export function ok(): Record<string, unknown> {
  return { ok: true }
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
    const built: Registry = { list: allCoreSpecs(), index: new Map() }
    for (const c of built.list) built.index.set(c.id, c)
    REGISTRY = built
  }
  return REGISTRY
}

/** Whether the registry has been initialised. */
export function registryReady(): boolean {
  return REGISTRY !== null
}
