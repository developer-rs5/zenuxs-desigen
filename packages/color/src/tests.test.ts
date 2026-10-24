/**
 * ZenuxsDesign colour tests (converted 1:1 from FigCraft `crates/color/src/tests.rs`).
 */

import { describe, expect, test } from 'bun:test'

import { BlendMode } from './blend'
import { Hsb, Hsl } from './hsx'
import {
  Color,
  Gradient,
  ImagePaint,
  Paint,
  serializePaint,
  deserializePaint
} from './lib'

describe('color hex and css', () => {
  test('hex_roundtrip_and_shorthands', () => {
    expect(Color.toHex(Color.fromHex('#0D99FF')!)).toBe('0D99FF')
    expect(Color.toHex(Color.fromHex('f')!)).toBe('FFFFFF')
    expect(Color.toHex(Color.fromHex('ab')!)).toBe('ABABAB')
    expect(Color.toHex(Color.fromHex('abc')!)).toBe('AABBCC')
    expect(Color.toRgba8(Color.fromHex('FF000080')!)).toEqual([255, 0, 0, 128])
    expect(Color.fromHex('xyz')).toBeNull()
    expect(Color.fromHex('12345')).toBeNull()
  })

  test('css_parsing', () => {
    expect(Color.toHex(Color.parseCss('rgb(255, 0, 0)')!)).toBe('FF0000')
    expect(Color.toRgba8(Color.parseCss('rgba(0 0 255 / 50%)')!)).toEqual([0, 0, 255, 128])
    expect(Color.toHex(Color.parseCss('hsl(120, 100%, 50%)')!)).toBe('00FF00')
    expect(Color.parseCss('white')).toEqual(Color.WHITE)
    expect(Color.toHex(Color.parseCss('RebeccaPurple')!)).toBe('663399')
    expect(Color.parseCss('transparent')).toEqual(Color.TRANSPARENT)
  })

  test('colour_fields_take_names', () => {
    expect(Color.toCssHex(Color.fromHexOrName('red')!)).toBe('#FF0000')
    expect(Color.toHex(Color.fromHexOrName(' Cornflower Blue ')!)).toBe('6495ED')
    expect(Color.toRgba8(Color.fromHexOrName('darkblue')!)).toEqual([0, 0, 139, 255])
    // Hex wins: every digit string still reads as hex.
    expect(Color.toHex(Color.fromHexOrName('abc')!)).toBe('AABBCC')
    expect(Color.toHex(Color.fromHexOrName('#0D99FF')!)).toBe('0D99FF')
    // Names are opaque; `transparent` is not a field colour.
    expect(Color.fromHexOrName('transparent')).toBeNull()
    for (const junk of ['', '#', 'redd', 're d d', '12345', '\0', '🟥', 'x'.repeat(100_000)]) {
      expect(Color.fromHexOrName(junk)).toBeNull()
    }
  })

  test('hsb_roundtrip', () => {
    for (const hex of ['0D99FF', 'F24822', '14AE5C', '000000', 'FFFFFF', '808080', '9747FF']) {
      const c = Color.fromHex(hex)!
      expect(Color.toHex(Hsb.toColor(Hsb.fromColor(c)))).toBe(hex)
      expect(Color.toHex(Hsl.toColor(Hsl.fromColor(c)))).toBe(hex)
    }
  })

  test('gradient_sampling', () => {
    const g: Gradient = {
      kind: 'linear',
      stops: [
        { position: 1, color: Color.WHITE },
        { position: 0, color: Color.BLACK }
      ],
      from: [0, 0],
      to: [1, 0],
      width: [0, 1]
    }
    expect(Gradient.sample(g, 0)).toEqual(Color.BLACK)
    expect(Gradient.sample(g, 1)).toEqual(Color.WHITE)
    expect(Color.toHex(Gradient.sample(g, 0.5))).toBe('808080')
  })

  test('paint_serde_shape', () => {
    const p = Paint.solid(Color.fromHex('FF0000')!)
    const j = serializePaint(p)
    expect(j.type).toBe('solid')
    const back = deserializePaint(j) as Paint
    expect(back).toEqual(p)
    const g = deserializePaint(
      JSON.parse(
        '{"type":"gradient","kind":"radial","stops":[],"from":[0.5,0.5],"to":[1,0.5],"width":[0.5,1]}'
      )
    ) as Paint
    expect(g.kind.type).toBe('gradient')
  })

  test('nan_inputs_are_sanitized', () => {
    const c = Color.new(NaN, 2, -1, Infinity)
    expect(Color.toRgba8(c)).toEqual([0, 255, 0, 255])
  })

  test('colour_deserializes_from_many_forms', () => {
    const a = Color.deserialize('#FF0000')
    const b = Color.deserialize({ r: 1, g: 0, b: 0 })
    const c = Color.deserialize([1, 0, 0, 1])
    expect(a).toEqual(b)
    expect(b).toEqual(c)
    expect(Color.deserialize('nope')).toBeInstanceOf(Error)
  })

  test('crop_defaults_to_fill_and_roundtrips', () => {
    const img: Parameters<typeof ImagePaint.effectiveCrop>[0] = {
      image: '',
      scale_mode: 'crop',
      scale: 1,
      rotation: 0,
      crop: null,
      filters: { exposure: 0, contrast: 0, saturation: 0, temperature: 0, tint: 0, highlights: 0, shadows: 0 }
    }
    // A 200×100 image in a 100×100 box: Fill scales to 100 tall, 200 wide, centred → x from -0.5 to 1.5.
    const c = ImagePaint.effectiveCrop(img, 200, 100, 100, 100)
    const [x0, y0, x1, y1] = ImagePaint.cropRect(c)
    expect(Math.abs(x0 + 0.5)).toBeLessThan(1e-9)
    expect(Math.abs(x1 - 1.5)).toBeLessThan(1e-9)
    expect(Math.abs(y0)).toBeLessThan(1e-9)
    expect(Math.abs(y1 - 1)).toBeLessThan(1e-9)
    const back = ImagePaint.cropFromRect(x0, y0, x1, y1)
    back.forEach((a, i) => expect(Math.abs(a - c[i])).toBeLessThan(1e-9))
  })

  test('infinite_channels_clamp', () => {
    const c = Color.parseCss('rgb(1e40, 0, 0)')
    expect(c?.r).toBe(1)
    const c2 = Color.new(Infinity, -Infinity, NaN, Infinity)
    expect([c2.r, c2.g, c2.b, c2.a]).toEqual([1, 0, 0, 1])
  })

  test('malformed_alpha_or_extra_args_rejected', () => {
    expect(Color.parseCss('rgba(0,0,0,abc)')).toBeNull()
    expect(Color.parseCss('hsla(0,0%,0%,abc)')).toBeNull()
    expect(Color.parseCss('rgb(1,2,3,4,5)')).toBeNull()
    expect(Color.parseCss('hsl(0,0%,0%,0.5,1)')).toBeNull()
    expect(Color.parseCss('rgb(1,2,3)')?.a).toBe(1)
    expect(Color.parseCss('rgba(1,2,3,0.5)')?.a).toBe(0.5)
  })
})
