import { DESIGN_SKILLS } from './definitions/design'
import { MOTION_SKILLS } from './definitions/motion'
import { PATTERN_SKILLS } from './definitions/patterns'
import { PROTOTYPE_SKILLS } from './definitions/prototype'
import { STATE_SKILLS } from './definitions/state'
import { SYSTEM_SKILLS } from './definitions/systems'
import {
  SKILL_CATEGORIES,
  type SemanticSkill,
  type SkillCategory,
  type SkillCommand
} from './types'

/**
 * Capability registry (spec §7): structured metadata instead of one enormous
 * system prompt (spec §77). Lookup supports exact slash names, aliases, and
 * category commands (`/motion` activates the whole motion category, spec §8).
 */

export const SEMANTIC_SKILLS: readonly SemanticSkill[] = [
  ...DESIGN_SKILLS,
  ...PATTERN_SKILLS,
  ...PROTOTYPE_SKILLS,
  ...MOTION_SKILLS,
  ...STATE_SKILLS,
  ...SYSTEM_SKILLS
]

const byId = new Map(SEMANTIC_SKILLS.map((skill) => [skill.id, skill]))

const byCommand = new Map<string, SemanticSkill>()
for (const skill of SEMANTIC_SKILLS) {
  byCommand.set(skill.name, skill)
  for (const alias of skill.aliases) byCommand.set(alias, skill)
}

export function getSkill(id: string): SemanticSkill | undefined {
  return byId.get(id)
}

/**
 * Slash names are one lowercase kebab-case token (spec §39): `/Page_Transition`
 * and `/page-transition` are the same command, so callers normalize first.
 */
export function normalizeCommand(command: string): string {
  return command.trim().toLowerCase().replace(/_/g, '-')
}

/** Exact slash name or alias → one skill; category name → that category's skills. */
export function resolveCommand(command: string): SemanticSkill[] | null {
  const normalized = normalizeCommand(command)
  const skill = byCommand.get(normalized)
  if (skill) return [skill]
  if ((SKILL_CATEGORIES as readonly string[]).includes(normalized)) {
    return SEMANTIC_SKILLS.filter((s) => s.category === normalized)
  }
  return null
}

export function skillsInCategory(category: SkillCategory): readonly SemanticSkill[] {
  return SEMANTIC_SKILLS.filter((skill) => skill.category === category)
}

// Slash names are one kebab-case token (spec §39); multi-word aliases resolve
// through resolveCommand but can never be typed after a `/`.
const SLASH_TOKEN = /^[a-z0-9-]+$/

const commands: SkillCommand[] = []
for (const [command, skill] of byCommand) {
  if (SLASH_TOKEN.test(command)) {
    commands.push({ command, description: skill.description, skillId: skill.id })
  }
}
for (const category of SKILL_CATEGORIES) {
  if (!byCommand.has(category)) {
    commands.push({
      command: category,
      description: `Activate every ${category} skill in one route.`,
      skillId: null
    })
  }
}

/**
 * Every typeable `/command` with its one-line purpose (spec §39): composer
 * autocomplete and unknown-command suggestions both read this list. Stable
 * registry order.
 */
export function listCommands(): readonly SkillCommand[] {
  return commands
}

/**
 * Structural invariants (spec §57, §69): unique ids/commands, known requires,
 * categories valid, required metadata present. Returns human-readable issues;
 * an empty array means the registry is sound.
 */
export function registryIssues(skills: readonly SemanticSkill[] = SEMANTIC_SKILLS): string[] {
  const issues: string[] = []
  const ids = new Set<string>()
  const commands = new Set<string>()

  for (const skill of skills) {
    if (ids.has(skill.id)) issues.push(`duplicate id "${skill.id}"`)
    ids.add(skill.id)
    if (!/^\d+\.\d+\.\d+$/.test(skill.version)) {
      issues.push(`${skill.id}: version "${skill.version}" is not semver`)
    }
    if (!(SKILL_CATEGORIES as readonly string[]).includes(skill.category)) {
      issues.push(`${skill.id}: unknown category "${skill.category}"`)
    }
    for (const command of [skill.name, ...skill.aliases]) {
      if (normalizeCommand(command) !== command) {
        issues.push(`${skill.id}: command "${command}" is not normalized kebab-case`)
      }
      if (commands.has(command)) issues.push(`${skill.id}: duplicate command "${command}"`)
      commands.add(command)
    }
    for (const key of ['description', 'knowledge', 'operations'] as const) {
      if (!skill[key]) issues.push(`${skill.id}: missing ${key}`)
    }
    for (const dependency of skill.requires) {
      if (!skills.some((candidate) => candidate.id === dependency)) {
        issues.push(`${skill.id}: unknown requires "${dependency}"`)
      }
    }
    for (const example of skill.examples) {
      if (!example.prompt || !example.intent) issues.push(`${skill.id}: incomplete example`)
    }
  }

  // Dependency cycles would break the router's topological order (spec §11).
  const visitState = new Map<string, 'visiting' | 'done'>()
  const visit = (id: string, trail: string[]): void => {
    const state = visitState.get(id)
    if (state === 'done') return
    if (state === 'visiting') {
      issues.push(`dependency cycle: ${[...trail, id].join(' → ')}`)
      return
    }
    visitState.set(id, 'visiting')
    const skill = skills.find((candidate) => candidate.id === id)
    for (const dependency of skill?.requires ?? []) visit(dependency, [...trail, id])
    visitState.set(id, 'done')
  }
  for (const skill of skills) visit(skill.id, [])

  return issues
}
