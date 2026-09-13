<script setup lang="ts">
import { ref } from 'vue'

import {
  activeAISkills,
  addCustomAISkill,
  aiSkills,
  removeAISkill,
  resetAISkillsToDefaults,
  toggleAISkill
} from '@/app/ai/skills'
import type { AISkill } from '@/app/ai/skills'
import SettingsGroup from '@/components/settings/layout/SettingsGroup.vue'
import SettingsSectionHeader from '@/components/settings/layout/SettingsSectionHeader.vue'
import AppButton from '@/components/ui/button/AppButton.vue'
import IconButton from '@/components/ui/button/IconButton.vue'
import AppSwitch from '@/components/ui/toggle/AppSwitch.vue'

const expandedSkillId = ref<string | null>(null)
const isAddingCustom = ref(false)

const customName = ref('')
const customDisplayName = ref('')
const customDescription = ref('')
const customSourceUrl = ref('')
const customContent = ref('')

function toggleExpand(id: string) {
  expandedSkillId.value = expandedSkillId.value === id ? null : id
}

function handleAddSkill() {
  if (!customName.value.trim() || !customContent.value.trim()) return

  addCustomAISkill({
    name: customName.value.trim(),
    displayName: customDisplayName.value.trim() || customName.value.trim(),
    description: customDescription.value.trim(),
    sourceUrl: customSourceUrl.value.trim(),
    promptContent: customContent.value.trim(),
    enabled: true
  })

  customName.value = ''
  customDisplayName.value = ''
  customDescription.value = ''
  customSourceUrl.value = ''
  customContent.value = ''
  isAddingCustom.value = false
}

function cancelAdd() {
  isAddingCustom.value = false
  customName.value = ''
  customDisplayName.value = ''
  customDescription.value = ''
  customSourceUrl.value = ''
  customContent.value = ''
}

function onSkillToggle(skill: AISkill, value: boolean) {
  toggleAISkill(skill.id || skill.name, value)
}
</script>

<template>
  <section class="flex flex-col gap-3">
    <div class="flex items-center justify-between">
      <SettingsSectionHeader>
        AI Skills & Design Frameworks
        <template #description>
          Active skills inject specialized design rules, anti-slop guidelines, and UI/UX intelligence into AI generation prompts.
        </template>
      </SettingsSectionHeader>
      <div class="flex items-center gap-2">
        <AppButton
          variant="outline"
          size="xs"
          class="text-xs"
          @click="resetAISkillsToDefaults"
        >
          <icon-lucide-rotate-ccw class="mr-1 size-3" />
          Reset
        </AppButton>
        <AppButton
          v-if="!isAddingCustom"
          variant="outline"
          size="xs"
          class="text-xs"
          @click="isAddingCustom = true"
        >
          <icon-lucide-plus class="mr-1 size-3" />
          Add Skill
        </AppButton>
      </div>
    </div>

    <!-- Custom Skill Creation Form -->
    <div
      v-if="isAddingCustom"
      class="flex flex-col gap-2.5 rounded border border-accent/40 bg-accent/5 p-3"
    >
      <div class="flex items-center justify-between">
        <span class="text-xs font-semibold text-surface">New Custom AI Skill</span>
        <IconButton label="Cancel" size="xs" @click="cancelAdd">
          <icon-lucide-x class="size-3" />
        </IconButton>
      </div>
      <div class="grid grid-cols-2 gap-2">
        <div class="flex flex-col gap-1.5">
          <label class="text-[11px] font-medium text-muted">Skill Name (slug)</label>
          <input
            v-model="customName"
            placeholder="e.g., brand-guidelines"
            class="h-7 w-full rounded border border-border bg-input px-2 text-xs text-surface outline-none focus:border-accent"
          />
        </div>
        <div class="flex flex-col gap-1.5">
          <label class="text-[11px] font-medium text-muted">Display Title</label>
          <input
            v-model="customDisplayName"
            placeholder="e.g., Brand Guidelines"
            class="h-7 w-full rounded border border-border bg-input px-2 text-xs text-surface outline-none focus:border-accent"
          />
        </div>
      </div>
      <div class="grid grid-cols-2 gap-2">
        <div class="flex flex-col gap-1.5">
          <label class="text-[11px] font-medium text-muted">Description (optional)</label>
          <input
            v-model="customDescription"
            placeholder="Brief summary of rules"
            class="h-7 w-full rounded border border-border bg-input px-2 text-xs text-surface outline-none focus:border-accent"
          />
        </div>
        <div class="flex flex-col gap-1.5">
          <label class="text-[11px] font-medium text-muted">Source URL (optional)</label>
          <input
            v-model="customSourceUrl"
            placeholder="https://..."
            class="h-7 w-full rounded border border-border bg-input px-2 text-xs text-surface outline-none focus:border-accent"
          />
        </div>
      </div>
      <div class="flex flex-col gap-1.5">
        <label class="text-[11px] font-medium text-muted">Skill Rules / Prompt Content</label>
        <textarea
          v-model="customContent"
          rows="4"
          placeholder="Enter design instructions, typography guidelines, or constraints to inject..."
          class="w-full resize-none rounded border border-border bg-input p-2 text-xs leading-relaxed text-surface outline-none focus:border-accent"
        />
      </div>
      <div class="flex justify-end gap-2 pt-1">
        <AppButton variant="ghost" size="xs" @click="cancelAdd">Cancel</AppButton>
        <AppButton
          variant="solid"
          color="primary"
          size="xs"
          :disabled="!customName.trim() || !customContent.trim()"
          @click="handleAddSkill"
        >
          Save Skill
        </AppButton>
      </div>
    </div>

    <!-- Skills List -->
    <SettingsGroup>
      <div
        v-for="skill in aiSkills"
        :key="skill.id || skill.name"
        class="flex flex-col p-3 transition-colors"
      >
        <div class="flex items-start justify-between gap-3">
          <div class="flex min-w-0 flex-1 flex-col gap-1">
            <div class="flex flex-wrap items-center gap-2">
              <span class="text-xs font-semibold text-surface">{{ skill.displayName || skill.name }}</span>
              <span
                v-if="skill.isDefault"
                class="rounded bg-accent/15 px-1.5 py-0.5 text-[10px] font-medium text-accent"
              >
                Default
              </span>
              <span
                v-if="skill.version"
                class="rounded bg-surface/10 px-1.5 py-0.5 text-[10px] font-mono text-muted"
              >
                v{{ skill.version }}
              </span>
              <span
                v-if="skill.author"
                class="text-[10px] text-muted"
              >
                by {{ skill.author }}
              </span>
              <a
                v-if="skill.sourceUrl"
                :href="skill.sourceUrl"
                target="_blank"
                rel="noreferrer"
                class="inline-flex items-center gap-1 text-[11px] text-muted hover:text-surface hover:underline"
              >
                <span>Docs</span>
                <icon-lucide-external-link class="size-3" />
              </a>
            </div>
            <p class="text-[11px] leading-relaxed text-muted">
              {{ skill.description }}
            </p>
            <div v-if="skill.tags && skill.tags.length" class="flex flex-wrap gap-1 pt-0.5">
              <span
                v-for="tag in skill.tags"
                :key="tag"
                class="rounded bg-border/50 px-1.5 py-0.2 text-[9px] text-muted"
              >
                #{{ tag }}
              </span>
            </div>
          </div>

          <div class="flex shrink-0 items-center gap-2 pt-0.5">
            <AppSwitch
              :model-value="skill.enabled"
              :label="`Enable ${skill.displayName || skill.name}`"
              size="sm"
              @update:model-value="onSkillToggle(skill, $event)"
            />
            <IconButton
              v-if="!skill.isDefault"
              label="Delete skill"
              size="xs"
              @click="removeAISkill(skill.id || skill.name)"
            >
              <icon-lucide-trash-2 class="size-3 text-danger hover:text-danger/80" />
            </IconButton>
            <IconButton
              :label="expandedSkillId === (skill.id || skill.name) ? 'Collapse rules' : 'Expand rules'"
              size="xs"
              @click="toggleExpand(skill.id || skill.name)"
            >
              <icon-lucide-chevron-up v-if="expandedSkillId === (skill.id || skill.name)" class="size-3.5" />
              <icon-lucide-chevron-down v-else class="size-3.5" />
            </IconButton>
          </div>
        </div>

        <!-- Expanded Prompt Content Preview -->
        <div
          v-if="expandedSkillId === (skill.id || skill.name)"
          class="mt-2.5 rounded border border-border/80 bg-canvas/60 p-2.5"
        >
          <div class="mb-1.5 flex items-center justify-between">
            <span class="text-[10px] font-semibold uppercase tracking-wider text-muted">
              Prompt Instructions Injected into AI
            </span>
          </div>
          <pre class="max-h-56 overflow-y-auto whitespace-pre-wrap font-mono text-[11px] leading-relaxed text-surface/90">{{ skill.promptContent }}</pre>
        </div>
      </div>
    </SettingsGroup>
    <div class="px-1 text-[11px] text-muted">
      {{ activeAISkills.length }} of {{ aiSkills.length }} skills active
    </div>
  </section>
</template>
