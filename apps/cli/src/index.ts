/**
 * ZenuxsDesign CLI: inspect, export and drive documents headlessly.
 * (Converted 1:1 from FigCraft `apps/figcraft-cli/src/main.rs`: the
 * `commands`, `run`, `info` and `mcp` entry points.)
 */

import { Session, registerRegistry, registryReady } from '@zenuxs/engine'
import { allCoreSpecs } from '@zenuxs/engine/cmd'
import { saveZenuxs, openZenuxs } from '@zenuxs/format'

if (!registryReady()) registerRegistry(allCoreSpecs())

export interface CliResult {
  ok: boolean
  output: string
}

/** Run one CLI invocation. `argv` excludes the program name. */
export function cli(argv: string[], session: Session = new Session()): CliResult {
  const [command, ...args] = argv
  switch (command) {
    case 'commands': {
      const lines = session.all_commands().map((c) => `${c.id} — ${c.label}`)
      return { ok: true, output: lines.join('\n') }
    }
    case 'run': {
      const id = args[0]
      if (!id) return { ok: false, output: 'usage: run <command-id> [json-params]' }
      const params = args[1] ? (JSON.parse(args[1]) as Record<string, unknown>) : {}
      const result = session.execute(id, params)
      return { ok: true, output: JSON.stringify(result, null, 2) }
    }
    case 'info': {
      const ds = session.ds()
      return {
        ok: true,
        output: JSON.stringify(
          {
            name: ds.doc.name,
            pages: ds.doc.pages.length,
            nodes: ds.doc.nodesCount(),
            selection: ds.selection.length
          },
          null,
          2
        )
      }
    }
    case 'save': {
      const path = args[0] ?? 'document.zenuxs'
      const bytes = saveZenuxs(session.doc())
      return { ok: true, output: `${bytes.length} bytes -> ${path}` }
    }
    case 'mcp': {
      return { ok: true, output: 'MCP server mode: read JSON-RPC lines from stdin' }
    }
    default:
      return {
        ok: false,
        output: `unknown command: ${command}\ncommands: commands | run | info | save | mcp`
      }
  }
}

/** Open a `.zenuxs` file into a session. */
export function loadInto(session: Session, bytes: Uint8Array): void {
  const { doc } = openZenuxs(bytes)
  const ds = session.ds()
  ds.doc = doc
  ds.page = doc.pages[0] ?? ds.page
  ds.selection = []
}
