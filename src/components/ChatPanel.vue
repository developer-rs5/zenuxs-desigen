<script setup lang="ts">
import type { Chat } from '@ai-sdk/vue'
import type { UIMessage } from 'ai'
import { computed, markRaw, onUnmounted, ref, shallowRef, watch } from 'vue'

import { useI18n } from '@open-pencil/vue'

import { chatBuilding } from '@/app/ai/chat/build-state'
import { hasMessageCheckpoint } from '@/app/ai/chat/history/checkpoints'
import { chatDocumentId } from '@/app/ai/chat/history/document'
import { revertUserMessage } from '@/app/ai/chat/history/revert'
import { buildTextSubmission } from '@/app/ai/chat/submission/build'
import { useChatSubmission } from '@/app/ai/chat/submission/use'
import { useAIChat } from '@/app/ai/chat/use'
import { copyChatLog } from '@/app/ai/debug'
import { didHitStepLimit } from '@/app/ai/tools'
import { getActiveEditorStore } from '@/app/editor/active-store'
import { useNotificationMessages } from '@/app/i18n/notifications'
import { openSettingsDialog } from '@/app/settings/dialog'
import { toast } from '@/app/shell/ui'
import { activeTab } from '@/app/tabs'
import ACPPermissionDialog from '@/components/chat/ACPPermissionDialog.vue'
import AiCopilotEmptyState from '@/components/chat/AiCopilotEmptyState.vue'
import ChatHistory from '@/components/chat/ChatHistory.vue'
import ChatInput from '@/components/chat/ChatInput.vue'
import ChatTranscript from '@/components/chat/ChatTranscript.vue'
import ProviderSetup from '@/components/chat/ProviderSetup.vue'

const {
  isConfigured,
  ensureChat,
  history,
  chatFailure,
  clearChatFailure,
  providerID,
  chatInputDraft
} = useAIChat()
const { ai } = useI18n()
const notifications = useNotificationMessages()

const chat = shallowRef<Chat<UIMessage> | null>(null)
const submission = useChatSubmission({
  chat,
  ensureChat,
  flush: history.flush,
  clearFailure: clearChatFailure,
  getEditor: getActiveEditorStore,
  providerID: () => providerID.value,
  messages: computed(() => ({
    openSettings: ai.value.openProviderSettingsAction,
    requestFailed: ai.value.chatRequestFailed,
    visionUnavailable: ai.value.visionModelUnavailable,
    agentImagesUnsupported: ai.value.chatAgentImagesUnsupported,
    modelImagesUnsupported: ai.value.chatModelImagesUnsupported,
    unknownCommand: ai.value.unknownCommand,
    unknownCommandSuggestions: ai.value.unknownCommandSuggestions
  })),
  reportError: toast.error,
  openModelSettings: () => openSettingsDialog('ai')
})

let viewGeneration = 0
const initialGeneration = ++viewGeneration
void ensureChat()
  .then((c) => {
    if (c && initialGeneration === viewGeneration) chat.value = markRaw(c)
    return undefined
  })
  .catch((error: unknown) => {
    toast.error(
      notifications.value.chatInitializationFailed({
        error: error instanceof Error ? error.message : String(error)
      })
    )
  })

const messages = computed(() => chat.value?.messages ?? history.messages.value)
const historyOptions = computed(() => {
  const current = history.current.value
  const rows = [...history.conversations.value]
  if (current && !rows.some((row) => row.id === current.id)) rows.unshift(current)
  return rows.map((conversation) => ({
    ...conversation,
    available: conversation.documentId === chatDocumentId(getActiveEditorStore())
  }))
})
const agentHistoryReadOnly = computed(
  () => !chat.value && messages.value.length > 0 && history.current.value?.backend !== 'direct'
)
async function historyAction(action: () => Promise<unknown>) {
  const generation = ++viewGeneration
  submission.cancel()
  try {
    await chat.value?.stop()
    await action()
    if (generation !== viewGeneration) return
    chat.value = null
    const next = await ensureChat()
    if (generation === viewGeneration) chat.value = next ? markRaw(next) : null
  } catch {
    toast.error(ai.value.chatHistoryFailed)
  }
}

async function renameConversation(id: string, title: string) {
  try {
    await history.rename(id, title)
  } catch {
    toast.error(ai.value.chatHistoryFailed)
  }
}

const failureMessage = computed(() => {
  switch (chatFailure.value?.reason) {
    case 'authentication':
      return ai.value.chatAuthenticationFailed
    case 'forbidden':
      return ai.value.chatForbidden
    case 'insufficient-credit':
      return ai.value.chatInsufficientCredit
    case 'model-not-found':
      return ai.value.chatModelNotFound
    case 'network':
      return ai.value.chatNetworkFailed
    case 'output-limit':
      return ai.value.chatOutputLimit
    case 'rate-limit':
      return ai.value.chatRateLimited
    case 'request-failed':
      return ai.value.chatRequestFailed
    default:
      return null
  }
})
const failureHasSettingsAction = computed(() =>
  ['authentication', 'forbidden', 'model-not-found', 'output-limit'].includes(
    chatFailure.value?.reason ?? ''
  )
)
const status = computed(() => chat.value?.status ?? 'ready')
// Signal the canvas overlay while AI is actively building.
watch(
  status,
  (value) => {
    chatBuilding.value = value === 'submitted' || value === 'streaming'
  },
  { immediate: true }
)
onUnmounted(() => {
  chatBuilding.value = false
})
const showContinue = computed(() => {
  if (history.readOnly.value || agentHistoryReadOnly.value) return false
  if (status.value !== 'ready') return false
  if (messages.value.length === 0) return false
  const last = messages.value[messages.value.length - 1]
  return last.role === 'assistant' && didHitStepLimit()
})

watch(
  () => chatFailure.value?.reason,
  (reason) => {
    if (!reason) return
    toast.error(
      failureMessage.value ?? ai.value.chatRequestFailed,
      failureHasSettingsAction.value
        ? {
            label: ai.value.openProviderSettingsAction,
            run: () => openSettingsDialog('ai')
          }
        : undefined
    )
  }
)
watch(
  () => [activeTab.value?.id, activeTab.value?.store.state.preparation] as const,
  async ([, preparation]) => {
    if (preparation) {
      viewGeneration++
      submission.cancel()
      return
    }
    const generation = ++viewGeneration
    submission.cancel()
    chat.value = null
    try {
      await history.initialize()
      if (generation !== viewGeneration) return
      const nextChat = await ensureChat()
      if (generation === viewGeneration) chat.value = nextChat ? markRaw(nextChat) : null
    } catch {
      if (generation === viewGeneration) toast.error(ai.value.chatHistoryFailed)
    }
  }
)

function handleStop() {
  submission.stop()
}

/**
 * Undo + edit share one revert: canvas changes from the message onward are
 * undone, the tail of the transcript is dropped, and the prompt returns to
 * the composer (focused by the draft watcher) for editing and resending.
 */
const revertableIds = computed(
  () =>
    new Set(
      (chat.value?.messages ?? [])
        .filter((message) => message.role === 'user' && hasMessageCheckpoint(message.id))
        .map((message) => message.id)
    )
)
const transcriptActionsDisabled = computed(
  () =>
    status.value !== 'ready' ||
    submission.busy.value ||
    history.busy.value ||
    agentHistoryReadOnly.value ||
    history.readOnly.value
)
async function handleRevertMessage(messageId: string) {
  const live = chat.value
  if (!live || status.value !== 'ready') return
  try {
    const reverted = await revertUserMessage(messageId, {
      chat: live,
      editor: getActiveEditorStore(),
      flush: history.flush,
      restoreDraft: (text) => {
        chatInputDraft.value = text
      }
    })
    if (!reverted) toast.error(ai.value.chatHistoryFailed)
  } catch {
    toast.error(ai.value.chatHistoryFailed)
  }
}

const diagnosticNotice = ref('')
async function copyDiagnostics(operation: () => Promise<void>) {
  diagnosticNotice.value = ''
  try {
    await operation()
    diagnosticNotice.value = ai.value.diagnosticCopied
  } catch {
    diagnosticNotice.value = ai.value.diagnosticCopyFailed
  }
}
async function handleCopyDebug() {
  await copyDiagnostics(() => copyChatLog(messages.value, chatFailure.value))
}
</script>

<template>
  <div data-test-id="chat-panel" class="flex min-h-0 flex-1 flex-col overflow-hidden select-text">
    <!-- ZONE 1: Fixed Header - Copilot info -->
    <div class="shrink-0 border-b border-[#292D33] px-3 py-3">
      <div class="flex items-center gap-2">
        <icon-lucide-sparkles class="size-4 text-[#3B82F6]" />
        <span class="text-[14px] font-semibold text-[#F5F7FA]">Zenux Ai</span>
      </div>
      <p class="mt-1 text-[11px] text-[#9CA3AF]">Your design partner, powered by AI.</p>
    </div>
    <ChatHistory
      :saved="history.conversations.value.some((row) => row.id === history.current.value?.id)"
      :debug="true"
      :conversations="historyOptions"
      :selected-id="history.current.value?.id"
      :disabled="history.busy.value"
      @create="historyAction(() => history.newChat())"
      @select="historyAction(() => history.open($event))"
      @rename="renameConversation"
      @delete="historyAction(() => history.remove($event))"
      @copy-debug="handleCopyDebug"
    />
    <p v-if="diagnosticNotice" role="status" class="px-3 py-2 text-xs text-muted">
      {{ diagnosticNotice }}
    </p>
    <p v-if="history.storageError.value" role="alert" class="px-3 py-2 text-xs text-red-400">
      {{ ai.chatStorageFailed }}
    </p>

    <!-- ZONE 2: Scrollable Content - Empty state or conversation -->
    <div class="flex min-h-0 flex-1 flex-col overflow-y-auto">
      <ProviderSetup v-if="!isConfigured" />

      <!-- AI Copilot empty state when no messages -->
      <AiCopilotEmptyState
        v-if="isConfigured && messages.length === 0"
        @submit="submission.submit(buildTextSubmission($event))"
      />

      <template v-if="(isConfigured && messages.length > 0) || messages.length">
        <p
          v-if="history.current.value?.interrupted && status === 'ready'"
          role="status"
          class="px-3 py-2 text-xs text-muted"
        >
          {{ ai.chatInterrupted }}
        </p>
        <ChatTranscript
          :messages="messages"
          :status="status"
          :show-continue="showContinue"
          :revertable-ids="revertableIds"
          :actions-disabled="transcriptActionsDisabled"
          @continue="
            submission.submit({
              modelText: 'Continue where you left off',
              displayText: 'Continue where you left off',
              images: [],
              nodes: []
            })
          "
          @undo="handleRevertMessage"
          @edit="handleRevertMessage"
        />

        <p v-if="agentHistoryReadOnly" role="status" class="px-3 py-2 text-xs text-muted">
          {{ ai.chatAgentReadOnly }}
        </p>
        <p v-if="history.readOnly.value" role="status" class="px-3 py-2 text-xs text-muted">
          {{ ai.chatReadOnly }}
        </p>
      </template>
    </div>

    <!-- ZONE 3: Fixed Composer - Input, model, skills, actions -->
    <div class="shrink-0 border-t border-[#292D33] p-3">
      <ChatInput
        v-if="isConfigured && !agentHistoryReadOnly && !history.readOnly.value"
        :status="status"
        :disabled="submission.busy.value || history.busy.value"
        @submit="submission.submit"
        @stop="handleStop"
        @error="toast.error"
      />
    </div>

    <ACPPermissionDialog />
  </div>
</template>
