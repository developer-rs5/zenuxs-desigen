<script setup lang="ts">
import { SplitterGroup, SplitterPanel, SplitterResizeHandle } from 'reka-ui'
import { tv } from 'tailwind-variants'
import { ref } from 'vue'

import { useViewportKind } from '@open-pencil/vue'

import { useAIChat } from '@/app/ai/chat/use'
import { useEditorStore } from '@/app/editor/active-store'
import { appRuntimeConfig } from '@/app/runtime/config'
import { loadEditorLayout, saveEditorLayout } from '@/app/shell/layout-storage'
import { activeTab, showNewTab } from '@/app/tabs'
import CanvasSplitRoot from '@/components/canvas/CanvasSplitRoot.vue'
import EditorCanvas from '@/components/EditorCanvas.vue'
import LayersPanel from '@/components/LayersPanel.vue'
import MobileDrawer from '@/components/MobileDrawer.vue'
import MobileHud from '@/components/MobileHud/MobileHud.vue'
import LeftRail from '@/components/navigation/LeftRail.vue'
import PluginsDialog from '@/components/plugins/PluginsDialog.vue'
import PropertiesPanel from '@/components/PropertiesPanel.vue'
import Toolbar from '@/components/Toolbar/Toolbar.vue'
import VariablesDialog from '@/components/variables/VariablesDialog.vue'
import splitterTheme from '@/theme/splitter'

const showChrome = appRuntimeConfig.showChrome
const store = useEditorStore()
const { isMobile } = useViewportKind()
const { activeTab: aiChatTab } = useAIChat()
const initialEditorLayout = loadEditorLayout()
const horizontalSplitterStyles = tv(splitterTheme)({ direction: 'horizontal' })

// FigCraft Rail & Side panel state (mirrors crates/ui-egui/src/layers.rs)
const railTab = ref<'file' | 'assets' | 'variables' | 'ai'>('file')
const leftCollapsed = ref(false)
const variablesDialogOpen = ref(false)
const pluginsDialogOpen = ref(false)

function onRailTabSelect(tab: 'file' | 'assets' | 'variables' | 'ai') {
  if (tab === 'variables') {
    variablesDialogOpen.value = true
    return
  }
  if (tab === 'ai') {
    railTab.value = 'ai'
    aiChatTab.value = 'ai'
    leftCollapsed.value = false
    return
  }
  if (railTab.value === tab && !leftCollapsed.value) {
    leftCollapsed.value = true
  } else {
    railTab.value = tab
    leftCollapsed.value = false
  }
}
</script>

<template>
  <div class="flex flex-1 overflow-hidden bg-[#1E1E1E]">
    <!-- 1. FigCraft Slim Icon Rail (56px) -->
    <LeftRail
      v-if="!isMobile && showChrome && store.state.showUI"
      :active-tab="railTab"
      :collapsed="leftCollapsed"
      @select-tab="onRailTabSelect"
      @toggle-collapse="leftCollapsed = !leftCollapsed"
      @open-home="showNewTab"
      @open-plugins="pluginsDialogOpen = true"
    />

    <!-- 2. Main 3-Column Splitter: Layers Panel | Canvas with Floating Dock | Properties Panel -->
    <SplitterGroup
      v-if="!isMobile && showChrome && store.state.showUI"
      :key="activeTab?.id"
      direction="horizontal"
      class="flex-1 overflow-hidden"
      @layout="saveEditorLayout"
    >
      <!-- Left Panel: Pages & Layers (240px) -->
      <SplitterPanel
        v-if="!leftCollapsed"
        id="layers"
        :default-size="initialEditorLayout[0]"
        :min-size="10"
        :max-size="30"
        class="flex"
      >
        <LayersPanel
          :active-tab="railTab === 'assets' ? 'assets' : 'file'"
          @collapse="leftCollapsed = true"
        />
      </SplitterPanel>

      <SplitterResizeHandle
        v-if="!leftCollapsed"
        data-test-id="left-splitter-handle"
        :class="horizontalSplitterStyles.handle()"
      >
        <div :class="horizontalSplitterStyles.divider()" />
      </SplitterResizeHandle>

      <!-- Center Canvas with Floating Toolbar Dock -->
      <SplitterPanel
        id="canvas"
        :default-size="leftCollapsed ? 75 : initialEditorLayout[1]"
        :min-size="30"
        class="flex"
      >
        <div class="relative flex min-w-0 flex-1">
          <CanvasSplitRoot />
          <Toolbar />
        </div>
      </SplitterPanel>

      <SplitterResizeHandle :class="horizontalSplitterStyles.handle()">
        <div :class="horizontalSplitterStyles.divider()" />
      </SplitterResizeHandle>

      <!-- Right Panel: Design / Prototype / Inspect / AI -->
      <SplitterPanel
        id="properties"
        :default-size="initialEditorLayout[2]"
        :min-size="15"
        :max-size="35"
        class="flex flex-col"
      >
        <PropertiesPanel />
      </SplitterPanel>
    </SplitterGroup>

    <!-- Mobile viewport handling -->
    <div
      v-else-if="isMobile && showChrome && store.state.showUI"
      :key="'mobile-' + activeTab?.id"
      class="flex flex-1 overflow-hidden"
    >
      <div class="relative flex min-w-0 flex-1">
        <EditorCanvas />
        <MobileHud />
        <Toolbar />
      </div>
      <MobileDrawer />
    </div>

    <!-- UI Hidden state -->
    <div
      v-else-if="showChrome"
      :key="'collapsed-' + activeTab?.id"
      class="flex flex-1 overflow-hidden"
    >
      <div class="relative flex min-w-0 flex-1">
        <EditorCanvas />
      </div>
    </div>

    <!-- Variables Modal Dialog -->
    <VariablesDialog v-model:open="variablesDialogOpen" />

    <!-- Plugins Marketplace Dialog -->
    <PluginsDialog v-model="pluginsDialogOpen" />
  </div>
</template>
