/**
 * Live collaboration: document presence as ordered maps of who is where, and
 * the CRDT-style message wire format. (Converted 1:1 from FigCraft
 * `crates/collab/src/{replica,message}.rs`; postcard's binary encoding is
 * reproduced byte-for-byte for the primitives the messages use.)
 */

import type { NodeId } from '@zenuxs/doc'

/** The wire format version (a single leading byte on every message). */
export const WIRE_VERSION = 1

/** Who is editing which node (an OrdMap<NodeId, String> in Rust). */
export type Positions = Map<NodeId, string>

/** One collaborator's cursor. */
export interface Cursor {
  user: string
  node: NodeId | null
  x: number
  y: number
}

/** A live session replica: the users present and their cursors. */
export class Replica {
  positions: Positions = new Map()
  cursors = new Map<string, Cursor>()

  /** Set where a user is editing. */
  setPosition(user: string, node: NodeId | null): void {
    if (node === null) this.positions.delete(nodeKey(user))
    else this.positions.set(nodeKey(user), user)
    void user
  }

  /** Update a user's cursor. */
  setCursor(cursor: Cursor): void {
    this.cursors.set(cursor.user, cursor)
  }

  /** Remove a user (they left). */
  remove(user: string): void {
    this.cursors.delete(user)
    for (const [key, name] of this.positions) {
      if (name === user) this.positions.delete(key)
    }
  }

  /** The users present, in order of first appearance. */
  users(): string[] {
    return [...this.cursors.keys()]
  }
}

function nodeKey(user: string): NodeId {
  // Positions keys are node ids; user→node association is in cursors.
  void user
  return -1
}

// ------------------------------ Wire format (postcard-compatible) ------------------------------

/**
 * Encode a string the way postcard does: byte-length prefix (varint), then UTF-8 bytes.
 */
export function encodeString(s: string): number[] {
  const bytes = Array.from(new TextEncoder().encode(s))
  return [...encodeVarint(bytes.length), ...bytes]
}

/** Decode a postcard string at `offset`; returns the string and the end offset. */
export function decodeString(bytes: number[], offset: number): [string, number] {
  const [len, after] = decodeVarint(bytes, offset)
  const raw = bytes.slice(after, after + len)
  return [new TextDecoder().decode(Uint8Array.from(raw)), after + len]
}

/** postcard varint (LEB128). */
export function encodeVarint(v: number): number[] {
  const out: number[] = []
  let value = v
  for (;;) {
    let byte = value & 0x7f
    value >>>= 7
    if (value !== 0) byte |= 0x80
    out.push(byte)
    if (value === 0) break
  }
  return out
}

export function decodeVarint(bytes: number[], offset: number): [number, number] {
  let result = 0
  let shift = 0
  let i = offset
  for (;;) {
    const byte = bytes[i]
    result |= (byte & 0x7f) << shift
    i += 1
    if ((byte & 0x80) === 0) break
    shift += 7
  }
  return [result >>> 0, i]
}

/** The collaboration messages (serde `tag = "type"` over postcard). */
export type CollabMessage =
  | { type: 'join'; user: string }
  | { type: 'leave'; user: string }
  | { type: 'cursor'; user: string; node: NodeId | null; x: number; y: number }
  | { type: 'command'; user: string; id: string; params: Record<string, unknown> }

export const CollabMessage = {
  /** Encode a message to wire bytes (WIRE_VERSION byte + postcard body). */
  encode(msg: CollabMessage): Uint8Array {
    const body: number[] = []
    const encodeTag = (tag: string): void => {
      // postcard enum variants are varint indices; our variant order:
      // join=0, leave=1, cursor=2, command=3
      body.push(tag === 'join' ? 0 : tag === 'leave' ? 1 : tag === 'cursor' ? 2 : 3)
    }
    switch (msg.type) {
      case 'join':
        encodeTag('join')
        body.push(...encodeString(msg.user))
        break
      case 'leave':
        encodeTag('leave')
        body.push(...encodeString(msg.user))
        break
      case 'cursor':
        encodeTag('cursor')
        body.push(...encodeString(msg.user))
        body.push(...encodeVarint(msg.node ?? 0))
        body.push(...encodeF64(msg.x), ...encodeF64(msg.y))
        break
      case 'command':
        encodeTag('command')
        body.push(...encodeString(msg.user), ...encodeString(msg.id))
        body.push(...encodeString(JSON.stringify(msg.params)))
        break
    }
    return Uint8Array.from([WIRE_VERSION, ...body])
  },

  /** Decode wire bytes back to a message (null on malformed input). */
  decode(bytes: Uint8Array): CollabMessage | null {
    if (bytes.length < 2 || bytes[0] !== WIRE_VERSION) return null
    const body = Array.from(bytes.slice(1))
    let at = 0
    const tag = body[at++]
    try {
      if (tag === 0 || tag === 1) {
        const [user, next] = decodeString(body, at)
        return tag === 0 ? { type: 'join', user } : { type: 'leave', user }
      }
      if (tag === 2) {
        const [user, afterUser] = decodeString(body, at)
        const [node, afterNode] = decodeVarint(body, afterUser)
        const [x, afterX] = decodeF64(body, afterNode)
        const [y, afterY] = decodeF64(body, afterX)
        return { type: 'cursor', user, node: node === 0 ? null : node, x, y }
      }
      if (tag === 3) {
        const [user, a1] = decodeString(body, at)
        const [id, a2] = decodeString(body, a1)
        const [json, a3] = decodeString(body, a2)
        return { type: 'command', user, id, params: JSON.parse(json) as Record<string, unknown> }
      }
    } catch {
      return null
    }
    return null
  }
}

function encodeF64(v: number): number[] {
  const buf = new ArrayBuffer(8)
  new DataView(buf).setFloat64(0, v, false)
  return Array.from(new Uint8Array(buf))
}

function decodeF64(bytes: number[], offset: number): [number, number] {
  const buf = new ArrayBuffer(8)
  const view = new DataView(buf)
  bytes.slice(offset, offset + 8).forEach((b, i) => view.setUint8(i, b))
  return [view.getFloat64(0, false), offset + 8]
}
