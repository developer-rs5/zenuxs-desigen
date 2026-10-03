<script setup lang="ts">
import { useTextareaAutosize } from '@vueuse/core'
import { computed, nextTick, ref, watch } from 'vue'

import { ACP_AGENTS } from '@open-pencil/core/constants'
import { useSelectionState } from '@open-pencil/vue'

import { MAX_IMAGE_ATTACHMENTS } from '@/app/ai/attachment/image/types'
import type { ChatSubmission } from '@/app/ai/chat/submission/types'
import { useAIChat } from '@/app/ai/chat/use'
import { designModelProfile, resolveAIModelRole } from '@/app/ai/models'
import { openSettingsDialog } from '@/app/settings/dialog'
import ChatNodePreview from '@/components/chat/ChatNodePreview.vue'
import ChatProfileSelect from '@/components/chat/ChatProfileSelect.vue'
import ChatSkillsPopover from '@/components/chat/ChatSkillsPopover.vue'
import { useAttachmentDrafts } from '@/components/chat/input/useAttachments'

const { providerID, providerDef, modelID, customModelID, chatInputDraft } = useAIChat()
const { editor, selectedIds } = useSelectionState()

const { status, disabled = false } = defineProps<{
  status: 'ready' | 'submitted' | 'streaming' | 'error'
  disabled?: boolean
}>()

const emit = defineEmits<{
  submit: [submission: ChatSubmission]
  stop: []
  error: [message: string]
}>()

const attachments = useAttachmentDrafts({
  editor,
  selectedIds,
  reportError: (message) => emit('error', message)
})
const {
  images,
  nodes: referencedNodes,
  canToggleSelection: canAddSelection,
  selectionActive: selectionContextActive,
  openImageDialog,
  removeImage,
  removeNode: removeReferencedNode,
  toggleSelection: toggleCurrentSelection,
  takeSubmission
} = attachments

const textarea = ref<HTMLTextAreaElement>()
const input = ref('')
const { triggerResize } = useTextareaAutosize({ element: textarea, input, maxHeight: 120 })

watch(chatInputDraft, (draft) => {
  if (draft) {
    input.value = draft
    triggerResize()
    chatInputDraft.value = ''
    void nextTick(() => {
      textarea.value?.focus()
      textarea.value?.setSelectionRange(input.value.length, input.value.length)
    })
  }
})

const isStreaming = computed(() => disabled || status === 'streaming' || status === 'submitted')
const isAgentProvider = computed(
  () => providerID.value.startsWith('acp:') || providerID.value === 'harness:pi'
)
const agentName = computed(() => {
  if (providerID.value === 'harness:pi') return 'Pi'
  const agentId = providerID.value.replace('acp:', '')
  return ACP_AGENTS.find((a) => a.id === agentId)?.name ?? agentId
})
const isCustomProvider = computed(
  () => providerID.value === 'openai-compatible' || providerID.value === 'anthropic-compatible'
)
const customModelName = computed(() => customModelID.value.trim())
const usesCustomModel = computed(
  () => !!providerDef.value.supportsCustomModel && !!customModelName.value
)

const selectedModelName = computed(() => {
  if (usesCustomModel.value) return customModelName.value
  if (isCustomProvider.value) return 'No model'
  return providerDef.value.models.find((m) => m.id === modelID.value)?.name ?? modelID.value
})

const selectedProfileName = computed(
  () => designModelProfile.value?.name ?? selectedModelName.value
)

const hasVisionModel = computed(() => resolveAIModelRole('vision') !== null)

function handleInputKeydown(event: KeyboardEvent) {
  if (event.code !== 'Enter' || event.shiftKey || event.isComposing) return
  event.preventDefault()
  const target = event.currentTarget
  if (target instanceof HTMLElement) target.closest('form')?.requestSubmit()
}

function handleSubmit(event: Event) {
  event.preventDefault()
  if (isStreaming.value) return
  const text = input.value.trim()
  if (!text) return
  const snapshot = takeSubmission(text)
  emit('submit', {
    ...snapshot,
    restore: () => {
      attachments.restoreSubmission(snapshot)
      input.value = text
      triggerResize()
    }
  })
  input.value = ''
  triggerResize()
}
</script>

<template>
  <div class="flex flex-col gap-2.5">
    <!-- Label -->
    <p class="text-[11px] text-[#9CA3AF]">Describe what you want...</p>

    <!-- Attachments -->
    <div v-if="images.length || referencedNodes.length" class="flex flex-wrap gap-1.5">
      <div
        v-for="node in referencedNodes"
        :key="node.id"
        class="flex min-w-0 max-w-full items-center gap-2 rounded-lg border border-[#292D33] bg-[#1B1E22] p-1.5"
      >
        <ChatNodePreview :editor="editor" :node="node" />
        <span class="min-w-0 flex-1 truncate text-[10px] text-[#F5F7FA]">
          {{ node.name || node.type }}
        </span>
        <button
          class="flex size-4 items-center justify-center rounded text-[#9CA3AF] hover:text-[#F5F7FA]"
          @click="removeReferencedNode(node.id)"
        >
          <icon-lucide-x class="size-3" />
        </button>
      </div>
      <div
        v-for="(image, index) in images"
        :key="image.previewURL"
        class="flex min-w-0 max-w-full items-center gap-2 rounded-lg border border-[#292D33] bg-[#1B1E22] p-1.5"
      >
        <img
          :src="image.previewURL"
          :alt="image.file.name"
          class="size-8 shrink-0 rounded border border-[#292D33] object-cover"
        />
        <span class="min-w-0 flex-1 truncate text-[10px] text-[#F5F7FA]">{{
          image.file.name
        }}</span>
        <button
          class="flex size-4 items-center justify-center rounded text-[#9CA3AF] hover:text-[#F5F7FA]"
          @click="removeImage(index)"
        >
          <icon-lucide-x class="size-3" />
        </button>
      </div>
    </div>

    <!-- Input area -->
    <div
      class="flex flex-col rounded-xl border border-[#292D33] bg-[#1B1E22] transition-colors focus-within:border-[#3B82F6]/50"
    >
      <textarea
        ref="textarea"
        v-model="input"
        placeholder="Describe what you want..."
        :disabled="isStreaming"
        rows="1"
        class="min-h-[40px] w-full resize-none bg-transparent px-3 pt-2.5 pb-1 text-[13px] leading-relaxed text-[#F5F7FA] outline-none placeholder-[#6B7280] disabled:cursor-not-allowed disabled:opacity-60"
        @keydown="handleInputKeydown"
        @copy.stop
        @cut.stop
      />

      <!-- Bottom toolbar: model selector + actions -->
      <div class="flex items-center gap-1 px-2 pb-2">
        <!-- Model selector -->
        <template v-if="isAgentProvider">
          <div class="flex items-center gap-1 rounded-md px-2 py-1 text-[11px] text-[#9CA3AF]">
            <icon-lucide-bot class="size-3.5 shrink-0" />
            <span class="truncate">{{ agentName }}</span>
          </div>
        </template>
        <ChatProfileSelect v-else>
          <template #value>
            <span class="min-w-0 truncate">{{ selectedProfileName }}</span>
          </template>
        </ChatProfileSelect>

        <div class="flex-1" />

        <!-- Selection context -->
        <button
          :disabled="isStreaming || !canAddSelection"
          class="flex size-7 items-center justify-center rounded-md text-[#9CA3AF] transition-colors hover:bg-[#1E2126] hover:text-[#F5F7FA] disabled:opacity-40"
          :class="selectionContextActive ? 'text-[#3B82F6]' : ''"
          @click="toggleCurrentSelection"
        >
          <icon-lucide-mouse-pointer-2 class="size-4" />
        </button>

        <!-- Attach images -->
        <button
          :disabled="isStreaming || images.length >= MAX_IMAGE_ATTACHMENTS"
          class="flex size-7 items-center justify-center rounded-md text-[#9CA3AF] transition-colors hover:bg-[#1E2126] hover:text-[#F5F7FA] disabled:opacity-40"
          @click="openImageDialog()"
        >
          <icon-lucide-paperclip class="size-4" />
        </button>

        <!-- Skills -->
        <ChatSkillsPopover />

        <!-- Send / Stop -->
        <button
          v-if="isStreaming"
          class="flex size-7 items-center justify-center rounded-lg border border-[#292D33] text-[#9CA3AF] transition-colors hover:bg-[#1E2126] hover:text-[#F5F7FA]"
          @click="emit('stop')"
        >
          <icon-lucide-square class="size-3.5" />
        </button>
        <button
          v-else
          class="flex size-7 items-center justify-center rounded-lg bg-[#3B82F6] text-white transition-colors hover:bg-[#2563EB] disabled:opacity-40"
          :disabled="!input.trim()"
          @click="handleSubmit"
        >
          <icon-lucide-send class="size-3.5" />
        </button>
      </div>
    </div>

    <!-- Vision warning -->
    <div
      v-if="images.length > 0 && !hasVisionModel"
      class="flex items-center gap-2 rounded-lg border border-[#F59E0B]/30 bg-[#F59E0B]/10 px-3 py-2 text-[11px] text-[#FCD34D]"
    >
      <icon-lucide-alert-triangle class="size-3.5 shrink-0" />
      <span class="flex-1">No vision model configured — images won't be analyzed.</span>
      <button
        class="shrink-0 font-medium underline underline-offset-2 transition-colors hover:text-[#FDE68A]"
        @click="openSettingsDialog('ai')"
      >
        Settings
      </button>
    </div>
  </div>
</template>
