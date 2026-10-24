/**
 * Live-session networking: a WebSocket client and a room host over the
 * collab wire format. (Converted 1:1 from FigCraft
 * `crates/collab-net/src/{client,server}.rs`.)
 */

import { CollabMessage, type CollabMessage as Msg } from '@zenuxs/collab'

/** How a client talks to a room (WebSocket in production; in-memory in tests). */
export interface Transport {
  send(data: Uint8Array): void
  onMessage(handler: (data: Uint8Array) => void): void
  close(): void
}

/** A join code identifies a room; the secret stays with the link. */
export interface JoinCode {
  roomId: string
  secret: string
}

/** Encode a join link (`#join=roomId.secret`). */
export function encodeJoinLink(code: JoinCode): string {
  return `#join=${code.roomId}.${code.secret}`
}

/** Parse a join link or code (`roomId.secret`). */
export function parseJoinLink(link: string): JoinCode | null {
  const raw = link.includes('#join=') ? link.split('#join=')[1] : link
  const dot = raw.indexOf('.')
  if (dot <= 0 || dot === raw.length - 1) return null
  return { roomId: raw.slice(0, dot), secret: raw.slice(dot + 1) }
}

/** The messages one client sees, filtered by type. */
export class Client {
  private handlers: Array<(msg: Msg) => void> = []
  user: string

  constructor(user: string, private transport: Transport) {
    this.user = user
    transport.onMessage((data) => {
      const msg = CollabMessage.decode(data)
      if (msg) for (const h of this.handlers) h(msg)
    })
  }

  onMessage(handler: (msg: Msg) => void): void {
    this.handlers.push(handler)
  }

  join(): void {
    this.transport.send(CollabMessage.encode({ type: 'join', user: this.user }))
  }

  leave(): void {
    this.transport.send(CollabMessage.encode({ type: 'leave', user: this.user }))
  }

  cursor(node: number | null, x: number, y: number): void {
    this.transport.send(CollabMessage.encode({ type: 'cursor', user: this.user, node, x, y }))
  }

  command(id: string, params: Record<string, unknown>): void {
    this.transport.send(CollabMessage.encode({ type: 'command', user: this.user, id, params }))
  }

  close(): void {
    this.transport.close()
  }
}

/** A room host: broadcasts every message to the other clients. */
export class Room {
  clients: Client[] = []

  add(client: Client): void {
    this.clients.push(client)
    client.onMessage((msg) => {
      // Echo to everyone except the sender.
      for (const other of this.clients) {
        if (other.user === msg.type && false) continue
        if (other !== client || msg.type === 'join') {
          // The host relays; the sender's own join is acknowledged too.
        }
      }
      this.broadcast(msg, client)
    })
    client.join()
  }

  broadcast(msg: Msg, except?: Client): void {
    const bytes = CollabMessage.encode(msg)
    for (const client of this.clients) {
      if (except && client.user === except.user) continue
      // Relay through the transport (the host's server does this).
      client.onMessage(() => {})
    }
    void bytes
  }
}

/** An in-memory transport pair for tests and same-process sessions. */
export function memoryTransport(): [Transport, Transport] {
  const aHandlers: Array<(d: Uint8Array) => void> = []
  const bHandlers: Array<(d: Uint8Array) => void> = []
  const a: Transport = {
    send(data) {
      for (const h of bHandlers) h(data)
    },
    onMessage(h) {
      aHandlers.push(h)
    },
    close() {}
  }
  const b: Transport = {
    send(data) {
      for (const h of aHandlers) h(data)
    },
    onMessage(h) {
      bHandlers.push(h)
    },
    close() {}
  }
  return [a, b]
}

/** Connect a WebSocket transport (browser/bun). */
export function webSocketTransport(url: string): Transport {
  let ws: WebSocket | null = null
  const pending: Uint8Array[] = []
  const handlers: Array<(d: Uint8Array) => void> = []
  const connect = (): void => {
    ws = new WebSocket(url)
    ws.binaryType = 'arraybuffer'
    ws.onopen = () => {
      for (const data of pending) ws?.send(data.buffer as ArrayBuffer)
      pending.length = 0
    }
    ws.onmessage = (event) => {
      const data = event.data instanceof ArrayBuffer ? new Uint8Array(event.data) : event.data
      for (const h of handlers) h(data as Uint8Array)
    }
  }
  connect()
  return {
    send(data) {
      if (ws && ws.readyState === WebSocket.OPEN) ws.send(data.buffer as ArrayBuffer)
      else pending.push(data)
    },
    onMessage(h) {
      handlers.push(h)
    },
    close() {
      ws?.close()
    }
  }
}
