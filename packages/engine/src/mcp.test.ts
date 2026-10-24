/**
 * MCP tests (ported from the core cases of FigCraft `crates/mcp/src/`).
 */

import { describe, expect, test } from 'bun:test'

import { Session } from './lib'
import { TOOL_NAMES, callTool, handleLine, PROTOCOL_VERSION } from './mcp'

describe('mcp server', () => {
  test('18_tools_advertised', () => {
    expect(TOOL_NAMES.length).toBe(18)
  })

  test('run_command_creates_shapes', () => {
    const s = new Session()
    const r = callTool(s, 'run_command', { command: 'shape.rectangle', params: { width: 50, height: 30 } })
    expect(r.isError).toBe(false)
    expect(r.content[0].text).toContain('"ok": true')
  })

  test('inspect_document_lists_children', () => {
    const s = new Session()
    s.execute('shape.rectangle', { name: 'Hero' })
    const r = callTool(s, 'inspect_document', {})
    expect(r.content[0].text).toContain('Hero')
  })

  test('unknown_tool_is_an_error', () => {
    const s = new Session()
    const r = callTool(s, 'nope', {})
    expect(r.isError).toBe(true)
  })

  test('jsonrpc_initialize_and_tools_list', () => {
    const s = new Session()
    const init = JSON.parse(handleLine(s, JSON.stringify({ id: 1, method: 'initialize', params: {} }))!)
    expect(init.result.protocolVersion).toBe(PROTOCOL_VERSION)
    const tools = JSON.parse(handleLine(s, JSON.stringify({ id: 2, method: 'tools/list', params: {} }))!)
    expect(tools.result.tools.length).toBe(18)
  })

  test('jsonrpc_tools_call_roundtrip', () => {
    const s = new Session()
    const reply = JSON.parse(
      handleLine(s, JSON.stringify({ id: 3, method: 'tools/call', params: { name: 'run_command', arguments: { command: 'shape.ellipse' } } }))!
    )
    expect(reply.id).toBe(3)
    expect(reply.result.isError).toBe(false)
  })
})
