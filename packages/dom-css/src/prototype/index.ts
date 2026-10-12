import type { SceneGraph } from '@open-pencil/scene-graph'

import { sceneGraphToDesignDocument } from '../from-scene-graph'
import {
  exportHTMLBundle,
  type ExportHTMLBundle,
  type ExportHTMLBundleOptions
} from '../html-export'
import { mergeClassNames } from '../serialize'
import type { DesignDocument, DesignElement, DesignNode } from '../types'
import { analyzePrototype, type PrototypeAnalysis } from './analyze'
import { prototypeShim } from './shim'
import type { PrototypeExportReport } from './support'

/**
 * Prototype-aware HTML export: builds the ordinary design document, walks the
 * export root's prototype data (`analyzePrototype`), decorates screens, states,
 * overlays, and variant templates, then injects the prototype CSS and — only
 * when JS-dependent interactions exist — the shim into the standalone bundle.
 *
 * Always implies `html: 'standalone'`; the returned report accounts for every
 * interaction/state/animation/flow, including everything withheld.
 */

export interface ExportPrototypeOptions extends ExportHTMLBundleOptions {
  /** Export root (page or node id); defaults to the graph root. */
  rootId?: string
}

export interface ExportPrototypeResult {
  bundle: ExportHTMLBundle
  report: PrototypeExportReport
}

function decorateDocument(
  document: DesignDocument,
  analysis: PrototypeAnalysis,
  graph: SceneGraph
): void {
  const screens = new Map(analysis.screens.map((screen) => [screen.id, screen]))
  const overlayIds = analysis.overlays
  // Variant templates keyed by instance id, built from each target component's
  // children (positions are component-relative, matching instance children).
  const templates = new Map<string, DesignElement[]>()
  for (const [instanceId, targets] of analysis.variants) {
    const elements: DesignElement[] = []
    for (const target of targets) {
      const doc = sceneGraphToDesignDocument(graph, { rootId: target.componentId })
      elements.push({
        type: 'element',
        tagName: 'template',
        attrs: { 'data-op-variant-for': target.componentId },
        children: doc.children
      })
    }
    templates.set(instanceId, elements)
  }

  const decorate = (node: DesignNode): void => {
    if (node.type === 'text') return
    const sourceId = node.sourceSceneNodeId
    if (sourceId) {
      const screen = screens.get(sourceId)
      if (screen) {
        node.attrs['data-op-screen'] = screen.id
        node.attrs.class =
          mergeClassNames(node.attrs.class, 'op-screen', screen.active ? 'is-active' : undefined) ??
          'op-screen'
      } else if (overlayIds.has(sourceId)) {
        // Overlay frames hoist above the screens: hidden until the runtime
        // opens them, positioned by the open op (preview `overlayVisual`).
        node.attrs['data-op-overlay'] = sourceId
        node.attrs.class = mergeClassNames(node.attrs.class, 'op-overlay') ?? 'op-overlay'
      }
      const seed = analysis.seeds.get(sourceId)
      if (seed !== undefined) node.attrs['data-op-state'] = seed
      const variantTemplates = templates.get(sourceId)
      if (variantTemplates) {
        for (const template of variantTemplates) node.children.push(template)
      }
    }
    for (const child of node.children) decorate(child)
  }
  for (const child of document.children) decorate(child)

  // Hoist overlay subtrees to the end of the stage so an open overlay always
  // paints above the active screen, wherever it was authored.
  const hoisted: DesignNode[] = []
  const strip = (nodes: DesignNode[]): DesignNode[] =>
    nodes.filter((child) => {
      if (child.type === 'text') return true
      if (child.attrs['data-op-overlay']) {
        hoisted.push(child)
        return false
      }
      child.children = strip(child.children)
      return true
    })
  document.children = strip(document.children)
  document.children.push(...hoisted)
}

function injectPrototype(html: string, analysis: PrototypeAnalysis): string {
  let result = html
  const css = analysis.css.join('')
  if (css) result = result.replace('</head>', `<style data-op-prototype>${css}</style></head>`)
  const shim = prototypeShim(
    analysis.shim,
    analysis.screens.find((screen) => screen.active)?.id ?? null
  )
  if (shim) result = result.replace('</body>', `<script data-op-prototype>${shim}</script></body>`)
  return result
}

export async function exportPrototypeBundle(
  graph: SceneGraph,
  options: ExportPrototypeOptions = {}
): Promise<ExportPrototypeResult> {
  const rootId = options.rootId ?? graph.rootId
  const analysis = analyzePrototype(graph, rootId)
  const document = sceneGraphToDesignDocument(graph, { rootId, includeSourceIds: true })
  decorateDocument(document, analysis, graph)

  const bundleOptions: ExportPrototypeOptions = { ...options }
  delete bundleOptions.rootId
  const bundle = await exportHTMLBundle(document, {
    ...bundleOptions,
    html: 'standalone',
    ...(analysis.stage ? { stage: analysis.stage } : {})
  })
  const files = bundle.files.map((file) =>
    file.path === bundle.entrypoint && typeof file.content === 'string'
      ? { ...file, content: injectPrototype(file.content, analysis) }
      : file
  )
  return { bundle: { ...bundle, files }, report: analysis.report }
}
