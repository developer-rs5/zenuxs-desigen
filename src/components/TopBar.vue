<script setup lang="ts">
import { templateRef } from '@vueuse/core'
import { watch } from 'vue'

import { useI18n } from '@open-pencil/vue'

import { useEditorStore } from '@/app/editor/active-store'
import { openSettingsDialog } from '@/app/settings/dialog'
import { useDocumentNameRename } from '@/app/shell/menu/document-name'
import { useAppTheme } from '@/app/shell/theme'
import Tip from '@/components/ui/overlay/Tip.vue'
import CollabSharePopover from '@/components/CollabPanel/CollabSharePopover.vue'
import { provideCollabPanel } from '@/components/CollabPanel/context'

provideCollabPanel()

const store = useEditorStore()
const { rename, editingName, startRename, commitRename } = useDocumentNameRename(store)
const nameInput = templateRef<HTMLInputElement>('nameInput')
const { settings } = useI18n()
const { isLight, toggleTheme } = useAppTheme()

watch(nameInput, (input) => {
  if (input) void rename.focusInput(input)
})
</script>

<template>
  <div class="flex h-[48px] shrink-0 items-center border-b border-[#292D33] bg-[#17191C] px-4">
    <!-- Left: Logo + Brand + Beta -->
    <div class="flex items-center gap-2.5">
      <div class="flex size-7 items-center justify-center rounded-lg bg-[#3B82F6] text-[12px] font-bold text-white">
        Z
      </div>
      <span class="text-[15px] font-semibold text-[#F5F7FA]">ZenuxsDesign</span>
      <span class="rounded-full bg-[#3B82F6]/15 px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wide text-[#3B82F6]">
        BETA
      </span>
    </div>

    <!-- Divider -->
    <div class="mx-4 h-5 w-px bg-[#292D33]" />

    <!-- Center: Document name + save status -->
    <div class="flex items-center gap-2">
      <input
        v-if="editingName"
        ref="nameInput"
        class="min-w-0 max-w-[160px] rounded border border-[#3B82F6] bg-[#151719] px-2 py-0.5 text-[13px] text-[#F5F7FA] outline-none"
        :value="store.state.documentName"
        @blur="commitRename($event)"
        @keydown="rename.onKeydown"
      />
      <span
        v-else
        class="min-w-0 max-w-[160px] cursor-default truncate rounded px-2 py-0.5 text-[13px] text-[#F5F7FA] hover:bg-[#1E2126]"
        @dblclick="startRename"
      >
        {{ store.state.documentName }}
      </span>
      <icon-lucide-chevron-down class="size-3.5 text-[#9CA3AF]" />
      <div class="flex items-center gap-1.5 text-[11px] text-[#9CA3AF]">
        <div class="size-1.5 rounded-full bg-[#4ADE80]" />
        <span>All changes saved</span>
      </div>
    </div>

    <!-- Spacer -->
    <div class="flex-1" />

    <!-- Right: Actions -->
    <div class="flex items-center gap-1">
      <Tip label="Cloud sync">
        <button class="flex size-8 items-center justify-center rounded-lg text-[#9CA3AF] transition-colors hover:bg-[#1E2126] hover:text-[#F5F7FA]">
          <icon-lucide-cloud class="size-[18px]" />
        </button>
      </Tip>

      <Tip :label="settings.title">
        <button
          class="flex size-8 items-center justify-center rounded-lg text-[#9CA3AF] transition-colors hover:bg-[#1E2126] hover:text-[#F5F7FA]"
          @click="openSettingsDialog()"
        >
          <icon-lucide-settings class="size-[18px]" />
        </button>
      </Tip>

      <Tip :label="isLight ? 'Switch to dark mode' : 'Switch to light mode'">
        <button
          class="flex size-8 items-center justify-center rounded-lg text-[#9CA3AF] transition-colors hover:bg-[#1E2126] hover:text-[#F5F7FA]"
          @click="toggleTheme"
        >
          <icon-lucide-moon v-if="!isLight" class="size-[18px]" />
          <icon-lucide-sun v-else class="size-[18px]" />
        </button>
      </Tip>

      <Tip label="Preview">
        <button class="flex size-8 items-center justify-center rounded-lg text-[#9CA3AF] transition-colors hover:bg-[#1E2126] hover:text-[#F5F7FA]">
          <icon-lucide-play class="size-[18px]" />
        </button>
      </Tip>

      <div class="mx-1 h-5 w-px bg-[#292D33]" />

      <CollabSharePopover />

      <Tip label="More options">
        <button class="flex size-8 items-center justify-center rounded-lg text-[#9CA3AF] transition-colors hover:bg-[#1E2126] hover:text-[#F5F7FA]">
          <icon-lucide-ellipsis class="size-[18px]" />
        </button>
      </Tip>

      <div class="ml-1 flex size-8 items-center justify-center rounded-full bg-[#3B82F6] text-[12px] font-semibold text-white">
        Y
      </div>
    </div>
  </div>
</template>
