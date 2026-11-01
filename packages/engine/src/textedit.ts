/**
 * On-canvas text editing: caret, selection, typing. A whole editing session is one undo step.
 * (Converted 1:1 from FigCraft `crates/engine/src/textedit.rs`.)
 */

import { TextData, textOf, type ListStyle, type TextStyle } from '@zenuxs/doc'

import { EngineError, type Session, type TextEdit } from './lib'

/** Characters a word can be split at: spaces and punctuation end a word. */
function wordClass(chars: string[], index: number): number {
  let i = index
  while (i > 0 && isCombining(chars[i])) i -= 1
  const c = chars[i]
  if (c === undefined) return 0
  const cp = c.codePointAt(0) ?? 0
  if (cp === 0x3005 || cp === 0x3006 || cp === 0x3007) return 2
  if ((cp >= 0x3400 && cp <= 0x4dbf) || (cp >= 0x4e00 && cp <= 0x9fff) || (cp >= 0xf900 && cp <= 0xfaff) || (cp >= 0x20000 && cp <= 0x3ffff)) return 2
  if (cp >= 0x3041 && cp <= 0x309f) return 3
  if ((cp >= 0x30a0 && cp <= 0x30ff) || (cp >= 0x31f0 && cp <= 0x31ff) || (cp >= 0xff66 && cp <= 0xff9f)) return 4
  if ((cp >= 0x1100 && cp <= 0x11ff) || (cp >= 0x3130 && cp <= 0x318f) || (cp >= 0xac00 && cp <= 0xd7af)) return 5
  return isWordChar(c) ? 1 : 0
}

function isCombining(c: string | undefined): boolean {
  if (c === undefined) return false
  const cp = c.codePointAt(0) ?? 0
  return (
    (cp >= 0x0300 && cp <= 0x036f) ||
    (cp >= 0x1ab0 && cp <= 0x1aff) ||
    (cp >= 0x1dc0 && cp <= 0x1dff) ||
    (cp >= 0x20d0 && cp <= 0x20ff) ||
    (cp >= 0x3099 && cp <= 0x309a) ||
    (cp >= 0xfe20 && cp <= 0xfe2f)
  )
}

function isWordChar(c: string): boolean {
  return /[\p{L}\p{N}_]/u.test(c)
}

function isWord(chars: string[], i: number): boolean {
  return wordClass(chars, i) !== 0
}

/** The start of the word before `i` (skipping spaces and punctuation first). */
function wordLeft(chars: string[], index: number): number {
  let i = index
  while (i > 0 && !isWord(chars, i - 1)) i -= 1
  const cls = wordClass(chars, i - 1)
  while (i > 0 && wordClass(chars, i - 1) === cls && cls !== 0) i -= 1
  return i
}

/** The end of the word after `i` (skipping spaces and punctuation first). */
function wordRight(chars: string[], index: number): number {
  const n = chars.length
  let i = index
  while (i < n && !isWord(chars, i)) i += 1
  const cls = wordClass(chars, i)
  while (i < n && wordClass(chars, i) === cls && cls !== 0) i += 1
  return i
}

function lineStart(chars: string[], index: number): number {
  let i = index
  while (i > 0 && chars[i - 1] !== '\n') i -= 1
  return i
}

function lineEnd(chars: string[], index: number): number {
  let i = index
  while (i < chars.length && chars[i] !== '\n') i += 1
  return i
}

/** The char above (`up`) or below `index` in the same column; past either end, the text's end. */
function verticalStep(chars: string[], index: number, down: boolean): number {
  const n = chars.length
  const ls = lineStart(chars, index)
  const column = index - ls
  if (down) {
    const le = lineEnd(chars, index)
    if (le >= n) return n
    const nextStart = le + 1
    return Math.min(nextStart + column, lineEnd(chars, nextStart))
  }
  if (ls === 0) return 0
  const prevStart = lineStart(chars, ls - 1)
  return Math.min(prevStart + column, lineEnd(chars, prevStart))
}

/** Longest composition shown (IMEs compose a phrase at a time). */
const MAX_PREEDIT = 1000

/** The text layer's data (`{id} is not a text layer` otherwise). */
export function textOfNode(s: Session, id: number): TextData {
  const n = s.doc().node(id)
  if (!n || n.kind.type !== 'text') throw new EngineError(`${id} is not a text layer`)
  return textOf(n.kind)
}

/** Write text data back onto its node. */
function writeText(s: Session, id: number, data: TextData): void {
  const n = s.doc().node_mut(id)
  if (!n || n.kind.type !== 'text') return
  Object.assign(n.kind, data)
}

/** Start editing text node `id` with the caret at `caret` (null = select all). */
export function begin(s: Session, id: number, caret: number | null, created: boolean): void {
  const t = textOfNode(s, id)
  const n = t.characters.length
  s.begin_interaction('Edit text')
  const ds = s.ds()
  const at = caret === null ? n : Math.min(caret, n)
  const anchor = caret === null ? 0 : at
  ds.text_edit = { node: id, caret: at, anchor, preedit: '', preedit_cursor: 0, created }
  ds.selection = [id]
  ds.bump()
}

/** Finish editing: an empty new text layer is removed; the session becomes one undo step. */
export function end(s: Session): void {
  const ds = s.ds()
  const te = ds.text_edit
  if (!te) return
  ds.text_edit = null
  let empty = false
  try {
    empty = textOfNode(s, te.node).characters.trim().length === 0
  } catch {
    empty = false
  }
  if (empty) {
    ds.doc.delete(te.node)
    ds.selection = []
  }
  if (empty && te.created) {
    // Nothing to undo for a text box that was never filled: re-base the gesture snapshot on the
    // document without the layer, so committing records no step.
    const interaction = ds.interaction
    if (interaction) interaction.doc = ds.doc.clone()
  }
  s.commit_interaction()
  ds.bump()
}

function range(te: TextEdit): [number, number] {
  return [Math.min(te.caret, te.anchor), Math.max(te.caret, te.anchor)]
}

/** Run `f` on the edited text and its edit state, then settle the edit (one revision bump). */
function edit(s: Session, f: (t: TextData, te: TextEdit) => void): void {
  const ds = s.ds()
  const current = ds.text_edit
  if (!current) throw new EngineError('not editing text')
  const te: TextEdit = { ...current }
  const n = ds.doc.node_mut(te.node)
  if (!n || n.kind.type !== 'text') throw new EngineError('not a text layer')
  const t = textOf(n.kind)
  f(t, te)
  // Any edit ends a composition (a commit replaces it with the final text).
  te.preedit = ''
  te.preedit_cursor = 0
  const len = t.characters.length
  te.caret = Math.min(te.caret, len)
  te.anchor = Math.min(te.anchor, len)
  TextData.normalize(t)
  writeText(s, te.node, t)
  if (n.source !== undefined && n.source !== null) n.overrides.add('characters')
  ds.text_edit = te
  ds.bump()
}

/** Normalise line endings and drop control characters that pasted text often carries. */
function cleanText(text: string): string {
  let out = ''
  for (const c of text.replace(/\r\n?/g, '\n')) {
    const cp = c.codePointAt(0) ?? 0
    const control = cp < 0x20 || cp === 0x7f
    if (!control || c === '\n' || c === '\t') out += c
  }
  return out
}

/** Type (or paste) `text` replacing the selection. */
export function insert(s: Session, text: string): void {
  const clean = cleanText(text)
  if (clean.length === 0) return
  edit(s, (t, te) => {
    const [a, b] = range(te)
    // "- ", "* " or "1. " typed at the start of a plain paragraph starts a list.
    if (clean === ' ' && a === b && TextData.paraList(t, TextData.paraOf(t, a)).kind === 'none') {
      const chars = [...t.characters]
      const start = lineStart(chars, a)
      const typed = chars.slice(start, a).join('')
      const kind: ListStyle = typed === '-' || typed === '*' ? 'bullet' : typed === '1.' ? 'numbered' : 'none'
      if (kind !== 'none') {
        TextData.replaceRange(t, start, a, '')
        TextData.setParaLists(t, start, start, (pl) => {
          pl.kind = kind
        })
        te.caret = start
        te.anchor = start
        return
      }
    }
    TextData.replaceRange(t, a, b, clean)
    te.caret = a + clean.length
    te.anchor = te.caret
  })
}

/**
 * List keys: Tab nests the selected list items a level deeper; Shift+Tab, Backspace at an item's
 * start and Enter on an empty item move it a level out (at the top: out of the list). Returns
 * whether the key was taken.
 */
function listKey(s: Session, key: string, shift: boolean): boolean {
  const te = s.ds().text_edit
  if (!te) return false
  const t = textOfNode(s, te.node)
  const [a, b] = range(te)
  const chars = [...t.characters]
  const atStart = a === b && lineStart(chars, a) === a
  const item = TextData.paraList(t, TextData.paraOf(t, a)).kind !== 'none'
  const [pa, pb] = TextData.paraSpan(t, a, b)
  let anyItem = false
  for (let p = pa; p <= pb; p++) {
    if (TextData.paraList(t, p).kind !== 'none') anyItem = true
  }
  let deeper: boolean
  if (key === 'Tab' && anyItem) deeper = !shift
  else if (key === 'Backspace' && item && atStart) deeper = false
  else if (key === 'Enter' && item && atStart && (chars[a] === undefined || chars[a] === '\n')) deeper = false
  else return false
  edit(s, (t, _te) => {
    TextData.setParaLists(t, a, b, (pl) => {
      if (pl.kind === 'none') return
      if (deeper) pl.indent = pl.indent + 1
      else if (pl.indent > 0) pl.indent -= 1
      else pl.kind = 'none'
    })
  })
  return true
}

/** Cmd/Ctrl+] and Cmd/Ctrl+[ while editing: the selected items a level deeper or out. */
export function listIndent(s: Session, out: boolean): boolean {
  const id = s.ds().text_edit?.node
  if (id === undefined) return false
  const before = textOfNode(s, id)
  if (!listKey(s, 'Tab', out)) return false
  return JSON.stringify(textOfNode(s, id)) !== JSON.stringify(before)
}

/** Step the caret one grapheme left (`back`) or right. */
function graphemeStep(chars: string[], index: number, forward: boolean): number {
  if (forward) {
    if (index >= chars.length) return chars.length
    let i = index + 1
    while (i < chars.length && isCombining(chars[i])) i += 1
    return i
  }
  if (index <= 0) return 0
  let i = index - 1
  while (i > 0 && isCombining(chars[i])) i -= 1
  return i
}

/**
 * A named key: Backspace, Delete, Left, Right, Up, Down, Home, End, Enter, Escape, SelectAll.
 * `word` (alt) moves or deletes by word, `line` (cmd) to the line's ends (the text's ends for
 * Up/Down and Home/End). `ArrowLeft` and friends also work.
 */
export function key(s: Session, keyName: string, shift: boolean, word: boolean, line: boolean): void {
  const k = keyName.startsWith('Arrow') ? keyName.slice('Arrow'.length) : keyName
  const current = s.ds().text_edit
  if (!current) throw new EngineError('not editing text')
  const te: TextEdit = { ...current }
  const t = textOfNode(s, te.node)
  const chars = [...t.characters]
  const n = chars.length
  if ((k === 'Tab' || k === 'Backspace' || k === 'Enter') && !word && !line && listKey(s, k, shift)) return
  if (k === 'Escape') return end(s)
  if (k === 'Enter') return insert(s, '\n')
  if (k === 'Tab') return insert(s, '\t')
  if (k === 'Backspace' || k === 'Delete') {
    edit(s, (t, te) => {
      let [a, b] = range(te)
      if (a === b) {
        if (k === 'Backspace') {
          a = line ? lineStart(chars, a) : word ? wordLeft(chars, a) : graphemeStep(chars, a, false)
        } else {
          b = line ? lineEnd(chars, a) : word ? wordRight(chars, a) : Math.min(graphemeStep(chars, a, true), n)
        }
      }
      TextData.replaceRange(t, a, b, '')
      te.caret = a
      te.anchor = a
    })
    return
  }
  const [a, b] = range(te)
  // Without Shift, a selection collapses first: plain arrows stop at its edge.
  const collapsed = !shift && a !== b
  const cur = collapsed && (k === 'Left' || k === 'Up' || k === 'Home') ? a : collapsed && (k === 'Right' || k === 'Down' || k === 'End') ? b : te.caret
  let next: number
  switch (k) {
    case 'Left':
      next =
        collapsed && !word && !line ? a : line ? lineStart(chars, cur) : word ? wordLeft(chars, cur) : graphemeStep(chars, cur, false)
      break
    case 'Right':
      next = collapsed && !word && !line ? b : line ? lineEnd(chars, cur) : word ? wordRight(chars, cur) : Math.min(graphemeStep(chars, cur, true), n)
      break
    case 'Home':
      next = line ? 0 : lineStart(chars, cur)
      break
    case 'End':
      next = line ? n : lineEnd(chars, cur)
      break
    case 'Up':
      next = line ? 0 : verticalStep(chars, cur, false)
      break
    case 'Down':
      next = line ? n : verticalStep(chars, cur, true)
      break
    case 'SelectAll':
      return select(s, 0, n)
    default:
      return
  }
  return select(s, shift ? te.anchor : next, next)
}

/** Set the selection (`anchor`..`caret`, clamped to the text); abandons any composition. */
export function select(s: Session, anchor: number, caret: number): void {
  const ds = s.ds()
  const te = ds.text_edit
  if (!te) return
  const node = ds.doc.node(te.node)
  const len = node && node.kind.type === 'text' ? node.kind.characters.length : 0
  te.anchor = Math.min(anchor, len)
  te.caret = Math.min(caret, len)
  te.preedit = ''
  te.preedit_cursor = 0
  ds.bump()
}

/**
 * Show an IME composition inline at the caret (`cursor` = the IME's cursor inside it, in chars;
 * default its end). The document only changes on `insert`; an empty `text` cancels it.
 */
export function preedit(s: Session, text: string, cursor: number | null): void {
  const current = s.ds().text_edit
  if (!current) throw new EngineError('not editing text')
  const te: TextEdit = { ...current }
  const clean = [...text].filter((c) => !/\p{Cc}/u.test(c)).slice(0, MAX_PREEDIT).join('')
  if (clean.length === 0 && !te.preedit) return // IMEs send empty compositions when idle
  if (clean.length > 0 && !te.preedit && te.caret !== te.anchor) {
    edit(s, (t, te) => {
      const [a, b] = range(te)
      TextData.replaceRange(t, a, b, '')
      te.caret = a
      te.anchor = a
    })
  }
  const ds = s.ds()
  const next = ds.text_edit
  if (!next) return
  const len = clean.length
  next.preedit = len > 0 ? clean : ''
  next.preedit_cursor = len > 0 ? Math.min(cursor ?? len, len) : 0
  ds.bump()
}

/**
 * The document as it looks while composing: the composition inserted at the caret. Returns the
 * document, the composition's char range and the IME cursor's index; null when nothing composes.
 */
export function preeditDoc(s: Session): { doc: ReturnType<Session['doc']>; range: [number, number]; cursor: number } | null {
  const ds = s.ds()
  const te = ds.text_edit
  if (!te || !te.preedit) return null
  const doc = ds.doc.clone()
  const node = doc.node_mut(te.node)
  if (!node || node.kind.type !== 'text') return null
  const t = textOf(node.kind)
  const at = Math.min(te.caret, t.characters.length)
  TextData.replaceRange(t, at, at, te.preedit)
  TextData.normalize(t)
  writeTextOn(doc, te.node, t)
  const n = te.preedit.length
  return { doc, range: [at, at + n], cursor: at + Math.min(te.preedit_cursor, n) }
}

function writeTextOn(doc: ReturnType<Session['doc']>, id: number, data: TextData): void {
  const n = doc.node_mut(id)
  if (!n || n.kind.type !== 'text') return
  Object.assign(n.kind, data)
}

/** Place the caret (and optionally extend the selection) at char `index`. */
export function setCaret(s: Session, index: number, extend: boolean): void {
  const te = s.ds().text_edit
  if (!te) return
  select(s, extend ? te.anchor : index, index)
}

/** Select the word at `index` (double-click). */
export function selectWord(s: Session, index: number): void {
  const te = s.ds().text_edit
  if (!te) return
  const chars = [...textOfNode(s, te.node).characters]
  let a = Math.min(index, chars.length)
  // Double-clicking just after a word's last char (or at the end) selects that word.
  if (a > 0 && !isWord(chars, a) && isWord(chars, a - 1)) a -= 1
  let b = a
  // Words by script, then runs of spaces and of punctuation; newlines stay unselected.
  const cls = (i: number): number => {
    const c = chars[i]
    if (wordClass(chars, i) !== 0) return wordClass(chars, i)
    return c !== undefined && /^\s$/u.test(c) ? 10 : 11
  }
  const first = chars[a]
  if (first !== undefined && first !== '\n') {
    const k = cls(a)
    while (a > 0 && chars[a - 1] !== '\n' && cls(a - 1) === k) a -= 1
    while (b < chars.length && chars[b] !== '\n' && cls(b) === k) b += 1
  }
  select(s, a, b)
}

/** Select the line (paragraph) containing `index` (triple-click). */
export function selectLine(s: Session, index: number): void {
  const te = s.ds().text_edit
  if (!te) return
  const chars = [...textOfNode(s, te.node).characters]
  const i = Math.min(index, chars.length)
  select(s, lineStart(chars, i), lineEnd(chars, i))
}

/** The selected text while editing (for copy). */
export function selectedText(s: Session): string | null {
  const r = selectedRange(s)
  if (!r) return null
  const [id, a, b] = r
  const node = s.doc().node(id)
  if (!node || node.kind.type !== 'text') return null
  return node.kind.characters.slice(a, b)
}

/** The selected range while editing (for styling commands), or null. */
export function selectedRange(s: Session): [number, number, number] | null {
  const te = s.ds().text_edit
  if (!te) return null
  const [a, b] = range(te)
  return [te.node, a, b]
}

/** The character styles `style` has, for commands that restyle a whole layer. */
export function allStyles(t: TextData): TextStyle[] {
  return TextData.spans(t).map(([, , style]) => style)
}
