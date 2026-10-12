import {
  analyzeAttachedImages,
  designMessageWithImageFindings
} from '@/app/ai/attachment/image/analyze'
import type { prepareImageAttachment } from '@/app/ai/attachment/image/prepare'
import { preparedImagePresentations } from '@/app/ai/attachment/image/presentation'
import type { snapshotNode } from '@/app/ai/attachment/node/snapshot'
import { setMessageAttachments } from '@/app/ai/attachment/presentation/store'
import type { ChatSubmission } from '@/app/ai/chat/submission/types'
import type { EditorStore } from '@/app/editor/active-store'

import type { ChatInstance } from './use'

interface VisionSendContext {
  currentChat: ChatInstance
  submission: ChatSubmission
  messageId: string
  preparedImages: Awaited<ReturnType<typeof prepareImageAttachment>>[]
  nodeAttachments: ReturnType<typeof snapshotNode>[]
  version: number
  getEditor: () => EditorStore
  /** True when a newer submission superseded this one mid-flight. */
  isStale: (version: number) => boolean
}

/** Runs image analysis for a submission, falling back to a text-only send. */
export async function sendWithVisionAnalysis(context: VisionSendContext): Promise<void> {
  const { currentChat, submission, messageId, preparedImages, nodeAttachments, version } = context
  try {
    const findings = await analyzeAttachedImages(
      context.getEditor(),
      submission.modelText,
      preparedImages
    )
    if (context.isStale(version)) return

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
    await currentChat.sendMessage({ messageId, text: submission.modelText }).catch(() => undefined)
  }
}
