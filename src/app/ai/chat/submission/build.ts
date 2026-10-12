import type { RoutingContext } from '@open-pencil/core/skills'
import { buildSkillContext, routeSkills } from '@open-pencil/core/skills'

import type { ImageAttachmentDraft } from '@/app/ai/attachment/image/types'
import { appendReferencedNodeContext, type ReferencedNode } from '@/app/ai/chat/context'
import type { ChatSubmission } from '@/app/ai/chat/submission/types'
import { recordSkillRoute } from '@/app/ai/skills/route-log'

export interface TextSubmissionOptions {
  images?: ImageAttachmentDraft[]
  nodes?: ReferencedNode[]
  /**
   * Selection facts for routing (spec §61). Defaults to the attached nodes —
   * the selection context that actually rides on the message.
   */
  context?: RoutingContext
}

function routingContext(
  nodes: readonly ReferencedNode[],
  override?: RoutingContext
): RoutingContext {
  if (override) return override
  return {
    hasSelection: nodes.length > 0,
    selectedNodeTypes: nodes.map((node) => node.type)
  }
}

/**
 * One builder for text submissions (spec §9): skill routing runs for every
 * natural-language entry point — composer, suggestion chips, empty-state
 * prompts — so slash commands and plain text always go through the same
 * resolver. The skill block (knowledge, validation, defaults,
 * operations, examples, plus any unknown-command note) rides on `modelText`;
 * `displayText` stays what was typed.
 */
export function buildTextSubmission(text: string, options?: TextSubmissionOptions): ChatSubmission {
  const nodes = options?.nodes ?? []
  const images = options?.images ?? []
  const route = routeSkills(text, routingContext(nodes, options?.context))
  recordSkillRoute(route)
  if (typeof document !== 'undefined') {
    // Safe metadata only — skill ids, never content or credentials (spec §64).
    document.documentElement.dataset.activeSkills = route.ordered.join(',')
  }
  return {
    modelText: `${appendReferencedNodeContext(text, nodes)}${buildSkillContext(route)}`,
    displayText: text,
    images,
    nodes,
    notice:
      route.unknownCommand === null
        ? undefined
        : { command: route.unknownCommand, suggestions: route.suggestions }
  }
}
