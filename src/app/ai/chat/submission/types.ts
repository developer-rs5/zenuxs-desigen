import type { ImageAttachmentDraft } from '@/app/ai/attachment/image/types'
import type { ReferencedNode } from '@/app/ai/chat/context'

export interface ChatSubmission {
  modelText: string
  displayText: string
  images: ImageAttachmentDraft[]
  nodes: ReferencedNode[]
}

export type ImageSupportReason = 'agent-transport' | 'no-vision-capability'

/** How the active Design model can consume attached images. */
export type ImageSupport =
  | { kind: 'direct' }
  | { kind: 'vision-model' }
  | { kind: 'unsupported'; reason: ImageSupportReason }
