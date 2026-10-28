/**
 * View menu, tools and preferences: the viewport, the view toggles, the tool
 * selection and the app preferences. View state is per document and drivable
 * like everything else.
 * (Converted 1:1 from FigCraft `crates/engine/src/cmd/view.rs`.)
 */

import type { NodeId } from '@zenuxs/doc'
import { RectMath, transform_rect_bbox } from '@zenuxs/geom'

import {
  anchorName,
  anchorOf,
  ok,
  spec,
  ToolId,
  UI_SCALE_MAX,
  UI_SCALE_MIN,
  ViewState,
  type CommandSpec,
  type Session,
  type ViewState as View
} from '../lib'

// ------------------------------ helpers ------------------------------

function view(s: Session): View {
  return s.ds().view
}

function num(p: Record<string, unknown>, key: string): number | null {
  const v = p[key]
  return typeof v === 'number' && Number.isFinite(v) ? v : null
}

function numOr(p: Record<string, unknown>, key: string, fallback: number): number {
  return num(p, key) ?? fallback
}

function boolean(p: Record<string, unknown>, key: string): boolean | null {
  const v = p[key]
  return typeof v === 'boolean' ? v : null
}

function str(p: Record<string, unknown>, key: string): string | null {
  const v = p[key]
  return typeof v === 'string' ? v : null
}

/** A view toggle: set it, or flip it when `on` is omitted. */
function flag(s: Session, p: Record<string, unknown>, key: keyof View): Record<string, unknown> {
  const v = view(s)
  const slot = v[key]
  if (typeof slot !== 'boolean') throw new Error(`${String(key)} is not a toggle`)
  const on = boolean(p, 'on') ?? !slot
  v[key] = on as never
  return { on }
}

/**
 * A view toggle the preferences keep: files opened or made later start with
 * the kept ones. Outline modes stay with their file, so they are not kept.
 */
const TOGGLES: Array<[string, keyof View, boolean]> = [
  ['view.pixelGrid', 'pixel_grid', true],
  ['view.layoutGrids', 'layout_grids', true],
  ['view.rulers', 'rulers', true],
  ['view.slices', 'show_slices', true],
  ['view.comments', 'comments', true],
  ['view.multiplayerCursors', 'multiplayer_cursors', true],
  ['view.outlines', 'outlines', false],
  ['view.outlinesSelection', 'outlines_selection', false],
  ['view.outlinesHiddenLayers', 'outline_hidden', false],
  ['view.outlinesObjectBounds', 'outline_bounds', false],
  ['view.maskOutlines', 'mask_outlines', true],
  ['view.frameOutlines', 'frame_outlines', true],
  ['view.proofSrgb', 'proof_srgb', false],
  ['view.snapGeometry', 'snap_geometry', true],
  ['view.snapObjects', 'snap_objects', true],
  ['view.snapPixel', 'snap_pixel', true]
]

/** View toggle `id`: the file's view changes, and the preferences keep it if it is kept. */
function toggle(s: Session, p: Record<string, unknown>, id: string): Record<string, unknown> {
  const entry = TOGGLES.find(([k]) => k === id)
  if (!entry) throw new Error(`${id} is not a View toggle`)
  const [, slot, keep] = entry
  const r = flag(s, p, slot)
  if (keep && typeof r.on === 'boolean') s.prefs.view[id] = r.on
  return r
}

/** Set the view toggles the preferences keep (the others stay as they are). */
export function applyKeptToggles(prefs: { view: Record<string, boolean> }, v: View): void {
  for (const [id, slot, keep] of TOGGLES) {
    if (!keep) continue
    const on = prefs.view[id]
    if (typeof on === 'boolean') (v as unknown as Record<string, boolean>)[slot] = on
  }
}

/** Whether the View menu's toggle `id` is on; `null` for a command that isn't one. */
export function viewChecked(s: Session, id: string): boolean | null {
  const v = s.ds().view
  if (id === 'view.pixelPreview') return v.pixel_preview
  const entry = TOGGLES.find(([k]) => k === id)
  return entry ? (v[entry[1]] as boolean) : null
}

/** Figma's zoom steps. */
const STEPS = [0.02, 0.03, 0.06, 0.13, 0.25, 0.5, 1, 2, 4, 8, 16, 32, 64, 128, 256]

function step(z: number, up: boolean): number {
  if (up) return STEPS.find((s) => s > z * 1.001) ?? 256
  return [...STEPS].reverse().find((s) => s < z * 0.999) ?? 0.02
}

/** The bounds of `ids` in page coordinates, or `null` when none of them exist. */
function boundsOf(
  s: Session,
  ids: NodeId[]
): { x0: number; y0: number; x1: number; y1: number } | null {
  let box: { x0: number; y0: number; x1: number; y1: number } | null = null
  for (const id of ids) {
    const n = s.ds().doc.node(id)
    if (!n) continue
    const b = transform_rect_bbox(
      { coeffs: n.transform.coeffs },
      RectMath.new(0, 0, n.width, n.height)
    )
    box = box ? RectMath.union(box, b) : b
  }
  return box
}

/** Zoom about the viewport centre. */
function zoomTo(s: Session, z: number): Record<string, unknown> {
  const v = view(s)
  ViewState.setZoomAt(v, z, v.cx, v.cy)
  return { zoom: v.zoom }
}

/** The page's top-level frames, in order. */
function topFrames(s: Session): NodeId[] {
  const ds = s.ds()
  const page = ds.doc.node(ds.page)
  if (!page) return []
  return page.children.filter((id) => ds.doc.node(id)?.kind.type === 'frame')
}

/** The top-level frame containing `id`, or `id` itself when it is one. */
function topLevelFrame(s: Session, id: NodeId): NodeId | null {
  const ds = s.ds()
  const frames = topFrames(s)
  if (frames.includes(id)) return id
  let cur: NodeId | null | undefined = ds.doc.node(id)?.parent
  while (cur !== null && cur !== undefined) {
    if (frames.includes(cur)) return cur
    cur = ds.doc.node(cur)?.parent
  }
  return null
}

/** How far an arrow key pans the view with nothing selected (screen pixels; Shift: ten times). */
export const PAN_STEP_PX = 20

// ------------------------------ specs ------------------------------

export const VIEW_TOOL_SPECS: CommandSpec[] = [
  // ------------------------------ view.rs ------------------------------
  spec('view.zoomIn', 'Zoom in', '{}', false, (s) => zoomTo(s, step(view(s).zoom, true))),
  spec('view.zoomOut', 'Zoom out', '{}', false, (s) => zoomTo(s, step(view(s).zoom, false))),
  spec('view.zoom100', 'Zoom to 100%', '{}', false, (s) => zoomTo(s, 1)),
  spec('view.zoom50', 'Zoom to 50%', '{}', false, (s) => zoomTo(s, 0.5)),
  spec('view.zoom200', 'Zoom to 200%', '{}', false, (s) => zoomTo(s, 2)),
  spec('view.zoomFit', 'Zoom to fit', '{}', false, (s) => {
    const ds = s.ds()
    const ids = ds.selection.length > 0 ? ds.selection : [...(ds.doc.node(ds.page)?.children ?? [])]
    const b = boundsOf(s, ids) ?? { x0: 0, y0: 0, x1: 100, y1: 100 }
    ViewState.fit(ds.view, b)
    return { zoom: ds.view.zoom }
  }),
  spec('view.zoomSelection', 'Zoom to selection', '{}', false, (s) => {
    const ds = s.ds()
    const b = boundsOf(s, ds.selection)
    if (b) ViewState.fit(ds.view, b, 256)
    return { zoom: ds.view.zoom }
  }),
  spec(
    'view.set',
    'Set view',
    '{zoom?, cx?, cy? (page coordinate at the centre), vw?, vh? (viewport size)}',
    false,
    (s, p) => {
      const v = view(s)
      const z = num(p, 'zoom')
      if (z !== null) v.zoom = Math.min(256, Math.max(0.02, z))
      v.cx = numOr(p, 'cx', v.cx)
      v.cy = numOr(p, 'cy', v.cy)
      const vw = num(p, 'vw')
      if (vw !== null) v.vw = Math.min(20000, Math.max(10, vw))
      const vh = num(p, 'vh')
      if (vh !== null) v.vh = Math.min(20000, Math.max(10, vh))
      return { ...v }
    }
  ),
  spec(
    'view.zoomAt',
    'Zoom tool',
    '{x, y (page point kept in place), out? (zoom out a step), width?, height? (an area to fit instead)}',
    false,
    (s, p) => {
      const x = num(p, 'x')
      const y = num(p, 'y')
      if (x === null || y === null) throw new Error('`x` and `y` (page coordinates) are required')
      const v = view(s)
      const w = num(p, 'width')
      const h = num(p, 'height')
      if (w !== null && h !== null && w > 0 && h > 0) {
        ViewState.fit(v, { x0: x, y0: y, x1: x + w, y1: y + h }, 256)
      } else {
        ViewState.setZoomAt(v, step(v.zoom, !(boolean(p, 'out') ?? false)), x, y)
      }
      return { zoom: v.zoom, cx: v.cx, cy: v.cy }
    }
  ),
  spec('view.get', 'Get view', '{}', false, (s) => ({ ...view(s) })),
  spec('view.prevFrame', 'Zoom to previous frame', '{}', false, (s) => zoomFrame(s, -1)),
  spec('view.nextFrame', 'Zoom to next frame', '{}', false, (s) => zoomFrame(s, 1)),
  spec('view.prevPage', 'Previous page', '{}', false, (s) => pageStep(s, -1)),
  spec('view.nextPage', 'Next page', '{}', false, (s) => pageStep(s, 1)),
  spec('view.pixelGrid', 'Pixel grid', '{on?}', false, (s, p) => toggle(s, p, 'view.pixelGrid')),
  spec('view.layoutGrids', 'Layout grids', '{on?}', false, (s, p) =>
    toggle(s, p, 'view.layoutGrids')
  ),
  spec('view.rulers', 'Rulers', '{on?}', false, (s, p) => toggle(s, p, 'view.rulers')),
  spec('view.slices', 'Slices', '{on?}', false, (s, p) => toggle(s, p, 'view.slices')),
  spec('view.comments', 'Comments', '{on?}', false, (s, p) => toggle(s, p, 'view.comments')),
  spec(
    'view.multiplayerCursors',
    'Multiplayer cursors',
    "{on?}  others' cursors in a live session",
    false,
    (s, p) => toggle(s, p, 'view.multiplayerCursors')
  ),
  spec(
    'view.pan',
    'Pan the view',
    '{dx, dy (arrow-key steps, e.g. 1 or -1), big? (ten times as far, like Shift)}',
    false,
    (s, p) => {
      const mult = boolean(p, 'big') === true ? PAN_STEP_PX * 10 : PAN_STEP_PX
      const dir = (k: string): number => Math.min(100, Math.max(-100, num(p, k) ?? 0)) * mult
      const dx = dir('dx')
      const dy = dir('dy')
      const v = view(s)
      // Scrolling moves the content; panning right shows what is to the right.
      v.cx += dx / v.zoom
      v.cy += dy / v.zoom
      return { cx: v.cx, cy: v.cy }
    }
  ),
  spec('view.outlines', 'Outlines', '{on?}', false, (s, p) => toggle(s, p, 'view.outlines')),
  spec(
    'view.outlinesSelection',
    'Outlines for selection',
    '{on?}  outline mode for the selected layers only',
    false,
    (s, p) => toggle(s, p, 'view.outlinesSelection')
  ),
  spec(
    'view.outlinesHiddenLayers',
    'Include hidden layers in outlines',
    '{on?}  outline mode outlines hidden layers too',
    false,
    (s, p) => toggle(s, p, 'view.outlinesHiddenLayers')
  ),
  spec(
    'view.outlinesObjectBounds',
    'Include object bounds in outlines',
    "{on?}  outline mode also draws each layer's box",
    false,
    (s, p) => toggle(s, p, 'view.outlinesObjectBounds')
  ),
  spec('view.maskOutlines', 'Mask outlines', '{on?}', false, (s, p) =>
    toggle(s, p, 'view.maskOutlines')
  ),
  spec(
    'view.pixelPreview',
    'Pixel preview',
    '{on?, scale? (1|2: rendered pixels per page pixel; turns it on)}',
    false,
    (s, p) => {
      const scale = p.scale
      if (scale !== undefined && scale !== null && scale !== 1 && scale !== 2) {
        throw new Error('`scale` must be 1 or 2')
      }
      const v = view(s)
      if (scale === 1 || scale === 2) v.pixel_scale = scale
      v.pixel_preview =
        boolean(p, 'on') ?? (scale !== undefined && scale !== null ? true : !v.pixel_preview)
      return { on: v.pixel_preview, scale: v.pixel_scale }
    }
  ),
  spec('view.frameOutlines', 'Frame outlines', '{on?}', false, (s, p) =>
    toggle(s, p, 'view.frameOutlines')
  ),
  spec(
    'view.proofSrgb',
    'Soft-proof sRGB',
    "{on?}  mark colours sRGB screens can't show",
    false,
    (s, p) => toggle(s, p, 'view.proofSrgb')
  ),
  spec('view.snapGeometry', 'Snap to geometry', '{on?}', false, (s, p) =>
    toggle(s, p, 'view.snapGeometry')
  ),
  spec('view.snapObjects', 'Snap to objects', '{on?}', false, (s, p) =>
    toggle(s, p, 'view.snapObjects')
  ),
  spec('view.snapPixel', 'Snap to pixel grid', '{on?}', false, (s, p) =>
    toggle(s, p, 'view.snapPixel')
  ),
  spec('view.toggleUi', 'Show/Hide UI', '{on?}', false, (s, p) => flag(s, p, 'ui_hidden')),
  spec(
    'view.fullscreen',
    'Full screen',
    '{on?}  the window fills the screen (a no-op headless)',
    false,
    (s, p) => {
      s.request_ui('window.fullscreen', { on: boolean(p, 'on') })
      return ok()
    }
  ),
  spec('view.layers', 'Layers panel', '{}', false, (s) => ui(s, 'panel.layers')),
  spec('view.assets', 'Assets panel', '{}', false, (s) => ui(s, 'panel.assets')),
  spec('view.design', 'Design panel', '{}', false, (s) => ui(s, 'panel.design')),
  spec('view.prototype', 'Prototype panel', '{}', false, (s) => ui(s, 'panel.prototype')),
  spec('view.designPrototype', 'Switch between Design and Prototype', '{}', false, (s) =>
    ui(s, 'panel.designPrototype')
  ),
  spec('view.devMode', 'Dev Mode', '{}', false, (s) => ui(s, 'panel.devMode')),
  spec('view.leftSidebar', 'Show/Hide left sidebar', '{}', false, (s) =>
    ui(s, 'panel.leftSidebar')
  ),
  spec(
    'view.panelWidths',
    'Reset panel widths',
    "{left?, right? (the panels' widths in pixels)}  without either, both go back to their default width",
    false,
    (s, p) => {
      const width = (k: string): number | null => {
        const w = num(p, k)
        return w === null ? null : Math.min(10000, Math.max(0, w))
      }
      s.request_ui('panel.widths', { left: width('left'), right: width('right') })
      return ok()
    }
  ),
  spec(
    'window.new',
    'New window',
    '{path?, index?}  a new window with a new file',
    false,
    (s, p) => {
      s.request_ui('window.new', { path: str(p, 'path'), index: num(p, 'index') })
      return ok()
    }
  ),
  spec('window.focus', 'Bring window to front', '{id}  a window id', false, (s, p) => {
    const id = num(p, 'id')
    if (id === null) throw new Error('`id` is required')
    s.request_ui('window.focus', { id })
    return ok()
  }),
  spec('view.nextRegion', 'Focus next region', '{}', false, (s) => region(s, 1)),
  spec('view.previousRegion', 'Focus previous region', '{}', false, (s) => region(s, -1)),
  spec('view.contextMenu', 'Show context menu', "{}  the selection's context menu", false, (s) =>
    ui(s, 'contextMenu')
  ),
  spec('view.themeLight', 'Light theme', '{}', false, (s) => {
    s.prefs.theme = 'light'
    return ok()
  }),
  spec('view.themeDark', 'Dark theme', '{}', false, (s) => {
    s.prefs.theme = 'dark'
    return ok()
  }),
  spec('view.themeSystem', 'Follow system theme', '{}', false, (s) => {
    s.prefs.theme = 'system'
    return ok()
  }),

  // ------------------------------ preferences ------------------------------
  spec('pref.keepTool', 'Keep tool selected after use', '{on?}', false, (s, p) =>
    pref(s, p, 'keep_tool')
  ),
  spec('pref.highlightHover', 'Highlight layers on hover', '{on?}', false, (s, p) =>
    pref(s, p, 'highlight_hover')
  ),
  spec('pref.renameDuplicates', 'Rename duplicated layers', '{on?}', false, (s, p) =>
    pref(s, p, 'rename_duplicates')
  ),
  spec('pref.showDimensions', 'Show dimensions on objects', '{on?}', false, (s, p) =>
    pref(s, p, 'show_dimensions')
  ),
  spec('pref.numberKeysOpacity', 'Use number keys for opacity', '{on?}', false, (s, p) =>
    pref(s, p, 'number_keys_opacity')
  ),
  spec('pref.reduceMotion', 'Reduce motion', '{on?}', false, (s, p) => pref(s, p, 'reduce_motion')),
  spec('pref.autoSave', 'Save files automatically', '{on?}', false, (s, p) =>
    pref(s, p, 'auto_save')
  ),
  spec('pref.startOnHome', 'Start on the Home screen', '{on?}', false, (s, p) =>
    pref(s, p, 'start_on_home')
  ),
  spec(
    'pref.uiScale',
    'Interface size',
    '{scale?: 0.75 to 3 relative to the system\'s display scale; "auto" is 1; omit: just read it}',
    false,
    (s, p) => {
      const raw = p.scale
      if (raw !== undefined && raw !== null) {
        if (typeof raw === 'string' && raw.trim().toLowerCase() === 'auto') {
          s.prefs.ui_scale = 1
        } else {
          const scale = num(p, 'scale')
          if (scale === null) throw new Error('`scale` must be a finite number')
          s.prefs.ui_scale = Math.min(UI_SCALE_MAX, Math.max(UI_SCALE_MIN, scale))
        }
      }
      return { scale: s.prefs.ui_scale }
    }
  ),
  spec('pref.nudge', 'Nudge amount', '{small?, big?}', false, (s, p) => {
    s.prefs.nudge_small = Math.min(1000, Math.max(0.01, num(p, 'small') ?? s.prefs.nudge_small))
    s.prefs.nudge_large = Math.min(10000, Math.max(0.01, num(p, 'big') ?? s.prefs.nudge_large))
    return { small: s.prefs.nudge_small, big: s.prefs.nudge_large }
  }),
  spec('pref.userName', 'Your name in comments', '{name}', false, (s, p) => {
    const name = str(p, 'name')
    if (name === null) throw new Error('`name` is required')
    const cleaned = [...name.trim()]
      .filter((c) => {
        const code = c.codePointAt(0) ?? 0
        return !(code < 0x20 || code === 0x7f)
      })
      .slice(0, 64)
      .join('')
    s.prefs.user_name = cleaned.length === 0 ? 'You' : cleaned
    return { name: s.prefs.user_name }
  }),
  spec(
    'pref.language',
    'Interface language',
    '{language: system|en|es|fr|de|ja|zh-Hans|…}',
    false,
    (s, p) => {
      const raw = str(p, 'language')
      if (raw === null) throw new Error('`language` is required')
      const lang = raw.trim()
      // A BCP 47-style tag ("es", "pt-BR", "zh_Hans") or "system".
      const tag =
        lang.length <= 35 &&
        lang
          .split(/[-_]/)
          .every((part) => part.length > 0 && part.length <= 8 && /^[A-Za-z0-9]+$/.test(part))
      if (!tag) throw new Error(`\`${lang}\` is not a language code`)
      s.prefs.language = lang
      return { language: s.prefs.language }
    }
  ),
  spec('app.preferences', 'Preferences', '{}', false, (s) => ui(s, 'dialog.preferences')),
  spec('app.actions', 'Actions', '{}', false, (s) => ui(s, 'palette.actions')),
  spec('help.shortcuts', 'Keyboard shortcuts', '{}', false, (s) => ui(s, 'panel.shortcuts')),
  spec('help.about', 'About ZenuxsDesign', '{}', false, (s) => ui(s, 'dialog.about')),
  spec('help.page', 'Help page', '{}', false, (s) => ui(s, 'open.help')),
  spec('libraries.open', 'Libraries', '{}', false, (s) => ui(s, 'panel.libraries')),

  // ------------------------------ tools ------------------------------
  spec(
    'tool.set',
    'Choose tool',
    '{tool: move|scale|hand|frame|section|slice|rectangle|line|arrow|ellipse|polygon|star|pen|pencil|text|comment|shapeBuilder}',
    false,
    (s, p) => {
      const raw = str(p, 'tool')
      if (raw === null) throw new Error('`tool` is required')
      const t = ToolId.fromId(raw)
      if (!t) throw new Error(`unknown tool \`${raw}\``)
      return setTool(s, t)
    }
  ),
  spec(
    'tool.place',
    'Place with the tool',
    '{tool?, x?, y?} — what a click with the tool makes, selected',
    false,
    (s, p) => {
      const raw = str(p, 'tool')
      if (raw !== null) {
        const t = ToolId.fromId(raw)
        if (!t) throw new Error(`unknown tool \`${raw}\``)
        setTool(s, t)
      }
      return place(s, num(p, 'x'), num(p, 'y'))
    }
  ),
  spec(
    'tool.pencilBrush',
    'Pencil brush',
    '{preset? (taper|ink|ribbon|bristle|dots|stars|confetti|leaves | null: plain), spacing?, sizeJitter?, rotationJitter?, scatter?, seed?}',
    false,
    (s, p) => {
      // `null` (unlike a missing preset) clears the brush.
      if ('preset' in p) {
        const preset = p.preset
        if (preset === null) s.tools.pencil_brush = null
        else {
          const name = typeof preset === 'string' ? preset.trim() : ''
          if (name.length === 0) throw new Error('`preset` must be a brush name')
          s.tools.pencil_brush = { ...p, preset: name }
        }
      }
      return { brush: s.tools.pencil_brush }
    }
  ),
  spec(
    'tool.scaleAnchor',
    'Scale anchor',
    '{anchor?: tl|t|tr|l|c|r|bl|b|br} (omit to read it)',
    false,
    (s, p) => {
      const raw = str(p, 'anchor')
      if (raw !== null) {
        const a = anchorOf(raw)
        if (!a) throw new Error(`unknown anchor \`${raw}\``)
        s.tools.scale_anchor = a
        s.ds().bump()
      }
      return { anchor: anchorName(s.tools.scale_anchor) }
    }
  ),
  toolSpec('tool.move', 'move'),
  toolSpec('tool.scale', 'scale'),
  toolSpec('tool.hand', 'hand'),
  toolSpec('tool.frame', 'frame'),
  toolSpec('tool.section', 'section'),
  toolSpec('tool.slice', 'slice'),
  toolSpec('tool.rectangle', 'rectangle'),
  toolSpec('tool.line', 'line'),
  toolSpec('tool.arrow', 'arrow'),
  toolSpec('tool.ellipse', 'ellipse'),
  toolSpec('tool.polygon', 'polygon'),
  toolSpec('tool.star', 'star'),
  toolSpec('tool.pen', 'pen'),
  toolSpec('tool.pencil', 'pencil'),
  toolSpec('tool.text', 'text'),
  toolSpec('tool.comment', 'comment'),
  toolSpec('tool.shapeBuilder', 'shapeBuilder'),
  spec('edit.pickColor', 'Pick color', '{}', false, (s) => setTool(s, 'eyedropper'))
]

// ------------------------------ spec helpers ------------------------------

function toolSpec(id: string, t: ToolId): CommandSpec {
  return spec(id, ToolId.label(t), '{}', false, (s) => setTool(s, t))
}

/** Select `t` as the active tool (read-only files allow only Move and Hand). */
function setTool(s: Session, t: ToolId): Record<string, unknown> {
  s.set_tool(t)
  return { tool: t }
}

function ui(s: Session, kind: string): Record<string, unknown> {
  s.request_ui(kind, {})
  return ok()
}

/** Move the keyboard focus between the interface regions (the UI does it). */
function region(s: Session, step: number): Record<string, unknown> {
  s.request_ui('focus.region', { step })
  return ok()
}

/** A boolean preference: set it, or flip it when `on` is omitted. */
function pref(
  s: Session,
  p: Record<string, unknown>,
  key:
    | 'keep_tool'
    | 'highlight_hover'
    | 'rename_duplicates'
    | 'show_dimensions'
    | 'number_keys_opacity'
    | 'reduce_motion'
    | 'auto_save'
    | 'start_on_home'
): Record<string, unknown> {
  const slot = s.prefs[key]
  const on = boolean(p, 'on') ?? !slot
  s.prefs[key] = on
  return { on }
}

/** Zoom to the previous/next top-level frame, selecting it. */
function zoomFrame(s: Session, dir: number): Record<string, unknown> {
  const ds = s.ds()
  const frames = topFrames(s)
  if (frames.length === 0) return ok()
  const first = ds.selection[0]
  const current = first === undefined ? null : topLevelFrame(s, first)
  const at = current === null ? -1 : frames.indexOf(current)
  const n = frames.length
  const next = at < 0 ? 0 : (((at + dir) % n) + n) % n
  const f = frames[next]
  if (f === undefined) return ok()
  const b = boundsOf(s, [f]) ?? { x0: 0, y0: 0, x1: 0, y1: 0 }
  ds.selection = [f]
  ViewState.fit(ds.view, b, 256)
  return { frame: f }
}

/** Step to the previous/next page and zoom to fit. */
function pageStep(s: Session, dir: number): Record<string, unknown> {
  const ds = s.ds()
  const pages = ds.doc.pages
  const i = pages.indexOf(ds.page)
  const n = pages.length
  let next = i + dir
  let target = ds.page
  while (next >= 0 && next < n) {
    const p = pages[next]
    if (p !== undefined) {
      target = p
      break
    }
    next += dir
  }
  ds.page = target
  ds.selection = []
  const ids = [...(ds.doc.node(target)?.children ?? [])]
  const b = boundsOf(s, ids)
  if (b) ViewState.fit(ds.view, b)
  return { page: target }
}

/** What a click with the current tool makes, selected. */
function place(s: Session, x: number | null, y: number | null): Record<string, unknown> {
  const tool = s.tool()
  const kindOf: Partial<Record<string, string>> = {
    frame: 'shape.frame',
    section: 'shape.frame',
    slice: 'shape.frame',
    rectangle: 'shape.rectangle',
    ellipse: 'shape.ellipse',
    polygon: 'shape.polygon',
    star: 'shape.star',
    line: 'shape.line',
    text: 'text.create'
  }
  const command = kindOf[tool]
  if (!command) throw new Error(`the ${tool} tool doesn't place a shape`)
  const ds = s.ds()
  // `x`/`y` are the shape's centre; the create commands take its top-left.
  const w = 100
  const h = tool === 'text' ? 22 : 100
  const left = (x ?? ds.view.cx) - w / 2
  const top = (y ?? ds.view.cy) - h / 2
  const r = s.execute(command, { x: left, y: top, width: w, height: h })
  return { ids: typeof r.id === 'number' ? [r.id] : [...ds.selection] }
}
