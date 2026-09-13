<script setup lang="ts">
import { SplitterGroup, SplitterPanel, SplitterResizeHandle } from 'reka-ui'
import { tv } from 'tailwind-variants'
import { computed, ref } from 'vue'

import { useI18n } from '@open-pencil/vue'

import SegmentedControl from '@/components/ui/select/SegmentedControl.vue'
import splitterTheme from '@/theme/splitter'

import AssetsPanel from './assets-panel/AssetsPanel.vue'
import LayerTree from './LayerTree/LayerTree.vue'
import PagesPanel from './PagesPanel.vue'

const { menu, panels } = useI18n()
const activePanel = ref<'file' | 'assets'>('file')
const panelModel = computed({
  get: () => activePanel.value,
  set: (value: string) => {
    if (value === 'file' || value === 'assets') activePanel.value = value
  }
})
const panelOptions = computed(() => [
  { value: 'file', label: menu.value.file },
  { value: 'assets', label: panels.value.assets }
])
const panelTabsUI = { root: 'w-full' }
const splitterStyles = tv(splitterTheme)({ direction: 'vertical' })
</script>

<template>
  <aside
    data-test-id="layers-panel"
    class="flex min-w-0 flex-1 flex-col overflow-hidden border-r border-border bg-panel"
    style="contain: paint layout style"
  >
    <!-- Tabs: Pages / Assets -->
    <div class="shrink-0 border-b border-border px-2 py-2">
      <SegmentedControl
        v-model="panelModel"
        :options="panelOptions"
        :label="panels.layers"
        :ui="panelTabsUI"
      >
        <template #option="{ option }">
          <span
            :data-test-id="
              option.value === 'file' ? 'left-panel-layers-tab' : 'left-panel-assets-tab'
            "
            class="truncate"
          >
            {{ option.label }}
          </span>
        </template>
      </SegmentedControl>
    </div>
    <AssetsPanel v-if="activePanel === 'assets'" />
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
          class="flex shrink-0 items-center justify-between px-3 py-2"
        >
          <span class="text-[11px] font-semibold text-surface">{{ panels.layers }}</span>
          <div class="flex items-center gap-0.5">
            <button class="flex size-5 items-center justify-center rounded text-muted transition-colors hover:bg-hover hover:text-surface">
              <icon-lucide-search class="size-3" />
            </button>
            <button class="flex size-5 items-center justify-center rounded text-muted transition-colors hover:bg-hover hover:text-surface">
              <icon-lucide-plus class="size-3" />
            </button>
          </div>
        </header>
        <LayerTree data-test-id="layers-tree" />
      </SplitterPanel>
    </SplitterGroup>

    <!-- Shortcuts card -->
    <div class="shrink-0 border-t border-border p-3">
      <div class="flex items-center gap-2.5">
        <div class="flex size-7 items-center justify-center rounded-md bg-panel-field text-muted">
          <icon-lucide-keyboard class="size-3.5" />
        </div>
        <div class="min-w-0 flex-1">
          <div class="text-[11px] font-medium text-surface">Shortcuts</div>
          <div class="text-[10px] text-muted">Press ? to view all shortcuts</div>
        </div>
      </div>
    </div>
  </aside>
</template>
