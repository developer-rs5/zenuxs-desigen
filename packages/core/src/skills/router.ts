import { ALL_TOOLS } from '#core/tools/registry'

import {
  getSkill,
  listCommands,
  normalizeCommand,
  resolveCommand,
  SEMANTIC_SKILLS
} from './registry'
import type {
  RoutingContext,
  SemanticSkill,
  SkillAmbiguity,
  SkillRoute,
  SkillValidationIssue
} from './types'

/**
 * Skill router (spec §9): slash commands and natural language resolve through
 * the same engine to the same skills, composed via the dependency graph
 * (spec §10–§11) with explicit > semantic priority (spec §40).
 */

export const SKILL_CONTEXT_MARKER = '\n\n[Design skills activated for this request]\n'

const TOKEN_PATTERN = /[\p{L}\p{N}]+/gu

/** Words that point at something else — resolvable only with a target (spec §61). */
const ANAPHORA = new Set([
  'it',
  'its',
  'this',
  'that',
  'these',
  'those',
  'they',
  'them',
  'their',
  'selected',
  'current'
])

/**
 * Words that point at an artifact that already exists. Inside a creation
 * request they mean the element is being changed, not introduced.
 */
const DEFINITE_REFERENCES = new Set([
  'the',
  'this',
  'that',
  'these',
  'those',
  'current',
  'selected'
])

/**
 * Verbs that introduce a new artifact. Paired with an artifact noun they make
 * an anaphor self-resolving: "Build a pricing page and make it bold" points at
 * the page being created, not at an unnamed selection.
 */
const CREATION_VERBS = new Set([
  'build',
  'create',
  'design',
  'make',
  'generate',
  'draft',
  'compose',
  'redesign',
  'restyle',
  'sketch',
  'prototype',
  'draw',
  'layout'
])

/** Nouns that name the artifact a creation request produces. */
const ARTIFACT_NOUNS = new Set([
  'page',
  'screen',
  'app',
  'dashboard',
  'landing',
  'website',
  'site',
  'interface',
  'ui',
  'component',
  'hero',
  'section',
  'poster',
  'deck',
  'pricing',
  'portfolio',
  'onboarding',
  'flow',
  'form',
  'modal',
  'menu',
  'gallery',
  'feed',
  'profile',
  'checkout',
  'settings',
  'table',
  'card',
  'button',
  'header',
  'footer',
  'navbar',
  'sidebar',
  'state'
])

/** Variant/state vocabulary: an instance swap is state work, not screen work. */
const INSTANCE_TASK_TERMS = new Set(['variant', 'variants', 'state', 'states', 'swap', 'swapping'])

/** Edits tolerated before an unknown `/command` counts as unrelated (spec §39). */
const MAX_COMMAND_EDITS = 2

function tokens(text: string): Set<string> {
  return new Set(text.toLowerCase().match(TOKEN_PATTERN))
}

function phraseTokens(phrase: string): string[] {
  return phrase.toLowerCase().match(TOKEN_PATTERN) ?? []
}

/** Leading `/command` (slash names are one kebab-case token, spec §39). */
export function parseLeadingCommand(text: string): { command: string; rest: string } | null {
  const match = /^\s*\/([a-z0-9_-]+)\b(.*)$/is.exec(text)
  if (!match?.[1]) return null
  return { command: normalizeCommand(match[1]), rest: match[2] ?? '' }
}

/** A trigger/alias matches when every word it contains appears in the text. */
function phraseMatches(phrase: string, textTokens: Set<string>): boolean {
  const parts = phraseTokens(phrase)
  if (parts.length === 0) return false
  return parts.every((part) => textTokens.has(part))
}

function naturalMatches(text: string): SemanticSkill[] {
  const textTokens = tokens(text)
  if (textTokens.size === 0) return []
  return SEMANTIC_SKILLS.filter((skill) =>
    [...skill.triggers, ...skill.aliases].some((phrase) => phraseMatches(phrase, textTokens))
  )
}

function mentionsAny(text: string, vocabulary: ReadonlySet<string>): boolean {
  for (const token of tokens(text)) {
    if (vocabulary.has(token)) return true
  }
  return false
}

/**
 * Bounded Levenshtein distance: bails out as soon as no alignment can stay
 * within `max`, so command suggestions stay cheap on every keystroke.
 */
function editDistance(source: string, target: string, max: number): number {
  if (Math.abs(source.length - target.length) > max) return max + 1
  let previous: number[] = []
  for (let column = 0; column <= target.length; column++) previous[column] = column
  for (let row = 1; row <= source.length; row++) {
    const current: number[] = [row]
    let rowMinimum = row
    for (let column = 1; column <= target.length; column++) {
      const substitution = source.charAt(row - 1) === target.charAt(column - 1) ? 0 : 1
      const value = Math.min(
        (previous[column] ?? 0) + 1,
        (current[column - 1] ?? 0) + 1,
        (previous[column - 1] ?? 0) + substitution
      )
      current[column] = value
      if (value < rowMinimum) rowMinimum = value
    }
    if (rowMinimum > max) return max + 1
    previous = current
  }
  return previous[target.length] ?? max + 1
}

/**
 * Known commands within ≤2 edits of `unknown`, plus prefix matches such as
 * `/bot` → `bottom-sheet`. Nearest first, then A–Z — never a lecture.
 */
function suggestCommands(unknown: string, limit = 3): string[] {
  const typed = unknown.toLowerCase()
  const scored: { command: string; distance: number }[] = []
  for (const { command } of listCommands()) {
    let distance = editDistance(typed, command, MAX_COMMAND_EDITS + 1)
    if (command.startsWith(typed) || typed.startsWith(command)) {
      distance = Math.min(distance, 1)
    }
    if (distance <= MAX_COMMAND_EDITS) scored.push({ command, distance })
  }
  scored.sort((a, b) => a.distance - b.distance || a.command.localeCompare(b.command))
  return scored.slice(0, limit).map((entry) => entry.command)
}

function unknownCommandIssue(
  command: string,
  suggestions: readonly string[]
): SkillValidationIssue {
  const alternatives =
    suggestions.length > 0
      ? `did you mean ${suggestions.map((candidate) => `/${candidate}`).join(' or ')}?`
      : 'no close match — use a listed slash command or describe the intent in plain language.'
  return {
    kind: 'IntentError',
    skillId: command,
    message: `Unknown command "/${command}" — ${alternatives}`
  }
}

/**
 * Decide, explicitly, how one message should be handled (spec §61): an
 * explicit `/command` executes, a reference with something selected resolves
 * against it, a reference that names nothing to act on asks the user first.
 */
export function resolveAmbiguity(text: string, context?: RoutingContext): SkillAmbiguity {
  if (parseLeadingCommand(text)) {
    return { action: 'execute', reason: 'explicit skill command' }
  }
  if (context?.hasSelection === true) {
    return { action: 'infer', reason: 'reference resolves against the current selection' }
  }
  if (mentionsAny(text, ANAPHORA)) {
    // "Build a pricing page and make it bold" introduces its own target, so
    // asking which element "it" means would stall a complete request.
    if (introducesNewArtifact(text)) {
      return { action: 'infer', reason: 'reference resolves to the artifact this message creates' }
    }
    return { action: 'clarify', reason: 'reference without a selection to apply it to' }
  }
  return { action: 'infer', reason: 'natural-language intent' }
}

/**
 * A creation verb that introduces an artifact means the message carries its
 * own target ("Build a landing page and make it bold"), unlike an edit that
 * points at something unnamed ("make this a modal").
 *
 * The verb has to reach an artifact noun without a definite reference in
 * between: an article like "a" introduces something new, while "this" or
 * "the" points at what already exists.
 */
function introducesNewArtifact(text: string): boolean {
  const words = phraseTokens(text)
  for (let index = 0; index < words.length; index++) {
    if (!CREATION_VERBS.has(words[index] ?? '')) continue
    for (let step = index + 1; step < Math.min(words.length, index + 5); step++) {
      const word = words[step] ?? ''
      if (DEFINITE_REFERENCES.has(word)) break
      if (ARTIFACT_NOUNS.has(word)) return true
    }
  }
  return false
}

/**
 * An instance selection that talks about variants/state is state or prototype
 * work (spec §61): rank those skills ahead of the rest of the match.
 */
function preferredSkills(
  text: string,
  matched: readonly string[],
  context?: RoutingContext
): Set<string> {
  const preferred = new Set<string>()
  if (context?.hasSelection !== true) return preferred
  if (!context.selectedNodeTypes?.includes('INSTANCE')) return preferred
  if (!mentionsAny(text, INSTANCE_TASK_TERMS)) return preferred
  for (const id of matched) {
    const skill = getSkill(id)
    if (skill && (skill.category === 'state' || skill.category === 'prototype')) preferred.add(id)
  }
  return preferred
}

/**
 * Pull in transitive `requires` (spec §11), then order dependencies first
 * with a stable, cycle-free topological sort (explicit > preferred > registry,
 * §40).
 */
function compose(
  seeds: readonly SemanticSkill[],
  explicitIds: ReadonlySet<string>,
  preferredIds: ReadonlySet<string>
): string[] {
  const included = new Map<string, SemanticSkill>()
  const queue = [...seeds]
  while (queue.length > 0) {
    const skill = queue.pop()
    if (!skill || included.has(skill.id)) continue
    included.set(skill.id, skill)
    for (const dependency of skill.requires) {
      const resolved = getSkill(dependency)
      if (resolved && !included.has(resolved.id)) queue.push(resolved)
    }
  }

  const registryOrder = new Map(SEMANTIC_SKILLS.map((skill, index) => [skill.id, index]))
  const pending = new Set(included.keys())
  const ordered: string[] = []

  while (pending.size > 0) {
    const ready = [...pending].filter((id) => {
      const skill = included.get(id)
      return skill?.requires.every((dependency) => !pending.has(dependency)) ?? false
    })
    if (ready.length === 0) {
      // Unreachable with an acyclic registry; keep the remainder deterministic.
      ordered.push(...[...pending].sort())
      break
    }
    ready.sort((a, b) => {
      const explicit = Number(explicitIds.has(b)) - Number(explicitIds.has(a))
      if (explicit !== 0) return explicit
      const preferred = Number(preferredIds.has(b)) - Number(preferredIds.has(a))
      if (preferred !== 0) return preferred
      return (registryOrder.get(a) ?? 0) - (registryOrder.get(b) ?? 0)
    })
    const next = ready[0]
    if (!next) break
    pending.delete(next)
    ordered.push(next)
  }
  return ordered
}

function targetHint(text: string, context?: RoutingContext): string | null {
  if (context?.hasSelection === true && mentionsAny(text, ANAPHORA)) {
    return 'target = current selection'
  }
  return null
}

export function routeSkills(text: string, context?: RoutingContext): SkillRoute {
  const leading = parseLeadingCommand(text)
  const explicit: string[] = []
  const matched: string[] = []
  let unknownCommand: string | null = null

  const naturalText = leading ? leading.rest : text
  for (const skill of naturalMatches(naturalText)) {
    if (!matched.includes(skill.id)) matched.push(skill.id)
  }

  if (leading) {
    const resolved = resolveCommand(leading.command)
    if (resolved) {
      for (const skill of resolved) {
        if (!explicit.includes(skill.id)) explicit.push(skill.id)
      }
    } else {
      unknownCommand = leading.command
    }
  }

  const explicitIds = new Set(explicit)
  const seeds = [
    ...explicit.map((id) => getSkill(id)).filter((skill): skill is SemanticSkill => !!skill),
    ...matched.map((id) => getSkill(id)).filter((skill): skill is SemanticSkill => !!skill)
  ]
  const suggestions = unknownCommand === null ? [] : suggestCommands(unknownCommand)
  const issues = unknownCommand === null ? [] : [unknownCommandIssue(unknownCommand, suggestions)]
  const hint = targetHint(text, context)
  return {
    explicit,
    matched,
    ordered: compose(seeds, explicitIds, preferredSkills(text, matched, context)),
    unknownCommand,
    suggestions,
    issues,
    ambiguity: resolveAmbiguity(text, context),
    hint
  }
}

const TOOL_PURPOSES = new Map(ALL_TOOLS.map((tool) => [tool.name, tool.description]))

function oneSentence(description: string): string {
  const sentence = description.split(/[.!?](?:\s|$)/)[0] ?? description
  const trimmed = sentence.trim()
  return trimmed.length > 100 ? `${trimmed.slice(0, 99)}…` : trimmed
}

/** One-line purpose for an operation; undefined when no ToolDef knows it. */
export function describeOperation(operation: string): string | undefined {
  const description = TOOL_PURPOSES.get(operation)
  return description ? oneSentence(description) : undefined
}

export interface SkillContextOptions {
  /** Overrides the ToolDef lookup used for operation purposes. */
  describeOperation?: (operation: string) => string | undefined
}

function operationLine(operation: string, describe: (name: string) => string | undefined): string {
  const purpose = describe(operation)
  return purpose ? `${operation} — ${purpose}` : operation
}

/** One skill's block: knowledge, validation, defaults, operations, examples, requires. */
function skillBlock(skill: SemanticSkill, describe: (name: string) => string | undefined): string {
  const lines = [`### ${skill.id} (v${skill.version})`, skill.knowledge]
  if (skill.validation.length > 0) {
    lines.push('', 'Validation:', ...skill.validation.map((rule) => `- ${rule}`))
  }
  const defaults = Object.entries(skill.defaults)
  if (defaults.length > 0) {
    lines.push(
      '',
      'Defaults (apply only where the user gave no value):',
      ...defaults.map(([key, value]) => `- ${key}: ${String(value)}`)
    )
  }
  if (skill.operations.length > 0) {
    lines.push(
      '',
      'Operations:',
      ...skill.operations.map((operation) => `- ${operationLine(operation, describe)}`)
    )
  }
  if (skill.examples.length > 0) {
    lines.push(
      '',
      'Examples:',
      ...skill.examples.slice(0, 2).map((example) => `- "${example.prompt}" → ${example.intent}`)
    )
  }
  if (skill.requires.length > 0) lines.push('', `Requires: ${skill.requires.join(', ')}`)
  return lines.join('\n')
}

/**
 * Compact per-message context appended to `modelText` (spec §9 same-engine;
 * §30 internal explainability without giant technical cards). Empty when no
 * skill matched and nothing failed to route — simple requests stay direct
 * (spec §65) while an unknown `/command` always reaches the model instead of
 * being dropped (spec §63).
 */
export function buildSkillContext(route: SkillRoute, options?: SkillContextOptions): string {
  const describe = options?.describeOperation ?? describeOperation
  const blocks = route.ordered
    .map((id) => {
      const skill = getSkill(id)
      return skill ? skillBlock(skill, describe) : ''
    })
    .filter((block) => block.length > 0)
  if (blocks.length === 0 && route.issues.length === 0) return ''

  const lines = [SKILL_CONTEXT_MARKER]
  lines.push(`Routing mode: ${route.ambiguity.action} — ${route.ambiguity.reason}.`)
  if (route.hint) lines.push(`Target: ${route.hint}.`)
  if (route.issues.length > 0) lines.push('', ...route.issues.map((issue) => issue.message))
  if (blocks.length > 0) {
    lines.push(
      '',
      'Follow the activated skill knowledge below for this request. Explicit user instructions override skill defaults. Validate the result against each activated skill’s validation rules before replying.',
      '',
      ...blocks
    )
  }
  return lines.join('\n')
}

export function stripSkillContext(text: string): string {
  const index = text.lastIndexOf(SKILL_CONTEXT_MARKER)
  return index === -1 ? text : text.slice(0, index)
}
