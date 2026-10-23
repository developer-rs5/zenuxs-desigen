/**
 * Model-backed routing decision.
 *
 * The model judges whether an image slot can be satisfied by a public image
 * library or has to be generated. User overrides never reach the model.
 */

import { valibotSchema } from '@ai-sdk/valibot'
import { Output, streamText } from 'ai'
import type { LanguageModel } from 'ai'
import * as v from 'valibot'

import type { RouteDecision, RouteDecider, VisualIntent } from '@open-pencil/core/tools'

import { buildReasoningProviderOptions } from '@/app/ai/chat/reasoning'
import { createAIModelRuntime } from '@/app/ai/models'
import type { ResolvedAIModelRole } from '@/app/ai/models/types'

/** Upper bound for the routing answer. */
const MAX_ROUTING_TOKENS = 400

/**
 * The answer shape, spelled out for the model.
 *
 * The provider may ignore the JSON schema, so the instruction is part of the
 * prompt as well: the answer is parsed and validated either way.
 */
const ROUTE_JSON_HINT =
  'Answer with a single JSON object and nothing else: {"route": "search" | "probe_then_generate" | "generate", "confidence": number between 0 and 1, "reason": string, "signals": string[]}.'

export const ROUTE_DECISION_SCHEMA = v.object({
  route: v.picklist(['search', 'probe_then_generate', 'generate']),
  confidence: v.pipe(v.number(), v.minValue(0), v.maxValue(1)),
  reason: v.string(),
  signals: v.array(v.string())
})

function routeOutput() {
  return Output.object({
    schema: valibotSchema(ROUTE_DECISION_SCHEMA),
    name: 'image_routing_decision',
    description: 'Whether the image should be searched for, probed once, or generated.'
  })
}

function buildRoutingPrompt(intent: VisualIntent): string {
  const lines = [
    'Decide how this image for a design should be obtained.',
    `Subject: ${intent.subject}${intent.action ? `, ${intent.action}` : ''}`,
    `Style: ${intent.style.replace(/_/g, ' ')}`,
    intent.palette ? `Palette: ${intent.palette}` : '',
    intent.orientation ? `Orientation: ${intent.orientation}` : '',
    intent.aspectRatio !== undefined ? `Aspect ratio: ${intent.aspectRatio.toFixed(2)}:1` : '',
    intent.placement ? `Placement: ${intent.placement}` : '',
    intent.requiresTransparency ? 'The image needs a transparent background' : '',
    intent.requiresNegativeSpace ? 'The image needs empty space reserved for text' : '',
    intent.textInImage ? 'The image must contain text' : '',
    intent.exclusions.length > 0 ? `Hard exclusions: ${intent.exclusions.join('; ')}` : '',
    intent.styleGroup ? 'Several images must share one consistent style' : '',
    '',
    'Answer with one of these routes:',
    '- search: a public image library very likely has a suitable image (common subjects, generic stock content).',
    '- probe_then_generate: it is uncertain, so try one cheap search round and generate if that fails.',
    '- generate: no public library will have it (brand-specific art, exact style and palette, mockups, text inside the image, fictional scenes, or a set of images that must share one style).',
    '',
    "Never choose generate for real people' likeness or for real brand logos and trademarks."
  ]
  return lines.filter((line) => line !== '').join('\n')
}

/**
 * Creates the routing decider.
 *
 * The cheap `fast` role is preferred; the `design` role is used when no fast
 * model is assigned. Returns null when neither can be used, in which case the
 * heuristic decides.
 */
export async function createRouteDecider(): Promise<RouteDecider | null> {
  let runtime: Awaited<ReturnType<typeof createAIModelRuntime>> = null
  try {
    runtime = await createAIModelRuntime('fast')
  } catch {
    runtime = null
  }
  if (runtime?.kind !== 'direct') {
    try {
      runtime = await createAIModelRuntime('design')
    } catch {
      return null
    }
    if (runtime?.kind !== 'direct') return null
  }

  return createRouteDeciderForModel(runtime.model, runtime.role)
}

/**
 * Builds the routing decider on top of a concrete model.
 *
 * A session and a live check run exactly the same routing code.
 */
export function createRouteDeciderForModel(
  model: LanguageModel,
  role: ResolvedAIModelRole
): RouteDecider {
  return {
    async decide(intent: VisualIntent): Promise<RouteDecision> {
      const result = streamText({
        model,
        maxOutputTokens: Math.min(role.profile.maxOutputTokens, MAX_ROUTING_TOKENS),
        providerOptions: buildReasoningProviderOptions(
          role.connection.providerID,
          role.profile.reasoningEffort ?? ''
        ),
        output: routeOutput(),
        messages: [{ role: 'user', content: `${buildRoutingPrompt(intent)}\n\n${ROUTE_JSON_HINT}` }]
      })
      // The decision is validated by the core router, so a missing or
      // malformed answer falls back to the heuristic there.
      return result.output
    }
  }
}
