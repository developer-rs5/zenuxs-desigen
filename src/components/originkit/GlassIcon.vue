<script setup lang="ts">
import { onMounted, onUnmounted, ref } from 'vue'

import { DEFAULT_BACKDROP, DEFAULT_FONT, DEFAULT_GLASS, DEFAULT_ORIENT } from './glass/defaults'
import { startGlassRenderer } from './glass/renderer'
import type { GlassIconProps, GlassLiveState } from './glass/types'

/**
 * Originkit "glass-icon" (LiquidGlassCluster) — Vue port.
 * React .tsx reference: src/components/originkit/ui/glass-icon.tsx
 * Pure WebGL (no React), same SDF ray-marched glass shader.
 */

const {
  className,
  style,
  background = '#000000',
  shape = 'Torus',
  logo = '',
  depth = 32,
  size = 60,
  speed = 100,
  direction = 'Clockwise',
  backdrop,
  glass,
  orient
} = defineProps<GlassIconProps>()

const hostRef = ref<HTMLDivElement | null>(null)
const canvasRef = ref<HTMLCanvasElement | null>(null)
const cleanupRef = ref<(() => void) | null>(null)

let live: GlassLiveState = snapshotLive()

function snapshotLive(): GlassLiveState {
  return {
    background,
    shape,
    logo,
    depth,
    size,
    speed,
    direction,
    bd: { ...DEFAULT_BACKDROP, ...backdrop, font: { ...DEFAULT_FONT, ...backdrop?.font } },
    gl3: { ...DEFAULT_GLASS, ...glass },
    or: { ...DEFAULT_ORIENT, ...orient }
  }
}

function syncLive() {
  live = snapshotLive()
}

onMounted(() => {
  syncLive()
  const canvasEl = canvasRef.value
  const hostEl = hostRef.value
  if (!canvasEl || !hostEl) return
  cleanupRef.value = startGlassRenderer(canvasEl, hostEl, () => live)
})

onUnmounted(() => {
  cleanupRef.value?.()
})
</script>

<template>
  <div
    ref="hostRef"
    class="glass-icon"
    :class="className"
    :style="{
      position: 'relative',
      width: '100%',
      height: '100%',
      overflow: 'hidden',
      background,
      touchAction: 'none',
      ...style
    }"
  >
    <canvas
      ref="canvasRef"
      :style="{ position: 'absolute', inset: '0', width: '100%', height: '100%', display: 'block' }"
    />
  </div>
</template>
