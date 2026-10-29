import { Action, MAX_DELAY_MS, walk } from '@zenuxs/doc'
import type { ModelMessage } from 'ai'

import type { FigmaAPI } from '@open-pencil/core/figma-api'
import { PROTOTYPE_TOOLS, type ToolDef } from '@open-pencil/core/tools'

import { getZenuxsEngine } from '@/app/zenuxs-engine'

/**
 * Automatic post-generation prototype validation (audit §4.6).
 *
 * Prompt-only MUTATE → VALIDATE asks the model to police itself. This module is
 * the code path that does not: after every prototype mutation the tool loop
 * runs the real `validate_prototype` ToolDef and, when it reports errors, feeds
 * them into the next model step as a repair instruction — at most
 * `MAX_PROTOTYPE_REPAIR_ROUNDS` times per run, so a document that stays broken
 * can never spin the loop. Later failures stay in the report (debug log).
 */

/** One automatic repair round per run: validate → repair → validate again, then stop. */
export const MAX_PROTOTYPE_REPAIR_ROUNDS = 1

const VALIDATE_TOOL_NAME = 'validate_prototype'

/** Prototype tools that write document content (create_/set_/connect_/add_/apply_*). */
const PROTOTYPE_MUTATORS = new Set(
  PROTOTYPE_TOOLS.filter((tool) => tool.mutates === true).map((tool) => tool.name)
)

/** True when this tool call can invalidate authored prototype behavior. */
export function isPrototypeMutation(toolName: string): boolean {
  return PROTOTYPE_MUTATORS.has(toolName)
}

/** The verdict the validator produced; null when it could not run. */
export interface PrototypeValidationResult {
  ok: boolean
  errors: string[]
}

export interface PrototypeCriticReport {
  /** A prototype-mutating tool ran during this run. */
  mutated: boolean
  /** Last verdict recorded for the run. */
  validation: PrototypeValidationResult | null
  /** Repair rounds already injected into model steps. */
  repairRoundsUsed: number
  /** Text of the last injected repair instruction, for the debug log. */
  lastRepair: string | null
}

function parseValidation(raw: unknown): PrototypeValidationResult | null {
  if (!raw || typeof raw !== 'object' || !('errors' in raw)) return null
  const listed: unknown = raw.errors
  // A tool-level failure (`{ error }`) is not a verdict — never repair on it.
  if (!Array.isArray(listed)) return null
  const errors = listed.filter((entry): entry is string => typeof entry === 'string')
  return { ok: 'ok' in raw && raw.ok === true, errors }
}

/** Run the real validator through the same ToolDef path the model calls. */
export function runPrototypeValidation(figma: FigmaAPI): PrototypeValidationResult | null {
  const validator: ToolDef | undefined = PROTOTYPE_TOOLS.find(
    (tool) => tool.name === VALIDATE_TOOL_NAME
  )
  if (!validator) return null
  try {
    return parseValidation(validator.execute(figma, {}))
  } catch {
    // A crashing validator must not take the tool run down with it.
    return null
  }
}

/**
 * Longest transition duration a prototype may declare (ms). Mirrors the core
 * validator's `MAX_DURATION_MS`, which the `@open-pencil/core/tools` barrel does
 * not export.
 */
const MAX_TRANSITION_DURATION_MS = 120_000

/** Flows are schema-typed `unknown[]` on the page kind, so read them defensively. */
function readFlows(kind: unknown): { name: string; start: number }[] {
  if (!kind || typeof kind !== 'object' || !('flows' in kind)) return []
  const flows: unknown = kind.flows
  if (!Array.isArray(flows)) return []
  return flows.flatMap((flow: unknown) => {
    if (!flow || typeof flow !== 'object') return []
    if (!('name' in flow) || !('start' in flow)) return []
    if (typeof flow.name !== 'string' || typeof flow.start !== 'number') return []
    return [{ name: flow.name, start: flow.start }]
  })
}

/**
 * Validate the Zenuxs document the AI tools actually write.
 *
 * The scene-graph projection drops page flows and narrows interactions, so the
 * core `validate_prototype` tool cannot see what `zenuxs_add_navigation` wrote.
 * This reads `getZenuxsEngine().doc()` directly and speaks the same message
 * forms, so the critic's repair instruction stays uniform.
 */
export function runZenuxsPrototypeValidation(): PrototypeValidationResult {
  try {
    const doc = getZenuxsEngine().doc()
    const errors: string[] = []

    for (const id of doc.ids()) {
      const node = doc.node(id)
      if (!node) continue

      node.interactions.forEach((interaction, index) => {
        const where = `${node.name}: interaction ${index}`
        if (interaction.actions.length === 0) {
          errors.push(`${where} has no actions`)
          return
        }
        walk(interaction.actions, (action) => {
          const dest = Action.dest(action)
          if (dest !== null && !doc.contains_id(dest)) {
            errors.push(`${where} → missing destination "${String(dest)}"`)
          }
        })
        if (
          interaction.duration_ms !== undefined &&
          interaction.duration_ms > MAX_TRANSITION_DURATION_MS
        ) {
          errors.push(`${where} → duration out of range`)
        }
        if (interaction.delay_ms !== undefined && interaction.delay_ms > MAX_DELAY_MS) {
          errors.push(`${where} → delay out of range`)
        }
      })

      for (const flow of readFlows(node.kind)) {
        if (!doc.contains_id(flow.start)) {
          errors.push(`Flow "${flow.name}" start "${String(flow.start)}" does not exist`)
        }
      }
    }

    return { ok: errors.length === 0, errors }
  } catch (error) {
    // A crashing validator must still produce a verdict, so the model can react.
    const message = error instanceof Error ? error.message : String(error)
    return { ok: false, errors: [`Zenuxs prototype validation could not run: ${message}`] }
  }
}

function buildRepairInstruction(errors: readonly string[]): string {
  const listed = errors.slice(0, 12).map((error) => `- ${error}`)
  if (errors.length > 12) listed.push(`- …and ${errors.length - 12} more`)
  return [
    'Automatic prototype validation failed — fix these errors in place before replying (localized repair; do not rebuild the screens):',
    ...listed,
    'Point every reference at a node that exists, run validate_prototype yourself, and only reply once it reports ok.'
  ].join('\n')
}

export interface PrototypeCritic {
  noteMutation(): void
  recordValidation(result: PrototypeValidationResult | null): void
  /** Consumes the one allowed repair round; null when there is nothing new to repair. */
  takeRepair(): string | null
  report(): PrototypeCriticReport
  reset(): void
}

/** Per-run critic state; the tool loop owns exactly one and resets it per message. */
export function createPrototypeCritic(): PrototypeCritic {
  let mutated = false
  let validation: PrototypeValidationResult | null = null
  let repairRoundsUsed = 0
  let lastRepair: string | null = null

  return {
    noteMutation: () => {
      mutated = true
    },
    recordValidation: (result) => {
      if (result) validation = result
    },
    takeRepair: () => {
      if (!mutated || !validation || validation.ok) return null
      if (repairRoundsUsed >= MAX_PROTOTYPE_REPAIR_ROUNDS) return null
      repairRoundsUsed += 1
      lastRepair = buildRepairInstruction(validation.errors)
      return lastRepair
    },
    report: () => ({ mutated, validation, repairRoundsUsed, lastRepair }),
    reset: () => {
      mutated = false
      validation = null
      repairRoundsUsed = 0
      lastRepair = null
    }
  }
}

/**
 * The repair instruction as an internal user turn: `prepareStep` appends it to
 * the model messages for the next step (the UI transcript never sees it).
 */
export function repairMessage(text: string): ModelMessage {
  return { role: 'user', content: text }
}
