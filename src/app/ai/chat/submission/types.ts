import type { ImageAttachmentDraft } from '@/app/ai/attachment/image/types'
import type { ReferencedNode } from '@/app/ai/chat/context'

export interface ChatSubmission {
  modelText: string
  displayText: string
  images: ImageAttachmentDraft[]
  nodes: ReferencedNode[]
  /**
   * Unrecognized leading `/command`, reported to the user after send. The
   * same note already rides in `modelText` so the model can correct course.
   */
  notice?: SkillCommandNotice
  /**
   * Puts the prompt and drafts back into the composer when the submission
   * fails before anything was sent. Optional so programmatic callers can omit it.
   */
  restore?: () => void
}

export interface SkillCommandNotice {
  command: string
  suggestions: string[]
}

export type ImageSupportReason = 'agent-transport' | 'no-vision-capability'

/** How the active Design model can consume attached images. */
export type ImageSupport =
  | { kind: 'direct' }
  | { kind: 'vision-model' }
  | { kind: 'unsupported'; reason: ImageSupportReason }
