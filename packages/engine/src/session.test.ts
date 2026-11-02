/**
 * Engine session layer: selection hygiene, batching and clipboard state.
 * (Ported from FigCraft `crates/engine/src/lib.rs` session cases.)
 */

import { describe, expect, test } from 'bun:test'

import type { NodeId } from '@zenuxs/doc'

import { Clipboard, Duplicated, Session, resolveStepRefs } from './lib'

function ex(s: Session, cmd: string, p: Record<string, unknown> = {}): Record<string, unknown> {
  return s.execute(cmd, p)
}

function rect(s: Session, x: number, y: number, parent?: NodeId): NodeId {
  const p: Record<string, unknown> = { x, y, width: 40, height: 40 }
  if (parent !== undefined) p.parent = parent
  return ex(s, 'shape.rectangle', p).id as NodeId
}

describe('engine session — selection and ids', () => {
  test('document_ids_are_stable_across_commands', () => {
    const s = new Session()
    const before = s.ds().uid
    rect(s, 0, 0)
    rect(s, 50, 0)
    ex(s, 'select.all')
    expect(s.ds().uid).toBe(before)
  })

  test('two_documents_get_different_ids', () => {
    const a = new Session()
    const b = new Session()
    expect(a.ds().uid).not.toBe(b.ds().uid)
  })

  test('set_selection_drops_duplicates_and_foreign_ids', () => {
    const s = new Session()
    const r = rect(s, 0, 0)
    s.set_selection([r, r, 9999])
    expect(s.selection()).toEqual([r])
  })

  test('set_selection_bumps_the_revision', () => {
    const s = new Session()
    const r = rect(s, 0, 0)
    const before = s.ds().revision
    s.set_selection([r])
    expect(s.ds().revision).toBeGreaterThan(before)
  })

  test('execute_cleans_the_selection_after_a_delete', () => {
    const s = new Session()
    const r = rect(s, 0, 0)
    s.set_selection([r])
    // Deleting through the document model leaves the selection stale.
    s.doc().delete(r)
    ex(s, 'select.all')
    expect(s.selection()).toEqual([])
  })

  test('page_returns_the_active_page', () => {
    const s = new Session()
    expect(s.page()).toBe(s.doc().pages[0])
  })
})

describe('engine session — last command', () => {
  test('history_commands_are_remembered', () => {
    const s = new Session()
    ex(s, 'shape.rectangle', { x: 0, y: 0, width: 10, height: 10 })
    expect(s.last_command?.id).toBe('shape.rectangle')
  })

  test('non_history_commands_are_not_remembered', () => {
    const s = new Session()
    ex(s, 'shape.rectangle', { x: 0, y: 0, width: 10, height: 10 })
    ex(s, 'select.all')
    expect(s.last_command?.id).toBe('shape.rectangle')
  })
})

describe('engine session — clipboard state', () => {
  test('a_new_session_has_an_empty_clipboard', () => {
    const s = new Session()
    expect(s.clipboard.nodes).toEqual([])
    expect(s.clipboard.bounds).toBeNull()
    expect(s.clipboard.props).toBeNull()
    expect(s.clipboard.source).toBeNull()
    expect(s.clipboard.source_path).toBeNull()
    expect(s.clipboard.copied_components.size).toBe(0)
    expect(s.clipboard.images.size).toBe(0)
  })

  test('clipboard_empty_is_a_fresh_value', () => {
    const a = Clipboard.empty()
    a.images.set('x', { bytes: new Uint8Array(), width: 1, height: 1 })
    a.copied_components.add(1)
    const b = Clipboard.empty()
    expect(b.images.size).toBe(0)
    expect(b.copied_components.size).toBe(0)
  })
})

describe('engine session — duplication bookkeeping', () => {
  test('is_selection_compares_as_sets', () => {
    const d: Duplicated = { sources: [1, 2], copies: [3, 4] }
    expect(Duplicated.is_selection(d, [4, 3])).toBe(true)
    expect(Duplicated.is_selection(d, [3])).toBe(false)
    expect(Duplicated.is_selection(d, [3, 4, 5])).toBe(false)
    expect(Duplicated.is_selection({ sources: [], copies: [] }, [])).toBe(false)
  })

  test('offset_measures_the_page_distance_between_sources_and_copies', () => {
    const s = new Session()
    const a = rect(s, 0, 0)
    const b = rect(s, 100, 50)
    const d: Duplicated = { sources: [a], copies: [b] }
    expect(Duplicated.offset(d, s.doc())).toEqual([100, 50])
  })

  test('offset_is_null_when_nothing_moved', () => {
    const s = new Session()
    const a = rect(s, 0, 0)
    const d: Duplicated = { sources: [a], copies: [a] }
    expect(Duplicated.offset(d, s.doc())).toBeNull()
  })

  test('offset_is_null_for_a_missing_layer', () => {
    const s = new Session()
    const a = rect(s, 0, 0)
    const d: Duplicated = { sources: [a], copies: [9999] }
    expect(Duplicated.offset(d, s.doc())).toBeNull()
  })
})

describe('engine session — batch', () => {
  test('batch_runs_every_step_and_records_one_undo_step', () => {
    const s = new Session()
    const depth = s.ds().history.undo.length
    const results = s.batch('Make two', [
      { id: 'shape.rectangle', params: { x: 0, y: 0, width: 10, height: 10 } },
      { id: 'shape.rectangle', params: { x: 20, y: 0, width: 10, height: 10 } }
    ])
    expect(results).toHaveLength(2)
    expect(s.ds().history.undo.length).toBe(depth + 1)
    expect(s.ds().history.undo.at(-1)?.label).toBe('Make two')
  })

  test('step_refs_target_what_an_earlier_step_made', () => {
    const s = new Session()
    s.batch('Rename', [
      { id: 'shape.rectangle', params: { x: 0, y: 0, width: 10, height: 10 } },
      { id: 'object.rename', params: { ids: [{ $step: 0 }], name: 'Made' } }
    ])
    const ids = s.doc().pages.length > 0 ? s.ds().selection : []
    const first = ids[0]
    expect(first).toBeDefined()
    expect(s.doc().node(first as NodeId)?.name).toBe('Made')
  })

  test('step_refs_pick_a_named_field', () => {
    const s = new Session()
    const out = ex(s, 'shape.rectangle', { x: 0, y: 0, width: 10, height: 10 })
    const resolved = resolveStepRefs({ x: { $step: 0, field: 'id' } }, [out], 1, 0)
    expect(resolved).toEqual({ x: out.id })
  })

  test('a_failed_step_restores_the_group_start', () => {
    const s = new Session()
    const before = s.doc().pages.length
    expect(() =>
      s.batch('Broken', [
        { id: 'shape.rectangle', params: { x: 0, y: 0, width: 10, height: 10 } },
        { id: 'no.such.command', params: {} }
      ])
    ).toThrow()
    expect(s.doc().pages.length).toBe(before)
    expect(s.doc().top_frames(s.page())).toEqual([])
  })

  test('step_refs_reject_a_later_step', () => {
    const s = new Session()
    expect(() => s.batch('Bad', [{ id: 'select.set', params: { ids: [{ $step: 1 }] } }])).toThrow(
      /earlier step/
    )
  })

  test('step_refs_reject_extra_keys', () => {
    expect(() => resolveStepRefs({ a: { $step: 0, nope: 1 } }, [{}], 1, 0)).toThrow(/takes only/)
  })

  test('step_refs_reject_a_non_index', () => {
    expect(() => resolveStepRefs({ a: { $step: 'x' } }, [{}], 1, 0)).toThrow(/step index/)
  })

  test('step_refs_reject_a_missing_field', () => {
    expect(() => resolveStepRefs({ a: { $step: 0, field: 'nope' } }, [{}], 1, 0)).toThrow(/has no/)
  })
})
