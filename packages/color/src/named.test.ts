/**
 * ZenuxsDesign colour — named colour table tests (converted 1:1 from the
 * inline test module in FigCraft `crates/color/src/named.rs`).
 */

import { describe, expect, test } from 'bun:test'

import { all, lookup } from './named'

describe('color named', () => {
  test('table_is_sorted_and_unique', () => {
    const names = all().map(([n]) => n)
    for (let i = 1; i < names.length; i++) {
      expect(names[i - 1] < names[i]).toBe(true)
    }
    expect(Math.max(...names.map((n) => n.length))).toBe(20)
  })

  test('every_name_is_found', () => {
    for (const [name, rgb] of all()) {
      expect(lookup(name)).toEqual([...rgb])
    }
  })

  test('lookup_normalises', () => {
    expect(lookup('Red')).toEqual([255, 0, 0])
    expect(lookup('  CORNFLOWER blue ')).toEqual([100, 149, 237])
    expect(lookup('light-goldenrod_yellow')).toEqual([250, 250, 210])
    expect(lookup('')).toBeNull()
    expect(lookup('transparent')).toBeNull()
    expect(lookup('reddish')).toBeNull()
    expect(lookup('rédé')).toBeNull()
    expect(lookup('a'.repeat(10_000))).toBeNull()
  })
})
