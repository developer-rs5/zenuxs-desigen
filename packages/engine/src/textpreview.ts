/**
 * Live text previews: what a text command would do, shown on the canvas without
 * an undo step — while the pointer is over a font family or style, a text style
 * in the style browser or a font's named instance, or while a variable font
 * axis slider is dragged. The document under the preview is kept and comes back
 * when the preview ends (`text.endPreview`). Every other command ends it first,
 * so committing (running the command for real) applies to the document itself
 * as one undo step, and Escape just ends the preview.
 * (Converted 1:1 from FigCraft `crates/engine/src/textpreview.rs`.)
 */

import { bad, get, reqString } from './cmd/params'
import { EngineError, endTextPreview, ok, spec, type CommandSpec, type Session } from './lib'
import { normalize } from './normalize'

/** The commands that show or end a preview (they don't end the one showing). */
export const COMMANDS: readonly string[] = ['text.preview', 'text.endPreview']

/** What can be previewed: text styles, font styles and axis values. */
export const PREVIEWABLE: readonly string[] = [
  'style.apply',
  'library.applyStyle',
  'text.setVariations',
  'text.style'
]

/** Show `command params` as a live preview, in place of an earlier one. */
export function show(s: Session, command: string, params: Record<string, unknown>): void {
  if (!PREVIEWABLE.includes(command)) {
    throw bad(
      'text.preview',
      `\`${command}\` can't be previewed (one of: ${PREVIEWABLE.join(', ')})`
    )
  }
  const target = s.find_command(command)
  if (!target) throw new EngineError(`unknown command \`${command}\``)
  // In place of an earlier preview.
  end(s)
  const ds = s.ds()
  const base = ds.doc.clone()
  const selection = [...ds.selection]
  const textEdit = ds.text_edit
  let failure: unknown = null
  try {
    target.run(s, params)
  } catch (error) {
    failure = error
  }
  // A preview changes what's shown, never the selection or the text being edited.
  ds.selection = selection
  ds.text_edit = textEdit
  if (failure !== null) {
    ds.doc = base
    throw failure
  }
  if (ds.doc !== base) {
    normalize(ds.doc, base)
    ds.text_preview = base
    ds.bump()
  }
}

/** End the live preview, if any: the document is back as it was. Whether one was showing. */
export function end(s: Session): boolean {
  return endTextPreview(s)
}

/** Whether a live text preview is showing. */
export function active(s: Session): boolean {
  return s.ds().text_preview !== null
}

/** `text.preview` and `text.endPreview`. */
export const PREVIEW_SPECS: CommandSpec[] = [
  spec(
    'text.preview',
    'Preview text change',
    '{command: style.apply|library.applyStyle|text.setVariations|text.style, params}  shows what the command would do on the canvas without an undo step (a hovered font family or style, text style or named instance, a dragged axis slider), in place of an earlier preview; text.endPreview or any other command ends it, so running the command for real commits it as one undo step',
    false,
    (s, p) => {
      const command = reqString('text.preview', p, 'command')
      show(s, command, paramsOf(p))
      return ok({ previewing: active(s) })
    }
  ),
  spec(
    'text.endPreview',
    'End text preview',
    '{}  puts the document back as it was before text.preview → {ended}',
    false,
    (s) => ok({ ended: end(s) })
  )
]

function paramsOf(p: Record<string, unknown>): Record<string, unknown> {
  const v = get(p, 'params')
  if (typeof v !== 'object' || v === null || Array.isArray(v)) return {}
  return v as Record<string, unknown>
}
