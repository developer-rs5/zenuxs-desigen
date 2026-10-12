import { colorToCSS } from '@open-pencil/core/color'

export const BEVEL = 0.025
export const IDLE_FLOAT = 0.05
export const TILT_RANGE = 0.5
export const TILT_RATE = 5
export const DRAG_GAIN = 0.01
export const SPIN_YAW = 0.5
export const SPIN_PITCH = 0.2
export const FOV = (45 * Math.PI) / 180
export const CAM_DIST = 5
export const DEG = Math.PI / 180
export const SDF_MAX = 512
export const SDF_PAD = 24
export const SDF_SPREAD = 32

export function parseColor(
  input: string | undefined,
  fallback: [number, number, number]
): [number, number, number] {
  if (!input) return fallback
  const s = input.trim()
  if (s[0] === '#') {
    let h = s.slice(1)
    if (h.length === 3 || h.length === 4)
      h = h
        .split('')
        .map((c) => c + c)
        .join('')
    if (h.length >= 6) {
      const r = Number.parseInt(h.slice(0, 2), 16) / 255
      const g = Number.parseInt(h.slice(2, 4), 16) / 255
      const b = Number.parseInt(h.slice(4, 6), 16) / 255
      if (!Number.isNaN(r) && !Number.isNaN(g) && !Number.isNaN(b)) return [r, g, b]
    }
    return fallback
  }
  const m = s.match(/rgba?\(([^)]+)\)/i)
  if (m) {
    const p = m[1].split(',').map((v) => Number.parseFloat(v))
    if (p.length >= 3) return [p[0] / 255, p[1] / 255, p[2] / 255]
  }
  return fallback
}

export function numOf(v: string | number | undefined, fallback: number): number {
  if (typeof v === 'number') return Number.isFinite(v) ? v : fallback
  if (typeof v === 'string') {
    const n = Number.parseFloat(v)
    if (Number.isFinite(n)) return n
  }
  return fallback
}

export function srcOf(v: unknown): string | undefined {
  if (!v) return undefined
  if (typeof v === 'string') return v
  const s = (v as { src?: unknown }).src
  return typeof s === 'string' ? s : undefined
}

function rotYX(yaw: number, pitch: number): Float32Array {
  const cy = Math.cos(yaw)
  const sy = Math.sin(yaw)
  const cx = Math.cos(pitch)
  const sx = Math.sin(pitch)
  const m = new Float32Array(9)
  m[0] = cy
  m[2] = -sy
  m[3] = sy * sx
  m[4] = cx
  m[5] = cy * sx
  m[6] = sy * cx
  m[7] = -sx
  m[8] = cy * cx
  return m
}

export function transpose3(m: Float32Array): Float32Array {
  const o = new Float32Array(9)
  o[0] = m[0]
  o[1] = m[3]
  o[2] = m[6]
  o[3] = m[1]
  o[4] = m[4]
  o[5] = m[7]
  o[6] = m[2]
  o[7] = m[5]
  o[8] = m[8]
  return o
}

function mul3(a: Float32Array, b: Float32Array): Float32Array {
  const o = new Float32Array(9)
  for (let c = 0; c < 3; c++)
    for (let r = 0; r < 3; r++)
      o[c * 3 + r] = a[r] * b[c * 3] + a[3 + r] * b[c * 3 + 1] + a[6 + r] * b[c * 3 + 2]
  return o
}

export function rotYXZ(yaw: number, pitch: number, roll: number): Float32Array {
  const base = rotYX(yaw, pitch)
  if (roll === 0) return base
  const c = Math.cos(roll)
  const s = Math.sin(roll)
  const rz = new Float32Array([c, s, 0, -s, c, 0, 0, 0, 1])
  return mul3(base, rz)
}

export function buildEnvCanvas(): HTMLCanvasElement | null {
  if (typeof document === 'undefined') return null
  const canvas = document.createElement('canvas')
  canvas.width = 1024
  canvas.height = 512
  const ctx = canvas.getContext('2d')
  if (!ctx) return null
  ctx.fillStyle = '#1a1a1a'
  ctx.fillRect(0, 0, 1024, 512)
  const softbox = (x: number, y: number, w: number, h: number, intensity: number) => {
    const grd = ctx.createLinearGradient(x, y, x, y + h)
    grd.addColorStop(0, colorToCSS({ r: 1, g: 1, b: 1, a: intensity }))
    grd.addColorStop(1, colorToCSS({ r: 50 / 255, g: 50 / 255, b: 50 / 255, a: intensity * 0.2 }))
    ctx.fillStyle = grd
    ctx.shadowColor = '#ffffff'
    ctx.shadowBlur = 80
    ctx.beginPath()
    ctx.roundRect(x, y, w, h, 60)
    ctx.fill()
  }
  softbox(50, 100, 300, 312, 1)
  softbox(674, 100, 300, 312, 1)
  softbox(350, -50, 324, 150, 0.9)
  ctx.shadowBlur = 0
  return canvas
}

function edt1d(f: Float32Array, d: Float32Array, v: Int32Array, z: Float32Array, n: number) {
  let k = 0
  v[0] = 0
  z[0] = -Infinity
  z[1] = Infinity
  for (let q = 1; q < n; q++) {
    let s = (f[q] + q * q - (f[v[k]] + v[k] * v[k])) / (2 * q - 2 * v[k])
    while (s <= z[k]) {
      k--
      s = (f[q] + q * q - (f[v[k]] + v[k] * v[k])) / (2 * q - 2 * v[k])
    }
    k++
    v[k] = q
    z[k] = s
    z[k + 1] = Infinity
  }
  k = 0
  for (let q = 0; q < n; q++) {
    while (z[k + 1] < q) k++
    d[q] = (q - v[k]) * (q - v[k]) + f[v[k]]
  }
}

function edt2d(mask: Uint8Array, w: number, h: number): Float32Array {
  const INF = 1e20
  const grid = new Float32Array(w * h)
  for (let i = 0; i < w * h; i++) grid[i] = mask[i] ? 0 : INF
  const n = Math.max(w, h)
  const f = new Float32Array(n)
  const d = new Float32Array(n)
  const v = new Int32Array(n)
  const z = new Float32Array(n + 1)
  for (let x = 0; x < w; x++) {
    for (let y = 0; y < h; y++) f[y] = grid[y * w + x]
    edt1d(f, d, v, z, h)
    for (let y = 0; y < h; y++) grid[y * w + x] = d[y]
  }
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) f[x] = grid[y * w + x]
    edt1d(f, d, v, z, w)
    for (let x = 0; x < w; x++) grid[y * w + x] = d[x]
  }
  return grid
}

export function bakeSDF(alpha: Uint8ClampedArray, w: number, h: number): Uint8Array {
  const inside = new Uint8Array(w * h)
  const outside = new Uint8Array(w * h)
  for (let i = 0; i < w * h; i++) {
    const on = alpha[i * 4 + 3] > 127 ? 1 : 0
    inside[i] = on
    outside[i] = on ? 0 : 1
  }
  const dOut = edt2d(inside, w, h)
  const dIn = edt2d(outside, w, h)
  const signed = new Float32Array(w * h)
  for (let i = 0; i < w * h; i++) signed[i] = inside[i] ? Math.sqrt(dIn[i]) : -Math.sqrt(dOut[i])
  const blurred = new Float32Array(w * h)
  const tmp = new Float32Array(w * h)
  const K = [0.06136, 0.24477, 0.38774, 0.24477, 0.06136]
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      let s = 0
      for (let k = -2; k <= 2; k++)
        s += K[k + 2] * signed[y * w + Math.min(w - 1, Math.max(0, x + k))]
      tmp[y * w + x] = s
    }
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      let s = 0
      for (let k = -2; k <= 2; k++) s += K[k + 2] * tmp[Math.min(h - 1, Math.max(0, y + k)) * w + x]
      blurred[y * w + x] = s
    }
  const out = new Uint8Array(w * h * 4)
  for (let i = 0; i < w * h; i++) {
    const norm = Math.max(0, Math.min(1, 0.5 + blurred[i] / (2 * SDF_SPREAD)))
    const b = Math.round(norm * 255)
    out[i * 4] = b
    out[i * 4 + 1] = b
    out[i * 4 + 2] = b
    out[i * 4 + 3] = 255
  }
  return out
}

export function fallbackAlpha(w: number, h: number): Uint8ClampedArray {
  const px = new Uint8ClampedArray(w * h * 4)
  const hx = w / 2 - SDF_PAD
  const hy = h / 2 - SDF_PAD
  const r = Math.min(hx, hy) * 0.45
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const dx = Math.abs(x - w / 2) - (hx - r)
      const dy = Math.abs(y - h / 2) - (hy - r)
      const qx = Math.max(dx, 0)
      const qy = Math.max(dy, 0)
      const d = Math.hypot(qx, qy) + Math.min(Math.max(dx, dy), 0) - r
      px[(y * w + x) * 4 + 3] = d < 0 ? 255 : 0
    }
  }
  return px
}
