/**
 * A minimal ICC v4 display profile writer (matrix/TRC: colorants, white point,
 * chromatic adaptation and parametric sRGB curves), built from the ICC.1
 * specification. Used to tag exported images with the document's colour
 * profile. (Converted 1:1 from FigCraft `crates/color/src/icc.rs`.)
 */

import { apply, inverse, mul, xyToXyz } from './profile'

/** A 3×3 matrix, row-major. */
export type Mat3 = [[number, number, number], [number, number, number], [number, number, number]]


/** The ICC profile connection space illuminant (D50). */
const PCS_D50: [number, number, number] = [0.9642, 1.0, 0.8249]

/** The Bradford cone response matrix (for chromatic adaptation). */
const BRADFORD: Mat3 = [
  [0.8951, 0.2664, -0.1614],
  [-0.7502, 1.7135, 0.0367],
  [0.0389, -0.0685, 1.0296]
]

/** sRGB transfer curve as ICC parametric curve type 3: g, a, b, c, d. */
const SRGB_CURVE: [number, number, number, number, number] = [2.4, 1 / 1.055, 0.055 / 1.055, 1 / 12.92, 0.04045]

/** A big-endian byte writer. */
class Be {
  bytes: number[] = []

  u16(v: number): this {
    this.bytes.push((v >> 8) & 0xff, v & 0xff)
    return this
  }

  u32(v: number): this {
    this.bytes.push((v >>> 24) & 0xff, (v >> 16) & 0xff, (v >> 8) & 0xff, v & 0xff)
    return this
  }

  sig(s: string): this {
    for (const c of s) this.bytes.push(c.charCodeAt(0) & 0xff)
    return this
  }

  /** An `s15Fixed16Number`. */
  fixed(v: number): this {
    const clamped = Number.isFinite(v)
      ? Math.min(2147483647, Math.max(-2147483648, Math.round(v * 65536)))
      : 0
    return this.u32(clamped >>> 0)
  }

  zeros(n: number): this {
    for (let i = 0; i < n; i++) this.bytes.push(0)
    return this
  }
}

/** `multiLocalizedUnicodeType` with one en-US record. */
function mluc(text: string): number[] {
  const utf16: number[] = []
  for (const code of text) {
    const unit = code.codePointAt(0) ?? 0
    utf16.push((unit >> 8) & 0xff, unit & 0xff)
  }
  const b = new Be()
  b.sig('mluc').zeros(4).u32(1).u32(12).sig('enUS').u32(utf16.length).u32(28)
  b.bytes.push(...utf16)
  return b.bytes
}

function xyz(v: [number, number, number]): number[] {
  const b = new Be()
  b.sig('XYZ ').zeros(4).fixed(v[0]).fixed(v[1]).fixed(v[2])
  return b.bytes
}

/** The Bradford matrix adapting XYZ under `src` white to XYZ under `dst` white. */
function bradford(src: [number, number, number], dst: [number, number, number]): Mat3 {
  const s = apply(BRADFORD, src)
  const d = apply(BRADFORD, dst)
  const ratio = (i: number): number => (Math.abs(s[i]) < 1e-12 ? 1 : d[i] / s[i])
  const scale: Mat3 = [
    [ratio(0), 0, 0],
    [0, ratio(1), 0],
    [0, 0, ratio(2)]
  ]
  const inv = inverse(BRADFORD) ?? scale
  return mul(inv, mul(scale, BRADFORD))
}

/**
 * A matrix/TRC RGB display profile: `to_xyz` maps linear RGB to XYZ under
 * `white`; every channel uses the sRGB curve.
 */
export function matrixTrcProfile(description: string, to_xyz: Mat3, white: [number, number]): Uint8Array {
  const chad = bradford(xyToXyz(white[0], white[1]), PCS_D50)
  const colorants = mul(chad, to_xyz)
  const column = (j: number): [number, number, number] => [colorants[0][j], colorants[1][j], colorants[2][j]]
  const sf32 = new Be()
  sf32.sig('sf32').zeros(4)
  for (const row of chad) {
    for (const v of row) {
      sf32.fixed(v)
    }
  }
  const para = new Be()
  para.sig('para').zeros(4).u16(3).u16(0)
  for (const v of SRGB_CURVE) {
    para.fixed(v)
  }
  const rTRC = [...para.bytes]
  const gTRC = [...para.bytes]
  const tags: Array<readonly [string, number[]]> = [
    ['desc', mluc(description)],
    ['cprt', mluc('No copyright, use freely')],
    ['wtpt', xyz(PCS_D50)],
    ['chad', sf32.bytes],
    ['rXYZ', xyz(column(0))],
    ['gXYZ', xyz(column(1))],
    ['bXYZ', xyz(column(2))],
    ['rTRC', rTRC],
    ['gTRC', gTRC],
    ['bTRC', para.bytes]
  ]
  // Tag data follows the header and the tag table, each element 4-byte aligned.
  let offset = 128 + 4 + 12 * tags.length
  const table = new Be()
  table.u32(tags.length)
  const data: number[] = []
  for (const [sig, bytes] of tags) {
    table.sig(sig).u32(offset).u32(bytes.length)
    const padded = Math.ceil(bytes.length / 4) * 4
    data.push(...bytes)
    for (let i = bytes.length; i < padded; i++) data.push(0)
    offset += padded
  }
  const h = new Be()
  h.u32(offset) // profile size
    .zeros(4) // preferred CMM
    .u32(0x0430_0000) // version 4.3
    .sig('mntr')
    .sig('RGB ')
    .sig('XYZ ')
    .u16(2026)
    .u16(1)
    .u16(1)
    .zeros(6) // creation date and time
    .sig('acsp')
    .zeros(4 + 4 + 4 + 4 + 8) // platform, flags, manufacturer, model, attributes
    .u32(0) // perceptual rendering intent
    .fixed(PCS_D50[0])
    .fixed(PCS_D50[1])
    .fixed(PCS_D50[2])
    .zeros(4 + 16 + 28) // creator, profile id (not computed), reserved
  const out = [...h.bytes, ...table.bytes, ...data]
  return Uint8Array.from(out)
}
