<script setup lang="ts">
import { computed } from 'vue'

import { currentUser } from '@/app/auth/zenuxs'
import { openProjectsDialog } from '@/app/projects/dialog'
import { openSettingsDialog } from '@/app/settings/dialog'
import Tip from '@/components/ui/overlay/Tip.vue'

const props = defineProps<{
  activeTab: 'file' | 'assets' | 'variables' | 'ai'
  collapsed?: boolean
}>()

const emit = defineEmits<{
  selectTab: [tab: 'file' | 'assets' | 'variables' | 'ai']
  toggleCollapse: []
  openHome: []
  openMenu: []
  openPlugins: []
}>()

const userInitials = computed(() => {
  const name = currentUser.value?.name || currentUser.value?.email || 'ZD'
  return name.slice(0, 2).toUpperCase()
})
</script>

<template>
  <aside
    data-test-id="left-icon-rail"
    class="flex w-[56px] shrink-0 flex-col items-center border-r border-[#444444] bg-[#2C2C2C] py-2 select-none"
  >
    <!-- Top: Main Menu / Logo button (FigCraft Chameleon / Zenuxs) -->
    <Tip label="Main menu & Projects">
      <button
        type="button"
        class="flex size-9 items-center justify-center rounded-md text-white transition-colors hover:bg-[#383838] focus-visible:ring-1 focus-visible:ring-[#02DA96]"
        data-test-id="topbar-projects-button"
        @click="openProjectsDialog"
      >
        <div class="flex size-7 items-center justify-center rounded bg-[#02DA96] text-[13px] font-bold text-[#07352A]">
          Z
        </div>
      </button>
    </Tip>

    <!-- Divider -->
    <div class="my-2 h-px w-6 bg-[#444444]" />

    <!-- Navigation Items matching FigCraft layers.rs rail items -->
    <div class="flex flex-1 flex-col items-center gap-1">
      <!-- Home tab -->
      <Tip label="Home (recents)">
        <button
          type="button"
          class="group flex w-12 flex-col items-center justify-center rounded-md py-1.5 transition-colors hover:bg-[#383838]"
          @click="emit('openHome')"
        >
          <icon-lucide-home class="size-4 text-[#B3B3B3] group-hover:text-white" />
          <span class="mt-1 text-[10px] font-medium text-[#B3B3B3] group-hover:text-white">Home</span>
        </button>
      </Tip>

      <!-- File / Layers Tab -->
      <Tip label="Layers & Pages">
        <button
          type="button"
          class="group flex w-12 flex-col items-center justify-center rounded-md py-1.5 transition-colors"
          :class="[
            activeTab === 'file' && !collapsed
              ? 'bg-[#164236] text-[#52E9B7]'
              : 'text-[#B3B3B3] hover:bg-[#383838] hover:text-white'
          ]"
          data-test-id="rail-file-tab"
          @click="emit('selectTab', 'file')"
        >
          <icon-lucide-file-text
            class="size-4"
            :class="[activeTab === 'file' && !collapsed ? 'text-[#52E9B7]' : 'text-[#B3B3B3] group-hover:text-white']"
          />
          <span class="mt-1 text-[10px] font-medium">File</span>
        </button>
      </Tip>

      <!-- Assets Tab -->
      <Tip label="Assets & Components">
        <button
          type="button"
          class="group flex w-12 flex-col items-center justify-center rounded-md py-1.5 transition-colors"
          :class="[
            activeTab === 'assets' && !collapsed
              ? 'bg-[#164236] text-[#52E9B7]'
              : 'text-[#B3B3B3] hover:bg-[#383838] hover:text-white'
          ]"
          data-test-id="rail-assets-tab"
          @click="emit('selectTab', 'assets')"
        >
          <icon-lucide-component
            class="size-4"
            :class="[activeTab === 'assets' && !collapsed ? 'text-[#52E9B7]' : 'text-[#B3B3B3] group-hover:text-white']"
          />
          <span class="mt-1 text-[10px] font-medium">Assets</span>
        </button>
      </Tip>

      <!-- Variables Tab -->
      <Tip label="Variables & Tokens">
        <button
          type="button"
          class="group flex w-12 flex-col items-center justify-center rounded-md py-1.5 transition-colors"
          :class="[
            activeTab === 'variables' && !collapsed
              ? 'bg-[#164236] text-[#52E9B7]'
              : 'text-[#B3B3B3] hover:bg-[#383838] hover:text-white'
          ]"
          data-test-id="rail-variables-tab"
          @click="emit('selectTab', 'variables')"
        >
          <icon-lucide-sliders-horizontal
            class="size-4"
            :class="[activeTab === 'variables' && !collapsed ? 'text-[#52E9B7]' : 'text-[#B3B3B3] group-hover:text-white']"
          />
          <span class="mt-1 text-[10px] font-medium">Variables</span>
        </button>
      </Tip>


      <!-- Plugins & Extensions -->
      <Tip label="Plugins & Extensions">
        <button
          type="button"
          class="group flex w-12 flex-col items-center justify-center rounded-md py-1.5 transition-colors text-[#B3B3B3] hover:bg-[#383838] hover:text-white"
          data-test-id="rail-plugins-tab"
          @click="emit('openPlugins')"
        >
          <icon-lucide-box class="size-4 text-[#B3B3B3] group-hover:text-white" />
          <span class="mt-1 text-[10px] font-medium">Plugins</span>
        </button>
      </Tip>

      <!-- AI Assistant Tab -->
      <Tip label="AI Assistant">
        <button
          type="button"
          class="group flex w-12 flex-col items-center justify-center rounded-md py-1.5 transition-colors"
          :class="[
            activeTab === 'ai' && !collapsed
              ? 'bg-[#3E3052] text-[#D27CFF]'
              : 'text-[#B3B3B3] hover:bg-[#383838] hover:text-white'
          ]"
          data-test-id="rail-ai-tab"
          @click="emit('selectTab', 'ai')"
        >
          <icon-lucide-sparkles
            class="size-4"
            :class="[activeTab === 'ai' && !collapsed ? 'text-[#D27CFF]' : 'text-[#B3B3B3] group-hover:text-[#D27CFF]']"
          />
          <span class="mt-1 text-[10px] font-medium">AI</span>
        </button>
      </Tip>
    </div>

    <!-- Bottom: User avatar + Settings -->
    <div class="flex flex-col items-center gap-1.5">
      <Tip :label="currentUser?.email || 'User Account'">
        <div
          class="flex size-7 items-center justify-center rounded-full bg-[#02DA96] text-[11px] font-bold text-[#07352A] shadow-sm cursor-pointer"
        >
          {{ userInitials }}
        </div>
      </Tip>

      <Tip label="Settings">
        <button
          type="button"
          data-test-id="app-settings-trigger"
          class="flex size-7 items-center justify-center rounded text-[#888888] transition-colors hover:bg-[#383838] hover:text-white"
          @click="openSettingsDialog()"
        >
          <icon-lucide-settings class="size-4" />
        </button>
      </Tip>
    </div>
  </aside>
</template>
