/**
 * ZenuxsDesign MCP server: exposes the engine over the Model Context
 * Protocol. Every tool reduces to a command, so headless and attached
 * sessions behave the same. (Converted 1:1 from FigCraft
 * `crates/mcp/src/tools.rs`; at wire-in this module is promoted to
 * `@zenuxs/mcp`, replacing the OpenPencil-era package.)
 */

import type { Session } from '../lib'

export const PROTOCOL_VERSION = '2025-06-18'
export const SUPPORTED_VERSIONS = ['2025-06-18', '2025-03-26', '2024-11-05']

export const TOOL_NAMES = [
  'list_commands',
  'run_command',
  'batch',
  'create_node',
  'set_properties',
  'inspect_document',
  'get_node',
  'select',
  'export',
  'screenshot',
  'open_file',
  'save_file',
  'undo',
  'redo',
  'pointer',
  'key',
  'type_text',
  'inspect_ui'
] as const

export type ToolName = (typeof TOOL_NAMES)[number]

export interface ToolResult {
  content: Array<{ type: 'text'; text: string }>
  isError: boolean
}

export const ToolResult = {
  text(t: string): ToolResult {
    return { content: [{ type: 'text', text: t }], isError: false }
  },
  json(v: unknown): ToolResult {
    return ToolResult.text(JSON.stringify(v, null, 2))
  },
  error(t: string): ToolResult {
    return { content: [{ type: 'text', text: t }], isError: true }
  }
}

/** Run an MCP tool against a session. */
export function callTool(session: Session, name: string, args: Record<string, unknown>): ToolResult {
  try {
    switch (name) {
      case 'list_commands':
        return ToolResult.json({
          commands: session.all_commands().map((c) => ({ id: c.id, label: c.label, params: c.params }))
        })
      case 'run_command': {
        const id = String(args.command ?? args.id ?? '')
        const params = (args.params ?? {}) as Record<string, unknown>
        return ToolResult.json(session.execute(id, params))
      }
      case 'batch': {
        const commands = Array.isArray(args.commands) ? (args.commands as Array<{ id: string; params?: Record<string, unknown> }>) : []
        const results = commands.map((c) => session.execute(c.id, c.params ?? {}))
        return ToolResult.json({ ok: true, results })
      }
      case 'create_node':
        return ToolResult.json(session.execute('shape.rectangle', args))
      case 'set_properties':
        return ToolResult.json(session.execute('node.set', args))
      case 'inspect_document':
        return ToolResult.json(inspectDocument(session))
      case 'get_node':
        return ToolResult.json(session.execute('node.get', args))
      case 'select':
        return ToolResult.json(session.execute('select.set', args))
      case 'export':
      case 'screenshot':
        return ToolResult.error(`${name} requires a renderer backend`)
      case 'open_file':
      case 'save_file':
        return ToolResult.error(`${name} requires a file backend`)
      case 'undo':
        return ToolResult.json({ ok: session.undo() })
      case 'redo':
        return ToolResult.json({ ok: session.redo() })
      case 'pointer':
      case 'key':
      case 'type_text':
        return ToolResult.error(`${name} requires an attached UI session`)
      case 'inspect_ui':
        return ToolResult.json({ ui: 'headless' })
      default:
        return ToolResult.error(`unknown tool: ${name}`)
    }
  } catch (error) {
    return ToolResult.error(error instanceof Error ? error.message : String(error))
  }
}

/** A JSON description of the active document (nodes tree, shallow). */
export function inspectDocument(session: Session): Record<string, unknown> {
  const ds = session.ds()
  return {
    name: ds.doc.name,
    page: ds.page,
    pages: ds.doc.pages.map((id) => ({ id, name: ds.doc.node(id)?.name ?? '' })),
    selection: ds.selection,
    nodeCount: ds.doc.nodesCount(),
    children: (ds.doc.node(ds.page)?.children ?? []).map((id) => {
      const n = ds.doc.node(id)
      return n ? { id: n.id, name: n.name, type: n.kind.type, width: n.width, height: n.height } : null
    })
  }
}

/** One JSON-RPC message handler (stdio loop in Rust; callable here). */
export function handleLine(session: Session, line: string): string | null {
  const trimmed = line.trim()
  if (trimmed.length === 0) return null
  let msg: { id?: unknown; method?: string; params?: Record<string, unknown> }
  try {
    msg = JSON.parse(trimmed)
  } catch {
    return JSON.stringify({ id: null, error: { code: -32700, message: 'parse error' } })
  }
  const id = msg.id ?? null
  const method = msg.method ?? ''
  const params = msg.params ?? {}
  try {
    let result: unknown
    if (method === 'initialize') {
      result = { protocolVersion: PROTOCOL_VERSION, capabilities: { tools: {} }, serverInfo: { name: 'zenuxs-design', version: '0.1.0' } }
    } else if (method === 'tools/list') {
      result = { tools: TOOL_NAMES.map((name) => ({ name, description: toolDescription(name), inputSchema: { type: 'object' } })) }
    } else if (method === 'tools/call') {
      const name = String((params as { name?: string }).name ?? '')
      const args = ((params as { arguments?: Record<string, unknown> }).arguments ?? {}) as Record<string, unknown>
      const called = callTool(session, name, args)
      result = { content: called.content, isError: called.isError }
    } else if (method === 'ping') {
      result = {}
    } else {
      return JSON.stringify({ id, error: { code: -32601, message: `method not found: ${method}` } })
    }
    return JSON.stringify({ id, result })
  } catch (error) {
    return JSON.stringify({ id, error: { code: -32000, message: error instanceof Error ? error.message : String(error) } })
  }
}

function toolDescription(name: string): string {
  switch (name) {
    case 'list_commands':
      return 'List every engine command with its id and parameters'
    case 'run_command':
      return 'Run one engine command'
    case 'batch':
      return 'Run several commands in one undo step'
    case 'inspect_document':
      return 'Describe the active document'
    default:
      return `ZenuxsDesign tool: ${name}`
  }
}
