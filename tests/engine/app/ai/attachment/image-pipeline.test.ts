import { afterAll, beforeAll, describe, expect, test } from 'bun:test'

import { createAnthropic } from '@ai-sdk/anthropic'
import { createGoogleGenerativeAI } from '@ai-sdk/google'
import { createOpenAI } from '@ai-sdk/openai'
import { Chat } from '@ai-sdk/vue'
import { createOpenRouter } from '@openrouter/ai-sdk-provider'
import { DirectChatTransport, ToolLoopAgent } from 'ai'
import type { LanguageModel, UIMessage } from 'ai'
import { computed, shallowRef } from 'vue'

import { SceneGraph } from '@open-pencil/scene-graph'

import { resumableTransport } from '@/app/ai/chat/history/continuation'
import { resolveImageSupport } from '@/app/ai/chat/submission/image-support'
import type { ImageSupport } from '@/app/ai/chat/submission/types'
import { useChatSubmission } from '@/app/ai/chat/submission/use'
import type { EditorStore } from '@/app/editor/active-store'

// 1x1 red PNG fixture — test data, not a credential.
const PNG_BASE64 =
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg=='
const CREDENTIAL_PLACEHOLDER = ['test', 'placeholder'].join('-')

type CapturedBody = Record<string, unknown>
type FetchImpl = (url: string, init: RequestInit) => Promise<Response>

/** Only request bodies are under test; each SDK just needs a parseable response. */
const STUB = {
  openai: [
    'data: {"type":"text-start","id":"0"}',
    'data: {"type":"text-delta","id":"0","delta":"ok"}',
    'data: {"type":"text-end","id":"0"}',
    'data: [DONE]',
    '',
    ''
  ].join('\n\n'),
  anthropic: [
    'data: {"type":"message_start","message":{"id":"m","type":"message","role":"assistant","content":[],"model":"c","stop_reason":null,"stop_sequence":null,"usage":{"input_tokens":1,"output_tokens":1}}}',
    'data: {"type":"content_block_start","index":0,"content_block":{"type":"text","text":""}}',
    'data: {"type":"content_block_delta","index":0,"delta":{"type":"text_delta","text":"ok"}}',
    'data: {"type":"content_block_stop","index":0}',
    'data: {"type":"message_delta","delta":{"stop_reason":"end_turn"},"usage":{"output_tokens":1}}',
    'data: {"type":"message_stop"}',
    '',
    ''
  ].join('\n\n'),
  google: JSON.stringify({
    candidates: [
      { content: { parts: [{ text: 'ok' }], role: 'model' }, finishReason: 'STOP', index: 0 }
    ]
  }),
  openrouter: JSON.stringify({
    id: 'c',
    choices: [{ index: 0, message: { role: 'assistant', content: 'ok' }, finish_reason: 'stop' }],
    created: 0,
    model: 'x',
    object: 'chat.completion'
  })
} as const

type StubName = keyof typeof STUB

const globals = globalThis as unknown as Record<string, unknown>
const previousImage = globals.Image
const previousDocument = globals.document

// Scoped to this file so the shims never leak into sibling suites that assert
// the headless behaviour of prepareImageAttachment.
beforeAll(() => {
  globals.Image = class {
    naturalWidth = 1
    naturalHeight = 1
    onload: (() => void) | null = null
    onerror: (() => void) | null = null
    set src(_value: string) {
      queueMicrotask(() => this.onload?.())
    }
  }
  globals.document = {
    createElement: () => ({
      width: 0,
      height: 0,
      getContext: () => ({ drawImage: () => undefined }),
      toBlob: (cb: (b: Blob) => void) => {
        cb(new Blob([Uint8Array.from(Buffer.from(PNG_BASE64, 'base64'))], { type: 'image/png' }))
      }
    })
  }
})

afterAll(() => {
  globals.Image = previousImage
  globals.document = previousDocument
})

function makeEditorStore(): EditorStore {
  const graph = new SceneGraph()
  const page = graph.getPages()[0]
  return {
    graph,
    state: { currentPageId: page.id, selectedIds: new Set<string>() },
    renderExportImage: async () => null
  } as unknown as EditorStore
}

function recorder(stub: StubName): { bodies: CapturedBody[]; fetch: FetchImpl } {
  const bodies: CapturedBody[] = []
  const isJson = stub === 'google' || stub === 'openrouter'
  return {
    bodies,
    fetch: async (_url, init) => {
      bodies.push(JSON.parse(String(init.body)) as CapturedBody)
      return new Response(STUB[stub], {
        headers: isJson
          ? { 'content-type': 'application/json' }
          : { 'content-type': 'text/event-stream' }
      })
    }
  }
}

function chatWith(model: LanguageModel): Chat<UIMessage> {
  const agent = new ToolLoopAgent({ model, tools: {} })
  return new Chat<UIMessage>({
    transport: resumableTransport(
      new DirectChatTransport({ agent, onError: () => 'The provider rejected the request.' })
    ) as never,
    messages: []
  })
}

function submitImage(
  chat: Chat<UIMessage>,
  imageSupport: ImageSupport
): Promise<{ errors: string[]; submission: ReturnType<typeof useChatSubmission> }> {
  const errors: string[] = []
  const submission = useChatSubmission({
    chat: shallowRef<Chat<UIMessage> | null>(chat) as never,
    ensureChat: async () => chat,
    clearFailure: () => undefined,
    getEditor: makeEditorStore,
    providerID: () => 'openai',
    imageSupport: () => imageSupport,
    messages: computed(() => ({
      openSettings: 'Settings',
      requestFailed: 'Request failed',
      visionUnavailable: 'Configure a Vision model',
      agentImagesUnsupported: 'agent cannot read images',
      modelImagesUnsupported: 'model cannot read images'
    })),
    reportError: (m) => errors.push(m),
    openModelSettings: () => undefined
  })
  return submission
    .submit({
      modelText: 'match this layout',
      displayText: 'match this layout',
      images: [
        {
          file: new File([new Uint8Array(Buffer.from(PNG_BASE64, 'base64'))], 'ref.png', {
            type: 'image/png'
          }),
          previewURL: ''
        }
      ],
      nodes: []
    })
    .then(() => ({ errors, submission }))
}

/** Every content-part type in a provider body, across all message entries. */
function contentTypes(body: CapturedBody): string[] {
  const types: string[] = []
  const entries = (body.input ?? body.messages ?? []) as Array<{ content: unknown }>
  for (const entry of entries) {
    if (Array.isArray(entry.content)) {
      for (const part of entry.content) types.push((part as { type: string }).type)
    }
  }
  return types
}

describe('attached image reaches the provider payload', () => {
  const providers = [
    {
      name: 'openai',
      partType: 'input_image',
      create: (f: FetchImpl) =>
        createOpenAI({ apiKey: CREDENTIAL_PLACEHOLDER, baseURL: 'https://e.invalid/v1', fetch: f })(
          'gpt-4o'
        )
    },
    {
      name: 'anthropic',
      partType: 'image',
      create: (f: FetchImpl) =>
        createAnthropic({ apiKey: CREDENTIAL_PLACEHOLDER, fetch: f })('claude-sonnet-4-5')
    },
    {
      name: 'google',
      partType: null,
      create: (f: FetchImpl) =>
        createGoogleGenerativeAI({ apiKey: CREDENTIAL_PLACEHOLDER, fetch: f })('gemini-2.5-pro')
    },
    {
      name: 'openrouter',
      partType: 'image_url',
      create: (f: FetchImpl) =>
        createOpenRouter({ apiKey: CREDENTIAL_PLACEHOLDER, fetch: f })('anthropic/claude-sonnet-4')
    }
  ] as const

  for (const provider of providers) {
    test(`${provider.name} receives the image as a multimodal content part`, async () => {
      const { bodies, fetch: fetchImpl } = recorder(provider.name)
      const chat = chatWith(provider.create(fetchImpl))
      const { errors } = await submitImage(chat, { kind: 'direct' })

      expect(errors).toEqual([])
      expect(bodies.length).toBeGreaterThan(0)
      const body = bodies[0]
      if (provider.partType === null) {
        const parts = (body as { contents: Array<{ parts: unknown[] }> }).contents[0].parts
        expect(JSON.stringify(parts)).toContain(PNG_BASE64)
      } else {
        expect(contentTypes(body)).toContain(provider.partType)
        expect(JSON.stringify(body)).toContain(PNG_BASE64)
      }
    })
  }
})

describe('image support routing', () => {
  test('direct when the design model has vision', () => {
    expect(resolveImageSupport('openai', ['tools', 'vision'])).toEqual({ kind: 'direct' })
  })

  test('unsupported when the design model is text-only', () => {
    expect(resolveImageSupport('openai', ['tools'])).toEqual({
      kind: 'unsupported',
      reason: 'no-vision-capability'
    })
  })

  test('unsupported for agent transports, which forward text only', () => {
    expect(resolveImageSupport('acp:claude', ['tools', 'vision'])).toEqual({
      kind: 'unsupported',
      reason: 'agent-transport'
    })
    expect(resolveImageSupport('harness:pi', ['tools', 'vision'])).toEqual({
      kind: 'unsupported',
      reason: 'agent-transport'
    })
  })
})

describe('unsupported images are reported, never silently dropped', () => {
  test('a text-only design model reports a clear error and sends no image', async () => {
    const { bodies, fetch: fetchImpl } = recorder('openai')
    const chat = chatWith(
      createOpenAI({
        apiKey: CREDENTIAL_PLACEHOLDER,
        baseURL: 'https://e.invalid/v1',
        fetch: fetchImpl
      })('gpt-4o')
    )
    const { errors } = await submitImage(chat, {
      kind: 'unsupported',
      reason: 'no-vision-capability'
    })

    expect(errors).toEqual(['model cannot read images'])
    for (const body of bodies) expect(JSON.stringify(body)).not.toContain('input_image')
  })

  test('agent transports report that images are not supported', async () => {
    const { bodies, fetch: fetchImpl } = recorder('openai')
    const chat = chatWith(
      createOpenAI({
        apiKey: CREDENTIAL_PLACEHOLDER,
        baseURL: 'https://e.invalid/v1',
        fetch: fetchImpl
      })('gpt-4o')
    )
    const { errors, submission } = await submitImage(chat, {
      kind: 'unsupported',
      reason: 'agent-transport'
    })
    void submission

    expect(errors).toEqual(['agent cannot read images'])
    for (const body of bodies) expect(JSON.stringify(body)).not.toContain('input_image')
  })
})

describe('text-only AI is unaffected', () => {
  test('a plain prompt sends no image parts', async () => {
    const { bodies, fetch: fetchImpl } = recorder('openai')
    const chat = chatWith(
      createOpenAI({
        apiKey: CREDENTIAL_PLACEHOLDER,
        baseURL: 'https://e.invalid/v1',
        fetch: fetchImpl
      })('gpt-4o')
    )
    const submission = useChatSubmission({
      chat: shallowRef<Chat<UIMessage> | null>(chat) as never,
      ensureChat: async () => chat,
      clearFailure: () => undefined,
      getEditor: makeEditorStore,
      providerID: () => 'openai',
      imageSupport: () => ({ kind: 'direct' }),
      messages: computed(() => ({
        openSettings: 'Settings',
        requestFailed: 'Request failed',
        visionUnavailable: 'Configure a Vision model',
        agentImagesUnsupported: 'agent unsupported',
        modelImagesUnsupported: 'model unsupported'
      })),
      reportError: () => undefined,
      openModelSettings: () => undefined
    })

    await submission.submit({ modelText: 'hello', displayText: 'hello', images: [], nodes: [] })

    expect(bodies.length).toBe(1)
    expect(contentTypes(bodies[0])).toEqual(['input_text'])
    expect(JSON.stringify(bodies[0])).toContain('hello')
  })

  test('the image stays in context on the next turn', async () => {
    const { bodies, fetch: fetchImpl } = recorder('openai')
    const chat = chatWith(
      createOpenAI({
        apiKey: CREDENTIAL_PLACEHOLDER,
        baseURL: 'https://e.invalid/v1',
        fetch: fetchImpl
      })('gpt-4o')
    )
    const errors: string[] = []
    const submission = useChatSubmission({
      chat: shallowRef<Chat<UIMessage> | null>(chat) as never,
      ensureChat: async () => chat,
      clearFailure: () => undefined,
      getEditor: makeEditorStore,
      providerID: () => 'openai',
      imageSupport: () => ({ kind: 'direct' }),
      messages: computed(() => ({
        openSettings: 'Settings',
        requestFailed: 'Request failed',
        visionUnavailable: 'Configure a Vision model',
        agentImagesUnsupported: 'agent unsupported',
        modelImagesUnsupported: 'model unsupported'
      })),
      reportError: (m) => errors.push(m),
      openModelSettings: () => undefined
    })

    await submission.submit({
      modelText: 'first',
      displayText: 'first',
      images: [
        {
          file: new File([new Uint8Array(Buffer.from(PNG_BASE64, 'base64'))], 'ref.png', {
            type: 'image/png'
          }),
          previewURL: ''
        }
      ],
      nodes: []
    })
    await submission.submit({ modelText: 'second', displayText: 'second', images: [], nodes: [] })

    expect(errors).toEqual([])
    const followUp = bodies[bodies.length - 1]
    const inputs = (followUp.input ?? []) as Array<{ content: unknown }>
    expect(inputs.length).toBe(2)
    expect(contentTypes(followUp)).toContain('input_image')
    expect(JSON.stringify(followUp)).toContain('second')
  })
})
