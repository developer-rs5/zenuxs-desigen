/**
 * PDF export: writes a minimal, valid PDF with one page per frame, embedding
 * node geometry as vector paths. (Converted 1:1 from FigCraft
 * `crates/pdf/src/lib.rs`; krilla's role is a hand-written PDF writer.)
 */

import { Document } from '@zenuxs/doc'
import { nodePath } from '@zenuxs/render'
import { Color as ColorAPI } from '@zenuxs/color'

/** A PDF page's box in points. */
export interface PageSize {
  width: number
  height: number
}

class PdfWriter {
  private chunks: Uint8Array[] = []
  private offsets: number[] = []
  private out: number[] = []

  write(s: string): void {
    for (const ch of s) this.out.push(ch.charCodeAt(0) & 0xff)
  }

  bytes(b: Uint8Array): void {
    for (const byte of b) this.out.push(byte)
  }

  get length(): number {
    return this.out.length
  }

  /** Begin an object, record its offset. */
  object(n: number, body: string): void {
    this.offsets[n] = this.out.length
    this.write(`${n} 0 obj\n${body}\nendobj\n`)
  }

  /** The xref table and trailer. */
  finish(info: { root: number; size: number }): Uint8Array {
    const start = this.out.length
    this.write(`xref\n0 ${info.size + 1}\n`)
    this.write('0000000000 65535 f \n')
    for (let i = 1; i <= info.size; i++) {
      const off = this.offsets[i] ?? 0
      this.write(`${String(off).padStart(10, '0')} 00000 n \n`)
    }
    this.write(`trailer\n<< /Size ${info.size + 1} /Root ${info.root} 0 R >>\nstartxref\n${start}\n%%EOF\n`)
    return Uint8Array.from(this.out)
  }
}

function pathToPdf(path: { elements: Array<{ type: string; p?: { x: number; y: number }; a?: { x: number; y: number }; b?: { x: number; y: number }; c?: { x: number; y: number } }> }): string {
  const parts: string[] = []
  for (const el of path.elements) {
    switch (el.type) {
      case 'MoveTo':
        parts.push(`${fmt(el.p.x)} ${fmt(el.p.y)} m`)
        break
      case 'LineTo':
        parts.push(`${fmt(el.p.x)} ${fmt(el.p.y)} l`)
        break
      case 'CurveTo':
        parts.push(`${fmt(el.a.x)} ${fmt(el.a.y)} ${fmt(el.b.x)} ${fmt(el.b.y)} ${fmt(el.c.x)} ${fmt(el.c.y)} c`)
        break
      case 'ClosePath':
        parts.push('h')
        break
    }
  }
  return parts.join('\n')
}

function fmt(v: number): string {
  return String(Math.round(v * 100) / 100)
}

function fillOpacityColor(color: { r: number; g: number; b: number; a: number }): string {
  const [r, g, b] = ColorAPI.toRgba8(color)
  return `${(r / 255).toFixed(4)} ${(g / 255).toFixed(4)} ${(b / 255).toFixed(4)} rg`
}

/** Export the given frames to a PDF (one page per frame, points). */
export function exportFramesPdf(doc: Document, frameIds: number[]): Uint8Array {
  const w = new PdfWriter()
  const pages: number[] = []
  const pageSize: PageSize = { width: 595, height: 842 } // A4 portrait default
  const contentStreams: string[] = []

  for (const fid of frameIds) {
    const frame = doc.node(fid)
    if (!frame) continue
    let content = ''
    const walk = (id: number, depth: number): void => {
      const n = doc.node(id)
      if (!n || !n.visible) return
      const path = nodePath(n)
      const fill = n.fills.find((f) => f.visible && f.kind.type === 'solid')
      if (path && fill && fill.kind.type === 'solid') {
        content += `q\n1 0 0 1 ${fmt(n.transform.coeffs[4])} ${fmt(pageSize.height - n.transform.coeffs[5])} cm\n`
        content += `${fillOpacityColor(fill.kind.color)}\n`
        content += pathToPdf(path) + '\nf\nQ\n'
      }
      for (const cid of n.children) walk(cid, depth + 1)
    }
    walk(fid, 0)
    contentStreams.push(content)
    pages.push(pages.length + 4) // object numbers assigned below
  }

  // Object 1: catalog, 2: pages, 3: font. Pages start at 4.
  w.write('%PDF-1.7\n')
  w.object(1, '<< /Type /Catalog /Pages 2 0 R >>')
  const kids = pages.map((n) => `${n} 0 R`).join(' ')
  w.object(2, `<< /Type /Pages /Kids [${kids}] /Count ${pages.length} >>`)
  w.object(3, '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>')

  let objNum = 4
  for (let i = 0; i < frameIds.length; i++) {
    const content = contentStreams[i]
    const streamNum = objNum + 2
    w.object(objNum, `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${pageSize.width} ${pageSize.height}] /Contents ${streamNum} 0 R /Resources << /Font << /F1 3 0 R >> >> >>`)
    w.object(objNum + 1, 'null') // reserved
    w.object(streamNum, `<< /Length ${content.length} >>\nstream\n${content}endstream`)
    objNum += 3
  }

  return w.finish({ root: 1, size: objNum - 1 })
}

/** Render frames to a PDF through the Canvas2D pipeline first (raster PDF); a simpler path. */
export function exportFramesPdfRaster(doc: Document, frameIds: number[]): Uint8Array {
  // Minimal valid single-page PDF embedding nothing (raster path lands with the canvas backend).
  const w = new PdfWriter()
  w.write('%PDF-1.7\n')
  w.object(1, '<< /Type /Catalog /Pages 2 0 R >>')
  w.object(2, '<< /Type /Pages /Kids [3 0 R] /Count 1 >>')
  w.object(3, '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] >>')
  return w.finish({ root: 1, size: 3 })
}
