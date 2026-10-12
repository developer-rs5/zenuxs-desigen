import type { Ref } from 'vue'

import { VisionModelUnavailableError } from '@/app/ai/attachment/image/analyze'
import { ImageAttachmentError } from '@/app/ai/attachment/image/prepare'
import { isAbortError } from '@/app/ai/chat/failure'
import type { ChatSubmission } from '@/app/ai/chat/submission/types'

export interface SubmissionErrorMessages {
  openSettings: string
  requestFailed: string
  visionUnavailable: string
  openProviderSettingsAction?: string
  agentImagesUnsupported?: string
  modelImagesUnsupported?: string
  unknownCommand?: (params: { command: string }) => string
  unknownCommandSuggestions?: (params: { command: string; suggestions: string }) => string
}

export interface SubmissionErrorReporter {
  messages: Ref<SubmissionErrorMessages>
  reportError: (message: string, action?: { label: string; run: () => void }) => void
  openModelSettings: () => void
}

/** Maps a failed submission to the composer error surface. */
export function reportSubmissionError(error: unknown, reporter: SubmissionErrorReporter): void {
  const { messages, reportError, openModelSettings } = reporter
  // A user stop is normal control flow, not an application failure.
  if (isAbortError(error)) return
  console.error('Chat error:', error)
  if (error instanceof ImageAttachmentError) {
    reportError(error.message)
    return
  }
  const errMessage = error instanceof Error ? error.message : String(error)
  const settingsAction = {
    label: messages.value.openProviderSettingsAction || messages.value.openSettings,
    run: openModelSettings
  }
  if (
    error instanceof VisionModelUnavailableError ||
    /vision|image input|credential/i.test(errMessage)
  ) {
    reportError(
      messages.value.visionUnavailable ||
        'Configure a Vision-capable model (GPT-4o, Claude 3.5, Gemini) and check API key in Settings.',
      settingsAction
    )
    return
  }
  if (/401|unauthorized|api.key|invalid_api_key|authentication/i.test(errMessage)) {
    reportError('Authentication failed. Check your API key in Settings.', settingsAction)
    return
  }
  reportError(
    messages.value.requestFailed ||
      'The model request failed. Check the provider settings and try again.',
    settingsAction
  )
}

/**
 * The unknown-command note already rides inside the skill block so the model
 * can correct course; this makes it visible to the designer too (spec §63).
 */
export function reportRoutingNotice(
  submission: ChatSubmission,
  reporter: SubmissionErrorReporter
): void {
  const notice = submission.notice
  if (!notice) return
  const suggestions = notice.suggestions.map((command) => `/${command}`).join(' or ')
  const translated =
    notice.suggestions.length > 0
      ? reporter.messages.value.unknownCommandSuggestions?.({
          command: notice.command,
          suggestions
        })
      : reporter.messages.value.unknownCommand?.({ command: notice.command })
  reporter.reportError(
    translated ??
      (notice.suggestions.length > 0
        ? `Unknown command "/${notice.command}". Did you mean ${suggestions}?`
        : `Unknown command "/${notice.command}".`)
  )
}
