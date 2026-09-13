<script setup lang="ts">
const emit = defineEmits<{
  submit: [text: string]
}>()

const quickActions = [
  { icon: 'icon-lucide-pencil', label: 'Generate a landing page', primary: true },
  { icon: 'icon-lucide-sparkles', label: 'Improve current design', primary: false },
  { icon: 'icon-lucide-layout-grid', label: 'Create components', primary: false },
  { icon: 'icon-lucide-palette', label: 'Generate styles', primary: false },
  { icon: 'icon-lucide-smartphone', label: 'Make it responsive', primary: false },
  { icon: 'icon-lucide-bar-chart-3', label: 'Analyze layout', primary: false }
]

function handleQuickAction(label: string) {
  emit('submit', label)
}
</script>

<template>
  <div class="flex flex-col px-4 py-6">
    <!-- Header -->
    <div class="mb-6 flex flex-col items-center">
      <div class="mb-3 flex items-center gap-2">
        <icon-lucide-sparkles class="size-5 text-accent" />
        <span class="text-[15px] font-semibold text-surface">Zenux AI Copilot</span>
        <span class="rounded-full bg-accent/15 px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wide text-accent">
          BETA
        </span>
      </div>
      <p class="text-[12px] text-muted">Your design partner, powered by AI.</p>
    </div>

    <!-- Main card -->
    <div class="rounded-xl border border-border bg-panel-secondary p-5">
      <!-- Sparkle icon -->
      <div class="mb-4 flex justify-center">
        <div class="flex size-12 items-center justify-center rounded-xl bg-accent/10">
          <icon-lucide-sparkles class="size-6 text-accent" />
        </div>
      </div>

      <!-- Heading -->
      <h2 class="mb-1.5 text-center text-[15px] font-semibold text-surface">
        What are you designing?
      </h2>
      <p class="mb-5 text-center text-[12px] text-muted">
        Turn your ideas into beautiful designs, faster than ever.
      </p>

      <!-- Quick actions -->
      <div class="flex flex-col gap-1.5">
        <button
          v-for="action in quickActions"
          :key="action.label"
          class="group flex items-center gap-3 rounded-lg border border-border bg-panel px-3 py-2.5 text-left transition-colors hover:border-accent/30 hover:bg-hover"
          @click="handleQuickAction(action.label)"
        >
          <div
            class="flex size-7 shrink-0 items-center justify-center rounded-md"
            :class="action.primary ? 'bg-accent/15 text-accent' : 'bg-panel-field text-muted'"
          >
            <component :is="action.icon" class="size-3.5" />
          </div>
          <span class="flex-1 text-[12px] text-surface">{{ action.label }}</span>
          <icon-lucide-chevron-right class="size-3.5 text-muted transition-colors group-hover:text-surface" />
        </button>
      </div>
    </div>
  </div>
</template>
