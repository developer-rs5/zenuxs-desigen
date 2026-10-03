<script setup lang="ts">
import { templateRef } from '@vueuse/core'
import {
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuPortal,
  DropdownMenuRoot,
  DropdownMenuSeparator,
  DropdownMenuTrigger
} from 'reka-ui'
import { ref, watch } from 'vue'

import { useEditorCommands, useI18n } from '@open-pencil/vue'

import { currentUser } from '@/app/auth/zenuxs'
import { useEditorStore } from '@/app/editor/active-store'
import { openSettingsDialog } from '@/app/settings/dialog'
import { fetchRemoteSettings, pushRemoteSettings } from '@/app/settings/remote-sync'
import { useDocumentNameRename } from '@/app/shell/menu/document-name'
import { useAppTheme } from '@/app/shell/theme'
import { toast } from '@/app/shell/ui'
import CollabSharePopover from '@/components/CollabPanel/CollabSharePopover.vue'
import { provideCollabPanel } from '@/components/CollabPanel/context'
import Tip from '@/components/ui/overlay/Tip.vue'

provideCollabPanel()

const store = useEditorStore()
const { getCommand } = useEditorCommands()
const { rename, editingName, startRename, commitRename } = useDocumentNameRename(store)
const nameInput = templateRef<HTMLInputElement>('nameInput')
const { settings } = useI18n()
const { isLight, toggleTheme } = useAppTheme()

const syncing = ref(false)

watch(nameInput, (input) => {
  if (input) void rename.focusInput(input)
})

async function handleSync() {
  if (syncing.value) return
  syncing.value = true
  try {
    const sub = currentUser.value?.sub
    const push = await pushRemoteSettings(sub)
    const pull = await fetchRemoteSettings(sub)
    if (push === 'failed' || pull === 'failed') {
      toast.error('Sync failed — check your connection')
    } else if (push === 'skipped' && pull === 'skipped') {
      toast.error('Sign in to sync settings')
    } else {
      toast.info('All changes synced')
    }
  } finally {
    syncing.value = false
  }
}
</script>

<template>
  <div class="flex h-[48px] shrink-0 items-center border-b border-[#292D33] bg-[#17191C] px-4">
    <!-- Left: Logo + Brand + Beta -->
    <div class="flex items-center gap-2.5">
      <div
        class="flex size-7 items-center justify-center rounded-lg bg-[#3B82F6] text-[12px] font-bold text-white"
      >
        Z
      </div>
      <span class="text-[15px] font-semibold text-[#F5F7FA]">ZenuxsDesign</span>
      <span
        class="rounded-full bg-[#3B82F6]/15 px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wide text-[#3B82F6]"
      >
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
        data-slot="document-title"
        class="min-w-0 max-w-[160px] rounded border border-[#3B82F6] bg-[#151719] px-2 py-0.5 text-[13px] text-[#F5F7FA] outline-none"
        :value="store.state.documentName"
        @blur="commitRename($event)"
        @keydown="rename.onKeydown"
      />
      <span
        v-else
        data-slot="document-title"
        class="min-w-0 max-w-[160px] cursor-pointer truncate rounded px-2 py-0.5 text-[13px] text-[#F5F7FA] hover:bg-[#1E2126]"
        title="Double click to rename"
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

      <Tip label="Zoom to fit / Preview">
        <button
          class="flex size-8 items-center justify-center rounded-lg text-[#9CA3AF] transition-colors hover:bg-[#1E2126] hover:text-[#F5F7FA]"
          @click="getCommand('view.zoomFit').run()"
        >
          <icon-lucide-play class="size-[18px]" />
        </button>
      </Tip>

      <div class="mx-1 h-5 w-px bg-[#292D33]" />

      <CollabSharePopover />

      <DropdownMenuRoot>
        <DropdownMenuTrigger
          class="flex size-8 items-center justify-center rounded-lg text-[#9CA3AF] transition-colors hover:bg-[#1E2126] hover:text-[#F5F7FA]"
        >
          <icon-lucide-ellipsis class="size-[18px]" />
        </DropdownMenuTrigger>
        <DropdownMenuPortal>
          <DropdownMenuContent
            align="end"
            :side-offset="4"
            class="z-50 min-w-[180px] rounded-xl border border-[#292D33] bg-[#1B1E22] p-1 shadow-xl"
          >
            <DropdownMenuItem
              class="flex cursor-pointer items-center gap-2 rounded-lg px-2.5 py-1.5 text-[12px] text-[#F5F7FA] outline-none hover:bg-[#1E2126]"
              @click="openSettingsDialog()"
            >
              <icon-lucide-settings class="size-3.5 text-[#9CA3AF]" />
              Settings
            </DropdownMenuItem>
            <DropdownMenuItem
              class="flex cursor-pointer items-center gap-2 rounded-lg px-2.5 py-1.5 text-[12px] text-[#F5F7FA] outline-none hover:bg-[#1E2126]"
              @click="handleSync"
            >
              <icon-lucide-cloud class="size-3.5 text-[#9CA3AF]" />
              Sync now
            </DropdownMenuItem>
            <DropdownMenuSeparator class="my-1 h-px bg-[#292D33]" />
            <DropdownMenuItem
              class="flex cursor-pointer items-center gap-2 rounded-lg px-2.5 py-1.5 text-[12px] text-[#F5F7FA] outline-none hover:bg-[#1E2126]"
              @click="store.state.documentName && startRename()"
            >
              <icon-lucide-pencil class="size-3.5 text-[#9CA3AF]" />
              Rename document
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenuPortal>
      </DropdownMenuRoot>
    </div>
  </div>
</template>
