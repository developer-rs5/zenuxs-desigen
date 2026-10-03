<script setup lang="ts">
import { computed } from 'vue'

const { label = 'Magic Building...' } = defineProps<{
  label?: string
  subtitle?: string
}>()

const activeSubtitle = computed(() => 'Synthesizing layout, vector geometry & color palette...')
</script>

<template>
  <div data-test-id="chat-magic-building" class="magic-building-card my-2 w-full">
    <!-- 360-degree rotating conic gradient border -->
    <div class="magic-building-conic" aria-hidden="true" />

    <!-- 360-degree rotating lower ambient glow -->
    <div class="magic-building-lower-glow" aria-hidden="true" />

    <!-- Inner content card -->
    <div class="magic-building-inner flex flex-col gap-2.5">
      <!-- Header -->
      <div class="flex items-center justify-between">
        <div class="flex items-center gap-2">
          <div
            class="flex size-6 items-center justify-center rounded-lg bg-[#1E2126] border border-[#292D33]"
          >
            <icon-lucide-sparkles
              class="size-3.5 text-[#3B82F6] animate-spin"
              style="animation-duration: 4s"
            />
          </div>
          <span class="text-[12px] font-semibold text-[#F5F7FA] tracking-tight">
            {{ label }}
          </span>
        </div>

        <div
          class="flex items-center gap-1.5 rounded-full border border-[#3B82F6]/30 bg-[#3B82F6]/10 px-2 py-0.5"
        >
          <span class="size-1.5 rounded-full bg-[#3B82F6] animate-ping" />
          <span class="text-[10px] font-medium text-[#60A5FA]">Active</span>
        </div>
      </div>

      <!-- Progressive Wireframe Skeleton Layout -->
      <div class="flex flex-col gap-2 rounded-lg border border-[#292D33]/60 bg-[#111315]/80 p-2.5">
        <!-- Mock Nav Bar -->
        <div class="flex items-center justify-between pb-1 border-b border-[#292D33]/40">
          <div class="size-4 rounded magic-skeleton-box" />
          <div class="flex items-center gap-2">
            <div class="h-2 w-10 magic-skeleton-bar" />
            <div class="h-2 w-8 magic-skeleton-bar" />
            <div class="h-2 w-12 magic-skeleton-bar" />
          </div>
        </div>

        <!-- Mock Hero Banner -->
        <div class="flex flex-col gap-1.5 py-1">
          <div class="h-3 w-3/4 magic-skeleton-bar" />
          <div class="h-2 w-1/2 magic-skeleton-bar" />
        </div>

        <!-- Mock 2-Column Component Cards -->
        <div class="grid grid-cols-2 gap-2 pt-0.5">
          <div class="flex flex-col gap-1.5 rounded border border-[#292D33]/40 bg-[#17191C] p-1.5">
            <div class="h-10 w-full magic-skeleton-box rounded" />
            <div class="h-2 w-4/5 magic-skeleton-bar" />
            <div class="h-1.5 w-3/5 magic-skeleton-bar" />
          </div>
          <div class="flex flex-col gap-1.5 rounded border border-[#292D33]/40 bg-[#17191C] p-1.5">
            <div class="h-10 w-full magic-skeleton-box rounded" />
            <div class="h-2 w-4/5 magic-skeleton-bar" />
            <div class="h-1.5 w-3/5 magic-skeleton-bar" />
          </div>
        </div>
      </div>

      <!-- Footer Subtitle -->
      <div class="flex items-center justify-between text-[10px] text-[#9CA3AF]">
        <span class="truncate">{{ activeSubtitle }}</span>
        <span class="shrink-0 text-[#60A5FA]">360° AI</span>
      </div>
    </div>
  </div>
</template>
