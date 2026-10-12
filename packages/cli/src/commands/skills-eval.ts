import { readFile } from 'node:fs/promises'

import { defineCommand } from 'citty'
import * as v from 'valibot'

import {
  SKILL_EVAL_CASES,
  evalCasePasses,
  routeSkills,
  type SkillEvalCase
} from '@open-pencil/core/skills'

import { bold, dim, fail, fmtList, ok } from '#cli/format'
import { loadDocument } from '#cli/headless'
import {
  evaluateAgainstReference,
  type ReferenceExpectations,
  type ReferenceReport
} from '#cli/skill-eval/compare'

/**
 * Skill evaluation runner (spec2 §47/§48/§49, §413 "CLI or equivalent
 * executable workflow"): deterministic routing eval over the shared case
 * dataset, plus reference-based document comparison. No model in the loop —
 * routing and reference checks are pure functions, so the runner is
 * reproducible offline; live-model acceptance runs live in the chat E2E
 * suites (`tests/e2e/chat`, `tests/e2e/prototype/human-flow.spec.ts`).
 */

const ReferenceExpectationsSchema = v.object({
  minScreens: v.optional(v.number()),
  screenNames: v.optional(v.array(v.string())),
  interactions: v.optional(
    v.array(
      v.object({
        from: v.optional(v.string()),
        to: v.optional(v.string()),
        trigger: v.optional(v.string()),
        action: v.optional(v.string()),
        transition: v.optional(v.string())
      })
    )
  ),
  states: v.optional(
    v.array(
      v.object({
        node: v.string(),
        states: v.array(v.string()),
        initial: v.optional(v.string())
      })
    )
  ),
  transitionKinds: v.optional(v.array(v.string())),
  flowStart: v.optional(v.string())
})

interface RoutingCaseResult {
  id: string
  prompt: string
  ok: boolean
  expected: string[]
  routed: string[]
}

function runRoutingEval(filter?: string): {
  results: RoutingCaseResult[]
  passed: number
  total: number
} {
  const cases: SkillEvalCase[] = filter
    ? SKILL_EVAL_CASES.filter((entry) => entry.id.includes(filter))
    : SKILL_EVAL_CASES
  const results = cases.map((entry) => {
    const route = routeSkills(entry.prompt)
    return {
      id: entry.id,
      prompt: entry.prompt,
      ok: evalCasePasses(entry, route),
      expected: entry.expect,
      routed: route.ordered
    }
  })
  return {
    results,
    passed: results.filter((result) => result.ok).length,
    total: results.length
  }
}

async function loadReference(path: string): Promise<ReferenceExpectations> {
  const raw = JSON.parse(await readFile(path, 'utf8')) as unknown
  const parsed = v.safeParse(ReferenceExpectationsSchema, raw)
  if (!parsed.success) {
    throw new Error(
      `Invalid reference file ${path}: ${parsed.issues.at(0)?.message ?? 'parse error'}`
    )
  }
  return parsed.output as ReferenceExpectations
}

function printRouting(results: RoutingCaseResult[], passed: number, total: number): void {
  console.log('')
  console.log(bold('Skill routing eval'))
  console.log('')
  const failures = results.filter((result) => !result.ok)
  if (failures.length === 0) {
    console.log(ok(`${passed}/${total} cases passed`))
  } else {
    console.log(fail(`${passed}/${total} cases passed`))
    console.log('')
    console.log(
      fmtList(
        failures.map((failure) => ({
          header: bold(failure.id),
          details: {
            prompt: failure.prompt,
            expected: failure.expected.join(', '),
            routed: failure.routed.length > 0 ? failure.routed.join(', ') : '(nothing)'
          }
        }))
      )
    )
  }
  console.log('')
}

function printReference(report: ReferenceReport, file: string): void {
  console.log('')
  console.log(bold(`Reference comparison: ${file}`))
  console.log('')
  if (report.ok) {
    console.log(ok(`${report.checked}/${report.checked} expectations met`))
  } else {
    console.log(fail(`${report.checked - report.issues.length}/${report.checked} expectations met`))
    console.log('')
    console.log(
      fmtList(
        report.issues.map((issue) => ({
          header: bold(issue.dimension),
          details: { expected: issue.expected, actual: issue.actual }
        }))
      )
    )
  }
  console.log('')
}

export default defineCommand({
  meta: {
    name: 'skills-eval',
    description: 'Run skill-routing eval cases and reference-based document comparison'
  },
  args: {
    reference: {
      type: 'string',
      description: 'Reference expectations JSON to compare a document against'
    },
    document: {
      type: 'string',
      description: 'Document file (.fig/.pen) for reference comparison (required with --reference)'
    },
    filter: { type: 'string', description: 'Only run routing cases whose id contains this text' },
    json: { type: 'boolean', default: false, description: 'Output as JSON' }
  },
  async run({ args }) {
    if (args.reference && !args.document) {
      console.error('--reference requires --document')
      process.exitCode = 1
      return
    }

    const routing = runRoutingEval(args.filter)

    let reference: ReferenceReport | null = null
    if (args.reference && args.document) {
      const graph = await loadDocument(args.document)
      const expectations = await loadReference(args.reference)
      reference = evaluateAgainstReference(graph, expectations)
    }

    if (args.json) {
      console.log(
        JSON.stringify(
          {
            routing: { passed: routing.passed, total: routing.total, results: routing.results },
            reference
          },
          null,
          2
        )
      )
    } else {
      printRouting(routing.results, routing.passed, routing.total)
      if (reference && args.reference) printReference(reference, args.reference)
      console.log(dim(`${routing.total} routing cases from the shared eval dataset.`))
    }

    const failed = routing.passed < routing.total || (reference ? !reference.ok : false)
    if (failed) process.exitCode = 1
  }
})
