/**
 * Rasterizes sanitized SVG artwork so a vision model can inspect it.
 *
 * The browser canvas is used, so the preview matches what the editor shows.
 * The original SVG is never modified — it stays the asset that is imported.
 */

import { decodeBase64 } from '@open-pencil/core/bytes'
import type { SVGRasterizer } from '@open-pencil/core/tools'

/** Longest edge of the generated preview. */
export const RASTER_PREVIEW_MAX_EDGE = 1024

function loadImage(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image()
    image.decoding = 'async'
    image.onload = () => resolve(image)
    image.onerror = () => reject(new Error('The SVG preview could not be rendered'))
    image.src = url
  })
}

function canvasToPNGBYTES(canvas: HTMLCanvasElement): Uint8Array {
  const dataURL = canvas.toDataURL('image/png')
  const base64 = dataURL.slice(dataURL.indexOf(',') + 1)
  return decodeBase64(base64)
}

/**
 * Creates the rasterizer, or null when no DOM is available (headless CLI or
 * MCP usage), in which case SVG assets simply cannot be verified.
 */
export function createSVGRasterizer(): SVGRasterizer | null {
  if (typeof document === 'undefined' || typeof Image === 'undefined') return null

  return {
    async rasterize(svg, options = {}) {
      const maxEdge = options.maxEdge ?? RASTER_PREVIEW_MAX_EDGE
      const blob = new Blob([svg], { type: 'image/svg+xml;charset=utf-8' })
      const url = URL.createObjectURL(blob)
      try {
        const image = await loadImage(url)
        const width = image.naturalWidth || image.width || maxEdge
        const height = image.naturalHeight || image.height || maxEdge
        const longestEdge = Math.max(width, height)
        const scale = longestEdge > 0 ? Math.min(1, maxEdge / longestEdge) : 1
        const canvas = document.createElement('canvas')
        canvas.width = Math.max(1, Math.round(width * scale))
        canvas.height = Math.max(1, Math.round(height * scale))
        const context = canvas.getContext('2d')
        if (!context) throw new Error('The SVG preview could not be rendered')
        context.drawImage(image, 0, 0, canvas.width, canvas.height)
        return { bytes: canvasToPNGBYTES(canvas), mediaType: 'image/png' }
      } finally {
        URL.revokeObjectURL(url)
      }
    }
  }
}
