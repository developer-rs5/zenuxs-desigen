/**
 * CLI tests (ported from the core cases of FigCraft `apps/figcraft-cli/`).
 */

import { describe, expect, test } from 'bun:test'

import { Session } from '@zenuxs/engine'
import { cli } from './index'

describe('zenuxs cli', () => {
  test('commands_lists_the_registry', () => {
    const r = cli(['commands'])
    expect(r.ok).toBe(true)
    expect(r.output).toContain('shape.rectangle')
  })

  test('run_executes_a_command', () => {
    const s = new Session()
    const r = cli(['run', 'shape.rectangle', '{"width": 42}'], s)
    expect(r.ok).toBe(true)
    expect(r.output).toContain('"ok": true')
  })

  test('info_describes_the_document', () => {
    const s = new Session()
    s.execute('shape.rectangle', {})
    const r = cli(['info'], s)
    expect(r.output).toContain('"nodes": 2')
  })

  test('unknown_command_fails_cleanly', () => {
    const r = cli(['nope'])
    expect(r.ok).toBe(false)
    expect(r.output).toContain('unknown command')
  })
})
