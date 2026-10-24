/**
 * Colour profile tests (converted 1:1 from FigCraft
 * `crates/color/src/profile_tests.rs`).
 */

import { describe, expect, test } from 'bun:test'

import { Color, ColorProfile, type ColorProfileId } from './lib'

function close(a: number, b: number, eps: number): boolean {
  return Math.abs(a - b) <= eps
}

function beU32(b: Uint8Array, at: number): number {
  return ((b[at] << 24) | (b[at + 1] << 16) | (b[at + 2] << 8) | b[at + 3]) >>> 0
}

function s15(b: Uint8Array, at: number): number {
  const v = (b[at] << 24) | (b[at + 1] << 16) | (b[at + 2] << 8) | b[at + 3]
  return v / 65536
}

/** The tag `sig`'s data in an ICC profile. */
function tag(icc: Uint8Array, sig: string): Uint8Array {
  const n = beU32(icc, 128)
  for (let i = 0; i < n; i++) {
    const at = 132 + i * 12
    const s = String.fromCharCode(icc[at], icc[at + 1], icc[at + 2], icc[at + 3])
    if (s === sig) {
      const off = beU32(icc, at + 4)
      const len = beU32(icc, at + 8)
      return icc.subarray(off, off + len)
    }
  }
  throw new Error(`tag ${sig} not found`)
}

describe('color profiles', () => {
  test('profile_ids_parse_and_serde', () => {
    for (const p of ColorProfile.ALL) {
      expect(ColorProfile.parse(ColorProfile.id(p))).toBe(p)
      expect(ColorProfile.parse(ColorProfile.label(p))).toBe(p)
      // serde serializes the profile as its id string.
      expect(JSON.parse(JSON.stringify(p))).toBe(ColorProfile.id(p))
    }
    expect(ColorProfile.parse('display-p3')).toBe('displayP3')
    expect(ColorProfile.parse('P3')).toBe('displayP3')
    expect(ColorProfile.parse('adobe rgb')).toBeNull()
    expect(ColorProfile.default()).toBe('srgb')
  })

  test('srgb_red_in_display_p3', () => {
    // sRGB #FF0000 is color(display-p3 0.9175 0.2003 0.1386).
    const p3 = ColorProfile.conversionTo('srgb', 'displayP3').apply(Color.new(1, 0, 0, 0.5))
    expect(close(p3.r, 0.9175, 0.001)).toBe(true)
    expect(close(p3.g, 0.2003, 0.001)).toBe(true)
    expect(close(p3.b, 0.1386, 0.001)).toBe(true)
    expect(p3.a).toBe(0.5)
  })

  test('conversions_round_trip_and_keep_neutrals', () => {
    const toP3 = ColorProfile.conversionTo('srgb', 'displayP3')
    const back = ColorProfile.conversionTo('displayP3', 'srgb')
    expect(ColorProfile.conversionTo('srgb', 'srgb').isIdentity()).toBe(true)
    for (const hex of ['0D99FF', 'F24822', '14AE5C', '000000', 'FFFFFF', '808080', '9747FF', 'FF0000', '00FF00']) {
      const c = Color.fromHex(hex)!
      expect(Color.toHex(back.apply(toP3.apply(c)))).toBe(hex)
    }
    // Shared white point: greys stay grey.
    const g = toP3.apply(Color.fromHex('808080')!)
    expect(close(g.r, g.g, 1e-4)).toBe(true)
    expect(close(g.g, g.b, 1e-4)).toBe(true)
    // Display P3's pure green is outside sRGB: it clips into range.
    const c = back.apply(Color.new(0, 1, 0, 1))
    expect(c.r === 0 && c.g === 1 && c.b === 0).toBe(true)
  })

  test('conversion_survives_junk', () => {
    const c = ColorProfile.conversionTo('displayP3', 'srgb').apply({
      r: NaN,
      g: Infinity,
      b: -3,
      a: 2
    })
    for (const v of [c.r, c.g, c.b, c.a]) {
      expect(v >= 0 && v <= 1).toBe(true)
    }
  })

  test('icc_profiles_are_well_formed', () => {
    // Published D50-adapted colorants of sRGB and Display P3.
    const expect_: Array<readonly [ColorProfileId, number[][]]> = [
      [
        'srgb',
        [
          [0.4361, 0.2225, 0.0139],
          [0.3851, 0.7169, 0.0971],
          [0.1431, 0.0606, 0.7142]
        ]
      ],
      [
        'displayP3',
        [
          [0.5151, 0.2412, -0.001],
          [0.292, 0.6922, 0.0419],
          [0.1571, 0.0666, 0.7844]
        ]
      ]
    ]
    for (const [profile, colorants] of expect_) {
      const icc = ColorProfile.icc(profile)
      expect(icc.length).toBe(beU32(icc, 0))
      const col = (sig: string): number[] => {
        const t = tag(icc, sig)
        return [0, 1, 2].map((i) => s15(t, 8 + i * 4))
      }
      const rx = col('rXYZ')
      const gx = col('gXYZ')
      const bx = col('bXYZ')
      const got = [rx, gx, bx]
      for (let i = 0; i < 3; i++) {
        for (let j = 0; j < 3; j++) {
          expect(Math.abs(got[i][j] - colorants[i][j])).toBeLessThan(0.001)
        }
      }
      // The description tag carries the profile label.
      const desc = tag(icc, 'desc')
      const textLen = ((desc[16] << 24) | (desc[17] << 16) | (desc[18] << 8) | desc[19]) >>> 0
      const text = Array.from(desc.subarray(28, 28 + textLen))
        .filter((_, i) => i % 2 === 1)
        .map((b) => String.fromCharCode(b))
        .join('')
      expect(text).toBe(ColorProfile.label(profile))
    }
  })
})
