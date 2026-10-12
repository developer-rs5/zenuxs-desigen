import { colorToCSS } from '@open-pencil/core/color'

export type BandWidths = { top: number; right: number; bottom: number; left: number }

export interface BorderLike {
  borderColor?: string
  borderStyle?: string
  borderWidth?: number | string
  borderTopWidth?: number | string
  borderRightWidth?: number | string
  borderBottomWidth?: number | string
  borderLeftWidth?: number | string
}

export const MAX_BAND_WIDTH = 30

export const num = (v?: number | string): number => {
  const parsed = Number.parseFloat(String(v ?? ''))
  return Number.isFinite(parsed) && parsed > 0 ? Math.min(parsed, MAX_BAND_WIDTH) : 0
}

export const bandWidthsOf = (b?: BorderLike): BandWidths => {
  const fused = num(b?.borderWidth)
  return {
    top: b?.borderTopWidth !== undefined ? num(b.borderTopWidth) : fused,
    right: b?.borderRightWidth !== undefined ? num(b.borderRightWidth) : fused,
    bottom: b?.borderBottomWidth !== undefined ? num(b.borderBottomWidth) : fused,
    left: b?.borderLeftWidth !== undefined ? num(b.borderLeftWidth) : fused
  }
}

export const borderColorOf = (b?: BorderLike): string => b?.borderColor ?? 'transparent'

/** 8-bit-per-channel RGB triple; deliberately not the scene-graph `Color`. */
export type RGB255 = { r: number; g: number; b: number }

export const WHITE: RGB255 = { r: 255, g: 255, b: 255 }

export function parseColor(input?: string): RGB255 {
  if (!input) return WHITE
  let c = String(input).trim()

  const token = c.match(/^var\([^,]+,\s*(.+)\)$/i)
  if (token) c = token[1].trim()

  if (c[0] === '#') {
    let h = c.slice(1)
    if (h.length === 3 || h.length === 4)
      h = h
        .split('')
        .map((ch) => ch + ch)
        .join('')
    if (h.length !== 6 && h.length !== 8) return WHITE
    const n = Number.parseInt(h, 16)
    if (Number.isNaN(n)) return WHITE
    return h.length === 6
      ? { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255 }
      : { r: (n >>> 24) & 255, g: (n >>> 16) & 255, b: (n >>> 8) & 255 }
  }

  const fn = c.match(/rgba?\(([^)]+)\)/i)
  if (fn) {
    const p = fn[1]
      .split(/[,\s/]+/)
      .filter(Boolean)
      .map(Number)
    if (p.length >= 3 && p.slice(0, 3).every((v) => !Number.isNaN(v)))
      return { r: p[0], g: p[1], b: p[2] }
  }
  return WHITE
}

export const rgba = (c: RGB255, a: number): string =>
  colorToCSS({ r: c.r / 255, g: c.g / 255, b: c.b / 255, a: Math.max(0, Math.min(1, a)) })

export const radiusFromPercent = (w: number, h: number, pct: number) =>
  (Math.min(w, h) / 2) * (Math.max(0, Math.min(100, pct)) / 100)

export const BAND_MASK = {
  maskImage: 'linear-gradient(#000 0 0), linear-gradient(#000 0 0)',
  maskClip: 'border-box, content-box',
  maskComposite: 'exclude',
  WebkitMaskImage: 'linear-gradient(#000 0 0), linear-gradient(#000 0 0)',
  WebkitMaskClip: 'border-box, content-box',
  WebkitMaskComposite: 'xor'
} as const

export const rnd = (i: number, salt: number) => {
  const x = Math.sin((i + 1) * 12.9898 + salt * 78.233) * 43758.5453
  return x - Math.floor(x)
}

export const pointOnRoundRect = (t: number, w: number, h: number, r: number) => {
  const rr = Math.max(0, Math.min(r, w / 2, h / 2))
  const sx = Math.max(0, w - 2 * rr)
  const sy = Math.max(0, h - 2 * rr)
  const arc = (Math.PI / 2) * rr
  const total = 2 * sx + 2 * sy + 4 * arc
  if (total <= 0) return { x: w / 2, y: h / 2 }

  let d = (((t % 1) + 1) % 1) * total + sx / 2
  d %= total

  if (d < sx) return { x: rr + d, y: 0 }
  d -= sx
  if (d < arc) {
    const a = d / rr
    return { x: w - rr + rr * Math.sin(a), y: rr - rr * Math.cos(a) }
  }
  d -= arc
  if (d < sy) return { x: w, y: rr + d }
  d -= sy
  if (d < arc) {
    const a = d / rr
    return { x: w - rr + rr * Math.cos(a), y: h - rr + rr * Math.sin(a) }
  }
  d -= arc
  if (d < sx) return { x: w - rr - d, y: h }
  d -= sx
  if (d < arc) {
    const a = d / rr
    return { x: rr - rr * Math.sin(a), y: h - rr + rr * Math.cos(a) }
  }
  d -= arc
  if (d < sy) return { x: 0, y: h - rr - d }
  d -= sy
  const a = d / rr
  return { x: rr - rr * Math.cos(a), y: rr - rr * Math.sin(a) }
}

export const pointOnRoundRectAngular = (t: number, w: number, h: number, r: number) => {
  const a = w / 2
  const b = h / 2
  if (a <= 0 || b <= 0) return { x: w / 2, y: h / 2 }
  const rr = Math.max(0, Math.min(r, a, b))
  const th = -Math.PI / 2 + (((t % 1) + 1) % 1) * Math.PI * 2
  const dx = Math.cos(th)
  const dy = Math.sin(th)

  const kx = Math.abs(dx) > 1e-9 ? a / Math.abs(dx) : Infinity
  const ky = Math.abs(dy) > 1e-9 ? b / Math.abs(dy) : Infinity
  let k = Math.min(kx, ky)

  const cx = a - rr
  const cy = b - rr
  if (rr > 0 && Math.abs(dx * k) > cx && Math.abs(dy * k) > cy) {
    const Cx = Math.sign(dx * k) * cx
    const Cy = Math.sign(dy * k) * cy
    const proj = dx * Cx + dy * Cy
    const disc = rr * rr - (Cx * Cx + Cy * Cy) + proj * proj

    k = proj + Math.sqrt(Math.max(0, disc))
  }
  return { x: a + dx * k, y: b + dy * k }
}

export const SECONDS_AT_SPEED_1 = 10

export type Cell = {
  cx: number
  cy: number
  base: number
  speed: number
  phase: number
}
