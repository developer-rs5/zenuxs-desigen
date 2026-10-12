import type { ModelMessage } from 'ai'

import type { FigmaAPI } from '@open-pencil/core/figma-api'
import { PROTOTYPE_TOOLS, type ToolDef } from '@open-pencil/core/tools'

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
