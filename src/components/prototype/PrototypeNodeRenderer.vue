<script setup lang="ts">
import { computed } from 'vue'

import type { PrototypeNodeVisual } from '@open-pencil/core/prototype/runtime'
import {
  readNodeInteractions,
  type Color,
  type Fill,
  type SceneGraph,
  type SceneNode,
  type Stroke
} from '@open-pencil/scene-graph'

defineOptions({ name: 'PrototypeNodeRenderer' })

const props = defineProps<{
  nodeId: string
  graph: SceneGraph
  visuals?: ReadonlyMap<string, PrototypeNodeVisual>
  showHotspots?: boolean
}>()

const emit = defineEmits<{
  nodeClick: [nodeId: string, event: PointerEvent]
}>()

const node = computed<SceneNode | undefined>(() => props.graph.getNode(props.nodeId))

const visual = computed<PrototypeNodeVisual | undefined>(() => props.visuals?.get(props.nodeId))

const hasInteractions = computed<boolean>(() => {
  if (!node.value) return false
  return readNodeInteractions(node.value).length > 0
})

function rgbaString(color?: Color, alpha = 1): string {
  if (!color) return 'transparent'
  const r = Math.round(color.r * 255)
  const g = Math.round(color.g * 255)
  const b = Math.round(color.b * 255)
  const a = Math.max(0, Math.min(1, (color.a ?? 1) * alpha))
  return `rgba(${r}, ${g}, ${b}, ${a.toFixed(3)})`
}

function resolveBackground(n: SceneNode, v?: PrototypeNodeVisual): string {
  if (v?.fill) return v.fill
  const visibleFills = (n.fills ?? []).filter((f: Fill) => f.visible !== false)
  if (visibleFills.length === 0) return 'transparent'

  const primary = visibleFills[0]
  if (primary.type === 'SOLID') {
    return rgbaString(primary.color, primary.opacity ?? 1)
  }
  if (
    primary.type === 'GRADIENT_LINEAR' &&
    primary.gradientStops &&
    primary.gradientStops.length > 0
  ) {
    const stops = primary.gradientStops
      .map((s) => `${rgbaString(s.color)} ${(s.position * 100).toFixed(1)}%`)
      .join(', ')
    return `linear-gradient(180deg, ${stops})`
  }
  if (primary.type === 'IMAGE' && primary.imageHash) {
    const bytes = props.graph.images.get(primary.imageHash)
    if (bytes) {
      const blob = new Blob([bytes])
      const url = URL.createObjectURL(blob)
      return `url("${url}") center / cover no-repeat`
    }
  }
  return 'transparent'
}

function resolveBorder(strokes?: Stroke[]): string | undefined {
  if (!strokes || strokes.length === 0) return undefined
  const visible = strokes.filter((s) => s.visible !== false)
  if (visible.length === 0) return undefined
  const primary = visible[0]
  const color = primary.color ? rgbaString(primary.color, primary.opacity ?? 1) : '#000000'
  return `1px solid ${color}`
}

function resolveBoxShadow(n: SceneNode): string | undefined {
  if (!n.effects || n.effects.length === 0) return undefined
  const shadows = n.effects.filter((e) => e.visible !== false && e.type === 'DROP_SHADOW')
  if (shadows.length === 0) return undefined
  return shadows
    .map((e) => {
      const col = e.color ? rgbaString(e.color) : 'rgba(0,0,0,0.25)'
      const x = e.offset?.x ?? 0
      const y = e.offset?.y ?? 2
      const radius = e.radius ?? 4
      const spread = e.spread ?? 0
      return `${x}px ${y}px ${radius}px ${spread}px ${col}`
    })
    .join(', ')
}

const nodeStyle = computed<Record<string, string | number>>(() => {
  const n = node.value
  if (!n || n.visible === false) {
    return { display: 'none' }
  }

  const v = visual.value
  const x = n.x + (v?.translateX ?? 0)
  const y = n.y + (v?.translateY ?? 0)
  const w = v?.width ?? n.width
  const h = v?.height ?? n.height
  const opacity = (n.opacity ?? 1) * (v?.opacity ?? 1)
  const rot = (n.rotation ?? 0) + (v?.rotation ?? 0)
  const scale = v?.scale ?? 1

  let transformStr = ''
  if (rot !== 0) transformStr += `rotate(${rot}deg) `
  if (scale !== 1) transformStr += `scale(${scale}) `

  const style: Record<string, string | number> = {
    position: 'absolute',
    left: `${x}px`,
    top: `${y}px`,
    width: `${w}px`,
    height: `${h}px`,
    opacity,
    boxSizing: 'border-box'
  }

  if (transformStr.trim()) {
    style.transform = transformStr.trim()
  }

  // Corner radius
  if (n.type === 'ELLIPSE') {
    style.borderRadius = '50%'
  } else if (v?.cornerRadius !== undefined) {
    style.borderRadius = `${v.cornerRadius}px`
  } else if (n.independentCorners) {
    style.borderRadius = `${n.topLeftRadius ?? 0}px ${n.topRightRadius ?? 0}px ${n.bottomRightRadius ?? 0}px ${n.bottomLeftRadius ?? 0}px`
  } else if (n.cornerRadius) {
    style.borderRadius = `${n.cornerRadius}px`
  }

  // Clip content
  if (n.clipsContent) {
    style.overflow = 'hidden'
  }

  // Background
  const bg = resolveBackground(n, v)
  if (bg !== 'transparent') {
    style.background = bg
  }

  // Border & Strokes
  const border = resolveBorder(n.strokes)
  if (border) {
    style.border = border
  }

  // Box shadow
  const shadow = resolveBoxShadow(n)
  if (shadow) {
    style.boxShadow = shadow
  }

  // Blur
  if (v?.blur) {
    style.filter = `blur(${v.blur}px)`
  }

  // Typography for text nodes
  if (n.type === 'TEXT') {
    if (n.fontSize) style.fontSize = `${n.fontSize}px`
    if (n.fontFamily) style.fontFamily = n.fontFamily
    if (n.fontWeight) style.fontWeight = n.fontWeight
    if (n.italic) style.fontStyle = 'italic'
    if (n.textAlignHorizontal) {
      style.textAlign = n.textAlignHorizontal.toLowerCase()
    }
    const fill = (n.fills ?? []).find((f) => f.visible !== false)
    if (fill && fill.type === 'SOLID' && fill.color) {
      style.color = rgbaString(fill.color, fill.opacity ?? 1)
    }
    style.whiteSpace = 'pre-wrap'
    style.wordBreak = 'break-word'
    style.lineHeight = '1.3'
  }

  return style
})

function onClick(event: PointerEvent) {
  if (!node.value) return
  emit('nodeClick', props.nodeId, event)
}
</script>

<template>
  <div
    v-if="node && node.visible !== false"
    :style="nodeStyle"
    :data-node-id="node.id"
    :data-node-type="node.type"
    :class="[
      'select-none',
      hasInteractions ? 'cursor-pointer' : '',
      showHotspots && hasInteractions ? 'ring-1 ring-blue-500/30' : ''
    ]"
    @pointerup="onClick"
  >
    <!-- Text content for TEXT nodes -->
    <template v-if="node.type === 'TEXT'">
      {{ node.text }}
    </template>

    <!-- Recursive children rendering for container nodes -->
    <template v-if="node.childIds && node.childIds.length > 0">
      <PrototypeNodeRenderer
        v-for="childId in node.childIds"
        :key="childId"
        :node-id="childId"
        :graph="graph"
        :visuals="visuals"
        :show-hotspots="showHotspots"
        @node-click="(id, ev) => $emit('nodeClick', id, ev)"
      />
    </template>
  </div>
</template>
