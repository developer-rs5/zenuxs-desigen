/**
 * The Text menu, text styling, paragraph/list, and text-editing commands.
 * (Converted 1:1 from FigCraft `crates/engine/src/cmd/text.rs`.)
 */

import {
  DECORATION,
  LIST_STYLE,
  LineHeight,
  TEXT_CASE,
  TextData,
  setFontStyle,
  setTextOf,
  textOf,
  type Document,
  type NodeId,
  TextStyle,
  type TextPath
} from '@zenuxs/doc'
import { stroke_geometry } from '@zenuxs/doc'

import {
  applyTextStyle,
  bad,
  boolean,
  boundBefore,
  detachEdited,
  enumOf,
  featuresOf,
  get,
  id,
  normalizeLineEndings,
  num,
  reqId,
  reqNum,
  reqString,
  reqTargets,
  string,
  targets,
  variationsOf
} from './params'
import { ok, spec, type CommandSpec, type Session } from '../lib'
import { normalize } from '../normalize'
import * as textedit from '../textedit'

const cmd = 'text'

/** `finite(v)`: NaN and the infinities become 0. */
function finite(v: number | null): number {
  return v !== null && Number.isFinite(v) ? v : 0
}

/** Read the text data of `id`, apply `f`, and write it back. */
function editText(doc: Document, id: NodeId, f: (t: TextData) => void): boolean {
  const n = doc.node_mut(id)
  if (!n || n.kind.type !== 'text') return false
  const t = textOf(n.kind)
  f(t)
  setTextOf(n.kind, t)
  return true
}

/**
 * A style command: the edited range while editing, else every char of the
 * targeted text layers.
 */
function style(
  s: Session,
  p: Record<string, unknown>,
  f: (st: TextStyle) => void
): Record<string, unknown> {
  const range = textedit.selectedRange(s)
  const doc = s.doc()
  if (range) {
    const [node, a, b] = range
    const before = doc.clone()
    const bound = boundBefore(doc, [node])
    editText(doc, node, (t) => TextData.restyle(t, a, b, f))
    detachEdited(doc, bound)
    normalize(doc, before)
    return ok()
  }
  const ids = reqTargets(cmd, s, p)
  const expanded = ids.flatMap((i) => doc.subtree(i))
  const bound = boundBefore(doc, expanded)
  for (const d of expanded) editText(doc, d, (t) => TextData.restyle(t, 0, t.characters.length, f))
  detachEdited(doc, bound)
  return ok()
}

/** A paragraph command: every targeted text, or the edited layer while editing. */
function para(
  s: Session,
  p: Record<string, unknown>,
  f: (t: TextData) => void
): Record<string, unknown> {
  const range = textedit.selectedRange(s)
  const ids = range ? [range[0]] : reqTargets(cmd, s, p)
  const doc = s.doc()
  const before = doc.clone()
  for (const i of ids) for (const d of doc.subtree(i)) editText(doc, d, f)
  normalize(doc, before)
  return ok()
}

/**
 * A paragraph command whose range is the edited selection while editing and
 * the whole text otherwise.
 */
function paraRange(
  s: Session,
  p: Record<string, unknown>,
  f: (t: TextData, a: number, b: number) => void
): Record<string, unknown> {
  const range = textedit.selectedRange(s)
  return para(s, p, (t) => {
    const a = range ? range[1] : 0
    const b = range ? range[2] : t.characters.length
    f(t, a, b)
  })
}

/**
 * A list command: every targeted paragraph becomes `l`, or (`toggle`) plain
 * when all of them already are.
 */
function setList(
  s: Session,
  p: Record<string, unknown>,
  l: 'none' | 'bullet' | 'numbered',
  toggle: boolean
): Record<string, unknown> {
  const range = textedit.selectedRange(s)
  const ids = range ? [range[0]] : targets(s, p)
  const doc = s.doc()
  const all = ids.every((i) => {
    const n = doc.node(i)
    if (!n || n.kind.type !== 'text') return false
    const t = textOf(n.kind)
    const a = range ? range[1] : 0
    const b = range ? range[2] : t.characters.length
    const common = TextData.commonParaList(t, a, b)
    return common !== null && common.kind === l
  })
  const want = toggle && all ? 'none' : l
  return paraRange(s, p, (t, a, b) => {
    TextData.setParaLists(t, a, b, (pl) => {
      pl.kind = want
    })
  })
}

/** Whether every targeted char has a style `pred` accepts (a toggle's direction). */
function allHave(
  s: Session,
  p: Record<string, unknown>,
  pred: (st: TextStyle) => boolean
): boolean {
  let doc: Document
  try {
    doc = s.doc()
  } catch {
    return false
  }
  const range = textedit.selectedRange(s)
  if (range) {
    const [node, a, b] = range
    const n = doc.node(node)
    if (!n || n.kind.type !== 'text') return false
    const t = textOf(n.kind)
    const from = a === b ? 0 : a
    const to = a === b ? t.characters.length : b
    for (let i = from; i < to; i++) if (!pred(TextData.styleAt(t, i))) return false
    return true
  }
  return targets(s, p).every((i) => {
    const n = doc.node(i)
    if (!n || n.kind.type !== 'text') return false
    return TextData.spans(textOf(n.kind)).every(([, , st]) => pred(st))
  })
}

function toggleBold(s: Session, p: Record<string, unknown>): Record<string, unknown> {
  const bold = allHave(s, p, (st) => TextStyle.style_weight(st.font_style) >= 700)
  return style(s, p, (st) => {
    setFontStyle(st, TextStyle.styled_name(bold ? 'Regular' : 'Bold', TextStyle.style_italic(st.font_style)))
  })
}

function toggleItalic(s: Session, p: Record<string, unknown>): Record<string, unknown> {
  const italic = allHave(s, p, (st) => TextStyle.style_italic(st.font_style))
  return style(s, p, (st) => {
    setFontStyle(
      st,
      TextStyle.styled_name(TextStyle.weight_name(TextStyle.style_weight(st.font_style)), !italic)
    )
  })
}

function stepWeight(s: Session, p: Record<string, unknown>, up: boolean): Record<string, unknown> {
  return style(s, p, (st) => {
    const w = Math.min(900, Math.max(100, TextStyle.style_weight(st.font_style) + (up ? 100 : -100)))
    setFontStyle(st, TextStyle.styled_name(TextStyle.weight_name(w), TextStyle.style_italic(st.font_style)))
  })
}

/**
 * Put a text layer on a path: it takes the path layer's transform and size, and
 * the path layer is removed.
 */
function onPath(s: Session, p: Record<string, unknown>): Record<string, unknown> {
  const idCmd = 'text.onPath'
  const doc = s.doc()
  const isText = (i: NodeId): boolean => doc.node(i)?.kind.type === 'text'
  const sel = targets(s, p)
  const text = id(p, 'text') ?? sel.find(isText)
  if (text === undefined) throw bad(idCmd, 'select a text layer and a path (or pass `text`)')
  const path = id(p, 'path') ?? sel.find((i) => i !== text && !isText(i))
  if (path === undefined) throw bad(idCmd, 'select a path or shape too (or pass `path`)')
  const pn = doc.node(path)
  if (pn === null) throw bad(idCmd, 'that layer has no path')
  const geom = stroke_geometry(pn)
  if (geom === null || geom.elements.length === 0) throw bad(idCmd, 'that layer has no path')
  if (!isText(text) || doc.is_ancestor(path, text)) {
    throw bad(idCmd, '`text` must be a text layer outside the path layer')
  }
  const parent = pn.parent
  if (parent === null || parent === undefined) throw bad(idCmd, 'pages have no path')
  const index = doc.index_in_parent(path)
  const transform = pn.transform
  const w = pn.width
  const h = pn.height
  const tp: TextPath = {
    d: geom.to_svg(),
    start: Math.min(1, Math.max(0, finite(num(p, 'start') ?? 0))),
    flip: boolean(p, 'flip') ?? false
  }
  doc.reparent(text, parent, index)
  doc.remove(path)
  const n = doc.get_mut(text)
  n.transform = transform
  n.width = w
  n.height = h
  editText(doc, text, (t) => {
    t.path = tp
  })
  s.ds().selection = [text]
  return { id: text }
}

const alignment = (h: 'left' | 'center' | 'right' | 'justify') => (s: Session, p: Record<string, unknown>) =>
  para(s, p, (t) => {
    t.align_h = h
  })

const textCase = (c: 'original' | 'upper' | 'lower' | 'title' | 'smallCaps') => (s: Session, p: Record<string, unknown>) =>
  style(s, p, (st) => {
    st.text_case = c
  })

const decoration = (d: 'none' | 'underline' | 'strikethrough') => (s: Session, p: Record<string, unknown>) =>
  style(s, p, (st) => {
    st.decoration = d
  })

/** Every character style of a text, for the toggles that read the running style. */
function letterSpacingStep(s: Session, p: Record<string, unknown>, delta: number): Record<string, unknown> {
  return style(s, p, (st) => {
    const ls = st.letter_spacing
    const percent = ls.unit === 'percent' ? ls.value : (ls.value / Math.max(st.font_size, 1)) * 100
    st.letter_spacing = { unit: 'percent', value: percent + delta }
  })
}

/** The text commands: the Text menu plus `text.set` and `text.style`. */
export const TEXT_SPECS: CommandSpec[] = [
  spec(
    'text.onPath',
    'Text on path',
    '{text? (text layer), path? (vector or shape layer; default: the selected text and other layer), start? (0..1 along the path), flip?}  the text follows the path and the path layer is removed → {id}',
    true,
    onPath
  ),
  spec(
    'text.pathOptions',
    'Text path options',
    '{start? (0..1 along the path), flip?, ids?}  for text on a path',
    true,
    (s, p) => {
      const start = num(p, 'start')
      const startAt = start !== null && Number.isFinite(start) ? Math.min(1, Math.max(0, start)) : null
      const flip = boolean(p, 'flip')
      return para(s, p, (t) => {
        if (t.path === null) return
        if (startAt !== null) t.path.start = startAt
        if (flip !== null) t.path.flip = flip
      })
    }
  ),
  spec(
    'text.removeFromPath',
    'Remove text from path',
    '{ids?}  text on a path back to a line of auto-width text',
    true,
    (s, p) =>
      para(s, p, (t) => {
        if (t.path === null) return
        t.path = null
        t.auto_resize = 'widthAndHeight'
      })
  ),
  spec('text.bold', 'Bold', '{ids?}', true, toggleBold),
  spec('text.italic', 'Italic', '{ids?}', true, toggleItalic),
  spec('text.underline', 'Underline', '{ids?}', true, (s, p) => {
    const on = allHave(s, p, (st) => st.decoration === 'underline')
    return style(s, p, (st) => {
      st.decoration = on ? 'none' : 'underline'
    })
  }),
  spec('text.strikethrough', 'Strikethrough', '{ids?}', true, (s, p) => {
    const on = allHave(s, p, (st) => st.decoration === 'strikethrough')
    return style(s, p, (st) => {
      st.decoration = on ? 'none' : 'strikethrough'
    })
  }),
  spec('text.link', 'Create link', '{url, ids?}', true, (s, p) => {
    const url = reqString('text.link', p, 'url')
    return style(s, p, (st) => {
      st.link = url
    })
  }),
  spec('text.bulletList', 'Bulleted list', '{ids?}  while editing: the selected paragraphs', true, (s, p) =>
    setList(s, p, 'bullet', true)
  ),
  spec('text.numberList', 'Numbered list', '{ids?}  while editing: the selected paragraphs', true, (s, p) =>
    setList(s, p, 'numbered', true)
  ),
  spec('text.alignLeft', 'Align left', '{ids?}', true, alignment('left')),
  spec('text.alignCenter', 'Align center', '{ids?}', true, alignment('center')),
  spec('text.alignRight', 'Align right', '{ids?}', true, alignment('right')),
  spec('text.alignJustify', 'Justify', '{ids?}', true, alignment('justify')),
  spec('text.sizeUp', 'Increase font size', '{ids?}', true, (s, p) =>
    style(s, p, (st) => {
      st.font_size = Math.min(5000, st.font_size + 1)
    })
  ),
  spec('text.sizeDown', 'Decrease font size', '{ids?}', true, (s, p) =>
    style(s, p, (st) => {
      st.font_size = Math.max(1, st.font_size - 1)
    })
  ),
  spec('text.weightUp', 'Increase font weight', '{ids?}', true, (s, p) => stepWeight(s, p, true)),
  spec('text.weightDown', 'Decrease font weight', '{ids?}', true, (s, p) => stepWeight(s, p, false)),
  spec('text.lineHeightUp', 'Increase line height', '{ids?}', true, (s, p) =>
    style(s, p, (st) => {
      st.line_height = {
        unit: 'pixels',
        value: Math.round(LineHeight.resolve(st.line_height, st.font_size, 1.21)) + 1
      }
    })
  ),
  spec('text.lineHeightDown', 'Decrease line height', '{ids?}', true, (s, p) =>
    style(s, p, (st) => {
      st.line_height = {
        unit: 'pixels',
        value: Math.max(0, Math.round(LineHeight.resolve(st.line_height, st.font_size, 1.21)) - 1)
      }
    })
  ),
  spec('text.trackingUp', 'Increase letter spacing', '{ids?}', true, (s, p) => letterSpacingStep(s, p, 1)),
  spec('text.trackingDown', 'Decrease letter spacing', '{ids?}', true, (s, p) =>
    letterSpacingStep(s, p, -1)
  ),
  spec('text.caseOriginal', 'Original case', '{ids?}', true, textCase('original')),
  spec('text.caseUpper', 'Uppercase', '{ids?}', true, textCase('upper')),
  spec('text.caseLower', 'Lowercase', '{ids?}', true, textCase('lower')),
  spec('text.caseTitle', 'Title case', '{ids?}', true, textCase('title')),
  spec('text.caseSmallCaps', 'Small caps', '{ids?}', true, textCase('smallCaps')),
  spec('text.case', 'Letter case', '{case: original|upper|lower|title|smallCaps, ids?}', true, (s, p) => {
    const raw = get(p, 'case')
    const c = typeof raw === 'string' ? enumOf(raw, TEXT_CASE) : null
    if (c === null) throw bad('text.case', '`case`: original|upper|lower|title|smallCaps')
    return textCase(c)(s, p)
  }),
  spec(
    'text.decoration',
    'Decoration',
    '{decoration: none|underline|strikethrough, ids?}',
    true,
    (s, p) => {
      const raw = get(p, 'decoration')
      const d = typeof raw === 'string' ? enumOf(raw, DECORATION) : null
      if (d === null) throw bad('text.decoration', '`decoration`: none|underline|strikethrough')
      return decoration(d)(s, p)
    }
  ),
  spec(
    'text.listStyle',
    'List style',
    '{style: none|bulleted|numbered, ids?}  while editing: the selected paragraphs',
    true,
    (s, p) => {
      const raw = get(p, 'style') ?? get(p, 'list')
      // FigCraft calls the bulleted list "bulleted"; Zenuxs stores "bullet".
      const text = typeof raw === 'string' ? (raw === 'bulleted' ? 'bullet' : raw) : null
      const l = text === null ? null : enumOf(text, LIST_STYLE)
      if (l === null) throw bad('text.listStyle', '`style`: none|bulleted|numbered')
      return setList(s, p, l, false)
    }
  ),
  spec('text.paragraphIndent', 'Paragraph indent', '{indent (px), ids?}', true, (s, p) => {
    const v = Math.min(10_000, Math.max(0, finite(reqNum('text.paragraphIndent', p, 'indent'))))
    return para(s, p, (t) => {
      t.paragraph_indent = v
    })
  }),
  spec('text.paragraphSpacing', 'Paragraph spacing', '{spacing (px), ids?}', true, (s, p) => {
    const v = Math.min(10_000, Math.max(0, finite(reqNum('text.paragraphSpacing', p, 'spacing'))))
    return para(s, p, (t) => {
      t.paragraph_spacing = v
    })
  }),
  spec('text.maxLines', 'Max lines', '{lines (0 = no limit; truncates), ids?}', true, (s, p) => {
    const v = Math.trunc(Math.min(10_000, Math.max(0, finite(reqNum('text.maxLines', p, 'lines')))))
    return para(s, p, (t) => {
      t.max_lines = v
      if (v > 0) t.auto_resize = 'truncate'
    })
  }),
  spec(
    'text.setFeatures',
    'OpenType features',
    '{features: {tag: bool | null (font default)}, replace? (clear others first), id?/ids?}',
    true,
    (s, p) => {
      const features = featuresOf('text.setFeatures', get(p, 'features') ?? null)
      const replace = boolean(p, 'replace') ?? false
      return para(s, p, (t) => {
        if (replace) t.features = {}
        for (const [k, on] of features) {
          if (on === null) delete t.features[k]
          else t.features[k] = on
        }
      })
    }
  ),
  spec(
    'text.setVariations',
    'Variable font axes',
    '{variations: {axis: number | null (style default)}, replace? (clear others first), id?/ids?}; while editing: the selected range',
    true,
    (s, p) => {
      const vars = variationsOf('text.setVariations', get(p, 'variations') ?? false)
      const replace = boolean(p, 'replace') ?? false
      return style(s, p, (st) => {
        if (replace) st.variation_axes = {}
        for (const [k, v] of vars) {
          if (v === null) delete st.variation_axes[k]
          else st.variation_axes[k] = v
        }
      })
    }
  ),
  spec('text.set', 'Set text', '{id?, characters}', true, (s, p) => {
    const characters = string(p, 'characters') ?? string(p, 'text')
    if (characters === null) throw bad('text.set', '`characters` required')
    const chars = normalizeLineEndings(characters)
    const ids = reqTargets('text.set', s, p)
    const doc = s.doc()
    const bound = boundBefore(doc, ids)
    for (const i of ids) {
      const n = doc.get_mut(i)
      if (n.kind.type !== 'text') throw bad('text.set', `${i} is not text`)
      const t = textOf(n.kind)
      TextData.replaceRange(t, 0, t.characters.length, chars)
      setTextOf(n.kind, t)
      n.overrides.add('characters')
    }
    detachEdited(doc, bound)
    return ok()
  }),
  spec(
    'text.style',
    'Style text range',
    '{id?, start?, end?, fontFamily?, fontStyle?, fontWeight?, fontSize?, lineHeight?, letterSpacing?, textDecoration?, textCase?, hyperlink?, textFills?}',
    true,
    (s, p) => {
      const ids = reqTargets('text.style', s, p)
      const doc = s.doc()
      const bound = boundBefore(doc, ids)
      for (const i of ids) {
        const n = doc.get_mut(i)
        if (n.kind.type !== 'text') throw bad('text.style', `${i} is not text`)
        const t = textOf(n.kind)
        const len = t.characters.length
        const start = num(p, 'start')
        const end = num(p, 'end')
        const a = Math.min(len, start === null ? 0 : Math.max(0, Math.trunc(start)))
        const b = Math.min(len, end === null ? len : Math.max(0, Math.trunc(end)))
        for (const [k, v] of Object.entries(p)) {
          if (k === 'id' || k === 'ids' || k === 'start' || k === 'end') continue
          applyTextStyle('text.style', t, a, b, k, v)
        }
        setTextOf(n.kind, t)
      }
      detachEdited(doc, bound)
      return ok()
    }
  ),
  spec('text.edit.begin', 'Edit text', '{id, caret? (char index; default select all)}', false, (s, p) => {
    const nodeId = reqId('text.edit.begin', p, 'id')
    const caret = num(p, 'caret')
    textedit.begin(s, nodeId, caret === null ? null : Math.max(0, Math.trunc(caret)), false)
    return ok()
  }),
  spec('text.edit.insert', 'Type text', '{text}', true, (s, p) => {
    textedit.insert(s, string(p, 'text') ?? '')
    return ok()
  }),
  spec(
    'text.edit.key',
    'Text key',
    '{key: Backspace|Delete|Left|Right|Up|Down|Home|End|Enter|Tab|Escape|SelectAll, shift?, alt?, cmd?}  in a list, Tab nests the item and Shift+Tab, Enter on an empty item or Backspace at its start move it out',
    true,
    (s, p) => {
      const keyName = reqString('text.edit.key', p, 'key')
      textedit.key(
        s,
        keyName,
        boolean(p, 'shift') ?? false,
        boolean(p, 'alt') ?? false,
        boolean(p, 'cmd') ?? false
      )
      return ok()
    }
  ),
  spec('text.listIndent', 'Indent list', '{}  while editing: the selected list items a level deeper', true, (s) =>
    ok({ changed: textedit.listIndent(s, false) })
  ),
  spec('text.listOutdent', 'Outdent list', '{}  while editing: the selected list items a level out', true, (s) =>
    ok({ changed: textedit.listIndent(s, true) })
  ),
  spec('text.edit.caret', 'Set caret', '{index, extend?}', false, (s, p) => {
    const i = Math.max(0, Math.trunc(reqNum('text.edit.caret', p, 'index')))
    textedit.setCaret(s, i, boolean(p, 'extend') ?? false)
    return ok()
  }),
  spec('text.edit.selectWord', 'Select word', '{index}', false, (s, p) => {
    const i = Math.max(0, Math.trunc(finite(reqNum('text.edit.selectWord', p, 'index'))))
    textedit.selectWord(s, i)
    return ok()
  }),
  spec('text.edit.selectLine', 'Select line', '{index}', false, (s, p) => {
    const i = Math.max(0, Math.trunc(finite(reqNum('text.edit.selectLine', p, 'index'))))
    textedit.selectLine(s, i)
    return ok()
  }),
  spec(
    'text.edit.preedit',
    'Compose text (IME)',
    '{text (empty = cancel), cursor? (chars into text)}; shown at the caret, committed by text.edit.insert',
    false,
    (s, p) => {
      const cursor = num(p, 'cursor')
      textedit.preedit(s, string(p, 'text') ?? '', cursor === null ? null : Math.max(0, Math.trunc(cursor)))
      return ok()
    }
  ),
  spec('text.edit.selection', 'Text selection', '{}', false, (s) => {
    const te = s.ds().text_edit
    if (!te) return ok({ selection: null })
    return ok({
      selection: {
        id: te.node,
        caret: te.caret,
        anchor: te.anchor,
        text: textedit.selectedText(s),
        preedit: te.preedit === '' ? null : { text: te.preedit, cursor: te.preedit_cursor }
      }
    })
  }),
  spec('text.edit.end', 'Stop editing text', '{}', false, (s) => {
    textedit.end(s)
    return ok()
  })
]
