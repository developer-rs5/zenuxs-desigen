<script setup lang="ts">
/**
 * Live-building overlay shown on the canvas while the AI chat is submitting or
 * streaming: a skeleton wireframe whose blocks pop in one by one while a
 * cursor travels the artboard, so the design looks like a human is building it.
 * Purely presentational — the building flag lives in chat build-state.
 */
</script>

<template>
  <div
    data-test-id="canvas-ai-build-overlay"
    aria-hidden="true"
    class="pointer-events-none absolute inset-0 z-40 flex items-center justify-center"
  >
    <div class="relative aspect-[16/10] w-[min(560px,72%)]">
      <div class="absolute inset-0 rounded-lg border border-dashed border-border/70" />
      <div class="ai-build-block ai-build-block-1" />
      <div class="ai-build-block ai-build-block-2" />
      <div class="ai-build-block ai-build-block-3" />
      <div class="ai-build-block ai-build-block-4" />
      <div class="ai-build-block ai-build-block-5" />
      <div class="ai-build-cursor">
        <icon-lucide-mouse-pointer-2
          class="size-5 rotate-[-8deg] fill-accent text-accent drop-shadow-md"
        />
      </div>
    </div>
  </div>
</template>
