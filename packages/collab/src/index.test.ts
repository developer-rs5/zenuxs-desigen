/**
 * Collab tests (ported from the core cases of FigCraft
 * `crates/collab/src/replica.rs` tests).
 */

import { describe, expect, test } from 'bun:test'

import { CollabMessage, Replica, WIRE_VERSION, encodeVarint, decodeVarint, encodeString, decodeString } from './index'

describe('collab replica', () => {
  test('cursors_added_and_removed', () => {
    const r = new Replica()
    r.setCursor({ user: 'a', node: 5, x: 10, y: 20 })
    r.setCursor({ user: 'b', node: null, x: 0, y: 0 })
    expect(r.users()).toEqual(['a', 'b'])
    r.remove('a')
    expect(r.users()).toEqual(['b'])
  })
})

describe('collab wire format', () => {
  test('messages_roundtrip', () => {
    const messages = [
      { type: 'join' as const, user: 'alice' },
      { type: 'leave' as const, user: 'bob' },
      { type: 'cursor' as const, user: 'alice', node: 42, x: 1.5, y: -2.5 },
      { type: 'command' as const, user: 'bob', id: 'shape.rectangle', params: { width: 100 } }
    ]
    for (const msg of messages) {
      const bytes = CollabMessage.encode(msg)
      expect(bytes[0]).toBe(WIRE_VERSION)
      expect(CollabMessage.decode(bytes)).toEqual(msg)
    }
  })

  test('varint_roundtrip', () => {
    for (const v of [0, 1, 127, 128, 300, 16384, 2 ** 31 - 1]) {
      const [back] = decodeVarint(encodeVarint(v), 0)
      expect(back).toBe(v)
    }
  })

  test('string_roundtrip_with_multibyte', () => {
    const [s, end] = decodeString(encodeString('héllo 🎨'), 0)
    expect(s).toBe('héllo 🎨')
    expect(end).toBe(encodeString('héllo 🎨').length)
  })

  test('rejects_wrong_version_and_garbage', () => {
    expect(CollabMessage.decode(Uint8Array.from([9, 0]))).toBeNull()
    expect(CollabMessage.decode(Uint8Array.from([1]))).toBeNull()
  })
})
