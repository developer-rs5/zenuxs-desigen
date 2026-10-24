/** Node ids and their string forms (converted 1:1 from FigCraft `crates/doc/src/ids.rs`). */

export const STYLE_ID_PREFIX = 'S:'
export const VARIABLE_ID_PREFIX = 'VariableID:'
export const COLLECTION_ID_PREFIX = 'VariableCollectionId:'
export const MODE_ID_INFIX = '/mode'

/** `NodeId` — a `u64` wrapped; string forms accept `12` and Figma's `0:12`. */
export type NodeId = number

export function parseNodeId(s: string): NodeId | null {
  const t = s.trim()
  const part = t.includes(':') ? t.slice(t.lastIndexOf(':') + 1) : t
  if (!/^\d+$/.test(part)) return null
  const v = Number(part)
  return Number.isSafeInteger(v) && v >= 0 ? v : null
}

/** Which id space a number lives in (collab: the high 32 bits are the client). */
export function space_of(n: number): number {
  return Math.floor(n / 2 ** 32)
}

/** The numeric part of a prefixed id (`S:12` → 12). */
export function id_number(id: string, prefix: string): number {
  return Number.parseInt(id.slice(prefix.length), 10)
}

/** The id space of a prefixed id (`S:9007199254740993` style collab ids). */
export function id_space(id: string, prefix: string): number {
  return space_of(id_number(id, prefix))
}

/** The numeric mode of a mode id (`VariableCollectionId:1/mode2` → 2). */
export function mode_number(id: string): number {
  const at = id.indexOf(MODE_ID_INFIX)
  return at >= 0 ? Number.parseInt(id.slice(at + MODE_ID_INFIX.length), 10) : 0
}
