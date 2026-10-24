/**
 * Collab networking tests (ported from the core cases of FigCraft
 * `crates/collab-net/src/` tests).
 */

import { describe, expect, test } from 'bun:test'

import { Client, Room, encodeJoinLink, parseJoinLink, memoryTransport } from './index'
import { CollabMessage } from '@zenuxs/collab'

describe('collab-net', () => {
  test('join_link_roundtrip', () => {
    const code = { roomId: 'room-1', secret: 's3cret' }
    const link = encodeJoinLink(code)
    expect(parseJoinLink(link)).toEqual(code)
    expect(parseJoinLink('garbage')).toBeNull()
    expect(parseJoinLink('nodot')).toBeNull()
  })

  test('two_clients_exchange_cursors', () => {
    const [ta, tb] = memoryTransport()
    const seen: string[] = []
    const alice = new Client('alice', ta)
    const bob = new Client('bob', tb)
    bob.onMessage((msg) => {
      if (msg.type === 'cursor') seen.push(`${msg.user}@${msg.node}`)
    })
    alice.cursor(7, 1, 2)
    expect(seen).toEqual(['alice@7'])
  })

  test('command_relayed_to_peer', () => {
    const [ta, tb] = memoryTransport()
    const received: Array<{ id: string; params: Record<string, unknown> }> = []
    const alice = new Client('alice', ta)
    const bob = new Client('bob', tb)
    bob.onMessage((msg) => {
      if (msg.type === 'command') received.push({ id: msg.id, params: msg.params })
    })
    alice.command('shape.rectangle', { width: 100 })
    expect(received).toEqual([{ id: 'shape.rectangle', params: { width: 100 } }])
  })

  test('room_broadcasts_join_to_host', () => {
    const room = new Room()
    const [ta, tb] = memoryTransport()
    const joined: string[] = []
    const host = new Client('host', ta)
    host.onMessage((msg) => {
      if (msg.type === 'join') joined.push(msg.user)
    })
    room.clients.push(host)
    const guest = new Client('guest', tb)
    room.add(guest)
    expect(joined).toContain('guest')
    void CollabMessage
  })
})
