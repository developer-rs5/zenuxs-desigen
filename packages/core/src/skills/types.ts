/**
 * Semantic skill layer (spec §3–§12): skills describe WHEN and WHY, low-level
 * ToolDefs describe HOW, and intent resolution decides WHAT. These types are
 * the vocabulary the router, registry, and chat submission share — no prompt
 * blobs, no second design representation (spec §59).
 */

export const SKILL_CATEGORIES = [
  'design',
  'patterns',
  'prototype',
  'motion',
  'state',
  'systems',
  'responsive'
] as const

export type SkillCategory = (typeof SKILL_CATEGORIES)[number]

/** One representative prompt with its expected semantic intent (spec §47). */
export interface SkillExample {
  prompt: string
  intent: string
}

/**
 * Structured capability metadata (spec §7). `knowledge` is the design
 * intelligence a slash command activates (spec §8) — vocabulary, model,
 * defaults, validation — never a rigid template (spec §22).
 */
export interface SemanticSkill {
  /** Stable dotted id, e.g. `prototype.bottom-sheet` (spec §57). */
  id: string
  /** Slash command name without the slash, e.g. `bottom-sheet`. */
  name: string
  category: SkillCategory
  description: string
  /** Semver; skill updates must not silently break documents (spec §57). */
  version: string
  /** Natural-language phrases that strongly select this skill (spec §39). */
  triggers: string[]
  /** Alternate names (also valid slash names) — e.g. "sheet", "drawer". */
  aliases: string[]
  /** Skill ids pulled in automatically; ordered before this skill (spec §11). */
  requires: string[]
  /** Safe defaults applied only where the user gave no explicit instruction (spec §17, §56). */
  defaults: Record<string, string | number | boolean>
  /** ToolDef names this skill routes to; low-level tools remain available (spec §13). */
  operations: string[]
  /** Concise design intelligence: vocabulary, when/when-not, relationships, failure modes (spec §8, §69). */
  knowledge: string
  /** Post-creation checks the AI must run on its own output (spec §31). */
  validation: string[]
  examples: SkillExample[]
}

/** A typeable slash command surfaced for autocomplete and suggestions (spec §39). */
export interface SkillCommand {
  /** Slash name without the slash — one kebab-case token. */
  command: string
  description: string
  /** Owning skill id; null for category commands such as `motion`. */
  skillId: string | null
}

/** Classified skill-routing failure (spec §63). User-facing text stays clear. */
export type SkillErrorKind = 'IntentError'

/** One issue surfaced while resolving skills for a message (spec §31, §63). */
export interface SkillValidationIssue {
  kind: SkillErrorKind
  /** Skill id, or the unresolved `/command` name when no skill matched. */
  skillId: string
  message: string
}

/**
 * Selection facts the router may use (spec §61): node types only, never node
 * content — routing stays package-neutral with no graph access.
 */
export interface RoutingContext {
  selectedNodeTypes?: string[]
  hasSelection?: boolean
}

/** How one message should be acted on (spec §61 ambiguous prompts). */
export type AmbiguityAction = 'execute' | 'infer' | 'clarify'

export interface SkillAmbiguity {
  action: AmbiguityAction
  reason: string
}

/** Resolution result of one chat submission (spec §9, §40). */
export interface SkillRoute {
  /** Ids selected by an explicit leading `/command` — highest priority (spec §40). */
  explicit: string[]
  /** Ids selected by natural-language trigger/alias matching. */
  matched: string[]
  /** explicit + matched + pulled-in requires, topologically ordered, deduped. */
  ordered: string[]
  /** Leading `/command` with no registry entry (spec §39 → IntentError). */
  unknownCommand: string | null
  /** Known commands within ≤2 edits of `unknownCommand`, nearest first. */
  suggestions: string[]
  /** Routing failures surfaced to the model and the debug log (spec §63). */
  issues: SkillValidationIssue[]
  /** Explicit execute/infer/clarify decision for this message (spec §61). */
  ambiguity: SkillAmbiguity
  /** Target hint for anaphoric requests, e.g. `target = current selection`. */
  hint: string | null
}
