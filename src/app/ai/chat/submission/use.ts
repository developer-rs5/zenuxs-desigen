import type { Chat } from '@ai-sdk/vue'
import type { UIMessage } from 'ai'
import { computed, markRaw, ref, type Ref } from 'vue'

import {
  analyzeAttachedImages,
  designMessageWithImageFindings,
  VisionModelUnavailableError
} from '@/app/ai/attachment/image/analyze'
import {
  ImageAttachmentError,
  imageAttachmentErrorMessage,
  prepareImageAttachment,
  revokeImagePreviewURL
} from '@/app/ai/attachment/image/prepare'
import {
  imageDraftPresentations,
  preparedImagePresentations
} from '@/app/ai/attachment/image/presentation'
import { snapshotNode } from '@/app/ai/attachment/node/snapshot'
import { setMessageAttachments } from '@/app/ai/attachment/presentation/store'
import { isAbortError } from '@/app/ai/chat/failure'
import { setVisibleMessageText } from '@/app/ai/chat/presentation'
import {
  designModelCapabilities,
  resolveImageSupport
} from '@/app/ai/chat/submission/image-support'
import type { ChatSubmission, ImageSupport } from '@/app/ai/chat/submission/types'
import type { EditorStore } from '@/app/editor/active-store'

export type ChatInstance = Pick<Chat<UIMessage>, 'messages' | 'sendMessage' | 'stop'>

interface SubmissionMessages {
  openSettings: string
  requestFailed: string
  visionUnavailable: string
  openProviderSettingsAction?: string
  agentImagesUnsupported?: string
  modelImagesUnsupported?: string
}

interface SubmissionOptions {
  chat: Ref<Chat<UIMessage> | null>
  ensureChat: () => Promise<Chat<UIMessage> | null>
  flush?: () => Promise<void>
  clearFailure: () => void
  getEditor: () => EditorStore
  providerID: () => string
  /** Overridable so the routing decision can be exercised without configured credentials. */
  imageSupport?: () => ImageSupport
  messages: Ref<SubmissionMessages>
  reportError: (message: string, action?: { label: string; run: () => void }) => void
  openModelSettings: () => void
}

function blobToDataUri(data: Uint8Array, mediaType: string): string {
  let binary = ''
  for (let i = 0; i < data.length; i++) binary += String.fromCharCode(data[i])
  const b64 = btoa(binary)
  return `data:${mediaType};base64,${b64}`
}

export function useChatSubmission(options: SubmissionOptions) {
  const isPreparingAttachments = ref(false)
  let operationVersion = 0

  async function sendText(currentChat: ChatInstance, submission: ChatSubmission): Promise<void> {
    const previousIds = new Set(currentChat.messages.map((message) => message.id))
    await currentChat.sendMessage({ text: submission.modelText }).catch(() => undefined)
    const message = currentChat.messages.find(
      (candidate) => candidate.role === 'user' && !previousIds.has(candidate.id)
    )
    if (message) setVisibleMessageText(message.id, submission.displayText)
  }

  async function sendWithVisionAnalysis(
    currentChat: ChatInstance,
    submission: ChatSubmission,
    messageId: string,
    preparedImages: Awaited<ReturnType<typeof prepareImageAttachment>>[],
    nodeAttachments: ReturnType<typeof snapshotNode>[],
    version: number
  ): Promise<void> {
    const editor = options.getEditor()
    try {
      const findings = await analyzeAttachedImages(editor, submission.modelText, preparedImages)
      if (version !== operationVersion || options.chat.value !== currentChat) return

      const normalizedImages = preparedImagePresentations(
        messageId,
        submission.images,
        preparedImages
      )
      setMessageAttachments(messageId, [
        ...nodeAttachments.filter((attachment) => attachment !== null),
        ...normalizedImages
      ])
      await currentChat
        .sendMessage({
          messageId,
          text: designMessageWithImageFindings(
            submission.modelText,
            submission.images.map((image) => image.file.name),
            findings
          )
        })
        .catch(() => undefined)
    } catch {
      // Vision analysis failed — send a text-only message as last resort
      await currentChat
        .sendMessage({ messageId, text: submission.modelText })
        .catch(() => undefined)
    }
  }

  /**
   * Keeps a submission's prompt/drafts in the composer when nothing reached
   * the transcript yet; revokes previews only for callers without a restore hook.
   */
  function retainSubmission(submission: ChatSubmission): void {
    if (submission.restore) {
      submission.restore()
      return
    }
    for (const image of submission.images) revokeImagePreviewURL(image.previewURL)
  }

  async function sendAttachments(
    currentChat: ChatInstance,
    submission: ChatSubmission,
    version: number
  ): Promise<void> {
    const messageId = crypto.randomUUID()
    const editor = options.getEditor()

    const support =
      submission.images.length === 0
        ? ({ kind: 'direct' } as const)
        : options.imageSupport
          ? options.imageSupport()
          : resolveImageSupport(options.providerID(), designModelCapabilities())

    // Prepare before touching chat state so a failed preparation can leave the
    // composer exactly as the user left it.
    let preparedImages: Awaited<ReturnType<typeof prepareImageAttachment>>[] = []
    if (submission.images.length > 0 && support.kind !== 'unsupported') {
      try {
        preparedImages = await Promise.all(
          submission.images.map((image) => prepareImageAttachment(image.file))
        )
      } catch (error) {
        retainSubmission(submission)
        options.reportError(imageAttachmentErrorMessage(error))
        return
      }
      if (version !== operationVersion || options.chat.value !== currentChat) {
        retainSubmission(submission)
        return
      }
    }

    const nodeAttachments = submission.nodes
      .map((node) => snapshotNode(editor, messageId, node))
      .filter((attachment) => attachment !== null)
    currentChat.messages = [
      ...currentChat.messages,
      { id: messageId, role: 'user', parts: [{ type: 'text', text: submission.modelText }] }
    ]
    setVisibleMessageText(messageId, submission.displayText)
    const draftImages = imageDraftPresentations(messageId, submission.images)
    setMessageAttachments(messageId, [...nodeAttachments, ...draftImages])
    for (const image of submission.images) revokeImagePreviewURL(image.previewURL)

    if (submission.images.length === 0) {
      await currentChat
        .sendMessage({ messageId, text: submission.modelText })
        .catch(() => undefined)
      return
    }

    if (support.kind === 'unsupported') {
      options.reportError(
        support.reason === 'agent-transport'
          ? (options.messages.value.agentImagesUnsupported ??
              'This agent cannot read image attachments. Switch to a direct model to use reference images.')
          : (options.messages.value.modelImagesUnsupported ??
              'The selected Design model cannot read images. Assign a vision-capable model in Settings.')
      )
      await currentChat
        .sendMessage({ messageId, text: submission.modelText })
        .catch(() => undefined)
      return
    }

    if (support.kind === 'vision-model') {
      await sendWithVisionAnalysis(
        currentChat,
        submission,
        messageId,
        preparedImages,
        nodeAttachments,
        version
      )
      return
    }

    // Direct multimodal: the Design model receives the images as file parts.
    const imageFiles = preparedImages.map((image, index) => ({
      type: 'file' as const,
      mediaType: image.mediaType,
      filename: submission.images[index]?.file.name || `image-${index + 1}`,
      url: blobToDataUri(image.data, image.mediaType)
    }))

    await currentChat
      .sendMessage({
        messageId,
        text: submission.modelText,
        files: imageFiles
      })
      .catch(() => undefined)
  }

  function reportSubmissionError(error: unknown): void {
    // A user stop is normal control flow, not an application failure.
    if (isAbortError(error)) return
    console.error('Chat error:', error)
    if (error instanceof ImageAttachmentError) {
      options.reportError(error.message)
      return
    }
    const errMessage = error instanceof Error ? error.message : String(error)
    if (
      error instanceof VisionModelUnavailableError ||
      /vision|image input|credential/i.test(errMessage)
    ) {
      options.reportError(
        options.messages.value.visionUnavailable ||
          'Configure a Vision-capable model (GPT-4o, Claude 3.5, Gemini) and check API key in Settings.',
        {
          label:
            options.messages.value.openProviderSettingsAction ||
            options.messages.value.openSettings,
          run: options.openModelSettings
        }
      )
      return
    }
    if (/401|unauthorized|api.key|invalid_api_key|authentication/i.test(errMessage)) {
      options.reportError('Authentication failed. Check your API key in Settings.', {
        label:
          options.messages.value.openProviderSettingsAction || options.messages.value.openSettings,
        run: options.openModelSettings
      })
      return
    }
    options.reportError(
      options.messages.value.requestFailed ||
        'The model request failed. Check the provider settings and try again.',
      {
        label:
          options.messages.value.openProviderSettingsAction || options.messages.value.openSettings,
        run: options.openModelSettings
      }
    )
  }

  async function submit(submission: ChatSubmission): Promise<void> {
    const status = options.chat.value?.status ?? 'ready'
    if (status === 'streaming' || status === 'submitted' || isPreparingAttachments.value) {
      retainSubmission(submission)
      if (submission.images.length > 0) options.reportError(options.messages.value.requestFailed)
      return
    }

    const version = ++operationVersion
    isPreparingAttachments.value = submission.images.length > 0
    options.clearFailure()
    try {
      const currentChat = await options.ensureChat()
      if (currentChat && version === operationVersion) options.chat.value = markRaw(currentChat)
      if (!currentChat || version !== operationVersion) {
        retainSubmission(submission)
        if (submission.images.length > 0) options.reportError(options.messages.value.requestFailed)
        return
      }
      if (submission.images.length === 0 && submission.nodes.length === 0) {
        await sendText(currentChat, submission)
      } else {
        await sendAttachments(currentChat, submission, version)
      }
    } catch (error) {
      reportSubmissionError(error)
    } finally {
      await options.flush?.().catch(() => undefined)
      if (version === operationVersion) isPreparingAttachments.value = false
    }
  }

  function cancel(): void {
    operationVersion += 1
    isPreparingAttachments.value = false
  }

  const busy = computed(() => isPreparingAttachments.value)

  return {
    busy,
    cancel,
    stop: () => options.chat.value?.stop(),
    submit
  }
}
