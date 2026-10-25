/**
 * Native ZenuxsDesign (.zenuxs) format adapter for IORegistry.
 *
 * Implements full document reading, writing, and export via @zenuxs/format.
 */

import { openZenuxs, saveZenuxs } from '@zenuxs/format'

import { extractExportGraph, type ExportRequest, type IOFormatAdapter } from '@open-pencil/core/io'

import { sceneGraphToZenuxsDoc, zenuxsDocToSceneGraph } from '@/app/zenuxs-bridge'

function lowerExt(name: string): string {
  const match = /\.([^.]+)$/.exec(name.toLowerCase())
  return match?.[1] ?? ''
}

export const zenuxsFormat: IOFormatAdapter = {
  id: 'zenuxs',
  label: 'ZenuxsDesign Document (.zenuxs)',
  role: 'native-document',
  category: 'document',
  extensions: ['zenuxs'],
  mimeTypes: ['application/zip', 'application/octet-stream'],
  support: {
    readDocument: true,
    writeDocument: true,
    exportDocument: true,
    exportPage: true,
    exportSelection: true,
    exportNode: true
  },
  exportOptions: {
    scale: false,
    quality: false
  },
  matchesFile(fileName: string) {
    return lowerExt(fileName) === 'zenuxs'
  },
  async readDocument(input) {
    const opened = openZenuxs(input.data)
    const graph = zenuxsDocToSceneGraph(opened.doc)
    return { graph, sourceFormat: 'zenuxs' }
  },
  async writeDocument(graph) {
    const { doc } = sceneGraphToZenuxsDoc(graph)
    const bytes = saveZenuxs(doc, { images: graph.images })
    return {
      format: 'zenuxs',
      mimeType: 'application/zip',
      extension: 'zenuxs',
      data: bytes
    }
  },
  async exportContent(request: ExportRequest) {
    const extracted = extractExportGraph(request.graph, request.target)
    const { doc } = sceneGraphToZenuxsDoc(extracted.graph)
    const bytes = saveZenuxs(doc, { images: extracted.graph.images })
    return {
      format: 'zenuxs',
      mimeType: 'application/zip',
      extension: 'zenuxs',
      data: bytes
    }
  }
}

/** Complete list of app IO formats including native .zenuxs. */
export function createZenuxsIORegistry(builtinFormats: IOFormatAdapter[]): IOFormatAdapter[] {
  return [zenuxsFormat, ...builtinFormats]
}
