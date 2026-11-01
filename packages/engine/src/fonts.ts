/**
 * Fonts a document names that this machine doesn't have, and fitting
 * auto-sizing text again once they arrive.
 * (Converted 1:1 from FigCraft `crates/engine/src/fonts.rs`.)
 *
 * The font database itself is a platform seam ([`FontRegistry`]): the desktop
 * app installs the one backed by the system's fonts, the browser app the one
 * loading web fonts. With no registry installed, no family counts as missing.
 */

import {
  Document,
  Variables,
  textOf,
  type NodeId,
  type VariableValue
} from '@zenuxs/doc'

import { bad, boolean, get, reqTargets, string } from './cmd/params'
import { ok, spec, type CommandSpec, type Session } from './lib'
import { normalize, autoSize } from './normalize'

/** The largest font file `text.loadFont` reads from disk. */
export const MAX_FONT_FILE = 128 * 1024 * 1024

/** Read a font file from disk (bounded). Hosts without a file system refuse. */
function readFontFile(path: string): Uint8Array {
  const host = fontHost()
  if (host === null) throw bad('text.loadFont', 'this host reads no font files; pass `data` (base64) instead')
  const size = host.fileSize(path)
  if (size > MAX_FONT_FILE) throw bad('text.loadFont', `\`path\`: the file is larger than ${MAX_FONT_FILE} bytes`)
  return host.readFile(path)
}

/** What a host reads font files with (the desktop app's file system). */
export interface FontHost {
  fileSize(path: string): number
  readFile(path: string): Uint8Array
}

let FILE_HOST: FontHost | null = null

/** The file reader `text.loadFont` uses (none in the browser: pass `data`). */
export function fontHost(): FontHost | null {
  return FILE_HOST
}

export function registerFontHost(host: FontHost | null): void {
  FILE_HOST = host
}

/** One variation axis of a variable face. */
export interface Axis {
  tag: string
  name: string
  min: number
  default: number
  max: number
  hidden: boolean
}

/** A named instance: one coordinate per axis. */
export interface NamedInstance {
  name: string
  variations: Record<string, number>
}

/** A face a font database knows, with its OpenType features and axes. */
export interface FullFace {
  family: string
  style: string
  featureTags(): string[]
  axes: Axis[]
  instances: NamedInstance[]
}

/** What installing fonts changed. */
export interface Rescan {
  /** Families that were unknown before. */
  added: string[]
  /** Families that gained faces. */
  changed: string[]
}

/**
 * The font database seam. The engine never reads font files itself: the app
 * supplies an implementation and registers it.
 */
export interface FontRegistry {
  /** Every installed family name. */
  familyNames(): string[]
  /** Every style of `family` ("Regular", "Bold Italic"…). */
  familyStyles(family: string): string[]
  /** The face `family`/`style`, or null. */
  findFace(family: string, style: string): FullFace | null
  /** Whether some installed face provides `family`. */
  hasFamily(family: string): boolean
  /** Add a font file's bytes; the families it provides. */
  loadBytes(bytes: Uint8Array): string[]
  /** Walk the system font folders again. */
  rescan(): Rescan
}

/** The registry with no fonts behind it: nothing is ever missing. */
export const EmptyFontRegistry: FontRegistry = {
  familyNames: () => [],
  familyStyles: () => [],
  findFace: () => null,
  hasFamily: () => true,
  loadBytes: () => [],
  rescan: () => ({ added: [], changed: [] })
}

let REGISTRY: FontRegistry | null = null

/** The font database in use. */
export function fontRegistry(): FontRegistry {
  return REGISTRY ?? EmptyFontRegistry
}

/** Install the app's font database (null puts back the empty one). */
export function registerFontRegistry(r: FontRegistry | null): void {
  REGISTRY = r
}

/** A family the document names that nothing installed provides. */
export interface Missing {
  /** As the document spells it. */
  family: string
  /** Text layers that use it (0: only a text style or a variable names it). */
  layers: number
}

/**
 * The families `doc` names that the font database doesn't have, by name.
 * Sources: text layers and their styled ranges, text styles, and the string
 * variables bound to a font family.
 */
export function missing(doc: Document): Missing[] {
  const used = new Map<string, { family: string; layers: number }>()
  const add = (family: string, layer: boolean): void => {
    const f = family.trim()
    if (f.length === 0) return
    const key = f.toLowerCase()
    const e = used.get(key) ?? { family: f, layers: 0 }
    if (layer) e.layers += 1
    used.set(key, e)
  }
  for (const n of doc.allNodes()) {
    if (n.kind.type === 'text') {
      const t = textOf(n.kind)
      const families = [t.style.font_family, ...t.runs.map((r) => r.style.font_family)]
      const seen = new Set<string>()
      for (const f of families) {
        const key = f.trim().toLowerCase()
        if (seen.has(key)) continue
        seen.add(key)
        add(f, true)
      }
    }
    const bound = n.bound.fontFamily
    if (bound !== undefined) for (const f of stringValues(doc.variables, bound)) add(f, false)
  }
  for (const st of doc.styles) {
    if (st.kind.type !== 'text') continue
    const fontFamily = (st.kind as { style?: { font_family?: unknown } }).style?.font_family
    if (typeof fontFamily === 'string') add(fontFamily, false)
  }
  const registry = fontRegistry()
  return [...used.values()].filter((u) => !registry.hasFamily(u.family))
}

/** Every string value of variable `id` in any mode, following aliases (32 deep). */
function stringValues(vars: Variables, id: string): string[] {
  const out: string[] = []
  const todo: Array<[string, number]> = [[id, 0]]
  while (todo.length > 0) {
    const next = todo.pop()
    if (!next) continue
    const [cur, depth] = next
    const v = Variables.get(vars, cur)
    if (!v) continue
    for (const value of Object.values(v.values) as VariableValue[]) {
      if (value.type === 'string') out.push(value.value)
      else if (value.type === 'alias' && depth < 32) todo.push([value.value, depth + 1])
    }
  }
  return out
}

/**
 * Auto-sizing text layers measure their boxes again: a box measured while its
 * family was missing (in a fallback font) follows the real face once that's
 * installed or loaded. Only layers under `under` (every layer: null) that use
 * one of `families` (any family: null). Returns the layers whose size changed.
 */
export function refit(doc: Document, under: NodeId[] | null, families: string[] | null): NodeId[] {
  const want = families === null ? null : new Set(families.map((f) => f.trim().toLowerCase()))
  const scope = under === null ? null : new Set(under.flatMap((i) => doc.subtree(i)))
  const ids: NodeId[] = []
  for (const n of doc.allNodes()) {
    if (scope !== null && !scope.has(n.id)) continue
    if (n.kind.type !== 'text') continue
    const t = textOf(n.kind)
    if (want !== null) {
      const base = t.style.font_family.trim().toLowerCase()
      const inRuns = t.runs.some((r) => want.has(r.style.font_family.trim().toLowerCase()))
      if (!want.has(base) && !inRuns) continue
    }
    const size = autoSize(n)
    if (size !== null && (Math.abs(size[0] - n.width) > 1e-6 || Math.abs(size[1] - n.height) > 1e-6)) ids.push(n.id)
  }
  if (ids.length > 0) {
    const before = doc.clone()
    doc.mark_dirty(ids)
    normalize(doc, before)
  }
  return ids
}


/** [`refit`] in the session's open document. */
export function refitOpen(s: Session, under: NodeId[] | null, families: string[] | null): NodeId[] {
  return refit(s.doc(), under, families)
}

/** Split a `data:` URL (or a bare base64 payload) into raw bytes. */
function fontBytes(data: string): Uint8Array {
  const comma = data.indexOf(',')
  const payload = (comma >= 0 ? data.slice(comma + 1) : data).trim()
  try {
    return Uint8Array.from(atob(payload), (c) => c.charCodeAt(0))
  } catch (error) {
    throw bad('text.loadFont', `\`data\`: ${error instanceof Error ? error.message : String(error)}`)
  }
}

/** The font commands: `text.missingFonts` and `text.refit`. */
export const FONT_SPECS: CommandSpec[] = [
  spec(
    'text.missingFonts',
    'Missing fonts',
    '{}  fonts the open document names that aren\'t installed (text layers, styled ranges, text styles, font family variables); the app shows them → {families: [{family, layers}]}',
    false,
    (s) => {
      const families = missing(s.doc()).map((m) => ({ family: m.family, layers: m.layers }))
      s.request_ui('dialog.missingFonts')
      return ok({ families })
    }
  ),
  spec(
    'text.refit',
    'Fit text to fonts',
    '{ids? (these layers and the text in them; default: the whole document)}  auto-sizing text measures its box again, e.g. a box measured in a fallback font while its family was missing → {refitted: [ids whose size changed]}',
    true,
    (s, p) => {
      const under = get(p, 'ids') === null || get(p, 'ids') === undefined ? null : reqTargets('text.refit', s, p)
      return ok({ refitted: refitOpen(s, under, null) })
    }
  ),
  spec(
    'text.rescanFonts',
    'Rescan installed fonts',
    "{}  walks the system font folders again, for fonts installed while the app runs; the open document's auto-sizing text in the families that gained faces (new ones, or styles installed since) fits them (text.refit) → {added: [families that were unknown], refitted: [ids]}",
    true,
    (s) => {
      const rescan = fontRegistry().rescan()
      return ok({ added: rescan.added, refitted: refitOpen(s, null, rescan.changed) })
    }
  ),
  spec(
    'text.loadFont',
    'Load font file',
    "{path | data (base64)}  adds a font file (.ttf, .otf, .ttc, .otc; every face of a collection) to this session's fonts without installing it; the open document's auto-sizing text in its families fits it (text.refit) → {families, refitted: [ids]}",
    true,
    (s, p) => {
      const data = get(p, 'data')
      let bytes: Uint8Array
      if (typeof data === 'string') {
        bytes = fontBytes(data)
      } else {
        const path = get(p, 'path')
        if (typeof path !== 'string' || path.length === 0) {
          throw bad('text.loadFont', 'pass `path` or `data` (base64)')
        }
        bytes = readFontFile(path)
      }
      const families = fontRegistry().loadBytes(bytes)
      if (families.length === 0) throw bad('text.loadFont', 'not a font file')
      return ok({ families, refitted: refitOpen(s, null, families) })
    }
  ),
  spec(
    'text.fonts',
    'List fonts',
    "{family? (list its styles), style?, features? (the face's OpenType features), axes? (the face's variation axes and named instances)}",
    false,
    (_s, p) => {
      const registry = fontRegistry()
      const family = get(p, 'family')
      if (typeof family !== 'string') return ok({ families: registry.familyNames() })
      if (boolean(p, 'features')) {
        const face = registry.findFace(family, styleOf(p))
        return ok({ features: face === null ? [] : face.featureTags() })
      }
      if (boolean(p, 'axes')) {
        const face = registry.findFace(family, styleOf(p))
        if (face === null) return ok({ face: null })
        return ok({ face: { family: face.family, axes: face.axes, instances: face.instances } })
      }
      return ok({ family, styles: registry.familyStyles(family) })
    }
  )
]

function styleOf(p: Record<string, unknown>): string {
  const style = string(p, 'style')
  return style !== null && style.length > 0 ? style : 'Regular'
}
