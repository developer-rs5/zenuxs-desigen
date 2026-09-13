<script setup lang="ts">
import { TabsContent, TabsList, TabsRoot, TabsTrigger } from 'reka-ui'

import { useI18n } from '@open-pencil/vue'

import { useAIChat } from '@/app/ai/chat/use'

import ChatPanel from './ChatPanel.vue'
import CodePanel from './CodePanel.vue'
import DesignPanel from './DesignPanel.vue'
import ZoomDropdown from './editor/ZoomDropdown.vue'

const { activeTab } = useAIChat()
const { panels } = useI18n()
</script>

<template>
  <aside
    data-test-id="properties-panel"
    class="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden border-l border-border bg-panel"
    style="contain: paint layout style"
  >
    <TabsRoot v-model="activeTab" class="flex min-h-0 flex-1 flex-col">
      <!-- Fixed header: tabs -->
      <TabsList class="flex h-10 shrink-0 items-center gap-0.5 border-b border-border px-1">
        <TabsTrigger
          value="design"
          data-test-id="properties-tab-design"
          class="relative rounded-md px-3 py-1.5 text-[12px] text-muted transition-colors hover:text-surface data-[state=active]:text-surface after:absolute after:inset-x-3 after:bottom-0 after:h-0.5 after:rounded-full after:bg-transparent data-[state=active]:after:bg-accent"
        >
          {{ panels.design }}
        </TabsTrigger>
        <TabsTrigger
          value="code"
          data-test-id="properties-tab-code"
          class="relative flex items-center gap-1.5 rounded-md px-3 py-1.5 text-[12px] text-muted transition-colors hover:text-surface data-[state=active]:text-surface after:absolute after:inset-x-3 after:bottom-0 after:h-0.5 after:rounded-full after:bg-transparent data-[state=active]:after:bg-accent"
        >
          <icon-lucide-code class="size-3" />
          {{ panels.code }}
        </TabsTrigger>
        <TabsTrigger
          value="ai"
          data-test-id="properties-tab-ai"
          class="relative flex items-center gap-1.5 rounded-md px-3 py-1.5 text-[12px] text-muted transition-colors hover:text-surface data-[state=active]:text-accent after:absolute after:inset-x-3 after:bottom-0 after:h-0.5 after:rounded-full after:bg-transparent data-[state=active]:after:bg-accent"
        >
          <icon-lucide-sparkles class="size-3" />
          {{ panels.ai }}
        </TabsTrigger>
        <div class="flex-1" />
        <ZoomDropdown v-if="activeTab === 'design'" />
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
        value="code"
        class="flex min-h-0 flex-1 flex-col overflow-y-auto"
        :force-mount="true"
        :hidden="activeTab !== 'code'"
      >
        <CodePanel :active="activeTab === 'code'" />
      </TabsContent>

      <TabsContent
        value="ai"
        class="flex min-h-0 flex-1 flex-col"
        :force-mount="true"
        :hidden="activeTab !== 'ai'"
      >
        <ChatPanel />
      </TabsContent>
    </TabsRoot>
  </aside>
</template>
