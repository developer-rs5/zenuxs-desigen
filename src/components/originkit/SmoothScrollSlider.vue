<script setup lang="ts">
import { onMounted, onUnmounted, ref, computed, watch } from 'vue'

interface Slide {
  src: string | null
  offsetY: number
}

interface ImageInput {
  image?: string | { src?: string }
  offsetY?: number
}

const props = withDefaults(defineProps<{
  images?: (string | ImageInput)[]
  slideWidth?: number
  slideHeight?: number
  spacing?: number
  direction?: 'right' | 'left'
  smoothness?: number
  radius?: number
  dim?: number
  background?: string
  sensitivity?: number
  loop?: boolean
}>(), {
  images: () => [],
  slideWidth: 400,
  slideHeight: 400,
  spacing: 2,
  direction: 'right',
  smoothness: 10,
  radius: 16,
  dim: 10,
  background: '#000000',
  sensitivity: 5,
  loop: true
})

const containerRef = ref<HTMLDivElement | null>(null)
const nodes = ref<(HTMLDivElement | null)[]>([])
const target = ref(0)
const current = ref(0)
const width = ref(0)

const MAX_SCALE = 2.5
const MIN_SCALE = 0.1

function resolveSrc(val: string | { src?: string } | null | undefined): string | null {
  if (!val) return null
  if (typeof val === 'string') return val || null
  const src = val.src
  return typeof src === 'string' && src ? src : null
}

function imageOf(item: string | ImageInput): string | null {
  if (typeof item === 'string') return item || null
  if (item && typeof item === 'object' && 'image' in item) {
    const img = item.image
    if (typeof img === 'string') return img || null
    if (img && typeof img === 'object') return img.src || null
  }
  return null
}

function offsetOf(item: string | ImageInput): number {
  if (typeof item === 'string') return 0
  if (item && typeof item === 'object' && 'offsetY' in item) {
    const o = (item as ImageInput).offsetY
    return typeof o === 'number' && isFinite(o) ? o : 0
  }
  return 0
}

const source = computed<Slide[]>(() => {
  const resolved: Slide[] = []
  for (const item of (props.images ?? [])) {
    const src = imageOf(item)
    if (src) resolved.push({ src, offsetY: offsetOf(item) })
  }
  return resolved.length ? resolved : Array.from({ length: 6 }, () => ({ src: null, offsetY: 0 }))
})

const step = computed(() => props.slideWidth + Math.min(Math.max(props.spacing, 0), 10) * 20)

const ease = computed(() => 0.15 - (Math.min(Math.max(props.smoothness, 0), 10) / 10) * 0.13)

const dimAmount = computed(() => (Math.min(Math.max(props.dim, 0), 10) / 10) * 0.85)

const wheelMult = computed(() => 0.4 + (Math.min(Math.max(props.sensitivity, 0), 10) / 10) * 1.2)
const dragMult = computed(() => 0.6 + (Math.min(Math.max(props.sensitivity, 0), 10) / 10) * 1.8)

const flip = computed(() => props.direction === 'left')

const repeats = computed(() => {
  if (!props.loop || width.value <= 0 || step.value <= 0) return 1
  return Math.max(1, Math.ceil((width.value + step.value * 2) / (source.value.length * step.value)))
})

const slides = computed(() => {
  const out: Slide[] = []
  for (let r = 0; r < repeats.value; r++) out.push(...source.value)
  return out
})

function wrap(v: number, span: number) {
  return ((v % span) + span) % span
}

function placeholderFill(i: number) {
  const hue = (i * 47 + 210) % 360
  return `linear-gradient(150deg, hsl(${hue} 42% 34%), hsl(${(hue + 45) % 360} 55% 10%))`
}

let raf = 0
let lastTime = 0

function tick(now: number) {
  raf = requestAnimationFrame(tick)
  const c = step.value
  if (!slides.value.length || c <= 0 || width.value <= 0) return

  const span = slides.value.length * c
  const half = width.value / 2

  if (props.loop) {
    if (current.value > span || current.value < -span) {
      const shift = Math.trunc(current.value / span) * span
      current.value -= shift
      target.value -= shift
    }
  } else {
    target.value = Math.min(Math.max(target.value, 0), (slides.value.length - 1) * c)
  }

  const k = 1 - Math.pow(1 - ease.value, (1 / 60) * 60)
  current.value += (target.value - current.value) * k

  const pad = (width.value - props.slideWidth) / 2

  for (let i = 0; i < slides.value.length; i++) {
    const node = nodes.value[i]
    if (!node) continue

    let raw = i * c - current.value + pad
    const x = props.loop ? wrap(raw + c, span) - c : raw

    const distance = x + props.slideWidth / 2 - half
    let scale: number
    let push: number
    if (distance > 0) {
      scale = Math.min(MAX_SCALE, 1 + distance / width.value)
      push = (scale - 1) * props.slideWidth * 0.75
    } else {
      scale = Math.max(MIN_SCALE, 1 + distance / width.value)
      push = 0
    }

    const left = flip.value ? width.value - props.slideWidth - (x + push) : x + push
    node.style.transform = `translate3d(${left}px, -50%, 0) scale(${scale})`

    if (dimAmount.value > 0 && scale < 1) {
      const t = (1 - scale) / Math.max(0.001, 1 - MIN_SCALE)
      node.style.filter = `brightness(${1 - t * dimAmount.value})`
    } else {
      node.style.filter = 'none'
    }
  }
}

function onWheel(e: WheelEvent) {
  e.preventDefault()
  const dominant = Math.abs(e.deltaX) > Math.abs(e.deltaY) ? e.deltaX : e.deltaY
  target.value += dominant * wheelMult.value
}

let pointerId: number | null = null
let lastX = 0

function onDown(e: PointerEvent) {
  if (pointerId !== null) return
  pointerId = e.pointerId
  lastX = e.clientX
  containerRef.value?.setPointerCapture(e.pointerId)
}

function onMove(e: PointerEvent) {
  if (pointerId !== e.pointerId) return
  const dx = e.clientX - lastX
  lastX = e.clientX
  target.value += (flip.value ? dx : -dx) * dragMult.value
}

function onUp(e: PointerEvent) {
  if (pointerId !== e.pointerId) return
  pointerId = null
  if (containerRef.value?.hasPointerCapture(e.pointerId)) {
    containerRef.value.releasePointerCapture(e.pointerId)
  }
}

onMounted(() => {
  const node = containerRef.value
  if (!node) return
  const obs = new ResizeObserver((entries) => {
    width.value = entries[0].contentRect.width
  })
  obs.observe(node)
  width.value = node.getBoundingClientRect().width
  raf = requestAnimationFrame(tick)
  node.addEventListener('wheel', onWheel, { passive: false })
  node.addEventListener('pointerdown', onDown)
  node.addEventListener('pointermove', onMove)
  node.addEventListener('pointerup', onUp)
  node.addEventListener('pointercancel', onUp)
  onUnmounted(() => {
    cancelAnimationFrame(raf)
    obs.disconnect()
    node.removeEventListener('wheel', onWheel)
    node.removeEventListener('pointerdown', onDown)
    node.removeEventListener('pointermove', onMove)
    node.removeEventListener('pointerup', onUp)
    node.removeEventListener('pointercancel', onUp)
  })
})
</script>

<template>
  <div
    ref="containerRef"
    class="smooth-scroll-slider"
    :style="{ background, cursor: 'grab', touchAction: 'pan-y' }"
  >
    <div
      v-for="(slide, i) in slides"
      :key="i"
      :ref="(el: any) => { nodes[i] = el as HTMLDivElement }"
      class="slider-slide"
      :style="{
        width: slideWidth + 'px',
        height: slideHeight + 'px',
        borderRadius: radius + 'px',
        background: slide.src ? '#111' : placeholderFill(i)
      }"
    >
      <img
        v-if="slide.src"
        :src="slide.src"
        alt=""
        draggable="false"
        :style="{
          objectPosition: `50% calc(50% + ${slide.offsetY}px)`
        }"
      />
    </div>
  </div>
</template>

<style scoped>
.smooth-scroll-slider {
  position: relative;
  width: 100%;
  height: 100%;
  overflow: hidden;
}
.slider-slide {
  position: absolute;
  top: 50%;
  left: 0;
  overflow: hidden;
  will-change: transform, filter;
  transform: translate3d(0, -50%, 0);
  pointer-events: none;
}
.slider-slide img {
  width: 100%;
  height: 100%;
  object-fit: cover;
  display: block;
  user-select: none;
}
</style>
