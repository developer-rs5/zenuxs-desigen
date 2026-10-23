import { describe, expect, it } from 'bun:test'

import { ALL_TOOLS } from '@open-pencil/core'
import {
  buildSkillContext,
  evalCasePasses,
  evalExpectationsResolve,
  getSkill,
  listCommands,
  normalizeCommand,
  parseLeadingCommand,
  registryIssues,
  resolveAmbiguity,
  resolveCommand,
  routeSkills,
  SEMANTIC_SKILLS,
  SKILL_CONTEXT_MARKER,
  SKILL_EVAL_CASES,
  stripSkillContext
} from '@open-pencil/core/skills'

describe('semantic skill registry (spec §7, §69)', () => {
  it('passes all structural invariants', () => {
    expect(registryIssues()).toEqual([])
  })

  it('covers the core categories with distinct capabilities', () => {
    const categories = new Set(SEMANTIC_SKILLS.map((skill) => skill.category))
    expect(categories).toContain('design')
    expect(categories).toContain('prototype')
    expect(categories).toContain('motion')
    expect(categories).toContain('state')
    expect(categories).toContain('systems')
    expect(SEMANTIC_SKILLS.length).toBeGreaterThanOrEqual(15)
  })

  it('resolves exact slash names, aliases, and category commands', () => {
    expect(resolveCommand('bottom-sheet')?.map((s) => s.id)).toEqual(['prototype.bottom-sheet'])
    expect(resolveCommand('sheet')?.map((s) => s.id)).toEqual(['prototype.bottom-sheet'])
    expect(resolveCommand('motion')?.map((s) => s.category)).toEqual([
      'motion',
      'motion',
      'motion',
      'motion'
    ])
    expect(resolveCommand('nope')).toBeNull()
  })

  it('documents the dependencies bottom-sheet pulls in', () => {
    expect(getSkill('prototype.bottom-sheet')?.requires).toEqual([
      'prototype.overlay',
      'motion.slide'
    ])
  })
})

describe('per-skill quality (audit §4.14, spec §46, §69)', () => {
  const toolNames = new Set(ALL_TOOLS.map((tool) => tool.name))
  const knownIds = new Set(SEMANTIC_SKILLS.map((skill) => skill.id))

  /** Every transitive `requires` id, depth-first. */
  function dependencyTree(id: string, seen = new Set<string>()): Set<string> {
    for (const dependency of getSkill(id)?.requires ?? []) {
      if (seen.has(dependency)) continue
      seen.add(dependency)
      dependencyTree(dependency, seen)
    }
    return seen
  }

  for (const skill of SEMANTIC_SKILLS) {
    it(`${skill.id} carries complete, honest metadata`, () => {
      expect(skill.version).toMatch(/^\d+\.\d+\.\d+$/)
      expect(skill.knowledge.length).toBeGreaterThan(80)
      expect(skill.knowledge).not.toContain('TODO')
      expect(skill.validation.length).toBeGreaterThan(0)
      expect(skill.examples.length).toBeGreaterThanOrEqual(1)
      expect(skill.triggers.length).toBeGreaterThan(0)
      expect(skill.description.length).toBeGreaterThan(0)
      for (const example of skill.examples) {
        expect(example.prompt.length).toBeGreaterThan(0)
        expect(example.intent.length).toBeGreaterThan(0)
      }
      for (const operation of skill.operations) {
        expect(toolNames.has(operation)).toBe(true)
      }
      for (const dependency of skill.requires) {
        expect(knownIds.has(dependency)).toBe(true)
      }
    })

    it(`${skill.id} routes from its own command and from a trigger`, () => {
      const byCommand = routeSkills(`/${skill.name}`)
      expect(byCommand.unknownCommand).toBeNull()
      expect(byCommand.ordered).toContain(skill.id)
      // At least one authored trigger resolves back to the skill in plain NL.
      expect(
        skill.triggers.some((trigger) => routeSkills(trigger).ordered.includes(skill.id))
      ).toBe(true)
    })

    it(`${skill.id} composes its dependency graph without dropping`, () => {
      const ordered = routeSkills(`/${skill.name}`).ordered
      expect(ordered).toContain(skill.id)
      for (const dependency of dependencyTree(skill.id)) {
        expect(ordered).toContain(dependency)
        expect(ordered.indexOf(dependency)).toBeLessThan(ordered.indexOf(skill.id))
      }
    })
  }
})

describe('skill router (spec §9, §39, §40)', () => {
  it('parses a leading slash command and keeps the rest', () => {
    expect(parseLeadingCommand('/bottom-sheet Make it dismiss on click')).toEqual({
      command: 'bottom-sheet',
      rest: ' Make it dismiss on click'
    })
    expect(parseLeadingCommand('make it a modal')).toBeNull()
  })

  it('routes slash and natural language to the same skill (spec §9)', () => {
    const slash = routeSkills('/bottom-sheet open the checkout')
    const natural = routeSkills('turn this into a bottom sheet for checkout')
    expect(slash.explicit).toContain('prototype.bottom-sheet')
    expect(natural.matched).toContain('prototype.bottom-sheet')
    expect(slash.ordered).toContain('prototype.bottom-sheet')
    expect(natural.ordered).toContain('prototype.bottom-sheet')
  })

  it('pulls dependencies and orders them before dependents (spec §11)', () => {
    const route = routeSkills('/bottom-sheet')
    expect(route.ordered).toEqual([
      'prototype.navigation',
      'prototype.overlay',
      'motion.slide',
      'prototype.bottom-sheet'
    ])
    expect(route.ordered.indexOf('prototype.overlay')).toBeLessThan(
      route.ordered.indexOf('prototype.bottom-sheet')
    )
  })

  it('composes explicit + natural matches without dropping either (spec §40)', () => {
    const route = routeSkills('/motion create a dashboard')
    expect(route.ordered).toContain('design.dashboard')
    for (const id of route.explicit) expect(route.ordered).toContain(id)
  })

  it('reports an unknown slash command without failing the route (spec §39)', () => {
    const route = routeSkills('/not-a-skill do something')
    expect(route.unknownCommand).toBe('not-a-skill')
    expect(route.ordered).toEqual([])
  })

  it('builds skill knowledge context and strips it for display (spec §19)', () => {
    const context = buildSkillContext(routeSkills('make a bottom sheet'))
    expect(context.startsWith(SKILL_CONTEXT_MARKER)).toBe(true)
    expect(context).toContain('### prototype.bottom-sheet')
    expect(context).toContain('Validate the result')
    const stripped = stripSkillContext(`user text${context}`)
    expect(stripped).toBe('user text')

    expect(buildSkillContext(routeSkills('plain unrelated text'))).toBe('')
    expect(stripSkillContext('clean')).toBe('clean')
  })

  it('matches case- and hyphen-insensitively', () => {
    expect(routeSkills('BOTTOM-SHEET please').ordered).toContain('prototype.bottom-sheet')
    expect(routeSkills('Make the splash Fade Into Login.').matched).toContain('motion.fade')
  })
})

describe('skill eval dataset (spec §47, §48)', () => {
  const knownIds = new Set(SEMANTIC_SKILLS.map((skill) => skill.id))

  it('references only skills that exist and covers the §76 acceptance prompts', () => {
    expect(evalExpectationsResolve(knownIds)).toEqual([])
    expect(SKILL_EVAL_CASES.length).toBeGreaterThanOrEqual(25)
    const prompts = SKILL_EVAL_CASES.map((evalCase) => evalCase.prompt)
    for (const acceptance of [
      'Make a mobile onboarding flow',
      'Make the splash fade into login',
      'Turn this menu into a bottom sheet',
      'Make the button feel interactive',
      'Add loading, success and error states',
      'Connect these screens into a prototype',
      'Add a smooth transition between them',
      'Turn this screenshot into an editable interactive prototype',
      'Make the existing dashboard responsive and add mobile navigation'
    ]) {
      expect(prompts).toContain(acceptance)
    }
  })

  it('keeps slash and natural-language pairs on the same intent (spec §9)', () => {
    const pairs: Array<[string, string]> = [
      ['slash-modal', 'equiv-nl-modal-confirm'],
      ['slash-bottom-sheet', 'equiv-nl-bottom-sheet']
    ]
    for (const [slashId, naturalId] of pairs) {
      const slash = SKILL_EVAL_CASES.find((evalCase) => evalCase.id === slashId)
      const natural = SKILL_EVAL_CASES.find((evalCase) => evalCase.id === naturalId)
      expect(slash).toBeDefined()
      expect(natural).toBeDefined()
      if (!slash || !natural) continue
      expect(natural.expect).toEqual(slash.expect)
      expect(new Set(routeSkills(natural.prompt).ordered)).toEqual(
        new Set(routeSkills(slash.prompt).ordered)
      )
    }
  })

  it('handles ambiguous prompts deterministically (spec §61 pass 2)', () => {
    const ambiguous = [
      'Make the button slide and fade',
      'Design something modern for phones',
      'Make it feel better'
    ]
    for (const prompt of ambiguous) {
      const first = routeSkills(prompt)
      expect(routeSkills(prompt)).toEqual(first)
      expect(first.ordered.length).toBeLessThanOrEqual(6)
    }
    const dual = routeSkills('Make the button slide and fade')
    expect(dual.ordered).toContain('motion.slide')
    expect(dual.ordered).toContain('motion.fade')
  })

  it('survives malformed and empty input (spec §61 pass 12)', () => {
    expect(routeSkills('').ordered).toEqual([])
    expect(routeSkills('   ').ordered).toEqual([])
    expect(routeSkills('/').ordered).toEqual([])
    expect(routeSkills('/!!!').ordered).toEqual([])
    expect(routeSkills('/not-a-skill!! do things').unknownCommand).toBe('not-a-skill')
    expect(routeSkills('\u0000\u0001').ordered).toEqual([])
  })

  it('is idempotent under repeated identical instructions (spec §61 pass 13)', () => {
    const prompt = 'Turn this menu into a bottom sheet'
    const runs = [routeSkills(prompt), routeSkills(prompt), routeSkills(prompt)]
    expect(runs[1]).toEqual(runs[0])
    expect(runs[2]).toEqual(runs[0])
    expect(runs[0].ordered.length).toBeGreaterThan(1)
  })

  for (const evalCase of SKILL_EVAL_CASES) {
    it(`routes: ${evalCase.id}`, () => {
      const route = routeSkills(evalCase.prompt)
      const failures: string[] = []
      for (const id of evalCase.expect) {
        if (!route.ordered.includes(id)) failures.push(`missing ${id}`)
      }
      for (const id of evalCase.forbid ?? []) {
        if (route.ordered.includes(id)) failures.push(`unexpected ${id}`)
      }
      for (const id of evalCase.expectExplicit ?? []) {
        if (!route.explicit.includes(id)) failures.push(`not explicit: ${id}`)
      }
      expect({ prompt: evalCase.prompt, ordered: route.ordered, failures }).toMatchObject({
        failures: []
      })
      expect(evalCasePasses(evalCase, route)).toBe(true)
    })
  }
})

describe('skill knowledge injection (spec §8, §30)', () => {
  it('renders knowledge, validation, defaults, operations, examples, and requires', () => {
    const context = buildSkillContext(routeSkills('/bottom-sheet turn this into a sheet'))
    expect(context).toContain('Validation:')
    expect(context).toContain('- Sheet node exists and is targeted by openOverlay')
    expect(context).toContain('Defaults (apply only where the user gave no value):')
    expect(context).toContain('- backdrop: 0.3')
    expect(context).toContain('Operations:')
    expect(context).toContain('Requires: prototype.overlay, motion.slide')
    expect(context).toContain('Routing mode: execute — explicit skill command.')
    // Every advertised operation carries its ToolDef purpose, one line each.
    expect(context).toContain('create_bottom_sheet — ')
    expect(context).toMatch(/- create_interaction — [^\n]+/)
  })

  it('caps examples at two per skill and stays compact for a routed skill', () => {
    const context = buildSkillContext(routeSkills('/bottom-sheet'))
    for (const block of context.split('### ').slice(1)) {
      expect([...block.matchAll(/^- "/gm)].length).toBeLessThanOrEqual(2)
    }
    // Four skills (three dependencies + the target) stay compact.
    expect(context.length).toBeLessThan(9000)
  })

  it('injects the full capability for every registered skill', () => {
    for (const skill of SEMANTIC_SKILLS) {
      const context = buildSkillContext(routeSkills(`/${skill.name}`))
      expect(context).toContain(`### ${skill.id} (v${skill.version})`)
      expect(context).toContain(skill.validation[0] ?? '')
      expect(context).toContain(`\n- ${skill.operations[0]} `)
      if (skill.requires.length > 0) {
        expect(context).toContain(`Requires: ${skill.requires.join(', ')}`)
      }
    }
  })

  it('falls back to the bare operation name when no ToolDef knows it', () => {
    const route = routeSkills('/bottom-sheet')
    const context = buildSkillContext(route, { describeOperation: () => undefined })
    expect(context).toContain('\n- create_bottom_sheet\n')
    expect(context).not.toContain('create_bottom_sheet — ')
  })

  it('surfaces an unknown command even when nothing routed', () => {
    const context = buildSkillContext(routeSkills('/bottm-sheet do things'))
    expect(context.startsWith(SKILL_CONTEXT_MARKER)).toBe(true)
    expect(context).toContain('Unknown command "/bottm-sheet"')
    expect(context).toContain('did you mean /bottom-sheet?')
  })
})

describe('command discovery and routing issues (spec §39, §63)', () => {
  it('lists typeable commands with their owning skill', () => {
    const commands = listCommands()
    expect(commands.every((entry) => /^[a-z0-9-]+$/.test(entry.command))).toBe(true)
    const sheet = commands.find((entry) => entry.command === 'sheet')
    expect(sheet?.skillId).toBe('prototype.bottom-sheet')
    expect(sheet?.description.length).toBeGreaterThan(0)
    const category = commands.find((entry) => entry.command === 'motion')
    expect(category?.skillId).toBeNull()
  })

  it('turns an unknown command into an IntentError issue with suggestions', () => {
    const route = routeSkills('/bottm-sheet make a sheet')
    expect(route.suggestions).toEqual(['bottom-sheet'])
    expect(route.issues).toHaveLength(1)
    expect(route.issues[0]).toEqual({
      kind: 'IntentError',
      skillId: 'bottm-sheet',
      message: 'Unknown command "/bottm-sheet" — did you mean /bottom-sheet?'
    })
    // Prefix matches count even when the edit distance is large.
    expect(routeSkills('/bot x').suggestions).toContain('bottom-sheet')
    // Unrelated commands suggest nothing rather than anything at all.
    expect(routeSkills('/zzzzzzzzzz x').suggestions).toEqual([])
    expect(routeSkills('/zzzzzzzzzz x').issues[0]?.message).toContain('no close match')
  })

  it('records no issues for known commands or plain text', () => {
    expect(routeSkills('/bottom-sheet').issues).toEqual([])
    expect(routeSkills('make a bottom sheet').issues).toEqual([])
  })
})

describe('ambiguity resolution (spec §61)', () => {
  it('executes an explicit command regardless of selection', () => {
    expect(
      resolveAmbiguity('/bottom-sheet turn this into a sheet', { hasSelection: true })
    ).toEqual({ action: 'execute', reason: 'explicit skill command' })
  })

  it('infers when a selection resolves the reference', () => {
    expect(resolveAmbiguity('make this a modal', { hasSelection: true }).action).toBe('infer')
  })

  it('clarifies an anaphoric request with no selection', () => {
    const result = resolveAmbiguity('make it feel better')
    expect(result.action).toBe('clarify')
    expect(result.reason).toContain('selection')
  })

  it('infers a creation request whose anaphor names the new artifact', () => {
    const result = resolveAmbiguity(
      'Build a landing page for a coffee roastery. Make it look genuinely designed.'
    )
    expect(result.action).toBe('infer')
    expect(result.reason).toContain('creates')
  })

  it('still clarifies a bare anaphor even with a creation verb', () => {
    expect(resolveAmbiguity('make it feel better').action).toBe('clarify')
    expect(resolveAmbiguity('make this nicer').action).toBe('clarify')
    expect(resolveAmbiguity('make this a modal').action).toBe('clarify')
    expect(resolveAmbiguity('turn this menu into a bottom sheet').action).toBe('clarify')
  })

  it('infers plain natural language', () => {
    expect(resolveAmbiguity('make the splash fade into login').action).toBe('infer')
  })

  it('carries the decision on every route', () => {
    expect(routeSkills('/motion create a dashboard').ambiguity.action).toBe('execute')
    expect(routeSkills('make it feel better').ambiguity.action).toBe('clarify')
    expect(routeSkills('make the splash fade into login').ambiguity.action).toBe('infer')
  })
})

describe('context-aware routing (spec §61)', () => {
  const anaphoric = 'turn this menu into a bottom sheet'

  it('hints the target only when an anaphoric request has a selection', () => {
    const withSelection = routeSkills(anaphoric, { hasSelection: true })
    expect(withSelection.hint).toBe('target = current selection')
    expect(withSelection.ambiguity.action).toBe('infer')

    const without = routeSkills(anaphoric)
    expect(without.hint).toBeNull()
    expect(without.ambiguity.action).toBe('clarify')

    expect(routeSkills('make the splash fade into login', { hasSelection: true }).hint).toBeNull()
  })

  it('ranks state skills first for instance variant work', () => {
    const text = 'make the button feel interactive with a hover state and fade it in'
    const plain = routeSkills(text)
    const instance = routeSkills(text, { hasSelection: true, selectedNodeTypes: ['INSTANCE'] })
    expect(plain.ordered[0]).toBe('motion.fade')
    expect(instance.ordered[0]).toBe('state.interaction')
    expect(new Set(instance.ordered)).toEqual(new Set(plain.ordered))

    const rectangle = routeSkills(text, { hasSelection: true, selectedNodeTypes: ['RECTANGLE'] })
    expect(rectangle.ordered).toEqual(plain.ordered)
  })

  it('keeps a single-skill route small even with context', () => {
    const route = routeSkills('make this a modal', {
      hasSelection: true,
      selectedNodeTypes: ['FRAME']
    })
    expect(route.ordered).toContain('prototype.overlay')
    expect(buildSkillContext(route)).toContain('Target: target = current selection.')
  })
})

describe('added slash commands (audit §3.4)', () => {
  it('routes /splash, /modal, and /page-transition to their skills', () => {
    expect(resolveCommand('splash')?.map((s) => s.id)).toEqual(['patterns.splash'])
    expect(resolveCommand('modal')?.map((s) => s.id)).toEqual(['prototype.overlay'])
    expect(resolveCommand('page-transition')?.map((s) => s.id)).toEqual(['motion.slide'])
    expect(routeSkills('/splash show a brand screen').explicit).toEqual(['patterns.splash'])
    expect(routeSkills('/splash show a brand screen').unknownCommand).toBeNull()
  })

  it('normalizes case and underscores to kebab-case', () => {
    expect(normalizeCommand('Page_Transition')).toBe('page-transition')
    expect(resolveCommand('MODAL')?.[0]?.id).toBe('prototype.overlay')
    expect(parseLeadingCommand('/page_transition slide between screens')).toEqual({
      command: 'page-transition',
      rest: ' slide between screens'
    })
    expect(routeSkills('/PAGE_TRANSITION slide between screens').explicit).toEqual(['motion.slide'])
    for (const command of ['splash', 'modal', 'page-transition']) {
      expect(listCommands().some((entry) => entry.command === command)).toBe(true)
    }
  })

  it('routes natural language to the same skills as the commands', () => {
    const splash = routeSkills('/splash show a brand screen')
    const natural = routeSkills('Create a splash/loading entry state')
    for (const id of splash.ordered) expect(natural.ordered).toContain(id)
    expect(natural.matched).toContain('patterns.splash')

    expect(routeSkills('Make this button open a modal').matched).toContain('prototype.overlay')
    expect(routeSkills('Add a page transition between these screens').matched).toContain(
      'motion.slide'
    )
    expect(routeSkills('/modal make the confirm dialog').explicit).toEqual(['prototype.overlay'])
  })
})

describe('knowledge-only vocabulary routing (audit §4.8)', () => {
  it('fires accessibility for keyboard and focus requests', () => {
    expect(routeSkills('Fix the tab order and focus ring on this form').ordered).toContain(
      'systems.accessibility'
    )
    expect(routeSkills('Make this control keyboard reachable').ordered).toContain(
      'systems.accessibility'
    )
  })

  it('fires responsive for breakpoint and mobile-version requests', () => {
    expect(routeSkills('Adjust this design for the tablet breakpoint').ordered).toContain(
      'design.responsive'
    )
    expect(routeSkills('Give me a mobile version of this screen').ordered).toContain(
      'design.responsive'
    )
  })

  it('keeps the system prompt free of that knowledge', () => {
    // Guarded by design: nothing routes without a skill block, and unrelated
    // prompts never pull the systems skills in.
    expect(buildSkillContext(routeSkills('Make the splash fade into login'))).not.toContain(
      '### systems.accessibility'
    )
    expect(buildSkillContext(routeSkills('Add a toast when saved'))).not.toContain(
      'systems.document-model'
    )
  })
})

describe('pattern library (audit §4.9)', () => {
  const names = [
    'splash',
    'login',
    'signup',
    'settings',
    'profile',
    'feed',
    'pricing',
    'checkout',
    'toast',
    'tooltip',
    'accordion',
    'pagination'
  ]

  it('exposes every pattern as a typeable command', () => {
    for (const name of names) {
      const resolved = resolveCommand(name)
      expect(resolved?.map((s) => s.id)).toEqual([`patterns.${name}`])
      const route = routeSkills(`/${name}`)
      expect(route.unknownCommand).toBeNull()
      expect(route.ordered).toContain(`patterns.${name}`)
    }
    const patterns = SEMANTIC_SKILLS.filter((skill) => skill.category === 'patterns')
    expect(patterns.map((skill) => skill.name).sort()).toEqual([...names].sort())
  })

  it('keeps pattern knowledge compact and operations real', () => {
    const toolNames = new Set(ALL_TOOLS.map((tool) => tool.name))
    for (const skill of SEMANTIC_SKILLS) {
      for (const operation of skill.operations) expect(toolNames.has(operation)).toBe(true)
      if (skill.category === 'patterns') {
        expect(skill.knowledge.split(/\s+/).length).toBeLessThan(280)
        expect(skill.examples.length).toBeGreaterThan(0)
      }
    }
  })

  it('routes pattern requests without pulling unrelated screens', () => {
    expect(routeSkills('Make a login screen for the app').ordered).toContain('patterns.login')
    expect(routeSkills('Show a toast when the item is saved').ordered).toContain('patterns.toast')
    expect(routeSkills('Add pagination under this list').ordered).toContain('patterns.pagination')
  })
})

describe('document-model knowledge (audit §4.17)', () => {
  it('routes document-model questions to the skill', () => {
    const route = routeSkills('What does the document model say about node types?')
    expect(route.ordered).toContain('systems.document-model')
    const context = buildSkillContext(route)
    expect(context).toContain('### systems.document-model')
    expect(context).toContain('pluginData')
    expect(context).toContain('parentId/childIds')
  })

  it('stays out of unrelated routes', () => {
    expect(routeSkills('Make a login screen').ordered).not.toContain('systems.document-model')
    expect(resolveCommand('document-model')?.[0]?.id).toBe('systems.document-model')
  })
})
