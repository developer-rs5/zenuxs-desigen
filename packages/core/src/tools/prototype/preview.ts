import { activeFlow, readNodeInteractions, readPrototypeDocument } from '@open-pencil/scene-graph'

import type { FigmaAPI } from '#core/figma-api'
import { defineTool } from '#core/tools/schema'

import { walkSubtree } from './helpers'

interface PreviewScan {
  screens: Array<{ id: string; name: string; interactions: number }>
  triggers: Record<string, number>
  interactions: number
}

/** Walk the report subtree collecting screens, interactions, and trigger counts. */
function scanPreviewSubtree(figma: FigmaAPI, rootId: string): PreviewScan {
  const scan: PreviewScan = { screens: [], triggers: {}, interactions: 0 }
  walkSubtree(figma, rootId, (id) => {
    const node = figma.graph.getNode(id)
    if (!node) return
    const authored = readNodeInteractions(node)
    if (authored.length === 0) return
    scan.interactions += authored.length
    for (const entry of authored) {
      scan.triggers[entry.trigger] = (scan.triggers[entry.trigger] ?? 0) + 1
    }
    if (node.type === 'FRAME' || node.type === 'COMPONENT') {
      scan.screens.push({ id: node.id, name: node.name, interactions: authored.length })
    }
  })
  return scan
}

function hasPreviewFrame(figma: FigmaAPI, rootId: string): boolean {
  const root = figma.graph.getNode(rootId)
  return (root?.childIds ?? []).some((id) => {
    const child = figma.graph.getNode(id)
    return child?.type === 'FRAME' || child?.type === 'COMPONENT'
  })
}

/** Blockers that would stop a preview run, in report order. */
function previewWarnings(args: {
  doc: ReturnType<typeof readPrototypeDocument> | null
  flowStartExists: boolean
  interactions: number
  hasFrame: boolean
  scopedToSubtree: boolean
}): string[] {
  const warnings: string[] = []
  if (!args.doc || args.doc.flows.length === 0) {
    warnings.push('No flow authored: preview starts from the first frame on the page')
  } else {
    const flow = activeFlow(args.doc)
    if (flow && !args.flowStartExists) {
      warnings.push(`Flow "${flow.name}" start "${flow.startNodeId}" does not exist`)
    }
  }
  if (args.interactions === 0) warnings.push('No interactions authored: preview will not respond')
  if (!args.hasFrame && !args.scopedToSubtree) {
    warnings.push('No screen frame on this page: nothing to preview')
  }
  return warnings
}

/**
 * Read-only preview plan (spec §16 `previewPrototype`, §17 "inspect what it
 * actually created"): reports the entry flow, executable screens, authored
 * interactions, and why a preview would not run — derived from the document,
 * never faked.
 */
export const previewPrototype = defineTool({
  name: 'preview_prototype',
  mutates: false,
  description:
    'Inspect the executable prototype plan without running it: active flow and entry screen, screens with interactions, trigger counts, and blockers that would stop preview.',
  params: {
    node_id: {
      type: 'string',
      description: 'Report on this subtree instead of the current page'
    }
  },
  execute: (figma, { node_id }) => {
    const rootId = node_id ?? figma.currentPageId
    if (!figma.graph.getNode(rootId)) return { error: `Node "${rootId}" not found` }

    const rootNode = figma.graph.getNode(figma.graph.rootId)
    const doc = rootNode ? readPrototypeDocument(rootNode) : null
    const flow = activeFlow(doc)
    const flowStartExists = Boolean(flow && figma.graph.getNode(flow.startNodeId))

    const scan = scanPreviewSubtree(figma, rootId)
    const hasFrame = hasPreviewFrame(figma, rootId)
    const warnings = previewWarnings({
      doc,
      flowStartExists,
      interactions: scan.interactions,
      hasFrame,
      scopedToSubtree: Boolean(node_id)
    })

    const entryId = flowStartExists ? flow?.startNodeId : null
    const entry = entryId ? figma.graph.getNode(entryId) : null
    return {
      executable: Boolean(entry) || hasFrame,
      active_flow_id: flow?.id ?? null,
      flow_start_id: entryId,
      flow_start_name: entry?.name ?? null,
      flow_start_exists: flowStartExists,
      flows: (doc?.flows ?? []).map((item) => ({
        id: item.id,
        name: item.name,
        start_node_id: item.startNodeId,
        active: item.id === flow?.id
      })),
      screens: scan.screens,
      interactions: scan.interactions,
      triggers: scan.triggers,
      warnings
    }
  }
})
