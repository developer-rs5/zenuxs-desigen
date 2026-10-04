<script setup lang="ts">
/**
 * Live AI building overlay: world-anchored feedback while the AI mutates the
 * document — a work-region highlight for the current operation, skeleton
 * placeholders inside the frame the AI is filling (each slot hides as real
 * children cover it), and a cursor that travels to each operation.
 * Driven entirely by tool-hook state and real graph events; no timers.
 */
import { computed, onUnmounted, ref, shallowRef, watch } from 'vue'
import IconLucideMousePointer2 from '~icons/lucide/mouse-pointer-2'

import type { SceneNode, Vector } from '@open-pencil/scene-graph'

import { aiPendingWork, clearAIPendingWork } from '@/app/ai/chat/build-state'
import type { AIWorkRect } from '@/app/ai/chat/live-build'
import {
  SKELETON_MAX_CHILDREN,
  SKELETON_MIN_SIZE,
  SKELETON_SLOTS,
  coveredSlots,
  rectCenter,
  slotRects
} from '@/app/ai/chat/live-build'
import { useEditorStore } from '@/app/editor/active-store'

const store = useEditorStore()

const graphTick = ref(0)
const cursorWorld = shallowRef<Vector | null>(null)
const workRect = shallowRef<AIWorkRect | null>(null)
/** Frames created during this build, oldest → newest; the newest hosts the skeleton. */
let frameStack: string[] = []

function bumpGraph(): void {
  graphTick.value++
}

function onNodeCreated(node: SceneNode): void {
  const bounds = store.graph.getAbsoluteBounds(node.id)
  workRect.value = bounds
  cursorWorld.value = rectCenter(bounds)
  if (node.type === 'FRAME' || node.type === 'SECTION') frameStack.push(node.id)
  bumpGraph()
}

function onNodeUpdated(id: string): void {
  if (!store.graph.getNode(id)) return
  const bounds = store.graph.getAbsoluteBounds(id)
  workRect.value = bounds
  cursorWorld.value = rectCenter(bounds)
  bumpGraph()
}

function onNodeDeleted(id: string): void {
  frameStack = frameStack.filter((frameId) => frameId !== id)
  bumpGraph()
}

function reset(): void {
  frameStack = []
  workRect.value = null
  cursorWorld.value = null
  bumpGraph()
}

// The operation's target region lands before the mutation runs; the graph
// events above then refine it to the node that actually exists afterwards.
watch(aiPendingWork, (work) => {
  if (!work) return
  workRect.value = work.rect
  cursorWorld.value = rectCenter(work.rect)
})

const offGraphEvents = [
  store.onEditorEvent('node:created', onNodeCreated),
  store.onEditorEvent('node:updated', onNodeUpdated),
  store.onEditorEvent('node:deleted', onNodeDeleted),
  store.onEditorEvent('graph:replaced', reset)
]

onUnmounted(() => {
  for (const off of offGraphEvents) off()
  clearAIPendingWork()
  store.renderer?.aiClearActive()
  reset()
})

function pxStyle(rect: AIWorkRect): Record<string, string> {
  const { zoom, panX, panY } = store.state
  return {
    left: `${rect.x * zoom + panX}px`,
    top: `${rect.y * zoom + panY}px`,
    width: `${rect.width * zoom}px`,
    height: `${rect.height * zoom}px`
  }
}

const workStyle = computed(() => (workRect.value ? pxStyle(workRect.value) : null))

const cursorStyle = computed(() => {
  const point = cursorWorld.value
  if (!point) return null
  const { zoom, panX, panY } = store.state
  return { transform: `translate(${point.x * zoom + panX}px, ${point.y * zoom + panY}px)` }
})

const skeleton = computed(() => {
  void graphTick.value
  for (let i = frameStack.length - 1; i >= 0; i--) {
    const node = store.graph.getNode(frameStack[i])
    if (!node) continue
    // Newest frame wins; once it is populated the skeleton disappears entirely.
    if (node.childIds.length >= SKELETON_MAX_CHILDREN) return null
    const bounds = store.graph.getAbsoluteBounds(frameStack[i])
    if (bounds.width < SKELETON_MIN_SIZE || bounds.height < SKELETON_MIN_SIZE) return null
    const children = node.childIds.map((id) => store.graph.getAbsoluteBounds(id))
    const covered = coveredSlots(slotRects(bounds), children)
    return {
      frameStyle: pxStyle(bounds),
      slots: SKELETON_SLOTS.map((slot, index) => ({
        style: {
          left: `${slot.fx * 100}%`,
          top: `${slot.fy * 100}%`,
          width: `${slot.fw * 100}%`,
          height: `${slot.fh * 100}%`
        },
        covered: covered[index] ?? false
      }))
    }
  }
  return null
})
</script>

<template>
  <div
    data-test-id="canvas-ai-build-overlay"
    aria-hidden="true"
    class="pointer-events-none absolute inset-0 z-40"
  >
    <div
      v-if="workStyle"
      data-test-id="canvas-ai-work-region"
      :style="workStyle"
      class="absolute rounded-md border border-dashed border-accent/70 bg-accent/5 transition-all duration-200 ease-out motion-reduce:transition-none"
    />
    <div
      v-if="skeleton"
      data-test-id="canvas-ai-skeleton"
      :style="skeleton.frameStyle"
      class="absolute"
    >
      <div
        v-for="(slot, index) in skeleton.slots"
        :key="index"
        :style="slot.style"
        :data-covered="slot.covered ? 'true' : 'false'"
        class="ai-build-block transition-opacity duration-300 ease-out motion-reduce:transition-none"
      />
    </div>
    <div
      v-if="cursorStyle"
      data-test-id="canvas-ai-build-cursor"
      :style="cursorStyle"
      class="absolute top-0 left-0 transition-transform duration-300 ease-out motion-reduce:transition-none"
    >
      <span
        class="absolute -top-1.5 -left-1.5 size-3 animate-ping rounded-full bg-accent/40 motion-reduce:animate-none"
      />
      <icon-lucide-mouse-pointer-2 class="size-5 text-accent drop-shadow-md" />
    </div>
  </div>
</template>
