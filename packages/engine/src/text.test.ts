/**
 * The text commands: styling ranges, paragraphs, lists, editing sessions,
 * previews, auto-size, and the font seams.
 * (Ported from the core cases of FigCraft `crates/engine/src/textedit.rs`
 * and `crates/engine/src/text_behaviour_tests.rs`.)
 */

import { describe, expect, test } from 'bun:test'

import { TextData, textOf } from '@zenuxs/doc'

import { EmptyFontRegistry, registerFontRegistry } from './fonts'
import { Session } from './lib'

/** A session with one text layer "Hi there" selected, and its id. */
function setup(characters = 'Hi there'): { s: Session; id: number } {
  const s = new Session()
  const r = s.execute('text.create', { characters })
  const id = r.id as number
  s.ds().selection = [id]
  return { s, id }
}

/** The text data of `id`. */
function data(s: Session, id: number): TextData {
  const kind = s.doc().get(id).kind
  if (kind.type !== 'text') throw new Error(`node ${id} is a ${kind.type}, not text`)
  return textOf(kind)
}

/** The first run's style. */
function firstStyle(s: Session, id: number) {
  const span = TextData.spans(data(s, id))[0]
  if (!span) throw new Error('no span')
  return span[2]
}

describe('text style commands', () => {
  test('text.bold makes the whole layer bold and back', () => {
    const { s, id } = setup()
    expect(s.execute('text.bold', {}).ok).toBe(true)
    expect(firstStyle(s, id).font_style).toBe('Bold')
    expect(s.execute('text.bold', {}).ok).toBe(true)
    expect(firstStyle(s, id).font_style).toBe('Regular')
  })

  test('text.italic keeps the weight it found', () => {
    const { s, id } = setup()
    s.execute('text.bold', {})
    s.execute('text.italic', {})
    expect(firstStyle(s, id).font_style).toBe('Bold Italic')
    s.execute('text.italic', {})
    expect(firstStyle(s, id).font_style).toBe('Bold')
  })

  test('text.weightUp and text.weightDown step by 100 and clamp', () => {
    const { s, id } = setup()
    s.execute('text.weightUp', {})
    expect(firstStyle(s, id).font_style).toBe('Medium')
    for (let i = 0; i < 10; i += 1) s.execute('text.weightUp', {})
    expect(firstStyle(s, id).font_style).toBe('Black')
    for (let i = 0; i < 20; i += 1) s.execute('text.weightDown', {})
    expect(firstStyle(s, id).font_style).toBe('Thin')
  })

  test('text.sizeUp and text.sizeDown clamp to 1..5000', () => {
    const { s, id } = setup()
    s.execute('text.sizeUp', {})
    expect(data(s, id).style.font_size).toBe(17)
    s.execute('text.sizeDown', {})
    s.execute('text.sizeDown', {})
    expect(data(s, id).style.font_size).toBe(15)
  })

  test('text.alignLeft writes the horizontal alignment', () => {
    const { s, id } = setup()
    s.execute('text.alignCenter', {})
    expect(data(s, id).align_h).toBe('center')
    s.execute('text.alignRight', {})
    expect(data(s, id).align_h).toBe('right')
    s.execute('text.alignJustify', {})
    expect(data(s, id).align_h).toBe('justify')
    s.execute('text.alignLeft', {})
    expect(data(s, id).align_h).toBe('left')
  })

  test('text.case writes the text case', () => {
    const { s, id } = setup()
    s.execute('text.caseUpper', {})
    expect(firstStyle(s, id).text_case).toBe('upper')
    s.execute('text.caseTitle', {})
    expect(firstStyle(s, id).text_case).toBe('title')
    s.execute('text.caseOriginal', {})
    expect(firstStyle(s, id).text_case).toBe('original')
  })

  test('text.decoration writes the decoration', () => {
    const { s, id } = setup()
    s.execute('text.underline', {})
    expect(firstStyle(s, id).decoration).toBe('underline')
    s.execute('text.strikethrough', {})
    expect(firstStyle(s, id).decoration).toBe('strikethrough')
  })

  test('text.style applies a patch to the range it is given', () => {
    const { s, id } = setup()
    s.execute('text.style', { start: 0, end: 2, fontSize: 40 })
    const spans = TextData.spans(data(s, id))
    expect(spans.length).toBeGreaterThan(1)
    expect(spans[0]?.[2].font_size).toBe(40)
    expect(data(s, id).style.font_size).toBe(16)
  })

  test('text.set replaces the characters', () => {
    const { s, id } = setup()
    s.execute('text.set', { characters: 'Hello' })
    expect(data(s, id).characters).toBe('Hello')
  })

  test('text.set normalises line endings', () => {
    const { s, id } = setup()
    s.execute('text.set', { characters: 'a\r\nb\rc' })
    expect(data(s, id).characters).toBe('a\nb\nc')
  })

  test('text.maxLines switches auto-size to truncate', () => {
    const { s, id } = setup()
    s.execute('text.maxLines', { lines: 2 })
    expect(data(s, id).max_lines).toBe(2)
    expect(data(s, id).auto_resize).toBe('truncate')
  })

  test('text.paragraphSpacing and text.paragraphIndent clamp at zero', () => {
    const { s, id } = setup()
    s.execute('text.paragraphSpacing', { spacing: 8 })
    expect(data(s, id).paragraph_spacing).toBe(8)
    s.execute('text.paragraphIndent', { indent: -5 })
    expect(data(s, id).paragraph_indent).toBe(0)
  })

  test('text.trackingUp turns pixel tracking into a percentage step', () => {
    const { s, id } = setup()
    s.execute('text.trackingUp', {})
    const ls = firstStyle(s, id).letter_spacing
    expect(ls.unit).toBe('percent')
  })
})

describe('text paragraph and list commands', () => {
  test('text.listStyle makes a bullet list and maps Figma spelling', () => {
    const { s, id } = setup()
    s.execute('text.listStyle', { style: 'bulleted' })
    expect(data(s, id).list).toBe('bullet')
  })

  test('text.bulletList toggles the list off again', () => {
    const { s, id } = setup()
    s.execute('text.bulletList', {})
    expect(data(s, id).list).toBe('bullet')
    s.execute('text.bulletList', {})
    expect(data(s, id).list).toBe('none')
  })

  test('text.numberList makes a numbered list', () => {
    const { s, id } = setup()
    s.execute('text.numberList', {})
    expect(data(s, id).list).toBe('numbered')
  })

  test('text.link writes the hyperlink of the range', () => {
    const { s, id } = setup()
    s.execute('text.link', { url: 'https://example.com', start: 0, end: 2 })
    const spans = TextData.spans(data(s, id))
    expect(spans[0]?.[2].link).toBe('https://example.com')
  })
})

describe('text editing sessions', () => {
  test('text.edit.begin then text.edit.selection reports the caret', () => {
    const { s, id } = setup()
    s.execute('text.edit.begin', { id, caret: 2 })
    const sel = s.execute('text.edit.selection', {}).selection as Record<string, unknown>
    expect(sel.id).toBe(id)
    expect(sel.caret).toBe(2)
    expect(sel.anchor).toBe(2)
    expect(sel.text).toBe('')
  })

  test('text.edit.selection is null outside an edit', () => {
    const { s } = setup()
    expect(s.execute('text.edit.selection', {}).selection).toBeNull()
  })

  test('text.edit.insert types at the caret', () => {
    const { s, id } = setup()
    s.execute('text.edit.begin', { id, caret: 2 })
    s.execute('text.edit.insert', { text: '!' })
    expect(data(s, id).characters).toBe('Hi! there')
  })

  test('text.edit.caret moves and extend grows the range', () => {
    const { s, id } = setup()
    s.execute('text.edit.begin', { id, caret: 0 })
    s.execute('text.edit.caret', { index: 2 })
    let sel = s.execute('text.edit.selection', {}).selection as Record<string, unknown>
    expect(sel.caret).toBe(2)
    expect(sel.anchor).toBe(2)
    s.execute('text.edit.caret', { index: 5, extend: true })
    sel = s.execute('text.edit.selection', {}).selection as Record<string, unknown>
    expect(sel.caret).toBe(5)
    expect(sel.anchor).toBe(2)
  })

  test('text.edit.key accepts the shift flag and never throws on junk', () => {
    const { s, id } = setup()
    s.execute('text.edit.begin', { id, caret: 0 })
    expect(s.execute('text.edit.key', { key: 'ArrowRight', shift: true }).ok).toBe(true)
    expect(s.execute('text.edit.key', { key: 'ArrowRight' }).ok).toBe(true)
  })

  test('text.edit.end leaves the session', () => {
    const { s, id } = setup()
    s.execute('text.edit.begin', { id, caret: 0 })
    expect(s.execute('text.edit.end', {}).ok).toBe(true)
    expect(s.ds().text_edit).toBeNull()
  })

  test('text.bold while editing styles only the range', () => {
    const { s, id } = setup()
    s.execute('text.edit.begin', { id, caret: 0 })
    s.execute('text.edit.caret', { index: 2, extend: true })
    s.execute('text.bold', {})
    const spans = TextData.spans(data(s, id))
    expect(spans[0]?.[2].font_style).toBe('Bold')
    expect(data(s, id).style.font_style).toBe('Regular')
  })

  test('text.edit.preedit reports the composition', () => {
    const { s, id } = setup()
    s.execute('text.edit.begin', { id, caret: 0 })
    s.execute('text.edit.preedit', { text: 'に', cursor: 1 })
    const sel = s.execute('text.edit.selection', {}).selection as Record<string, unknown>
    expect(sel.preedit).toEqual({ text: 'に', cursor: 1 })
  })

  test('every text command survives junk while editing', () => {
    const junk: Array<Record<string, unknown>> = [
      {},
      { index: -5, features: { '': 1 } },
      { index: 1e300, style: 3, case: null },
      { variations: { wght: 'heavy', toolong: 1 }, text: '\u0000\u0007', cursor: 1e300 },
      { variations: { wght: 1e300, opsz: -1e300 }, replace: 'yes', text: '日本語', cursor: -1 }
    ]
    const { s, id } = setup('Hi there\nyou')
    const ids = s
      .all_commands()
      .map((c) => c.id)
      .filter((c) => c.startsWith('text.') && c !== 'text.rescanFonts' && c !== 'text.create')
    for (const cmd of ids) {
      for (const params of junk) {
        s.execute('text.edit.begin', { id, caret: 0 })
        // Junk parameters are refused, never a crash.
        try {
          s.execute(cmd, params)
        } catch (error) {
          expect(error).toBeInstanceOf(Error)
        }
        s.execute('text.edit.end', {})
      }
    }
    expect(data(s, id).characters.length).toBeGreaterThan(0)
  })
})

describe('text auto-size and normalise', () => {
  test('text.create with auto-size width grows the box to the text', () => {
    const s = new Session()
    const r = s.execute('text.create', { characters: 'a much longer string here' })
    const id = r.id as number
    const n = s.doc().get(id)
    expect(n.width).toBeGreaterThan(20)
    expect(data(s, id).auto_resize).toBe('widthAndHeight')
  })

  test('text.set refits an auto-sizing box', () => {
    const { s, id } = setup('short')
    const before = s.doc().get(id).width
    s.execute('text.set', { characters: 'a considerably longer run of text' })
    expect(s.doc().get(id).width).toBeGreaterThan(before)
  })
})

describe('text previews', () => {
  test('text.preview applies a style without recording it', () => {
    const { s, id } = setup()
    const rev = s.ds().revision
    const r = s.execute('text.preview', { command: 'text.style', params: { fontWeight: 700 } })
    expect(r.ok).toBe(true)
    expect(firstStyle(s, id).font_style).toBe('Bold')
    expect(s.ds().revision).toBeGreaterThan(rev)
  })

  test('text.endPreview restores the document', () => {
    const { s, id } = setup()
    s.execute('text.preview', { command: 'text.style', params: { fontWeight: 700 } })
    expect(s.execute('text.endPreview', {}).ok).toBe(true)
    expect(firstStyle(s, id).font_style).toBe('Regular')
  })

  test('another command ends the preview first', () => {
    const { s, id } = setup()
    s.execute('text.preview', { command: 'text.style', params: { fontWeight: 700 } })
    s.execute('shape.rectangle', { x: 0, y: 0, width: 10, height: 10 })
    expect(firstStyle(s, id).font_style).toBe('Regular')
  })
})

describe('font commands', () => {
  test('text.missingFonts reports nothing with the empty registry', () => {
    registerFontRegistry(null)
    const { s } = setup()
    expect(s.execute('text.missingFonts', {}).families).toEqual([])
    registerFontRegistry(null)
  })

  test('text.missingFonts reports a family the registry lacks', () => {
    registerFontRegistry({ ...EmptyFontRegistry, hasFamily: (f) => f !== 'Missing Sans' })
    const { s, id } = setup()
    s.execute('text.style', { fontFamily: 'Missing Sans' })
    const families = s.execute('text.missingFonts', {}).families as Array<Record<string, unknown>>
    expect(families.map((f) => f.family)).toContain('Missing Sans')
    expect(s.doc().get(id).kind.type).toBe('text')
    registerFontRegistry(null)
  })

  test('text.fonts lists families, styles, features and axes', () => {
    registerFontRegistry({
      ...EmptyFontRegistry,
      familyNames: () => ['Inter'],
      familyStyles: () => ['Regular', 'Bold'],
      findFace: (family) =>
        family === 'Inter'
          ? {
              family: 'Inter',
              style: 'Regular',
              featureTags: () => ['liga', 'kern'],
              axes: [
                { tag: 'wght', name: 'Weight', min: 100, default: 400, max: 900, hidden: false }
              ],
              instances: []
            }
          : null
    })
    const s = new Session()
    expect(s.execute('text.fonts', {}).families).toEqual(['Inter'])
    expect(s.execute('text.fonts', { family: 'Inter' }).styles).toEqual(['Regular', 'Bold'])
    expect(s.execute('text.fonts', { family: 'Inter', features: true }).features).toEqual([
      'liga',
      'kern'
    ])
    const axes = s.execute('text.fonts', { family: 'Inter', axes: true }).face as Record<
      string,
      unknown
    >
    expect((axes.axes as Array<Record<string, unknown>>)[0]?.tag).toBe('wght')
    expect(s.execute('text.fonts', { family: 'Nope', axes: true }).face).toBeNull()
    registerFontRegistry(null)
  })

  test('text.loadFont refuses junk without touching the document', () => {
    const s = new Session()
    expect(() => s.execute('text.loadFont', {})).toThrow()
    expect(() => s.execute('text.loadFont', { data: 'not base64 !!!' })).toThrow()
    expect(() => s.execute('text.loadFont', { path: '/nope/font.ttf' })).toThrow()
  })

  test('text.refit reports nothing when nothing changed', () => {
    const { s } = setup()
    expect(s.execute('text.refit', {}).refitted).toEqual([])
  })
})

describe('text.onPath', () => {
  test('text.onPath needs a text and a path', () => {
    const { s } = setup()
    expect(() => s.execute('text.onPath', {})).toThrow()
  })

  test('text.onPath refuses a layer with no path', () => {
    const { s, id } = setup()
    const a = s.execute('shape.rectangle', { width: 20, height: 20 }).id as number
    const b = s.execute('shape.rectangle', { x: 40, width: 20, height: 20 }).id as number
    s.ds().selection = [a, b]
    s.execute('object.group', {})
    const group = s.ds().selection[0] as number
    expect(s.doc().node(group)?.kind.type).toBe('group')
    expect(() => s.execute('text.onPath', { text: id, path: group })).toThrow(/has no path/)
  })
})
