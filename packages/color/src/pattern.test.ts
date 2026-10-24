/**
 * Pattern cell tests (converted 1:1 from FigCraft
 * `crates/color/src/pattern_tests.rs`).
 */

import { describe, expect, test } from 'bun:test'

import { PatternPaint, type PatternPaint as PatternPaintT } from './lib'

describe('color pattern cells', () => {
  test('cells_tile_grids_and_shifted_rows', () => {
    const p: PatternPaintT = PatternPaint.new(7)
    p.spacing = [5, 10]
    let c = PatternPaint.cell(p, 20, 10, 100, 100)!
    expect(c.size).toEqual([25, 20])
    expect(c.origin).toEqual([0, 0])
    expect(c.tiles.length).toBe(1)
    p.tile = 'horizontalHex'
    c = PatternPaint.cell(p, 20, 10, 100, 100)!
    expect(c.size).toEqual([25, 40])
    expect(c.tiles).toEqual([
      [0, 0],
      [12.5, 20],
      [-12.5, 20]
    ])
    p.tile = 'verticalHex'
    expect(PatternPaint.cell(p, 20, 10, 100, 100)!.tiles).toEqual([
      [0, 0],
      [25, 10],
      [25, -10]
    ])
    // Scale applies to the tile, not the gap; alignment puts a tile in the centre or the far corner.
    p.tile = 'grid'
    p.scale = 2
    p.align = 'center'
    c = PatternPaint.cell(p, 20, 10, 100, 100)!
    expect(c.size).toEqual([45, 30])
    expect(c.origin).toEqual([30, 40])
    expect(c.scale).toBe(2)
    p.align = 'end'
    expect(PatternPaint.cell(p, 20, 10, 100, 100)!.origin).toEqual([60, 80])
  })

  test('cells_sanitise_their_values', () => {
    const p = PatternPaint.new(1)
    expect(PatternPaint.cell(p, 0, 10, 10, 10)).toBeNull()
    p.scale = NaN
    p.spacing = [Infinity, -5]
    let c = PatternPaint.cell(p, 10, 10, 10, 10)!
    expect(c.scale).toBe(1)
    expect(c.size).toEqual([10, 10])
    p.scale = 1e9
    p.spacing = [1e9, 0]
    c = PatternPaint.cell(p, 10, 10, 10, 10)!
    expect(c.scale).toBe(PatternPaint.SCALE_RANGE[1])
    expect(c.size[0]).toBe(1000 + PatternPaint.MAX_SPACING)
  })
})
