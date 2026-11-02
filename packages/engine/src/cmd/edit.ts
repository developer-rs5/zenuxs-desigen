/**
 * Edit menu: undo/redo/repeat, delete/duplicate, find and replace, layer
 * renames and toggles, nudges, reparenting, bound-list removals and command
 * batches. Clipboard commands live in `clipboard.ts`.
 * (Converted 1:1 from FigCraft `crates/engine/src/cmd/edit.rs`.)
 */

import { TextData, textOf, type Document, type NodeId } from '@zenuxs/doc'
import { Affine, Vec2Math } from '@zenuxs/geom'

import { arrowMove, dirFromUnits, flowingParent } from '../alKeys'
import { EngineError, ok, spec, type CommandSpec, type Session } from '../lib'
import { BatchRename } from '../rename'
import { BoundList, remove_item } from './lists'
import {
  bad,
  boolean,
  boundBefore,
  detachEdited,
  get,
  idOf,
  normalizeLineEndings,
  num,
  reqIndex,
  reqNum,
  reqString,
  reqTargets,
  string
} from './params'
import { z_sorted } from './select'

/** The ids with no ancestor among them (a layer and its parent move once). */
export function roots(doc: Document, ids: NodeId[]): NodeId[] {
  const set = new Set(ids)
  return ids.filter((i) => !doc.ancestors(i).some((a) => set.has(a)))
}

// ------------------------------ undo / redo / repeat ------------------------------

const HISTORY_SPECS: CommandSpec[] = [
  spec('edit.undo', 'Undo', '{}', false, (s) => ({ undone: s.undo() })),
  spec('edit.redo', 'Redo', '{}', false, (s) => ({ redone: s.redo() })),
  spec('edit.repeat', 'Repeat last command', '{}', true, (s) => {
    const last = s.last_command
    if (last === null || last.id === 'edit.repeat') {
      throw new EngineError('command `edit.repeat` is not available right now: nothing to repeat')
    }
    const found = s.find_command(last.id)
    if (!found) throw new EngineError(`unknown command \`${last.id}\``)
    return found.run(s, last.params)
  })
]

// ------------------------------ delete ------------------------------

const DELETE_SPECS: CommandSpec[] = [
  spec('edit.delete', 'Delete', '{ids?}', true, (s, p) => {
    // Top-most layers first, so a parent's id stays valid while it is removed.
    const ids = roots(s.doc(), reqTargets('edit.delete', s, p))
    for (const i of z_sorted(s.doc(), ids).reverse()) s.doc().remove(i)
    s.set_selection([])
    return { deleted: ids }
  })
]

// ------------------------------ find and replace ------------------------------

/**
 * Char index of the first case-insensitive occurrence of `needle` in `hay` at
 * or after `from`. Works on char indices (what `replaceRange` takes), so
 * lowercasing never shifts offsets.
 */
function findCi(hay: string[], needle: string[], from: number): number | null {
  if (needle.length === 0) return null
  for (let i = from; i + needle.length <= hay.length; i++) {
    let same = true
    for (let k = 0; k < needle.length; k++) {
      const a = hay[i + k] as string
      const b = needle[k] as string
      if (a !== b && a.toLowerCase() !== b.toLowerCase()) {
        same = false
        break
      }
    }
    if (same) return i
  }
  return null
}

const FIND_SPECS: CommandSpec[] = [
  spec(
    'edit.findReplace',
    'Find and replace',
    '{find, replace? (text layers), layerNames? (bool), select? (default true)}',
    true,
    (s, p) => {
      const find = reqString('edit.findReplace', p, 'find')
      if (find.length === 0) throw bad('edit.findReplace', '`find` is empty')
      const rawReplace = string(p, 'replace')
      // Line breaks stored as the editor stores them (CRLF, CR, U+2028 and
      // U+2029 become LF).
      const replace = rawReplace === null ? null : normalizeLineEndings(rawReplace)
      const names = boolean(p, 'layerNames') ?? false
      const doc = s.doc()
      const hits: NodeId[] = []
      const needle = [...find]
      const rChars = replace === null ? [] : [...replace]
      for (const i of doc.subtree(s.page())) {
        const n = doc.node(i)
        if (!n || n.kind.type === 'page') continue
        const kind = n.kind
        const plain = kind.type === 'text'
        const text: string[] | null = plain ? [...(kind.characters as string)] : null
        const textHit = text !== null && findCi(text, needle, 0) !== null
        const nameHit = names && findCi([...n.name], needle, 0) !== null
        if (!(textHit || nameHit)) continue
        hits.push(i)
        if (replace === null) continue
        const mut = doc.node_mut(i)
        if (!mut) continue
        if (names && nameHit) {
          const chars = [...mut.name]
          let out = ''
          let at = 0
          for (;;) {
            const pos = findCi(chars, needle, at)
            if (pos === null) break
            out += chars.slice(at, pos).join('')
            out += replace
            at = pos + needle.length
          }
          out += chars.slice(at).join('')
          mut.name = out
        }
        if (text !== null && mut.kind.type === 'text') {
          const data = textOf(mut.kind)
          const chars = [...data.characters]
          // Replace occurrence by occurrence so styles shift correctly. The
          // search resumes after each inserted replacement, so a replacement
          // that matches `find` (in any case) neither loops forever nor stops
          // the other occurrences.
          let cursor = 0
          for (let guard = 0; guard < 10_000; guard++) {
            const start = findCi(chars, needle, cursor)
            if (start === null) break
            TextData.replaceRange(data, start, start + needle.length, replace)
            chars.splice(start, needle.length, ...rChars)
            cursor = start + rChars.length
          }
          mut.kind.characters = data.characters
          mut.kind.runs = data.runs
          mut.kind.paragraphs = data.paragraphs
        }
      }
      if (boolean(p, 'select') ?? true) s.set_selection(hits)
      return { matches: hits }
    }
  )
]

// ------------------------------ rename / toggles ------------------------------

function toggle(
  s: Session,
  p: Record<string, unknown>,
  what: 'visible' | 'locked'
): Record<string, unknown> {
  const ids = reqTargets(what === 'visible' ? 'object.toggleVisible' : 'object.toggleLock', s, p)
  const doc = s.doc()
  const explicit = boolean(p, what)
  // Figma: if any is visible, hide all (and vice versa).
  const value =
    explicit ??
    (what === 'visible'
      ? !ids.every((i) => doc.node(i)?.visible === true)
      : !ids.every((i) => doc.node(i)?.locked === true))
  for (const i of ids) {
    const n = doc.node_mut(i)
    if (!n) throw new EngineError(`no such node ${i}`)
    if (what === 'visible') n.visible = value
    else n.locked = value
  }
  if (what === 'locked' && value) s.set_selection([])
  return { [what]: value }
}

const RENAME_SPECS: CommandSpec[] = [
  spec(
    'object.rename',
    'Rename',
    '{ids?, name?} (without a name: rename the layer inline in the layers panel)',
    true,
    (s, p) => {
      const ids = reqTargets('object.rename', s, p)
      if (p.name === undefined) {
        s.request_ui('layers.rename', { ids })
        return ok()
      }
      const name = reqString('object.rename', p, 'name')
      const doc = s.doc()
      for (const i of ids) {
        const n = doc.node_mut(i)
        if (!n) throw new EngineError(`no such node ${i}`)
        n.name = name
      }
      return ok()
    }
  ),
  spec(
    'object.batchRename',
    'Batch rename',
    "{ids?, find? (match; empty: none), regex? (find is a regular expression), replace? (for each match), name? (pattern for the whole name), start? (where $n starts and $N stops; default 1)} codes in replace and name: $& current name (or the match), $` and $' text before and after the match, $1…$9 groups, $n up, $N down, $nnn padded; layers are numbered in stacking order, bottom first",
    true,
    (s, p) => {
      const ids = reqTargets('object.batchRename', s, p)
      let rename: BatchRename
      try {
        rename = BatchRename.create(
          string(p, 'find'),
          boolean(p, 'regex') ?? false,
          string(p, 'replace') ?? '',
          string(p, 'name'),
          num(p, 'start')
        )
      } catch (e) {
        throw bad('object.batchRename', e instanceof Error ? e.message : String(e))
      }
      const doc = s.doc()
      const names = rename.plan(doc, ids, z_sorted)
      for (const [i, name] of names) {
        const n = doc.node_mut(i)
        if (n) n.name = name
      }
      return { names: names.map(([i, name]) => ({ id: i, name })) }
    }
  ),
  spec('object.toggleVisible', 'Show/Hide selection', '{ids?, visible?}', true, (s, p) =>
    toggle(s, p, 'visible')
  ),
  spec('object.toggleLock', 'Lock/Unlock selection', '{ids?, locked?}', true, (s, p) =>
    toggle(s, p, 'locked')
  ),
  spec('object.hideOthers', 'Hide other layers', '{}', true, (s) => {
    const page = s.page()
    const doc = s.doc()
    const keep = new Set<NodeId>()
    for (const i of s.selection()) {
      keep.add(i)
      for (const a of doc.ancestors(i)) keep.add(a)
    }
    for (const t of doc.node(page)?.children ?? []) {
      if (keep.has(t)) continue
      const n = doc.node_mut(t)
      if (n) n.visible = false
    }
    return ok()
  })
]

// ------------------------------ opacity keys ------------------------------

/**
 * The opacity number keys give: one digit is tens of percent (0 is 100%), two
 * digits typed in quick succession the exact percentage.
 */
export function opacityFromDigits(digits: string): number | null {
  let n = 0
  let count = 0
  for (const c of digits) {
    if (c < '0' || c > '9') return null
    n = n * 10 + Number(c)
    if (!Number.isSafeInteger(n)) return null
    count += 1
  }
  if (count === 1) return n === 0 ? 1 : n / 10
  if (count === 2) return n / 100
  return null
}

const OPACITY_SPECS: CommandSpec[] = [
  spec(
    'object.opacityKeys',
    'Opacity from number keys',
    '{digits ("1"…"9": 10%…90%, "0": 100%; two digits: that percentage, "45" is 45%), ids?}',
    true,
    (s, p) => {
      const digits = reqString('object.opacityKeys', p, 'digits')
      const o = opacityFromDigits(digits)
      if (o === null) throw bad('object.opacityKeys', '`digits` must be one or two digits')
      const ids = reqTargets('object.opacityKeys', s, p)
      const doc = s.doc()
      const before = boundBefore(doc, ids)
      for (const i of ids) {
        const n = doc.node_mut(i)
        if (n) n.opacity = o
      }
      detachEdited(doc, before)
      return { opacity: o }
    }
  )
]

// ------------------------------ object paint resets ------------------------------

const OBJECT_PAINT_SPECS: CommandSpec[] = [
  spec('object.removeFill', 'Remove fill', '{ids?}', true, (s, p) => {
    for (const i of reqTargets('object.removeFill', s, p)) {
      const n = s.doc().node_mut(i)
      if (n) n.fills = []
    }
    return ok()
  }),
  spec('object.removeStroke', 'Remove stroke', '{ids?}', true, (s, p) => {
    for (const i of reqTargets('object.removeStroke', s, p)) {
      const n = s.doc().node_mut(i)
      if (n) n.strokes = []
    }
    return ok()
  }),
  spec('object.swapFillStroke', 'Swap fill and stroke', '{ids?}', true, (s, p) => {
    for (const i of reqTargets('object.swapFillStroke', s, p)) {
      const n = s.doc().node_mut(i)
      if (!n) continue
      const fills = n.fills
      n.fills = n.strokes
      n.strokes = fills
    }
    return ok()
  })
]

// ------------------------------ bound-list removals ------------------------------

const LIST_REMOVE_SPECS: CommandSpec[] = [
  spec('effect.remove', 'Remove effect', '{ids?, index}', true, (s, p) => {
    const i = reqIndex('effect.remove', p, 'index')
    for (const id of reqTargets('effect.remove', s, p)) {
      const n = s.doc().node_mut(id)
      if (!n) throw new EngineError(`no such node ${id}`)
      // Its bindings go with it; later effects' move down one.
      remove_item(n, BoundList.Effects, i)
    }
    return ok()
  }),
  spec('grid.remove', 'Remove layout grid', '{ids?, index}', true, (s, p) => {
    const i = reqIndex('grid.remove', p, 'index')
    for (const id of reqTargets('grid.remove', s, p)) {
      const n = s.doc().node_mut(id)
      if (!n) throw new EngineError(`no such node ${id}`)
      remove_item(n, BoundList.Grids, i)
    }
    return ok()
  }),
  spec('export.remove', 'Remove export setting', '{ids?, index}', true, (s, p) => {
    const i = reqIndex('export.remove', p, 'index')
    for (const id of reqTargets('export.remove', s, p)) {
      const n = s.doc().node_mut(id)
      if (n && i < n.exports.length) n.exports.splice(i, 1)
    }
    return ok()
  })
]

// ------------------------------ nudges ------------------------------

const NUDGE_SPECS: CommandSpec[] = [
  spec(
    'transform.nudge',
    'Nudge',
    '{dx, dy, big? (use the big nudge amount)} (auto layout children move one place instead: along the flow, between wrapped rows, to the next grid cell, or into the neighbouring nested auto layout frame)',
    true,
    (s, p) => {
      const big = boolean(p, 'big') ?? false
      const k = big ? s.prefs.nudge_large : s.prefs.nudge_small
      const ux = num(p, 'dx') ?? 0
      const uy = num(p, 'dy') ?? 0
      const dx = ux * k
      const dy = uy * k
      const ids = reqTargets('transform.nudge', s, p)
      // Edit a copy and keep it only if something moved, so an arrow that
      // can't move anything adds no undo step.
      const work = s.doc().clone()
      const rs = roots(work, ids)
      let changed = false
      // Children in an auto layout flow move one place instead (see `alKeys`).
      for (const i of rs) {
        if (flowingParent(work, i) !== null || (dx === 0 && dy === 0)) continue
        const n = work.node_mut(i)
        if (!n) throw new EngineError(`no such node ${i}`)
        n.transform = Affine.mul(Affine.translate(Vec2Math.new(dx, dy)), n.transform)
        changed = true
      }
      for (const dir of dirFromUnits(ux, uy)) {
        // Grouped per arrow: a move into a neighbouring frame changes the parent.
        const groups = new Map<NodeId, NodeId[]>()
        for (const i of rs) {
          const parent = flowingParent(work, i)
          if (parent === null) continue
          const list = groups.get(parent)
          if (list) list.push(i)
          else groups.set(parent, [i])
        }
        for (const [parent, block] of [...groups].sort((a, b) => a[0] - b[0])) {
          if (arrowMove(work, parent, block, dir)) changed = true
        }
      }
      if (changed) s.ds().doc = work
      return ok()
    }
  ),
  spec(
    'transform.nudgeSize',
    'Resize by nudge',
    '{dw, dh, big?} (grow or shrink the selection by the nudge amount, top-left fixed)',
    true,
    (s, p) => {
      const big = boolean(p, 'big') ?? false
      const k = big ? s.prefs.nudge_large : s.prefs.nudge_small
      const dw = (num(p, 'dw') ?? 0) * k
      const dh = (num(p, 'dh') ?? 0) * k
      for (const i of roots(s.doc(), reqTargets('transform.nudgeSize', s, p))) {
        const n = s.doc().node(i)
        if (!n) continue
        const q: Record<string, unknown> = { ids: [i] }
        // Only the axis that changes becomes fixed.
        if (dw !== 0) q.width = Math.max(0, n.width + dw)
        if (dh !== 0) q.height = Math.max(0, n.height + dh)
        s.execute('transform.resize', q)
      }
      return ok()
    }
  )
]

// ------------------------------ structure ------------------------------

const STRUCTURE_SPECS: CommandSpec[] = [
  spec('node.reparent', 'Move layer into', '{ids?, parent, index?}', true, (s, p) => {
    const ids = reqTargets('node.reparent', s, p)
    const parent = p.parent === undefined ? null : idOf(p.parent)
    if (parent === null) throw bad('node.reparent', '`parent` must be a node id')
    const rawIndex = num(p, 'index')
    const index = rawIndex === null ? null : Math.max(0, Math.trunc(rawIndex))
    const doc = s.doc()
    if (!doc.node(parent)) throw new EngineError(`no such node ${parent}`)
    const sorted = z_sorted(doc, roots(doc, ids))
    // The layers land together under the first sibling at or above `index`
    // that stays put (none: on top), wherever they came from.
    const above =
      index === null
        ? null
        : (doc
            .node(parent)
            ?.children.slice(index)
            .find((c) => !sorted.includes(c)) ?? null)
    for (const i of sorted) {
      // Counted with the layer still in place, as `reparent` expects.
      const cur = doc.node(parent)
      const at = above === null ? null : (cur?.children.indexOf(above) ?? null)
      doc.reparent(i, parent, at === null || at < 0 ? null : at)
    }
    return ok()
  }),
  spec('node.reorder', 'Reorder layer', '{id, index}', true, (s, p) => {
    const i = p.id === undefined ? null : idOf(p.id)
    if (i === null) throw bad('node.reorder', '`id` must be a node id')
    const idx = Math.max(0, Math.trunc(reqNum('node.reorder', p, 'index')))
    s.doc().reorder(i, idx)
    return ok()
  }),
  spec('layers.collapseAll', 'Collapse layers', '{}', false, (s) => {
    s.request_ui('layers.collapseAll', {})
    return ok()
  })
]

// ------------------------------ batches ------------------------------

const BATCH_SPECS: CommandSpec[] = [
  spec(
    'command.batch',
    'Run several commands',
    '{label?, commands: [{command, params}]} (one undo step)',
    false,
    (s, p) => {
      const label = string(p, 'label') ?? 'Batch'
      const raw = get(p, 'commands')
      if (!Array.isArray(raw)) throw bad('command.batch', '`commands` must be an array')
      const cmds: Array<{ id: string; params: Record<string, unknown> }> = []
      raw.forEach((c, i) => {
        const step = c !== null && typeof c === 'object' ? (c as Record<string, unknown>) : null
        const command = step?.command
        if (typeof command !== 'string') throw bad('command.batch', `step ${i} has no \`command\``)
        const params = step?.params
        cmds.push({
          id: command,
          params:
            params !== null && typeof params === 'object' && !Array.isArray(params)
              ? (params as Record<string, unknown>)
              : {}
        })
      })
      return ok({ steps: s.batch(label, cmds) })
    }
  )
]

export const EDIT_SPECS: CommandSpec[] = [
  ...HISTORY_SPECS,
  ...DELETE_SPECS,
  ...FIND_SPECS,
  ...RENAME_SPECS,
  ...OPACITY_SPECS,
  ...OBJECT_PAINT_SPECS,
  ...LIST_REMOVE_SPECS,
  ...NUDGE_SPECS,
  ...STRUCTURE_SPECS,
  ...BATCH_SPECS
]
