/**
 * Styles and variables: shared paints/effects/text styles, variable
 * collections with modes, and the values per mode.
 * (Converted 1:1 from FigCraft `crates/doc/src/styles.rs`.)
 */

import type { Color } from '@zenuxs/color'

export type StyleId = string
export type VariableId = string
export type CollectionId = string
export type ModeId = string

/** What a shared style collects. */
export type StyleKind =
  | { type: 'color'; paints: unknown[] }
  | { type: 'text'; style: unknown }
  | { type: 'effect'; effects: unknown[] }
  | { type: 'grid'; grids: unknown[] }

/** A shared style. */
export interface Style {
  id: StyleId
  name: string
  folder?: string
  kind: StyleKind
}

/** The style ids a node links to per slot. */
export interface StyleRefs {
  fill?: StyleId | null
  stroke?: StyleId | null
  effect?: StyleId | null
  text?: StyleId | null
  grid?: StyleId | null
}

export type VariableType = 'boolean' | 'color' | 'number' | 'string'

/** A variable's value in one mode (an alias points at another variable). */
export type VariableValue =
  | { type: 'boolean'; value: boolean }
  | { type: 'color'; value: Color }
  | { type: 'number'; value: number }
  | { type: 'string'; value: string }
  | { type: 'alias'; value: string }

/** One mode of a collection. */
export interface Mode {
  id: ModeId
  name: string
}

/** A variable collection: the modes its variables can take. */
export interface Collection {
  id: CollectionId
  name: string
  modes: Mode[]
  default_mode?: ModeId | null
  hidden_from_publishing: boolean
}

/** A design variable with a value per mode. */
export interface Variable {
  id: VariableId
  name: string
  collection: CollectionId
  values: Record<ModeId, VariableValue>
  scopes: string[]
  code_syntax?: string
}

/** Code syntax platforms. */
export const CODE_PLATFORMS = ['web', 'ios', 'android'] as const

/** All scopes a variable can have. */
export const ALL_SCOPES: readonly string[] = [
  'fill',
  'stroke',
  'effect',
  'text-fill',
  'corner-radius',
  'width-height',
  'gap',
  'padding',
  'opacity',
  'font-family',
  'font-size',
  'font-weight',
  'line-height',
  'letter-spacing',
  'paragraph-spacing',
  'paragraph-indent'
]

/** The scopes that make sense for a variable type. */
export function scopes_for(kind: VariableType): readonly string[] {
  switch (kind) {
    case 'color':
      return ['fill', 'stroke', 'effect', 'text-fill']
    case 'number':
      return ['corner-radius', 'width-height', 'gap', 'padding', 'opacity', 'font-size', 'font-weight', 'line-height', 'letter-spacing', 'paragraph-spacing', 'paragraph-indent']
    case 'string':
      return ['font-family']
    case 'boolean':
      return []
  }
}

export function scope_known(scope: string): boolean {
  return ALL_SCOPES.includes(scope)
}

export function normalize_scopes(kind: VariableType, scopes: string[]): string[] {
  const allowed = scopes_for(kind)
  const out = scopes.filter((s) => allowed.includes(s) && scope_known(s))
  return [...new Set(out)]
}

/** The document's variables. */
export interface Variables {
  collections: Collection[]
  variables: Variable[]
}

export const Variables = {
  empty(): Variables {
    return { collections: [], variables: [] }
  },

  get(v: Variables, id: VariableId): Variable | null {
    return v.variables.find((variable) => variable.id === id) ?? null
  },

  collection(v: Variables, id: CollectionId): Collection | null {
    return v.collections.find((c) => c.id === id) ?? null
  },

  /**
   * Resolve `id` to its value in `modes` (following aliases; `depth` guards
   * alias cycles).
   */
  resolve(v: Variables, id: VariableId, modes: Record<string, string>, depth = 0): VariableValue | null {
    if (depth > 16) return null
    const variable = Variables.get(v, id)
    if (!variable) return null
    const collection = Variables.collection(v, variable.collection)
    const mode =
      modes[variable.collection] ??
      collection?.default_mode ??
      collection?.modes[0]?.id ??
      null
    const value = mode !== null ? variable.values[mode] : null
    if (!value) return null
    if (value.type === 'alias') {
      return Variables.resolve(v, value.value, modes, depth + 1)
    }
    return value
  }
}
