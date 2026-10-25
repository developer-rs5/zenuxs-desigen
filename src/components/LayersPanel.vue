<script setup lang="ts">
import { SplitterGroup, SplitterPanel, SplitterResizeHandle } from 'reka-ui'
import { tv } from 'tailwind-variants'
import { templateRef } from '@vueuse/core'
import { watch } from 'vue'

import { useI18n } from '@open-pencil/vue'
import { useEditorStore } from '@/app/editor/active-store'
import { useDocumentNameRename } from '@/app/shell/menu/document-name'
import Tip from '@/components/ui/overlay/Tip.vue'
import splitterTheme from '@/theme/splitter'

import AssetsPanel from './assets-panel/AssetsPanel.vue'
import LayerTree from './LayerTree/LayerTree.vue'
import PagesPanel from './PagesPanel.vue'

const props = withDefaults(
  defineProps<{
    activeTab?: 'file' | 'assets'
  }>(),
  {
    activeTab: 'file'
  }
)

const emit = defineEmits<{
  collapse: []
}>()

const store = useEditorStore()
const { panels } = useI18n()
const { rename, editingName, startRename, commitRename } = useDocumentNameRename(store)
const nameInput = templateRef<HTMLInputElement>('nameInput')
const splitterStyles = tv(splitterTheme)({ direction: 'vertical' })

watch(nameInput, (input) => {
  if (input) void rename.focusInput(input)
})
</script>

<template>
  <aside
    data-test-id="layers-panel"
    class="flex min-w-0 flex-1 flex-col overflow-hidden border-r border-[#444444] bg-[#2C2C2C] text-white"
    style="contain: paint layout style"
  >
    <!-- Header: Document Name + Drafts + Collapse (FigCraft layers.rs lines 145-165) -->
    <div class="flex h-14 shrink-0 items-center justify-between border-b border-[#444444] px-4">
      <div class="flex min-w-0 flex-1 flex-col justify-center">
        <input
          v-if="editingName"
          ref="nameInput"
          data-slot="document-title"
          class="min-w-0 rounded border border-[#02DA96] bg-[#1E1E1E] px-1.5 py-0.5 text-[13px] font-semibold text-white outline-none"
          :value="store.state.documentName"
          @blur="commitRename($event)"
          @keydown="rename.onKeydown"
        />
        <Tip v-else label="Double click to rename file">
          <span
            data-slot="document-title"
            class="min-w-0 truncate text-[13px] font-semibold text-white cursor-pointer hover:underline"
            @dblclick="startRename"
          >
            {{ store.state.documentName || 'Untitled' }}
          </span>
        </Tip>
        <span class="text-[11px] text-[#B3B3B3]">Drafts</span>
      </div>

      <Tip label="Collapse panel">
        <button
          type="button"
          class="flex size-6 items-center justify-center rounded text-[#B3B3B3] transition-colors hover:bg-[#383838] hover:text-white"
          data-test-id="collapse-left-panel"
          @click="emit('collapse')"
        >
          <icon-lucide-panel-left-close class="size-4" />
        </button>
      </Tip>
    </div>

    <!-- Panel Content: Assets View or Pages + Layers Splitter -->
    <AssetsPanel v-if="activeTab === 'assets'" />
    <SplitterGroup
      v-else
      direction="vertical"
      auto-save-id="layers-layout"
      class="flex-1 overflow-hidden"
    >
      <SplitterPanel
        :default-size="30"
        :min-size="10"
        :max-size="60"
        class="flex flex-col overflow-hidden"
      >
        <PagesPanel />
      </SplitterPanel>
      <SplitterResizeHandle :class="splitterStyles.handle()">
        <div :class="splitterStyles.divider()" />
      </SplitterResizeHandle>
      <SplitterPanel :default-size="70" :min-size="20" class="flex flex-col overflow-hidden">
        <header
          data-test-id="layers-header"
          class="flex shrink-0 items-center justify-between border-b border-[#444444] px-3 py-2 bg-[#2C2C2C]"
        >
          <span class="text-[11px] font-semibold text-white">{{ panels.layers }}</span>
          <div class="flex items-center gap-1">
            <button
              class="flex size-5 items-center justify-center rounded text-[#B3B3B3] transition-colors hover:bg-[#383838] hover:text-white"
            >
              <icon-lucide-search class="size-3" />
            </button>
          </div>
        </header>
        <LayerTree data-test-id="layers-tree" />
      </SplitterPanel>
    </SplitterGroup>
  </aside>
</template>
