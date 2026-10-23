import type { FigmaAPI } from '@open-pencil/core/figma-api'
import { CORE_TOOLS, type ToolDef } from '@open-pencil/core/tools'

/**
 * Automatic layout enforcement for AI-built layouts.
 *
 * The system prompt makes areas a contract ("declare the area, fill it, never
 * spill"), but a prompt cannot stop a long paragraph from outgrowing the box it
 * replaced, two siblings from stacking on the same coordinates, or a node from
 * collapsing to nothing. This is the code path that does: before the model
 * replies, the real `describe` checks run over the current page, and any
 * blocking layout error is fed back into the next model step as a bounded
 * repair round — the same shape as the prototype critic, applied to geometry.
 *
 * Detection is deliberately narrow. Only `error`-severity issues are
 * collected — overflow, sibling overlap, collapsed or unpainted elements,
 * unreadable text — so a design that merely has a radius or spacing nit is
 * never interrupted.
 */

/**
 * Two automatic repair rounds per run. The first absorbs an early overflow
 * (usually a skeleton that the real copy outgrew); the second is the final
 * review — the check that runs right before the model's reply, so a last
 * content render that spilled is still repaired instead of shipped.
 */
export const MAX_LAYOUT_REPAIR_ROUNDS = 2

/**
 * How deep the containment check descends from the page root.
 *
 * A real page nests Page → Frame → Section → Card → Text, so the overflow that
 * users actually see ("text runs out of its section") lives at level 3–4. A
 * depth of 2 only ever described the frame and section levels and never ran the
 * layout checks on the card or text that spilled — the check passed while the
 * design was broken. Depth 4 reaches the text level; the result is parsed
 * locally (never re-sent to the model), so the extra traversal costs no tokens.
 */
export const CRITIC_DESCRIBE_DEPTH = 4

/**
 * Blocking layout messages, used as a fallback when a described node does not
 * carry severity. The inspector classifies every issue; `error` is the set
 * that means the output is broken — containment escape, sibling overlap, a
 * collapsed or unpainted element, unreadable text, an undersized touch
 * target, nested text. Warnings (crowding, grow conflicts, grid nits) and info
 * (naming, radius suggestions) never interrupt a run.
 */
const LAYOUT_ERROR_PATTERN =
  /overflow|children total|on cross axis|is \d+px wide|overlaps .* in |collapses to|opacity 0|no fill and no stroke|has no color|dark on dark/i

const INSPECT_TOOL_NAME = 'describe'

interface DescribeIssue {
  message?: unknown
  severity?: unknown
}

interface DescribedNode {
  id?: unknown
  name?: unknown
  issues?: DescribeIssue[]
  children?: DescribedNode[]
}

function describeTargetName(node: DescribedNode): string {
  if (typeof node.name === 'string') return node.name
  if (typeof node.id === 'string') return node.id
  return 'node'
}

function isBlockingIssue(issue: DescribeIssue): boolean {
  if (issue.severity === 'error') return true
  const message = typeof issue.message === 'string' ? issue.message : null
  return message !== null && LAYOUT_ERROR_PATTERN.test(message)
}

function collectLayoutIssues(node: DescribedNode, found: string[]): void {
  for (const issue of node.issues ?? []) {
    if (!isBlockingIssue(issue)) continue
    const message = typeof issue.message === 'string' ? issue.message : null
    if (!message) continue
    const name = describeTargetName(node)
    found.push(`${name}: ${message}`)
  }
  for (const child of node.children ?? []) collectLayoutIssues(child, found)
}

/**
 * Blocking layout issues on the current page, or an empty list when the page
 * cannot be inspected. Runs the real `describe` ToolDef so the model and the
 * guard see exactly the same verdicts.
 */
export function collectPageLayoutErrors(figma: FigmaAPI): string[] {
  const inspector: ToolDef | undefined = CORE_TOOLS.find((tool) => tool.name === INSPECT_TOOL_NAME)
  if (!inspector) return []
  let result: unknown
  try {
    result = inspector.execute(figma, { id: figma.currentPageId, depth: CRITIC_DESCRIBE_DEPTH })
  } catch {
    // A crashing inspector must never take the tool run down with it.
    return []
  }
  if (!result || typeof result !== 'object') return []
  const found: string[] = []
  collectLayoutIssues(result as DescribedNode, found)
  return found
}

function buildRepairInstruction(errors: readonly string[], round: number): string {
  const listed = errors.slice(0, 12).map((error) => `- ${error}`)
  if (errors.length > 12) listed.push(`- …and ${errors.length - 12} more`)

  // The second round is the last chance before the reply, so it is framed as
  // the final containment review rather than another mid-build fix.
  const opening =
    round <= 1
      ? 'Automatic layout check failed — an element escaped the area that owns it, overlaps a sibling, or collapsed to nothing. Fix these in place before replying (localized repair; do not rebuild the page):'
      : 'Final layout review before you reply — these elements still overflow their area, overlap a sibling, or collapsed. Fix every one now; after this check there is no further repair round:'

  return [
    opening,
    ...listed,
    'Each fix belongs to the element named: give wrapping text w="fill" (never a fixed w), let a content column grow or size it "hug", add overflow="hidden" where content is intentionally clipped, remove absolute x/y positioning that overlaps a sibling (put both in a flex="col"/"row" parent instead), and give a collapsed element a real size or delete it. Re-run describe and only reply once none of these remain.'
  ].join('\n')
}

export interface LayoutCriticReport {
  /** A layout-mutating tool ran during this run. */
  mutated: boolean
  /** Last overflow errors recorded for the run. */
  errors: string[]
  repairRoundsUsed: number
  lastRepair: string | null
}

/** Per-run layout state; the tool loop owns exactly one and resets it per message. */
export interface LayoutCritic {
  noteMutation(): void
  /** Consumes the next allowed repair round; null when nothing overflows or the budget is spent. */
  takeRepair(errors: readonly string[]): string | null
  report(): LayoutCriticReport
  reset(): void
}

export function createLayoutCritic(): LayoutCritic {
  let mutated = false
  let errors: string[] = []
  let repairRoundsUsed = 0
  let lastRepair: string | null = null

  return {
    noteMutation: () => {
      mutated = true
    },
    takeRepair: (current) => {
      if (!mutated || current.length === 0) return null
      if (repairRoundsUsed >= MAX_LAYOUT_REPAIR_ROUNDS) return null
      repairRoundsUsed += 1
      errors = [...current]
      lastRepair = buildRepairInstruction(errors, repairRoundsUsed)
      return lastRepair
    },
    report: () => ({ mutated, errors, repairRoundsUsed, lastRepair }),
    reset: () => {
      mutated = false
      errors = []
      repairRoundsUsed = 0
      lastRepair = null
    }
  }
}
