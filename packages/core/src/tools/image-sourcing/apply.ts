/**
 * Canvas integration for sourced images.
 *
 * Only verified bytes reach this module. Raster images go through the existing
 * image fill pipeline, sanitized SVGs through the vector pipeline so they stay
 * editable.
 */

import type { SceneNode } from '@open-pencil/scene-graph'

import { BLACK } from '#core/constants'
import type { FigmaAPI } from '#core/figma-api'
import { setPluginData } from '#core/figma-api/plugin-data'
import { createSVGNodesFromImport, prepareSVGImport } from '#core/io/formats/svg'

import { contentHash } from './hash'
import type { AssetProvenance } from './types'

/** Plugin data key that carries the sourcing provenance of an image. */
export const IMAGE_SOURCING_PLUGIN_DATA_KEY = 'image-sourcing'

const IMAGE_TARGET_TYPES: ReadonlySet<SceneNode['type']> = new Set([
  'FRAME',
  'RECTANGLE',
  'ROUNDED_RECTANGLE',
  'ELLIPSE',
  'STAR',
  'POLYGON',
  'VECTOR',
  'BOOLEAN_OPERATION',
  'COMPONENT',
  'INSTANCE'
])

export interface ApplySourcedImageOptions {
  figma: FigmaAPI
  /** Placeholder node that receives the image. */
  nodeId: string
  /** Exact bytes that were verified. */
  bytes: Uint8Array
  mimeType: string
  /** Sanitized SVG source, when the verified asset is a vector. */
  svg?: string
  /** Name for the imported vector frame. */
  name?: string
  /**
   * Content hash of the verified bytes. When given, the import is refused if
   * the bytes no longer match the ones that were inspected.
   */
  expectedContentHash?: string
  /** Provenance attached to the node for debugging. */
  provenance?: AssetProvenance
}

export type ApplySourcedImageResult =
  | {
      id: string
      isVector: boolean
      imageHash?: string
      width: number
      height: number
    }
  | { error: string }

/**
 * Applies a verified asset to a placeholder.
 *
 * A vector asset replaces the placeholder with editable vector nodes; a raster
 * asset becomes an image fill on the placeholder, exactly like the existing
 * stock photo path.
 */
export async function applySourcedImage(
  options: ApplySourcedImageOptions
): Promise<ApplySourcedImageResult> {
  const { figma, nodeId } = options
  const node = figma.getNodeById(nodeId)
  if (!node) return { error: 'Not found' }

  if (!IMAGE_TARGET_TYPES.has(node.type)) {
    return {
      error: `"${node.name}" (${node.type}) is not a suitable image target`
    }
  }

  if (node.type === 'VECTOR' && (node.vectorNetwork.regions?.length ?? 0) === 0) {
    return { error: `"${node.name}" has no closed vector regions — use closed area geometry` }
  }

  if (node.children.length > 0) {
    return { error: `"${node.name}" has children — use a leaf image placeholder` }
  }

  if (options.expectedContentHash) {
    const mismatch = await checkContentHash(options.bytes, options.expectedContentHash)
    if (mismatch) return { error: mismatch }
  }

  if (options.svg) {
    const sceneNode = figma.graph.getNode(nodeId)
    if (!sceneNode) return { error: 'Not found' }
    return applyVector(figma, sceneNode, options)
  }

  if (options.bytes.byteLength === 0) {
    return { error: 'The verified asset contained no data' }
  }

  const image = figma.createImage(options.bytes)
  node.fills = [
    {
      type: 'IMAGE',
      color: BLACK,
      imageHash: image.hash,
      imageScaleMode: 'FILL',
      visible: true,
      opacity: 1
    }
  ]
  attachProvenance(figma, node.id, options.provenance)
  return {
    id: node.id,
    isVector: false,
    imageHash: image.hash,
    width: node.width,
    height: node.height
  }
}

/**
 * Compares the bytes that are about to be imported with the bytes that were
 * inspected. A mismatch means the asset changed after verification.
 */
async function checkContentHash(bytes: Uint8Array, expected: string): Promise<string | null> {
  const actual = await contentHash(bytes)
  if (actual === expected) return null
  return 'The asset no longer matches the content that was verified'
}

/** Attaches the sourcing metadata to the node for debugging. */
function attachProvenance(
  figma: FigmaAPI,
  nodeId: string,
  provenance: AssetProvenance | undefined
): void {
  if (!provenance) return
  const node = figma.graph.getNode(nodeId)
  if (!node) return
  setPluginData(figma.graph, node, IMAGE_SOURCING_PLUGIN_DATA_KEY, JSON.stringify(provenance))
}

async function applyVector(
  figma: FigmaAPI,
  node: SceneNode,
  options: ApplySourcedImageOptions
): Promise<ApplySourcedImageResult> {
  const graph = figma.graph
  const parent = node.parentId ? graph.getNode(node.parentId) : null
  if (!parent) return { error: `"${node.name}" has no parent to import into` }

  const absolute = graph.getAbsolutePosition(node.id)
  const resized = resizeSVGSource(options.svg as string, node.width, node.height)
  const data = prepareSVGImport(resized)
  if (!data) return { error: 'The SVG could not be converted into vector nodes' }

  const index = parent.childIds.indexOf(node.id)
  const frame = createSVGNodesFromImport(graph, parent.id, data, {
    name: options.name ?? node.name,
    x: absolute.x,
    y: absolute.y
  })
  if (!frame) return { error: 'The SVG produced no editable vector nodes' }

  // Keep the placeholder position inside its parent.
  if (index !== -1) graph.insertChildAt(frame.id, parent.id, index)
  graph.deleteNode(node.id)
  attachProvenance(figma, frame.id, options.provenance)

  return {
    id: frame.id,
    isVector: true,
    width: frame.width,
    height: frame.height
  }
}

/**
 * Rewrites the root size of an SVG so the artwork is scaled into the target
 * box while the viewBox keeps the original coordinate space.
 */
export function resizeSVGSource(source: string, width: number, height: number): string {
  if (width <= 0 || height <= 0) return source
  const roundedWidth = Math.round(width * 100) / 100
  const roundedHeight = Math.round(height * 100) / 100
  return source.replace(/<svg\b([^>]*)>/i, (_match, attributes: string) => {
    const withoutSize = attributes
      .replace(/\s(width|height)\s*=\s*("[^"]*"|'[^']*'|[^\s>]+)/gi, '')
      .trimEnd()
    return `<svg${withoutSize} width="${roundedWidth}" height="${roundedHeight}">`
  })
}
