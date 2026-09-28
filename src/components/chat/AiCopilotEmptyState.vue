<script setup lang="ts">
const emit = defineEmits<{
  submit: [text: string]
}>()
</script>

<template>
  <div class="flex h-full flex-col items-center justify-center px-6 py-12 text-center">
    <div class="mb-5 flex size-12 items-center justify-center rounded-2xl bg-[#1E2126]">
      <icon-lucide-sparkles class="size-6 text-[#3B82F6]" />
    </div>
    <h3 class="mb-1 text-[14px] font-semibold text-[#F5F7FA]">What are you designing?</h3>
    <p class="max-w-[220px] text-[12px] leading-relaxed text-[#9CA3AF]">
      Describe an interface, refine a layout, or turn an idea into a real design.
    </p>
  </div>
</template>