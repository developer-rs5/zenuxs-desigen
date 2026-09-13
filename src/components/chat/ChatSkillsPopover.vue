<script setup lang="ts">
import {
  PopoverContent,
  PopoverPortal,
  PopoverRoot,
  PopoverTrigger
} from 'reka-ui'
import { ref } from 'vue'

import { activeAISkills, aiSkills, toggleAISkill } from '@/app/ai/skills'
import { openSettingsDialog } from '@/app/settings/dialog'
import AppButton from '@/components/ui/button/AppButton.vue'
import { usePopoverUI } from '@/components/ui/overlay/popover'
import AppSwitch from '@/components/ui/toggle/AppSwitch.vue'

const open = ref(false)
const cls = usePopoverUI({ content: 'z-[100] w-72 rounded-xl border border-border bg-panel p-3 shadow-xl' })

function openSettings() {
  open.value = false
  openSettingsDialog('skills')
}
</script>

<template>
  <PopoverRoot v-model:open="open">
    <PopoverTrigger as-child>
      <button
        type="button"
        data-test-id="chat-skills-trigger"
        class="inline-flex h-6 items-center gap-1 rounded-md px-1.5 text-[11px] font-medium transition-colors hover:bg-hover active:scale-95"
        :class="activeAISkills.length > 0 ? 'text-surface' : 'text-muted'"
        :aria-label="`AI Skills: ${activeAISkills.length} active`"
      >
        <icon-lucide-wand-2 class="size-3 text-accent" />
        <span class="hidden sm:inline">Skills</span>
        <span
          class="flex size-3.5 items-center justify-center rounded-full text-[9px] font-semibold"
          :class="activeAISkills.length > 0 ? 'bg-accent text-white' : 'bg-muted/20 text-muted'"
        >
          {{ activeAISkills.length }}
        </span>
      </button>
    </PopoverTrigger>

    <PopoverPortal>
      <PopoverContent
        align="start"
        side="top"
        :side-offset="6"
        :class="cls.content"
      >
        <div class="flex items-center justify-between border-b border-border pb-2">
          <div class="flex items-center gap-1.5">
            <icon-lucide-sparkles class="size-3.5 text-accent" />
            <h4 class="text-xs font-semibold text-surface">AI Design Skills</h4>
          </div>
          <span class="text-[10px] font-medium text-muted">
            {{ activeAISkills.length }} active
          </span>
        </div>

        <div class="flex flex-col divide-y divide-border/60 py-1">
          <div
            v-for="skill in aiSkills"
            :key="skill.id"
            class="flex items-center justify-between gap-2 py-2"
          >
            <div class="flex min-w-0 flex-1 flex-col">
              <span class="truncate text-xs font-medium text-surface">{{ skill.displayName || skill.name }}</span>
              <span class="line-clamp-1 text-[10px] text-muted">{{ skill.description }}</span>
            </div>
            <AppSwitch
              :model-value="skill.enabled"
              :label="`Enable ${skill.displayName || skill.name}`"
              size="sm"
              @update:model-value="toggleAISkill(skill.id || skill.name, $event)"
            />
          </div>
        </div>

        <div class="mt-2 flex items-center justify-between border-t border-border pt-2 text-[11px]">
          <span class="text-[10px] text-muted">Taste Skill & UI/UX Pro Max</span>
          <AppButton
            variant="ghost"
            size="xs"
            class="h-6 text-[11px]"
            @click="openSettings"
          >
            Settings
            <icon-lucide-arrow-right class="ml-1 size-3" />
          </AppButton>
        </div>
      </PopoverContent>
    </PopoverPortal>
  </PopoverRoot>
</template>
