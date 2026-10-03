const OPENPENCIL_START = '<!--(openpencil)'
const OPENPENCIL_END = '(/openpencil)-->'
const FIGMA_START = '<!--(figma)'
const FIGMA_END = '(/figma)-->'
const ESCAPED_FIGMA_START = '&lt;!--(figma)'
const ESCAPED_FIGMA_END = '(/figma)--&gt;'

function hasCompleteMarker(html: string, start: string, end: string): boolean {
  const startIndex = html.indexOf(start)
  return startIndex !== -1 && html.includes(end, startIndex + start.length)
}

export function isDesignClipboardHTML(html: string): boolean {
  return (
    hasCompleteMarker(html, OPENPENCIL_START, OPENPENCIL_END) ||
    hasCompleteMarker(html, FIGMA_START, FIGMA_END) ||
    hasCompleteMarker(html, ESCAPED_FIGMA_START, ESCAPED_FIGMA_END)
  )
}

const RASTER_DATA_URI = /^data:(image\/(?:png|jpeg|webp|gif|avif));base64,/i

/**
 * Extract raster images embedded as base64 `data:` URIs in foreign clipboard
 * HTML (apps that copy an image without placing a file on the clipboard).
 * Remote `http(s)` image URLs are skipped — fetching them would need CORS.
 */
export function imageFilesFromClipboardHTML(html: string): File[] {
  if (!html || !html.includes('data:image/')) return []
  const doc = new DOMParser().parseFromString(html, 'text/html')
  const files: File[] = []
  for (const img of doc.querySelectorAll('img')) {
    const src = img.getAttribute('src') ?? ''
    const match = RASTER_DATA_URI.exec(src)
    if (!match) continue
    try {
      const bytes = Uint8Array.from(atob(src.slice(src.indexOf(',') + 1)), (c) => c.charCodeAt(0))
      const type = match[1].toLowerCase()
      const extension = type === 'image/jpeg' ? 'jpg' : type.slice('image/'.length)
      files.push(new File([bytes], `pasted-image.${extension}`, { type }))
    } catch {
      // Malformed base64 — skip this image rather than failing the paste.
    }
  }
  return files
}
