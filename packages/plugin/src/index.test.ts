/**
 * Plugin runtime tests (ported from the core cases of FigCraft
 * `crates/plugin/src/` tests).
 */

import { describe, expect, test } from 'bun:test'

import { parseManifest } from './index'

describe('plugin runtime', () => {
  test('manifest_parses', () => {
    const m = parseManifest({ id: 'com.example.plugin', name: 'Example', version: '1.0.0', permissions: ['read'] })
    expect(m).toEqual({ id: 'com.example.plugin', name: 'Example', version: '1.0.0', permissions: ['read'] })
  })

  test('manifest_rejects_missing_fields', () => {
    expect(parseManifest({})).toBeInstanceOf(Error)
    expect(parseManifest({ id: 'x' })).toBeInstanceOf(Error)
    expect(parseManifest(null)).toBeInstanceOf(Error)
  })

  test('permissions_default_to_empty', () => {
    const m = parseManifest({ id: 'a', name: 'b', version: '1' })
    expect(m).toEqual({ id: 'a', name: 'b', version: '1', permissions: [] })
  })
})
