<script setup lang="ts">
const emit = defineEmits<{
  submit: [text: string]
}>()

const quickActions = [
  { icon: 'icon-lucide-pencil', label: 'Generate a landing page' },
  { icon: 'icon-lucide-sparkles', label: 'Improve current design' },
  { icon: 'icon-lucide-layout-grid', label: 'Create components' },
  { icon: 'icon-lucide-palette', label: 'Generate styles' },
  { icon: 'icon-lucide-smartphone', label: 'Make it responsive' },
  { icon: 'icon-lucide-bar-chart-3', label: 'Analyze layout' }
]

function handleQuickAction(label: string) {
  emit('submit', label)
}
</script>

<template>
  <div class="flex flex-col px-3 py-4">
    <!-- What are you designing? header -->
    <div class="mb-4 flex items-start gap-2.5">
      <icon-lucide-sparkles class="mt-0.5 size-4 shrink-0 text-[#3B82F6]" />
      <div>
        <h3 class="text-[13px] font-semibold text-[#F5F7FA]">What are you designing?</h3>
        <p class="text-[11px] text-[#9CA3AF]">Turn your ideas into designs, faster.</p>
      </div>
    </div>

    <!-- Quick actions - compact rows -->
    <div class="flex flex-col gap-0.5">
      <button
        v-for="action in quickActions"
        :key="action.label"
        class="group flex items-center gap-2.5 rounded-lg px-2.5 py-2.5 text-left transition-colors hover:bg-[#1E2126]"
        @click="handleQuickAction(action.label)"
      >
        <component :is="action.icon" class="size-4 shrink-0 text-[#9CA3AF]" />
        <span class="flex-1 text-[13px] text-[#F5F7FA]">{{ action.label }}</span>
        <icon-lucide-chevron-right class="size-3.5 shrink-0 text-[#6B7280] transition-colors group-hover:text-[#9CA3AF]" />
      </button>
    </div>
  </div>
</template>
