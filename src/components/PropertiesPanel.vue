<script setup lang="ts">
import { computed } from 'vue'
import { TabsContent, TabsList, TabsRoot, TabsTrigger } from 'reka-ui'

import { useI18n } from '@open-pencil/vue'
import { currentUser } from '@/app/auth/zenuxs'
import { useAIChat } from '@/app/ai/chat/use'
import { useEditorStore } from '@/app/editor/active-store'
import CollabSharePopover from '@/components/CollabPanel/CollabSharePopover.vue'
import Tip from '@/components/ui/overlay/Tip.vue'

import ChatPanel from './ChatPanel.vue'
import CodePanel from './CodePanel.vue'
import DesignPanel from './DesignPanel.vue'
import ZoomDropdown from './editor/ZoomDropdown.vue'
import PrototypePanel from './properties/PrototypePanel.vue'

const { activeTab } = useAIChat()
const { panels } = useI18n()
const store = useEditorStore()

const userInitials = computed(() => {
  const name = currentUser.value?.name || currentUser.value?.email || 'ZD'
  return name.slice(0, 2).toUpperCase()
})

function togglePrototypePresenter() {
  if (store.state.prototypePresenterOpen) {
    store.state.prototypePresenterOpen = false
    store.stopPrototypePreview()
    return
  }
  if (!store.startPrototypePreview()) return
  store.state.prototypePresenterOpen = true
}
</script>

<template>
  <aside
    data-test-id="properties-panel"
    class="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden border-l border-[#444444] bg-[#2C2C2C] text-white"
    style="contain: paint layout style"
  >
    <!-- Top Bar: Avatar, Present Button, and Share Button (FigCraft right.rs lines 84-122) -->
    <div class="flex h-12 shrink-0 items-center justify-between border-b border-[#444444] px-3">
      <!-- Left: User Avatar -->
      <Tip :label="currentUser?.email || 'Active User'">
        <div class="flex items-center gap-1.5 cursor-pointer">
          <div
            class="flex size-7 items-center justify-center rounded-full bg-[#02DA96] text-[11px] font-bold text-[#07352A] shadow-sm"
          >
            {{ userInitials }}
          </div>
          <icon-lucide-chevron-down class="size-3 text-[#B3B3B3]" />
        </div>
      </Tip>

      <!-- Right: Present + Share button -->
      <div class="flex items-center gap-2">
        <Tip label="Present prototype (R / Click to play)">
          <button
            type="button"
            class="flex items-center gap-1.5 rounded px-2.5 py-1.5 text-[12px] font-medium text-white transition-colors hover:bg-[#383838]"
            data-test-id="prototype-present-button"
            @click="togglePrototypePresenter"
          >
            <icon-lucide-play class="size-3.5 fill-current text-white" />
          </button>
        </Tip>

        <CollabSharePopover>
          <template #default>
            <button
              type="button"
              class="flex items-center gap-1 rounded bg-[#02DA96] px-3.5 py-1.5 text-[12px] font-semibold text-[#07352A] transition-colors hover:bg-[#52E9B7]"
              data-test-id="properties-share-button"
            >
              Share
            </button>
          </template>
        </CollabSharePopover>
      </div>
    </div>

    <!-- Tabs Header: Design | Prototype | AI | Code + Zoom (FigCraft right.rs lines 124-170) -->
    <TabsRoot v-model="activeTab" class="flex min-h-0 flex-1 flex-col">
      <TabsList class="flex h-10 shrink-0 items-center gap-0.5 border-b border-[#444444] px-2 bg-[#2C2C2C]">
        <TabsTrigger
          value="design"
          data-test-id="properties-tab-design"
          class="relative rounded px-3 py-1.5 text-[12px] font-medium text-[#B3B3B3] transition-colors hover:text-white data-[state=active]:bg-[#383838] data-[state=active]:text-white"
        >
          {{ panels.design }}
        </TabsTrigger>
        <TabsTrigger
          value="prototype"
          data-test-id="properties-tab-prototype"
          class="relative rounded px-3 py-1.5 text-[12px] font-medium text-[#B3B3B3] transition-colors hover:text-white data-[state=active]:bg-[#383838] data-[state=active]:text-white"
        >
          Prototype
        </TabsTrigger>
        <TabsTrigger
          value="ai"
          data-test-id="properties-tab-ai"
          class="relative flex items-center gap-1.5 rounded px-3 py-1.5 text-[12px] font-medium text-[#B3B3B3] transition-colors hover:text-[#D27CFF] data-[state=active]:bg-[#3E3052] data-[state=active]:text-[#D27CFF]"
        >
          <icon-lucide-sparkles class="size-3" />
          {{ panels.ai }}
        </TabsTrigger>
        <TabsTrigger
          value="code"
          data-test-id="properties-tab-code"
          class="relative flex items-center gap-1.5 rounded px-3 py-1.5 text-[12px] font-medium text-[#B3B3B3] transition-colors hover:text-white data-[state=active]:bg-[#383838] data-[state=active]:text-white"
        >
          <icon-lucide-code class="size-3" />
          Inspect
        </TabsTrigger>
        <div class="flex-1" />
        <ZoomDropdown v-if="activeTab === 'design' || activeTab === 'prototype'" />
      </TabsList>

      <!-- Scrollable content area -->
      <TabsContent
        value="design"
        class="flex min-h-0 flex-1 flex-col overflow-y-auto"
        :force-mount="true"
        :hidden="activeTab !== 'design'"
      >
        <DesignPanel />
      </TabsContent>

      <TabsContent
        value="prototype"
        class="flex min-h-0 flex-1 flex-col overflow-y-auto"
        :force-mount="true"
        :hidden="activeTab !== 'prototype'"
      >
        <PrototypePanel />
      </TabsContent>

      <TabsContent
        value="ai"
        class="flex min-h-0 flex-1 flex-col"
        :force-mount="true"
        :hidden="activeTab !== 'ai'"
      >
        <ChatPanel />
      </TabsContent>

      <TabsContent
        value="code"
        class="flex min-h-0 flex-1 flex-col overflow-y-auto"
        :force-mount="true"
        :hidden="activeTab !== 'code'"
      >
        <CodePanel :active="activeTab === 'code'" />
      </TabsContent>
    </TabsRoot>
  </aside>
</template>
