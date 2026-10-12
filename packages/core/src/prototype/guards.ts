import type {
  PrototypeCondition,
  PrototypeGuard,
  PrototypeVarValue
} from '@open-pencil/scene-graph'

/**
 * Guard evaluation for prototype interactions (spec §4 conditions): all
 * conditions must hold or the interaction silently does not fire. Missing
 * variables and non-numeric comparisons on ordered operators fail closed —
 * deterministic, never an error.
 */

/** Missing variables read as `undefined` at runtime, so the record admits it. */
export type PrototypeVars = Record<string, PrototypeVarValue | undefined>

const ORDERED_COMPARATORS: Record<'gt' | 'lt' | 'gte' | 'lte', (a: number, b: number) => boolean> =
  {
    gt: (a, b) => a > b,
    lt: (a, b) => a < b,
    gte: (a, b) => a >= b,
    lte: (a, b) => a <= b
  }

function orderedCompare(op: 'gt' | 'lt' | 'gte' | 'lte', a: number, b: number): boolean {
  return ORDERED_COMPARATORS[op](a, b)
}

export function evaluateCondition(condition: PrototypeCondition, vars: PrototypeVars): boolean {
  const current = vars[condition.variable]
  if (current === undefined) return false
  const { op, value } = condition
  if (op === 'eq' || op === 'neq') {
    const equal =
      typeof current === typeof value ? current === value : String(current) === String(value)
    return op === 'eq' ? equal : !equal
  }
  if (typeof current !== 'number' || typeof value !== 'number') return false
  if (!Number.isFinite(current) || !Number.isFinite(value)) return false
  return orderedCompare(op, current, value)
}

export function evaluateGuard(guard: PrototypeGuard, vars: PrototypeVars): boolean {
  return guard.all.every((condition) => evaluateCondition(condition, vars))
}
