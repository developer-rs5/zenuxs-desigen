import { Chat } from '@ai-sdk/vue'
import { DirectChatTransport, stepCountIs, ToolLoopAgent } from 'ai'
import type { ChatTransport, FinishReason, LanguageModel, ModelMessage, UIMessage } from 'ai'
import type { ComputedRef, Ref } from 'vue'
import { ref } from 'vue'

import { ACP_AGENTS } from '@open-pencil/core/constants'
import type { ACPAgentID, AIProviderID } from '@open-pencil/core/constants'

import { nextDesignVariationDirective } from '@/app/ai/chat/design-variation'
import {
  classifyAIChatError,
  classifyAIChatFinish,
  hasVisibleAssistantOutput,
  isAbortError,
  type AIChatFailure
} from '@/app/ai/chat/failure'
import { resolveLanguageModelID } from '@/app/ai/chat/model'
import { repairMessage } from '@/app/ai/chat/prototype-critic'
import { buildReasoningProviderOptions, type AIProviderOptions } from '@/app/ai/chat/reasoning'
import SYSTEM_PROMPT from '@/app/ai/chat/system-prompt.md?raw'
import { createAIModelRuntime, resolveModelConnectionAPIKey } from '@/app/ai/models'
import type { ImageGenerationReason } from '@/app/ai/models/image'
import { getActiveSkillsPrompt } from '@/app/ai/skills'
import {
  MAX_AGENT_STEPS,
  createAITools,
  imageGenerationUnavailableReason,
  isImageSourcingAvailable,
  recordStep,
  resetRunSteps,
  takeLayoutRepair,
  takeMediaRepair,
  takePrototypeRepair
} from '@/app/ai/tools'
import {
  recordChatCompleted,
  recordChatFailed,
  recordModelStepCompleted
} from '@/app/diagnostics/events'
import type { getActiveEditorStore } from '@/app/editor/active-store'

import { resumableTransport } from './history/continuation'

type EditorStore = ReturnType<typeof getActiveEditorStore>

type ChatSessionOptions = {
  isConfigured: ComputedRef<boolean>
  isACPProvider: ComputedRef<boolean>
  isHarnessProvider: ComputedRef<boolean>
  providerID: Ref<AIProviderID>
  credentialsReady: Promise<void>
  getActiveEditorStore: () => EditorStore
}

export type ToolLoopTransportOptions = {
  store: EditorStore
  providerID: AIProviderID
  model: LanguageModel
  effectiveModelID: string
  maxOutputTokens: number
  reasoningEffort: string
  onError?: (error: unknown) => void
}

const ANTHROPIC_CACHE_CONTROL = {
  anthropic: { cacheControl: { type: 'ephemeral' } }
} as const

function supportsAnthropicCaching(providerID: AIProviderID, modelID: string): boolean {
  return (
    providerID === 'anthropic' ||
    providerID === 'anthropic-compatible' ||
    (providerID === 'openrouter' && modelID.startsWith('anthropic/'))
  )
}

function mergeProviderOptions(
  cacheOptions: typeof ANTHROPIC_CACHE_CONTROL | undefined,
  reasoningOptions: AIProviderOptions | undefined
): AIProviderOptions | undefined {
  if (!cacheOptions && !reasoningOptions) return undefined
  return { ...cacheOptions, ...reasoningOptions }
}

export async function createACPTransport(providerID: AIProviderID) {
  const agentId = providerID.replace('acp:', '') as ACPAgentID
  const agentDef = ACP_AGENTS.find((a) => a.id === agentId)
  if (!agentDef) throw new Error(`Unknown ACP agent: ${agentId}`)

  const { ACPChatTransport } = await import('@/app/ai/acp/transport')
  const { homeDir } = await import('@tauri-apps/api/path')
  return new ACPChatTransport({ agentDef, cwd: await homeDir() })
}

/**
 * The image-generation section of the system prompt, delimited by markers so a
 * session without `generate_image` can drop it instead of teaching the model a
 * tool that is not in its schema.
 */
const IMAGE_GENERATION_SECTION =
  /<!-- image-generation:start -->[\s\S]*?<!-- image-generation:end -->\n*/

/** The stock photo section, replaced by the sourcing section when it is active. */
const STOCK_PHOTO_SECTION = /<!-- stock-photo:start -->[\s\S]*?<!-- stock-photo:end -->\n*/

/** The sourcing section, only present when a Vision model is configured. */
const IMAGE_SOURCING_SECTION = /<!-- image-sourcing:start -->[\s\S]*?<!-- image-sourcing:end -->\n*/

/** The vector-first guidance, which stays in every session. */
const VECTOR_FIRST_SECTION = /<!-- vector-first:start -->([\s\S]*?)<!-- vector-first:end -->\n*/

/** The Polish-phase image step, rewritten to name the tool the session actually has. */
const IMAGE_SLOT_TOOL_SECTION =
  /<!-- image-slot-tool:start -->[\s\S]*?<!-- image-slot-tool:end -->\n*/

/**
 * Guidance that stays even when image generation is unavailable. Vector-first
 * is not conditional on having a bitmap tool — dropping it would tell a
 * key-less session to do the opposite of what it should.
 */
const VECTOR_ONLY_GUIDANCE = `# Image Sources — vector only

You cannot generate raster images in this session. Build vector geometry instead: \`create_vector\`, \`create_shape\`, \`import_svg\`, or an icon from the library via \`<Icon name="lucide:heart" />\` / \`search_icons\` / \`insert_icon\`.

Vector output is resolution-independent, recolorable, editable as real nodes, and survives \`.fig\` export. Check your work with \`describe\` (or \`export_image\` when appearance is the question) and confirm it reads correctly at the target size. If you cannot make it read correctly, leave the placeholder color as-is and tell the user why — never fake it with \`eval\` gradients or hand-drawn polygons.`

/**
 * Builds the system instructions for a session.
 *
 * When `generate_image` is not in the tool set the section is replaced with
 * vector-only guidance. Leaving the image section in place would invite the
 * model to promise something it cannot do.
 */
function imageUnavailableReason(reason: ImageGenerationReason): string {
  if (reason === 'no-api-key') return 'The Design model has no API key saved'
  if (reason === 'provider-unsupported') {
    return 'The active Design model provider cannot generate images'
  }
  return 'No Design model is configured'
}

function assembleInstructions(skillsPrompt: string): string {
  return buildSystemInstructions({
    skillsPrompt,
    imageSourcingAvailable: isImageSourcingAvailable(),
    imageGenerationReason: imageGenerationUnavailableReason()
  })
}

export interface SystemInstructionOptions {
  skillsPrompt: string
  imageSourcingAvailable: boolean
  imageGenerationReason: ImageGenerationReason | null
}

/**
 * Assembles the instructions for one session. Pure and exported so the prompt
 * contract — which tools the model is allowed to hear about, and which skills
 * are injected — is testable without starting a chat.
 */
export function buildSystemInstructions({
  skillsPrompt,
  imageSourcingAvailable,
  imageGenerationReason
}: SystemInstructionOptions): string {
  const unavailable = imageGenerationReason
  let base = SYSTEM_PROMPT
  if (imageSourcingAvailable) {
    // The sourcing tool verifies every image, so the unverified image tools
    // are not part of this session and must not be advertised. The vector-first
    // guidance stays, because it is not conditional on a bitmap tool.
    const vectorFirst = base.match(VECTOR_FIRST_SECTION)?.[1] ?? ''
    base = base
      .replace(STOCK_PHOTO_SECTION, '\n')
      .replace(IMAGE_GENERATION_SECTION, `\n${vectorFirst}\n`)
    // Phase 4 told the model to call `stock_photo`, which this session does
    // not have. Name the tool that actually exists.
    base = base.replace(
      IMAGE_SLOT_TOOL_SECTION,
      '1. `source_image` — batch EVERY named image placeholder in one call; a gray block you created stays unfinished until it is filled\n'
    )
  } else {
    base = base.replace(IMAGE_SOURCING_SECTION, '\n')
    if (unavailable) {
      base = base.replace(IMAGE_GENERATION_SECTION, '\n')
      const reason = imageUnavailableReason(unavailable)
      base = `${base}\n> Image generation unavailable: ${reason}.\n\n${VECTOR_ONLY_GUIDANCE}\n`
      base = base.replace(
        IMAGE_SLOT_TOOL_SECTION,
        '1. `stock_photo` — batch every named image placeholder in one call (image generation is unavailable in this session)\n'
      )
    } else {
      base = base.replace(
        IMAGE_SLOT_TOOL_SECTION,
        '1. `generate_image` or `stock_photo` — batch EVERY named image placeholder in one call of the tool that fits the slot\n'
      )
    }
  }
  return skillsPrompt ? `${base}\n\n${skillsPrompt}` : base
}

/**
 * The last user text in a call, used to decide whether this run is a design
 * request at all. Handles both call shapes (`messages` and `prompt`).
 */
function lastUserMessageText(input: {
  messages?: ModelMessage[]
  prompt?: string | ModelMessage[]
}): string {
  const messages =
    input.messages ??
    (typeof input.prompt === 'string'
      ? [{ role: 'user' as const, content: input.prompt }]
      : (input.prompt ?? []))

  for (let index = messages.length - 1; index >= 0; index -= 1) {
    const message = messages[index]
    if (message.role !== 'user') continue
    if (typeof message.content === 'string') return message.content
    return message.content
      .filter((part): part is { type: 'text'; text: string } => part.type === 'text')
      .map((part) => part.text)
      .join('\n')
  }
  return ''
}

export async function createToolLoopTransport({
  store,
  providerID,
  model,
  effectiveModelID,
  maxOutputTokens,
  reasoningEffort,
  onError
}: ToolLoopTransportOptions) {
  const tools = await createAITools(store)
  const cacheProviderOptions = supportsAnthropicCaching(providerID, effectiveModelID)
    ? ANTHROPIC_CACHE_CONTROL
    : undefined
  const providerOptions = mergeProviderOptions(
    cacheProviderOptions,
    buildReasoningProviderOptions(providerID, reasoningEffort)
  )

  const skillsPrompt = getActiveSkillsPrompt()
  const instructions = assembleInstructions(skillsPrompt)

  const agent = new ToolLoopAgent({
    model,
    instructions,
    tools,
    stopWhen: stepCountIs(MAX_AGENT_STEPS),
    maxOutputTokens,
    providerOptions,
    prepareCall: (options) => {
      resetRunSteps(store)
      // Variation is assigned per run, not per session: two requests in one
      // conversation must not inherit one direction.
      const variation = nextDesignVariationDirective(lastUserMessageText(options))
      return {
        ...options,
        instructions: variation ? `${instructions}\n\n${variation}` : instructions,
        maxOutputTokens,
        providerOptions
      }
    },
    onStepFinish: ({ usage }) => {
      recordStep(store)
      recordModelStepCompleted({
        provider: providerID,
        model: effectiveModelID,
        inputTokens: usage.inputTokens ?? null,
        outputTokens: usage.outputTokens ?? null,
        cacheReadTokens: usage.inputTokenDetails.cacheReadTokens ?? null,
        cacheWriteTokens: usage.inputTokenDetails.cacheWriteTokens ?? null
      })
    },
    // Code-enforced repair round (audit §4.6): if a prototype mutation
    // validated false, the failing errors ride on the next model step. The
    // critic spends a bounded budget per run, so this can never loop.
    // Layout containment works the same way: after a write, anything that
    // escaped its area is fed back before the model replies — the second
    // layout round is the final review, so a last-minute overflow still gets
    // corrected rather than shipped. Image slots do too — a placeholder the
    // run created but never filled is unfinished work, not a design choice.
    prepareStep: ({ messages }) => {
      const repair = takePrototypeRepair(store) ?? takeLayoutRepair(store) ?? takeMediaRepair(store)
      return repair === null ? undefined : { messages: [...messages, repairMessage(repair)] }
    }
  })

  return resumableTransport(
    new DirectChatTransport({
      agent,
      // This return value becomes the tool chip's errorText and any stream
      // error chunk, so it must name the actual failure — an invalid tool call
      // or local tool exception is not a provider rejection.
      onError: (error) => {
        onError?.(error)
        return error instanceof Error ? error.message : String(error)
      }
    }) as ChatTransport<UIMessage>
  )
}

export function createChatSessionManager({
  isConfigured,
  isACPProvider,
  isHarnessProvider,
  providerID,
  credentialsReady,
  getActiveEditorStore
}: ChatSessionOptions) {
  const failure = ref<AIChatFailure | null>(null)
  let transportDirty = false
  let currentChatStore: EditorStore | null = null
  const currentChatMessages = new WeakMap<EditorStore, UIMessage[]>()
  let chat: Chat<UIMessage> | null = null
  let acpTransportInstance: { destroy(): Promise<void> } | null = null
  let harnessTransportInstance: { stop(): Promise<void> } | null = null
  let overrideTransport: (() => ChatTransport<UIMessage>) | null = null
  let activeProviderError: unknown = null

  function captureProviderError(error: unknown): void {
    activeProviderError ??= error
  }

  function handleChatFinish({
    message,
    finishReason,
    isAbort,
    isDisconnect,
    isError
  }: {
    message: UIMessage
    finishReason?: FinishReason
    isAbort: boolean
    isDisconnect: boolean
    isError: boolean
  }): void {
    if (isAbort || isDisconnect || isError) return
    recordChatCompleted({ finishReason: finishReason ?? null })
    // An exhausted output budget (finishReason 'length') is the real cause even
    // though the stream succeeded; report it before the empty-output fallback
    // so users are not told to check provider settings for a token-limit stop.
    const finishFailure = classifyAIChatFinish(finishReason)
    if (finishFailure) {
      failure.value = finishFailure
      return
    }
    // A successful stream can still carry no renderable output (empty content,
    // safety-filter truncation). Fail loudly instead of ending with no reply.
    if (!hasVisibleAssistantOutput(message)) {
      failure.value = {
        reason: 'request-failed',
        detail: 'The model returned an empty response.'
      }
    }
  }

  function clearFailure(): void {
    activeProviderError = null
    failure.value = null
  }

  function markTransportDirty() {
    transportDirty = true
  }

  async function destroyAgentTransports(): Promise<void> {
    const acp = acpTransportInstance
    const harness = harnessTransportInstance
    acpTransportInstance = null
    harnessTransportInstance = null
    const results = await Promise.allSettled([acp?.destroy(), harness?.stop()])
    const errors = results
      .filter((result) => result.status === 'rejected')
      .map((result) => result.reason)
    if (errors.length) throw new AggregateError(errors, 'Agent transport teardown failed')
  }

  async function createActiveACPTransport() {
    await destroyAgentTransports()
    const transport = await createACPTransport(providerID.value)
    acpTransportInstance = transport
    return transport as ChatTransport<UIMessage>
  }

  async function createActiveHarnessTransport(sessionId: string) {
    await destroyAgentTransports()
    const runtime = await createAIModelRuntime('design')
    if (runtime?.kind !== 'harness') throw new Error('The Design agent is not configured for Pi')
    const [{ HarnessChatTransport }, { buildPiMCPServers }] = await Promise.all([
      import('@/app/ai/harness/transport'),
      import('@/app/integrations/mcp')
    ])
    const apiKey = await resolveModelConnectionAPIKey(runtime.role.connection.id)
    if (!apiKey) throw new Error('Credential is unavailable for the Pi agent')
    const model = runtime.role.profile.customModelID || runtime.role.profile.modelID
    const skillsPrompt = getActiveSkillsPrompt()
    const transport = new HarnessChatTransport(
      sessionId,
      {
        adapter: 'pi',
        sandbox: 'just-bash',
        model,
        settings: {
          thinkingLevel: runtime.role.profile.harnessThinkingLevel ?? 'medium',
          permissionMode: runtime.role.profile.harnessPermissionMode ?? 'allow-edits'
        },
        instructions: skillsPrompt ? `${SYSTEM_PROMPT}\n\n${skillsPrompt}` : SYSTEM_PROMPT,
        mcpServers: await buildPiMCPServers()
      },
      { OPENPENCIL_HARNESS_API_KEY: apiKey }
    )
    harnessTransportInstance = transport
    return transport as ChatTransport<UIMessage>
  }

  async function createTransport(store: EditorStore) {
    if (overrideTransport) return overrideTransport()

    await destroyAgentTransports()

    const runtime = await createAIModelRuntime('design')
    if (runtime?.kind !== 'direct') {
      throw new Error('The Design model is not configured for direct API access')
    }
    return createToolLoopTransport({
      store,
      providerID: runtime.role.connection.providerID,
      model: runtime.model,
      effectiveModelID: resolveLanguageModelID({
        providerID: runtime.role.connection.providerID,
        modelID: runtime.role.profile.modelID,
        customModelID: runtime.role.profile.customModelID
      }),
      maxOutputTokens: runtime.role.profile.maxOutputTokens,
      reasoningEffort: runtime.role.profile.reasoningEffort ?? '',
      onError: captureProviderError
    })
  }

  async function ensureChat(
    initialMessages?: UIMessage[],
    sessionId = crypto.randomUUID()
  ): Promise<Chat<UIMessage> | null> {
    await credentialsReady
    if (!isConfigured.value) return null

    const store = getActiveEditorStore()
    if (currentChatStore && chat) {
      currentChatMessages.set(currentChatStore, chat.messages)
    }

    if (!chat || transportDirty || currentChatStore !== store) {
      const messages = initialMessages ?? currentChatMessages.get(store)
      let transport: ChatTransport<UIMessage>
      if (isACPProvider.value) transport = await createActiveACPTransport()
      else if (isHarnessProvider.value) transport = await createActiveHarnessTransport(sessionId)
      else transport = await createTransport(store)
      chat = new Chat<UIMessage>({
        transport,
        messages,
        onError: (error) => {
          const reportedError = activeProviderError ?? error
          activeProviderError = null
          // A user stop tears the stream down; it is control flow, not a failure.
          if (isAbortError(reportedError)) return
          failure.value = classifyAIChatError(reportedError)
          recordChatFailed({
            errorName: reportedError instanceof Error ? reportedError.name : 'unknown'
          })
        },
        onFinish: handleChatFinish
      })
      currentChatStore = store
      transportDirty = false
    }
    return chat
  }

  async function resetChat() {
    if (currentChatStore) currentChatMessages.delete(currentChatStore)
    await destroyAgentTransports()
    failure.value = null
    chat = null
    currentChatStore = null
    transportDirty = false
  }

  function setOverrideTransport(factory: (() => ChatTransport<UIMessage>) | null) {
    overrideTransport = factory
    markTransportDirty()
  }

  return { ensureChat, resetChat, markTransportDirty, setOverrideTransport, failure, clearFailure }
}
