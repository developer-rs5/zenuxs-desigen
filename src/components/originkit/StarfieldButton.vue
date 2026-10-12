<script setup lang="ts">
import { useEventListener } from '@vueuse/core'
import { ref, onMounted, onUnmounted, computed } from 'vue'

import { colorToCSS } from '@open-pencil/core/color'

const {
  borderColor = 'rgba(255,255,255,0.1)',
  borderWidth = 1,
  faceBackground = 'transparent',
  lightCount = 20,
  padding = '12px 24px',
  borderRadius = '12px'
} = defineProps<{
  borderColor?: string
  borderWidth?: number
  faceBackground?: string
  lightCount?: number
  lightSize?: number
  lightColor?: string
  padding?: string
  borderRadius?: string
  as?: string
}>()

const emit = defineEmits<{
  click: [event: MouseEvent]
}>()

const containerRef = ref<HTMLDivElement | null>(null)
const canvasRef = ref<HTMLCanvasElement | null>(null)
const isHovered = ref(false)
const isPressed = ref(false)
const animProgress = ref(0)

let raf = 0
let stars: Array<{
  x: number
  y: number
  size: number
  speed: number
  opacity: number
  angle: number
}> = []
const canvasWidth = ref(0)
const canvasHeight = ref(0)

function handleMouseLeave() {
  isHovered.value = false
  isPressed.value = false
}

/** Uniform [0,1) sample from the platform CSPRNG (Math.random is disallowed). */
function randomUnit(): number {
  return crypto.getRandomValues(new Uint32Array(1))[0] / 2 ** 32
}

function initStars() {
  if (!canvasWidth.value || !canvasHeight.value) return
  stars = Array.from({ length: lightCount }, () => ({
    x: randomUnit() * canvasWidth.value,
    y: randomUnit() * canvasHeight.value,
    size: randomUnit() * 2 + 0.5,
    speed: randomUnit() * 0.5 + 0.2,
    opacity: randomUnit() * 0.5 + 0.3,
    angle: randomUnit() * Math.PI * 2
  }))
}

function drawFrame() {
  const canvas = canvasRef.value
  if (!canvas) return
  const ctx = canvas.getContext('2d')
  if (!ctx) return

  ctx.clearRect(0, 0, canvas.width, canvas.height)

  const targetOpacity = isHovered.value ? 1 : 0
  animProgress.value += (targetOpacity - animProgress.value) * 0.08

  if (animProgress.value < 0.01) {
    raf = requestAnimationFrame(drawFrame)
    return
  }

  for (const star of stars) {
    star.angle += star.speed * 0.02
    star.x += Math.cos(star.angle) * star.speed * 0.5
    star.y += Math.sin(star.angle) * star.speed * 0.3

    if (star.x < -10) star.x = canvas.width + 10
    if (star.x > canvas.width + 10) star.x = -10
    if (star.y < -10) star.y = canvas.height + 10
    if (star.y > canvas.height + 10) star.y = -10

    const alpha = star.opacity * animProgress.value
    const gradient = ctx.createRadialGradient(star.x, star.y, 0, star.x, star.y, star.size * 3)
    gradient.addColorStop(0, colorToCSS({ r: 1, g: 1, b: 1, a: alpha }))
    gradient.addColorStop(0.3, colorToCSS({ r: 1, g: 1, b: 1, a: alpha * 0.5 }))
    gradient.addColorStop(1, 'rgba(255, 255, 255, 0)')

    ctx.beginPath()
    ctx.arc(star.x, star.y, star.size * 3, 0, Math.PI * 2)
    ctx.fillStyle = gradient
    ctx.fill()
  }

  raf = requestAnimationFrame(drawFrame)
}

function handleResize() {
  const container = containerRef.value
  if (!container) return
  canvasWidth.value = container.offsetWidth
  canvasHeight.value = container.offsetHeight
  if (canvasRef.value) {
    canvasRef.value.width = canvasWidth.value
    canvasRef.value.height = canvasHeight.value
  }
  initStars()
}

useEventListener('resize', handleResize)

onMounted(() => {
  handleResize()
  raf = requestAnimationFrame(drawFrame)
})

onUnmounted(() => {
  cancelAnimationFrame(raf)
})

const bandStyle = computed(() => ({
  inset: '0',
  padding: `${borderWidth}px`,
  background: borderColor,
  borderRadius,
  mask: 'linear-gradient(#fff 0 0) content-box, linear-gradient(#fff 0 0)',
  maskComposite: 'xor',
  WebkitMaskComposite: 'xor',
  pointerEvents: 'none' as const
}))

const faceStyle = computed(() => ({
  position: 'relative' as const,
  zIndex: '1',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  padding,
  borderRadius,
  background: faceBackground,
  overflow: 'hidden',
  transition: 'transform 150ms ease',
  transform: isPressed.value ? 'scale(0.97)' : 'scale(1)'
}))
</script>

<template>
  <div
    ref="containerRef"
    class="starfield-btn"
    :style="{
      position: 'relative',
      padding: '0',
      cursor: 'pointer',
      overflow: 'visible',
      userSelect: 'none'
    }"
    @mouseenter="isHovered = true"
    @mouseleave="handleMouseLeave"
    @mousedown="isPressed = true"
    @mouseup="isPressed = false"
    @click="emit('click', $event)"
  >
    <!-- Border band -->
    <div :style="bandStyle" />

    <!-- Starfield canvas -->
    <canvas
      ref="canvasRef"
      class="starfield-canvas"
      :style="{
        position: 'absolute',
        inset: '0',
        width: '100%',
        height: '100%',
        pointerEvents: 'none',
        zIndex: '0',
        borderRadius: borderRadius
      }"
    />

    <!-- Face content -->
    <div :style="faceStyle">
      <slot />
    </div>
  </div>
</template>

<style scoped>
.starfield-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
}
.starfield-canvas {
  opacity: 0.8;
}
</style>
