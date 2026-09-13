<script setup lang="ts">
import { templateRef } from '@vueuse/core'
import { watch } from 'vue'

import { useI18n } from '@open-pencil/vue'

import { useEditorStore } from '@/app/editor/active-store'
import { openSettingsDialog } from '@/app/settings/dialog'
import { useDocumentNameRename } from '@/app/shell/menu/document-name'
import IconButton from '@/components/ui/button/IconButton.vue'
import Tip from '@/components/ui/overlay/Tip.vue'
import CollabAvatarStack from '@/components/CollabPanel/CollabAvatarStack.vue'
import CollabSharePopover from '@/components/CollabPanel/CollabSharePopover.vue'
import { provideCollabPanel } from '@/components/CollabPanel/context'

provideCollabPanel()

const store = useEditorStore()
const { rename, editingName, startRename, commitRename } = useDocumentNameRename(store)
const nameInput = templateRef<HTMLInputElement>('nameInput')
const { settings } = useI18n()

watch(nameInput, (input) => {
  if (input) void rename.focusInput(input)
})
</script>

<template>
  <div class="flex h-[44px] shrink-0 items-center border-b border-border bg-panel px-3">
    <!-- Left: Logo + Brand + Beta -->
    <div class="flex items-center gap-2.5">
      <div class="flex size-6 items-center justify-center rounded-md bg-accent text-[11px] font-bold text-white">
        Z
      </div>
      <span class="text-[14px] font-semibold text-surface">ZenuxsDesign</span>
      <span class="rounded-full bg-accent/15 px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wide text-accent">
        Beta
      </span>
    </div>

    <!-- Divider -->
    <div class="mx-3 h-5 w-px bg-border" />

    <!-- Center: Document name + save status -->
    <div class="flex items-center gap-2">
      <input
        v-if="editingName"
        ref="nameInput"
        class="min-w-0 max-w-[160px] rounded border border-accent bg-input px-2 py-0.5 text-[13px] text-surface outline-none"
        :value="store.state.documentName"
        @blur="commitRename($event)"
        @keydown="rename.onKeydown"
      />
      <span
        v-else
        class="min-w-0 max-w-[160px] cursor-default truncate rounded px-2 py-0.5 text-[13px] text-surface hover:bg-hover"
        @dblclick="startRename"
      >
        {{ store.state.documentName }}
      </span>
      <icon-lucide-chevron-down class="size-3.5 text-muted" />
      <div class="flex items-center gap-1.5 text-[11px] text-muted">
        <div class="size-1.5 rounded-full bg-success" />
        <span>All changes saved</span>
      </div>
    </div>

    <!-- Spacer -->
    <div class="flex-1" />

    <!-- Right: Actions -->
    <div class="flex items-center gap-1">
      <Tip label="Cloud sync">
        <button class="flex size-7 items-center justify-center rounded-md text-muted transition-colors hover:bg-hover hover:text-surface">
          <icon-lucide-cloud class="size-4" />
        </button>
      </Tip>

      <Tip :label="settings.title">
        <button
          class="flex size-7 items-center justify-center rounded-md text-muted transition-colors hover:bg-hover hover:text-surface"
          @click="openSettingsDialog()"
        >
          <icon-lucide-settings class="size-4" />
        </button>
      </Tip>

      <CollabAvatarStack />

      <CollabSharePopover />

      <Tip label="More options">
        <button class="flex size-7 items-center justify-center rounded-md text-muted transition-colors hover:bg-hover hover:text-surface">
          <icon-lucide-more-horizontal class="size-4" />
        </button>
      </Tip>
    </div>
  </div>
</template>
