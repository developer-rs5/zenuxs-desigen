/**
 * Vision inspector backed by the configured Vision model.
 *
 * The model receives the real pixels and answers with a validated JSON
 * verdict. A malformed or missing answer is a failed inspection, never an
 * approval.
 *
 * The verdict is requested as plain text instead of through the provider's
 * structured-output mode: OpenAI-compatible relays frequently ignore a JSON
 * response format, and a streamed object that fails schema parsing would reject
 * every candidate. Parsing the text ourselves keeps the validation just as
 * strict while working with providers that cannot do structured output.
 */

import { streamText } from 'ai'
import type { LanguageModel } from 'ai'
import * as v from 'valibot'

import type { VisionInspector, VisionVerdict } from '@open-pencil/core/tools'

import { buildReasoningProviderOptions } from '@/app/ai/chat/reasoning'
import { createAIModelRuntime } from '@/app/ai/models'
import type { ResolvedAIModelRole } from '@/app/ai/models/types'

/** Upper bound for the verdict, so a verbose model cannot blow the budget. */
const MAX_VERDICT_TOKENS = 800

/**
 * The answer shape, spelled out for the model.
 *
 * The provider may ignore the JSON schema, so the instruction is part of the
 * prompt as well: the answer is parsed and validated either way.
 */
const VERDICT_JSON_HINT =
  'Answer with a single JSON object and nothing else: {"approved": boolean, "relevanceScore": number between 0 and 1, "matchedRequirements": string[], "failedRequirements": string[], "reason": string}. Use the exact requirement ids listed above.'

/** The structured answer the vision model has to produce. */
export const VISION_VERDICT_SCHEMA = v.object({
  approved: v.boolean(),
  relevanceScore: v.pipe(v.number(), v.minValue(0), v.maxValue(1)),
  matchedRequirements: v.array(v.string()),
  failedRequirements: v.array(v.string()),
  reason: v.string()
})

export interface VisionInspectorOptions {
  /**
   * Whether the model can fetch a remote URL itself. When false the bytes are
   * downloaded first and inspected directly, which keeps the inspected bytes
   * identical to the imported bytes.
   */
  supportsURLInput?: boolean
}

/**
 * Reads the first complete JSON object out of a model answer.
 *
 * Models often wrap JSON in a code fence or add a sentence before it, so the
 * answer is scanned with string awareness instead of trusting `JSON.parse` on
 * the whole text.
 */
function extractJSONObject(text: string): string | null {
  const start = text.indexOf('{')
  if (start === -1) return null

  let depth = 0
  let inString = false
  let escaped = false

  for (let index = start; index < text.length; index++) {
    const char = text[index]
    if (inString) {
      if (escaped) escaped = false
      else if (char === '\\') escaped = true
      else if (char === '"') inString = false
      continue
    }
    if (char === '"') {
      inString = true
      continue
    }
    if (char === '{') depth += 1
    if (char === '}') {
      depth -= 1
      if (depth === 0) return text.slice(start, index + 1)
    }
  }
  return null
}

/**
 * Validates a raw answer against the verdict schema.
 *
 * Throwing here is deliberate: the verifier reports a failed inspection, so an
 * unusable answer can never be mistaken for an approval.
 */
export function parseVerdictText(text: string): VisionVerdict {
  const object = extractJSONObject(text)
  if (!object) {
    throw new Error('The vision model did not answer with a JSON verdict')
  }

  let parsed: unknown
  try {
    parsed = JSON.parse(object)
  } catch {
    throw new Error('The vision model answered with malformed JSON')
  }

  const result = v.safeParse(VISION_VERDICT_SCHEMA, parsed)
  if (!result.success) {
    throw new Error(`The vision verdict is incomplete: ${result.issues[0].message}`)
  }
  return result.output
}

/**
 * Creates the inspector for the active Vision model.
 *
 * Returns null when no usable Vision model is configured, which the caller
 * reports as `vision_unavailable_needs_user_selection`.
 */
export async function createVisionInspector(
  options: VisionInspectorOptions = {}
): Promise<VisionInspector | null> {
  let runtime: Awaited<ReturnType<typeof createAIModelRuntime>>
  try {
    runtime = await createAIModelRuntime('vision')
  } catch {
    return null
  }
  if (runtime?.kind !== 'direct') return null
  return createVisionInspectorForModel(runtime.model, runtime.role, options)
}

/**
 * Builds the inspector on top of a concrete model.
 *
 * The role supplies the token budget and the reasoning options, so a session
 * and a live check run exactly the same inspection code.
 */
export function createVisionInspectorForModel(
  model: LanguageModel,
  role: ResolvedAIModelRole,
  options: VisionInspectorOptions = {}
): VisionInspector {
  const supportsURLInput = options.supportsURLInput ?? false

  return {
    supportsURLInput,
    async inspect({ data, url, mediaType, prompt }): Promise<VisionVerdict> {
      if (!data && !url) {
        throw new Error('The image inspection needs either bytes or a URL')
      }
      const imagePart = url
        ? { type: 'file' as const, data: new URL(url), mediaType }
        : { type: 'file' as const, data: data as Uint8Array, mediaType }

      const result = streamText({
        model,
        maxOutputTokens: Math.min(role.profile.maxOutputTokens, MAX_VERDICT_TOKENS),
        providerOptions: buildReasoningProviderOptions(
          role.connection.providerID,
          role.profile.reasoningEffort ?? ''
        ),
        messages: [
          {
            role: 'user',
            content: [{ type: 'text', text: `${prompt}\n\n${VERDICT_JSON_HINT}` }, imagePart]
          }
        ]
      })

      // Providers that always stream would fail a non-streaming call, so the
      // verdict is read from the completed stream instead.
      return parseVerdictText(await result.text)
    }
  }
}
