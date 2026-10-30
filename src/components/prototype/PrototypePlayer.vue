<script setup lang="ts">
import { useEventListener } from '@vueuse/core'
import { computed, onMounted, onUnmounted, ref, watch } from 'vue'

import {
  calculateScrollRange,
  flingAxis,
  resolveDeviceGeometry,
  type DeviceGeometry
} from '@open-pencil/core'
import {
  createPrototypeRuntime,
  type PrototypeRenderState,
  type PrototypeRuntime
} from '@open-pencil/core/prototype/runtime'
import {
  activeFlow,
  readNodeInteractions,
  readPrototypeDocument,
  type PrototypeDeviceRotation,
  type PrototypeSettings,
  type SceneNode
} from '@open-pencil/scene-graph'

import { useEditorStore } from '@/app/editor/active-store'
import PrototypeNodeRenderer from '@/components/prototype/PrototypeNodeRenderer.vue'
import Tip from '@/components/ui/overlay/Tip.vue'

const props = defineProps<{
  open: boolean
}>()

const emit = defineEmits<{
  'update:open': [value: boolean]
}>()

const store = useEditorStore()

let runtime: PrototypeRuntime | null = null
const renderState = ref<PrototypeRenderState | null>(null)
const currentScreenNode = ref<SceneNode | null>(null)
const currentFlowName = ref('Flow 1')
const scaleMode = ref<'fit' | 'actual'>('fit')
const showHotspots = ref(true)
const hotspotRipple = ref<{ x: number; y: number } | null>(null)

// Physics scroll tracking per presented frame
const scrollX = ref(0)
const scrollY = ref(0)
let flingAnimFrame: number | null = null

const settings = computed<PrototypeSettings>(() => {
  void store.state.sceneVersion
  return (
    store.getPrototypeSettings() ?? {
      device: 'None',
      background: '#1E1E1E',
      rotation: 'portrait',
      color: '',
      customSize: [1280, 720],
      responsive: false
    }
  )
})

const deviceGeom = computed<DeviceGeometry | null>(() => {
  const s = settings.value
  if (!s.device || s.device === 'None' || s.device === 'Custom size') return null
  return resolveDeviceGeometry(s.device, s.rotation as PrototypeDeviceRotation, s.color)
})

const screenDimensions = computed<{ width: number; height: number }>(() => {
  if (deviceGeom.value) {
    return { width: deviceGeom.value.screenWidth, height: deviceGeom.value.screenHeight }
  }
  const curr = currentScreenNode.value
  if (curr) {
    return { width: curr.width, height: curr.height }
  }
  return { width: 1440, height: 900 }
})

function initRuntime() {
  const root = store.graph.getNode(store.graph.rootId)
  const doc = root ? readPrototypeDocument(root) : null
  const flow = activeFlow(doc)
  currentFlowName.value = flow?.name ?? 'Flow 1'

  // Pick start frame: selected frame -> flow start -> first frame on the page.
  // Never fall back to the root `Document` node: it is a FRAME with no parent,
  // so a bare "any parentless frame" scan starts the player on the container.
  const pageId = store.state.currentPageId
  let startId: string | null = null
  const selId = Array.from(store.state.selectedIds)[0]
  const selNode = selId ? store.graph.getNode(selId) : null
  if (selNode && selNode.type === 'FRAME' && selNode.parentId === pageId) {
    startId = selNode.id
  } else if (flow?.startNodeId && store.graph.getNode(flow.startNodeId)) {
    startId = flow.startNodeId
  } else {
    const page = store.graph.getNode(pageId)
    const firstFrameId = page?.childIds.find(
      (id) => store.graph.getNode(id)?.type === 'FRAME'
    )
    startId = firstFrameId ?? null
  }

  if (!startId) return

  runtime = createPrototypeRuntime(store.graph, {
    onMutate: () => {
      // Instance variant swap during presentation
      return true
    }
  })

  runtime.start(performance.now(), startId)
  syncState()
  runAnimationLoop()
}

let animFrame: number | null = null

function runAnimationLoop() {
  if (animFrame) cancelAnimationFrame(animFrame)
  function step() {
    if (!runtime) {
      animFrame = null
      return
    }
    const now = performance.now()
    runtime.tick(now)
    syncState()
    if (runtime.hasPendingWork(now)) {
      animFrame = requestAnimationFrame(step)
    } else {
      animFrame = null
    }
  }
  animFrame = requestAnimationFrame(step)
}

function syncState() {
  if (!runtime) return
  renderState.value = runtime.getRenderState()
  const sId = runtime.getScreenId()
  currentScreenNode.value = sId ? (store.graph.getNode(sId) ?? null) : null
}

function onNodeClicked(nodeId: string, _event?: PointerEvent) {
  if (!runtime) return
  const now = performance.now()
  runtime.click(nodeId, now)
  runAnimationLoop()
}

function restartFlow() {
  if (flingAnimFrame) cancelAnimationFrame(flingAnimFrame)
  if (animFrame) cancelAnimationFrame(animFrame)
  scrollX.value = 0
  scrollY.value = 0
  initRuntime()
}

function close() {
  if (flingAnimFrame) cancelAnimationFrame(flingAnimFrame)
  if (animFrame) cancelAnimationFrame(animFrame)
  emit('update:open', false)
}

function toggleScale() {
  scaleMode.value = scaleMode.value === 'fit' ? 'actual' : 'fit'
}

// ---------------- Input Handling & Physics Scrolling ----------------
let pointerIsDown = false
let startPointer = { x: 0, y: 0 }
let lastPointerTime = 0
let pointerVelocity = { vx: 0, vy: 0 }

function onScreenPointerDown(e: PointerEvent) {
  pointerIsDown = true
  startPointer = { x: e.clientX, y: e.clientY }
  lastPointerTime = performance.now()
  pointerVelocity = { vx: 0, vy: 0 }

  if (flingAnimFrame) {
    cancelAnimationFrame(flingAnimFrame)
    flingAnimFrame = null
  }

  const rect = (e.currentTarget as HTMLElement).getBoundingClientRect()
  const cx = e.clientX - rect.left + scrollX.value
  const cy = e.clientY - rect.top + scrollY.value

  const hit = store.hitTestAtPoint(cx, cy)
  if (hit && runtime) {
    runtime.pointerDown(hit.id, performance.now())
  }
}

function onScreenPointerMove(e: PointerEvent) {
  if (!pointerIsDown) return

  const now = performance.now()
  const dt = Math.max(1, now - lastPointerTime) / 1000
  const dy = e.clientY - startPointer.y

  pointerVelocity = {
    vx: (e.clientX - startPointer.x) / dt,
    vy: (e.clientY - startPointer.y) / dt
  }
  startPointer = { x: e.clientX, y: e.clientY }
  lastPointerTime = now

  // Check scroll range
  const curr = currentScreenNode.value
  if (curr) {
    const range = calculateScrollRange(
      store.graph,
      curr.id,
      screenDimensions.value.width,
      screenDimensions.value.height
    )
    if (range.maxY > 0) {
      scrollY.value = Math.max(0, Math.min(range.maxY, scrollY.value - dy))
    }
  }

  const rect = (e.currentTarget as HTMLElement).getBoundingClientRect()
  const cx = e.clientX - rect.left + scrollX.value
  const cy = e.clientY - rect.top + scrollY.value

  const hit = store.hitTestAtPoint(cx, cy)
  if (hit && runtime) {
    runtime.pointerDown(hit.id, now)
  }
}

function onScreenPointerUp(e: PointerEvent) {
  if (!pointerIsDown) return
  pointerIsDown = false

  const rect = (e.currentTarget as HTMLElement).getBoundingClientRect()
  const cx = e.clientX - rect.left + scrollX.value
  const cy = e.clientY - rect.top + scrollY.value

  const hit = store.hitTestAtPoint(cx, cy)
  if (hit && runtime) {
    runtime.pointerUp(hit.id, performance.now())
    runtime.click(hit.id, performance.now())
    runAnimationLoop()

    // Non-interactive click feedback (hotspot ripple)
    const hasInteractions = readNodeInteractions(hit).length > 0
    if (!hasInteractions && showHotspots.value) {
      hotspotRipple.value = { x: e.clientX - rect.left, y: e.clientY - rect.top }
      setTimeout(() => {
        hotspotRipple.value = null
      }, 400)
    }
  }

  // Fling momentum continuation
  const curr = currentScreenNode.value
  if (curr && (Math.abs(pointerVelocity.vx) > 30 || Math.abs(pointerVelocity.vy) > 30)) {
    const range = calculateScrollRange(
      store.graph,
      curr.id,
      screenDimensions.value.width,
      screenDimensions.value.height
    )
    let lastTime = performance.now()
    let curY = scrollY.value
    let curVy = -pointerVelocity.vy

    function stepFling() {
      const now = performance.now()
      const dt = (now - lastTime) / 1000
      lastTime = now

      const res = flingAxis(curY, curVy, range.maxY, dt)
      curY = res.pos
      curVy = res.vel
      scrollY.value = curY

      if (!res.done) {
        flingAnimFrame = requestAnimationFrame(stepFling)
      } else {
        flingAnimFrame = null
      }
    }
    flingAnimFrame = requestAnimationFrame(stepFling)
  }
}

function onScreenWheel(e: WheelEvent) {
  e.preventDefault()
  const curr = currentScreenNode.value
  if (!curr) return
  const range = calculateScrollRange(
    store.graph,
    curr.id,
    screenDimensions.value.width,
    screenDimensions.value.height
  )
  if (range.maxY > 0) {
    scrollY.value = Math.max(0, Math.min(range.maxY, scrollY.value + e.deltaY))
  }
}

useEventListener(window, 'keydown', (e: KeyboardEvent) => {
  if (!props.open) return
  if (e.key === 'Escape') close()
  if (e.key === 'r' || e.key === 'R') restartFlow()
  if (e.key === 'z' || e.key === 'Z') toggleScale()
})

watch(
  () => props.open,
  (isOpen) => {
    if (isOpen) restartFlow()
  }
)

onMounted(() => {
  if (props.open) restartFlow()
})

onUnmounted(() => {
  if (flingAnimFrame) cancelAnimationFrame(flingAnimFrame)
  if (animFrame) cancelAnimationFrame(animFrame)
})
</script>

<template>
  <div
    v-if="open"
    data-test-id="prototype-player-root"
    class="fixed inset-0 z-50 flex flex-col items-center justify-between overflow-hidden select-none"
    :style="{ backgroundColor: settings.background || '#121417' }"
  >
    <!-- Top Player Controls Bar -->
    <header
      class="flex h-12 w-full shrink-0 items-center justify-between border-b border-[#292D33]/60 bg-[#14171B]/90 px-4 text-[#F5F7FA] backdrop-blur-md"
    >
      <div class="flex items-center gap-2.5">
        <span class="rounded bg-[#3B82F6]/20 px-2 py-0.5 text-[11px] font-semibold text-[#60A5FA]">
          PROTOTYPE
        </span>
        <span class="text-xs font-medium">{{ currentFlowName }}</span>
        <span v-if="currentScreenNode" class="text-xs text-[#9CA3AF]">
          · {{ currentScreenNode.name }}
        </span>
      </div>

      <div class="flex items-center gap-1.5">
        <Tip label="Hotspot hints on click">
          <button
            type="button"
            class="flex size-7 items-center justify-center rounded transition-colors"
            :class="
              showHotspots
                ? 'text-[#3B82F6] hover:bg-[#1E2126]'
                : 'text-[#6B7280] hover:text-[#9CA3AF]'
            "
            @click="showHotspots = !showHotspots"
          >
            <icon-lucide-zap class="size-4" />
          </button>
        </Tip>

        <Tip label="Toggle fit / 100% (Z)">
          <button
            type="button"
            class="flex size-7 items-center justify-center rounded text-[#9CA3AF] transition-colors hover:bg-[#1E2126] hover:text-[#F5F7FA]"
            @click="toggleScale"
          >
            <icon-lucide-maximize-2 v-if="scaleMode === 'fit'" class="size-4" />
            <icon-lucide-minimize-2 v-else class="size-4" />
          </button>
        </Tip>

        <Tip label="Restart prototype (R)">
          <button
            type="button"
            class="flex size-7 items-center justify-center rounded text-[#9CA3AF] transition-colors hover:bg-[#1E2126] hover:text-[#F5F7FA]"
            @click="restartFlow"
          >
            <icon-lucide-rotate-ccw class="size-4" />
          </button>
        </Tip>

        <div class="mx-1.5 h-4 w-px bg-[#292D33]" />

        <Tip label="Close presentation (Esc)">
          <button
            type="button"
            class="flex size-7 items-center justify-center rounded text-[#9CA3AF] transition-colors hover:bg-[#EF4444]/20 hover:text-[#EF4444]"
            @click="close"
          >
            <icon-lucide-x class="size-4" />
          </button>
        </Tip>
      </div>
    </header>

    <!-- Center Presentation Stage -->
    <main class="relative flex flex-1 items-center justify-center p-6 overflow-hidden">
      <!-- Device Chassis Frame (when a device is selected) -->
      <div
        v-if="deviceGeom"
        class="relative flex flex-col items-center justify-center shadow-2xl transition-all"
        :style="{
          width: `${deviceGeom.bodyWidth}px`,
          height: `${deviceGeom.bodyHeight}px`,
          backgroundColor: deviceGeom.color ? `rgb(${deviceGeom.color.rgb.join(',')})` : '#2E2F33',
          borderRadius: `${deviceGeom.cornerRadius + deviceGeom.bezelWidth}px`,
          padding: `${deviceGeom.outsetTop}px ${deviceGeom.outsetSide}px ${deviceGeom.outsetBottom}px ${deviceGeom.outsetSide}px`,
          boxShadow: '0 25px 60px -15px rgba(0,0,0,0.7), inset 0 0 2px 1px rgba(255,255,255,0.2)'
        }"
      >
        <!-- Screen Container with Bezel and Corner Radius -->
        <div
          class="relative overflow-hidden cursor-pointer"
          :style="{
            width: `${screenDimensions.width}px`,
            height: `${screenDimensions.height}px`,
            borderRadius: `${deviceGeom.cornerRadius}px`,
            backgroundColor: currentScreenNode?.fills?.[0]?.color
              ? `rgba(${currentScreenNode.fills[0].color.r * 255}, ${currentScreenNode.fills[0].color.g * 255}, ${currentScreenNode.fills[0].color.b * 255}, ${currentScreenNode.fills[0].color.a ?? 1})`
              : '#FFFFFF'
          }"
          @pointerdown="onScreenPointerDown"
          @pointermove="onScreenPointerMove"
          @pointerup="onScreenPointerUp"
          @wheel="onScreenWheel"
        >
          <!-- Dynamic Island / Speaker cutout for mobile devices -->
          <div
            v-if="deviceGeom.screenWidth < 500 && deviceGeom.cornerRadius > 0"
            class="pointer-events-none absolute top-3 left-1/2 z-40 h-6 w-24 -translate-x-1/2 rounded-full bg-black shadow-inner"
          />

          <!-- Screen Content (Translated by physics scroll) -->
          <div
            class="relative size-full transition-transform duration-75 ease-out"
            :style="{
              transform: `translate(${-scrollX}px, ${-scrollY}px)`
            }"
          >
            <template v-if="renderState && renderState.drawIds.length > 0">
              <PrototypeNodeRenderer
                v-for="id in renderState.drawIds"
                :key="id"
                :node-id="id"
                :graph="store.graph"
                :visuals="renderState.nodeVisuals"
                :show-hotspots="showHotspots"
                @node-click="onNodeClicked"
              />
            </template>
            <template v-else-if="currentScreenNode">
              <PrototypeNodeRenderer
                :node-id="currentScreenNode.id"
                :graph="store.graph"
                :visuals="renderState?.nodeVisuals"
                :show-hotspots="showHotspots"
                @node-click="onNodeClicked"
              />
            </template>
          </div>

          <!-- Overlay Backdrop Dimmer -->
          <div
            v-if="renderState && renderState.backdropOpacity > 0"
            class="pointer-events-none absolute inset-0 bg-black transition-opacity"
            :style="{ opacity: renderState.backdropOpacity }"
          />

          <!-- Hotspot ripple hint -->
          <div
            v-if="hotspotRipple"
            class="pointer-events-none absolute size-12 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-[#3B82F6] bg-[#3B82F6]/20 animate-ping"
            :style="{ left: `${hotspotRipple.x}px`, top: `${hotspotRipple.y}px` }"
          />
        </div>
      </div>

      <!-- Clean Display without Chassis Body (Device = None or Custom Size) -->
      <div
        v-else
        class="relative overflow-hidden rounded-lg shadow-2xl cursor-pointer"
        :style="{
          width: `${screenDimensions.width}px`,
          height: `${screenDimensions.height}px`,
          backgroundColor: currentScreenNode?.fills?.[0]?.color
            ? `rgba(${currentScreenNode.fills[0].color.r * 255}, ${currentScreenNode.fills[0].color.g * 255}, ${currentScreenNode.fills[0].color.b * 255}, ${currentScreenNode.fills[0].color.a ?? 1})`
            : '#FFFFFF'
        }"
        @pointerdown="onScreenPointerDown"
        @pointermove="onScreenPointerMove"
        @pointerup="onScreenPointerUp"
        @wheel="onScreenWheel"
      >
        <!-- Screen Content (Translated by physics scroll) -->
        <div
          class="relative size-full transition-transform duration-75 ease-out"
          :style="{
            transform: `translate(${-scrollX}px, ${-scrollY}px)`
          }"
        >
          <template v-if="renderState && renderState.drawIds.length > 0">
            <PrototypeNodeRenderer
              v-for="id in renderState.drawIds"
              :key="id"
              :node-id="id"
              :graph="store.graph"
              :visuals="renderState.nodeVisuals"
              :show-hotspots="showHotspots"
              @node-click="onNodeClicked"
            />
          </template>
          <template v-else-if="currentScreenNode">
            <PrototypeNodeRenderer
              :node-id="currentScreenNode.id"
              :graph="store.graph"
              :visuals="renderState?.nodeVisuals"
              :show-hotspots="showHotspots"
              @node-click="onNodeClicked"
            />
          </template>
        </div>

        <!-- Overlay Backdrop Dimmer -->
        <div
          v-if="renderState && renderState.backdropOpacity > 0"
          class="pointer-events-none absolute inset-0 bg-black transition-opacity"
          :style="{ opacity: renderState.backdropOpacity }"
        />

        <!-- Hotspot ripple hint -->
        <div
          v-if="hotspotRipple"
          class="pointer-events-none absolute size-12 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-[#3B82F6] bg-[#3B82F6]/20 animate-ping"
          :style="{ left: `${hotspotRipple.x}px`, top: `${hotspotRipple.y}px` }"
        />
      </div>
    </main>

    <!-- Bottom Keyboard Shortcut Guide -->
    <footer
      class="flex h-8 w-full shrink-0 items-center justify-center gap-4 text-[11px] text-[#6B7280]"
    >
      <span
        ><kbd class="rounded border border-[#292D33] px-1 py-0.5 text-[10px] text-[#9CA3AF]">R</kbd>
        Restart</span
      >
      <span
        ><kbd class="rounded border border-[#292D33] px-1 py-0.5 text-[10px] text-[#9CA3AF]">Z</kbd>
        Toggle Scale</span
      >
      <span
        ><kbd class="rounded border border-[#292D33] px-1 py-0.5 text-[10px] text-[#9CA3AF]"
          >Esc</kbd
        >
        Close</span
      >
    </footer>
  </div>
</template>
