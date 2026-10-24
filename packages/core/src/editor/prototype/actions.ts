import {
  activeFlow,
  INTERACTIONS_PLUGIN_KEY,
  PROTOTYPE_DOC_PLUGIN_KEY,
  PROTOTYPE_PLUGIN_ID,
  PROTOTYPE_SCHEMA_VERSION,
  readNodeInteractions,
  readPrototypeDocument,
  resolveVariantComponentId,
  serializePluginValue,
  STATE_PLUGIN_KEY,
  type PrototypeDocument,
  type PrototypeFlow,
  type PrototypeInteraction,
  type PrototypeSettings,
  type PrototypeTransition,
  type PrototypeStateModel,
  type SceneNode
} from '@open-pencil/scene-graph'

import type { PrototypeConnectionsOverlay } from '#core/canvas/overlays/prototype-connections'
import { reapplyInstanceComponentProperties } from '#core/editor/components/properties'
import type { EditorContext } from '#core/editor/types'
import {
  createPrototypeRuntime,
  type PrototypeRenderState,
  type PrototypeRuntime
} from '#core/prototype/runtime'

const now = typeof performance !== 'undefined' ? () => performance.now() : () => 0

/** Hold duration before a preview press fires the longPress trigger. */
export const LONG_PRESS_THRESHOLD_MS = 500

export interface PrototypeActionOptions {
  /** Long-press threshold in ms; defaults to `LONG_PRESS_THRESHOLD_MS`. */
  longPressThresholdMs?: number
  /**
   * Framework-neutral prefers-reduced-motion query, evaluated when a preview
   * starts. Core never touches matchMedia, so the app supplies this.
   */
  prefersReducedMotion?: () => boolean
}

/**
 * Editor-side prototype preview actions (spec §9): resolve the flow entry
 * node, run the runtime, drive frame ticks while transitions are pending,
 * and translate canvas pointer input into runtime dispatches.
 *
 * Time is injectable (`nowMs` defaults to `performance.now()`) so engine
 * tests can advance the preview deterministically.
 */
export function createPrototypeActions(
  ctx: EditorContext,
  zoomToBounds: (minX: number, minY: number, maxX: number, maxY: number) => void,
  options: PrototypeActionOptions = {}
) {
  const longPressThresholdMs = options.longPressThresholdMs ?? LONG_PRESS_THRESHOLD_MS
  let runtime: PrototypeRuntime | null = null
  let frameHandle: number | null = null
  /** Node that received pointerDown — release must fire even if the pointer lifts elsewhere. */
  let pressedId: string | null = null
  /** World-space press origin; drag deltas accumulate from it. */
  let pressPoint: { cx: number; cy: number } | null = null
  let dragMoved = false
  let longPressTimer: ReturnType<typeof setTimeout> | null = null
  /** Screen the camera is framed on; navigation must follow the runtime. */
  let framedScreenId: string | null = null
  /**
   * Canvas input delivers pointerup AND mouseup for one physical click, so
   * previewPointerUp runs twice; the stray second click re-dispatched navigate
   * and cleared the in-flight transition (state flipped with no visible move).
   */
  let gestureActive = false

  /**
   * Preview renders screens at their authored world positions, so a navigate
   * to an off-camera screen would swap state while showing nothing. Re-frame
   * whenever the runtime's current screen changes (overlays don't move it).
   */
  function frameCurrentScreen() {
    const id = runtime?.getScreenId() ?? null
    if (!runtime || id === framedScreenId) return
    framedScreenId = id
    if (id === null) return
    const node = ctx.graph.getNode(id)
    if (!node) return
    const abs = ctx.graph.getAbsolutePosition(id)
    zoomToBounds(abs.x, abs.y, abs.x + node.width, abs.y + node.height)
  }

  function sync(repaint: boolean) {
    ctx.state.prototypePreview = runtime?.getRenderState() ?? null
    frameCurrentScreen()
    if (repaint) ctx.requestRepaint()
  }

  function hoverPreview(cx: number, cy: number, nowMs: number) {
    if (!runtime) return
    runtime.updateHover(previewHoverChain(cx, cy), nowMs)
    sync(true)
    scheduleTicks()
  }

  function scheduleTicks() {
    if (frameHandle !== null || !runtime) return
    if (typeof requestAnimationFrame !== 'function') return
    if (!runtime.hasPendingWork(now())) return
    frameHandle = requestAnimationFrame(() => {
      frameHandle = null
      if (!runtime) return
      runtime.tick(now())
      sync(true)
      scheduleTicks()
    })
  }

  function cancelTicks() {
    if (frameHandle !== null && typeof cancelAnimationFrame === 'function') {
      cancelAnimationFrame(frameHandle)
    }
    frameHandle = null
  }

  /** Flow entry → explicit node → active flow → first FRAME on the page. */
  function resolveStartNode(explicit?: string): string | null {
    if (explicit && ctx.graph.getNode(explicit)) return explicit
    const root = ctx.graph.getNode(ctx.graph.rootId)
    if (root) {
      const flow = activeFlow(readPrototypeDocument(root))
      if (flow && ctx.graph.getNode(flow.startNodeId)) return flow.startNodeId
    }
    const page = ctx.graph.getNode(ctx.state.currentPageId)
    return page?.childIds.find((id) => ctx.graph.getNode(id)?.type === 'FRAME') ?? null
  }

  /**
   * Preview-time variant swap: an instance variant change is a document
   * mutation (the instance's main component changes), so it runs through this
   * injected channel — undo-batched here, a recorded warning in headless
   * runtimes that never provide it.
   */
  function applyVariantMutation(nodeId: string, variant: string): boolean {
    const instance = ctx.graph.getNode(nodeId)
    if (instance?.type !== 'INSTANCE' || !instance.componentId) return false
    const targetId = resolveVariantComponentId(ctx.graph, nodeId, variant)
    if (!targetId) return false
    const previousComponentId = instance.componentId
    if (targetId === previousComponentId) return true
    const apply = (componentId: string) => {
      ctx.graph.swapInstanceComponent(nodeId, componentId)
      reapplyInstanceComponentProperties(ctx, nodeId)
      ctx.requestRender()
    }
    apply(targetId)
    ctx.undo.push({
      label: 'Set variant',
      forward: () => apply(targetId),
      inverse: () => apply(previousComponentId)
    })
    return true
  }

  function cancelLongPress() {
    if (longPressTimer !== null && typeof clearTimeout === 'function') clearTimeout(longPressTimer)
    longPressTimer = null
  }

  function scheduleLongPress(nodeId: string) {
    cancelLongPress()
    if (typeof setTimeout !== 'function' || longPressThresholdMs <= 0) return
    longPressTimer = setTimeout(() => {
      longPressTimer = null
      if (!runtime || pressedId !== nodeId) return
      runtime.longPress(nodeId, now())
      sync(true)
      scheduleTicks()
    }, longPressThresholdMs)
  }

  /**
   * Hit test restricted to what the preview draws: topmost overlay first,
   * falling back to the root itself when the point is inside its bounds.
   * ponytail: ignores in-flight visual offsets (slide/scale), so mid-animation
   * clicks land on authored geometry; good enough for the vertical slices.
   */
  function previewHit(cx: number, cy: number): SceneNode | null {
    const preview = runtime?.getRenderState()
    if (!preview) return null
    for (let i = preview.drawIds.length - 1; i >= 0; i--) {
      const rootId = preview.drawIds[i]
      if (!rootId) continue
      const deep = ctx.graph.hitTestDeep(cx, cy, rootId)
      if (deep) return deep
      const root = ctx.graph.getNode(rootId)
      if (!root) continue
      const abs = ctx.graph.getAbsolutePosition(rootId)
      if (cx >= abs.x && cx <= abs.x + root.width && cy >= abs.y && cy <= abs.y + root.height) {
        return root
      }
    }
    return null
  }

  /** Hit node up to and including its screen/overlay root (hover chain). */
  function previewHoverChain(cx: number, cy: number): string[] {
    const preview = runtime?.getRenderState()
    const hit = previewHit(cx, cy)
    if (!preview || !hit) return []
    const roots = new Set(preview.drawIds)
    const chain = [hit.id]
    let current = hit
    while (!roots.has(current.id)) {
      const parentId = current.parentId
      const parent = parentId ? ctx.graph.getNode(parentId) : null
      if (!parent || parent.type === 'CANVAS') break
      chain.push(parent.id)
      current = parent
    }
    return chain
  }

  /**
   * Overwrite one prototype pluginData key with an undoable transaction;
   * `value === null` removes the key instead of serializing it.
   */
  function writePluginKey(nodeId: string, key: string, value: unknown, label: string): boolean {
    const node = ctx.graph.getNode(nodeId)
    if (!node) return false
    const previous = node.pluginData
    const rest = previous.filter(
      (entry) => !(entry.pluginId === PROTOTYPE_PLUGIN_ID && entry.key === key)
    )
    const next =
      value === null
        ? rest
        : [...rest, { pluginId: PROTOTYPE_PLUGIN_ID, key, value: serializePluginValue(value) }]
    ctx.graph.updateNode(nodeId, { pluginData: next })
    ctx.undo.push({
      label,
      forward: () => {
        const target = ctx.graph.getNode(nodeId)
        if (target) ctx.graph.updateNode(nodeId, { pluginData: next })
      },
      inverse: () => {
        const target = ctx.graph.getNode(nodeId)
        if (target) ctx.graph.updateNode(nodeId, { pluginData: previous })
      }
    })
    return true
  }

  return {
    isPrototypePreviewActive: () => runtime !== null,

    startPrototypePreview(startNodeId?: string, nowMs = now()): boolean {
      const target = resolveStartNode(startNodeId)
      if (!target) return false
      cancelTicks()
      cancelLongPress()
      runtime?.stop()
      pressedId = null
      pressPoint = null
      dragMoved = false
      runtime = createPrototypeRuntime(ctx.graph, {
        onMutate: applyVariantMutation,
        reducedMotion: options.prefersReducedMotion?.() === true
      })
      ctx.setSelectedIds(new Set())
      ctx.state.hoveredNodeId = null
      ctx.state.measurementMode = 'off'
      runtime.start(nowMs, target)
      const node = ctx.graph.getNode(target)
      framedScreenId = node ? target : null
      if (node) {
        const abs = ctx.graph.getAbsolutePosition(target)
        zoomToBounds(abs.x, abs.y, abs.x + node.width, abs.y + node.height)
      }
      sync(true)
      scheduleTicks()
      return true
    },

    stopPrototypePreview() {
      if (!runtime) return
      cancelTicks()
      cancelLongPress()
      runtime.stop()
      runtime = null
      framedScreenId = null
      pressedId = null
      pressPoint = null
      dragMoved = false
      ctx.state.prototypePreview = null
      // Full render: the cached scene picture must be rebuilt for edit mode.
      ctx.requestRender()
    },

    /** Advance the preview; also the deterministic driver for engine tests. */
    tickPrototypePreview(nowMs = now()) {
      if (!runtime) return
      runtime.tick(nowMs)
      sync(true)
      scheduleTicks()
    },

    previewPointerDown(cx: number, cy: number, nowMs = now()) {
      if (!runtime) return
      // Armed even on an empty press: the duplicate mouseup that follows one
      // physical click must not deliver a second release/click.
      gestureActive = true
      const hit = previewHit(cx, cy)
      if (!hit) return
      pressedId = hit.id
      pressPoint = { cx, cy }
      dragMoved = false
      runtime.pointerDown(hit.id, nowMs)
      // No-op unless the hit chain owns a drag interaction.
      runtime.beginDrag(hit.id, nowMs)
      scheduleLongPress(hit.id)
      sync(true)
      scheduleTicks()
    },

    previewPointerUp(cx: number, cy: number, nowMs = now()) {
      if (!runtime || !gestureActive) return
      gestureActive = false
      cancelLongPress()
      const wasDragging = runtime.isDragging()
      if (wasDragging) runtime.endDrag(nowMs)
      const hit = previewHit(cx, cy)
      // Release always reaches the pressed node (a lift outside the canvas or
      // over another node must not leave press-only state visuals stuck).
      const releaseId = pressedId ?? hit?.id
      const suppressClick = wasDragging && dragMoved
      pressedId = null
      pressPoint = null
      dragMoved = false
      if (releaseId) runtime.pointerUp(releaseId, nowMs)
      // A drag consumed the gesture: its movement must not also fire a click.
      if (hit && !suppressClick) runtime.click(hit.id, nowMs)
      sync(true)
      scheduleTicks()
    },

    /** Pointer move in preview: track an active drag, otherwise update hover. */
    previewPointerMove(cx: number, cy: number, nowMs = now()) {
      if (!runtime) return
      if (runtime.isDragging() && pressPoint) {
        runtime.updateDrag(cx - pressPoint.cx, cy - pressPoint.cy, nowMs)
        if (cx !== pressPoint.cx || cy !== pressPoint.cy) dragMoved = true
        sync(true)
        scheduleTicks()
        return
      }
      hoverPreview(cx, cy, nowMs)
    },

    previewHover(cx: number, cy: number, nowMs = now()) {
      hoverPreview(cx, cy, nowMs)
    },

    /** Preview wheel: dispatch scroll triggers for nodes with scroll interactions. */
    previewScroll(cx: number, cy: number, deltaY: number, nowMs = now()) {
      if (!runtime) return
      const hit = previewHit(cx, cy)
      if (!hit) return
      runtime.scroll(hit.id, deltaY, nowMs)
      sync(true)
      scheduleTicks()
    },

    /** Pointer left the canvas: clear the hover chain. */
    previewPointerLeave(nowMs = now()) {
      if (!runtime) return
      cancelLongPress()
      runtime.updateHover([], nowMs)
      sync(true)
      scheduleTicks()
    },

    /** Replace a node's interactions; empty array removes the key. */
    setPrototypeInteractions(nodeId: string, interactions: PrototypeInteraction[]): boolean {
      return writePluginKey(
        nodeId,
        INTERACTIONS_PLUGIN_KEY,
        interactions.length > 0 ? interactions : null,
        interactions.length > 0 ? 'Set interactions' : 'Clear interactions'
      )
    },

    /** Replace a node's state model; null removes the key. */
    setPrototypeStateModel(nodeId: string, model: PrototypeStateModel | null): boolean {
      return writePluginKey(nodeId, STATE_PLUGIN_KEY, model, 'Set states')
    },

    /** Point the active flow's entry node at a screen (creates the flow doc). */
    setPrototypeStartNode(startNodeId: string): boolean {
      if (!ctx.graph.getNode(startNodeId)) return false
      const root = ctx.graph.getNode(ctx.graph.rootId)
      if (!root) return false
      const doc = readPrototypeDocument(root)
      const flows = [...(doc?.flows ?? [])]
      const activeIndex = doc?.activeFlowId
        ? flows.findIndex((flow) => flow.id === doc.activeFlowId)
        : 0
      const baseIndex = activeIndex < 0 ? 0 : activeIndex
      const base = flows.at(baseIndex)
      const flow: PrototypeFlow = base
        ? { ...base, startNodeId }
        : { id: 'flow-1', name: 'Flow 1', startNodeId }
      if (base) flows[baseIndex] = flow
      else flows.push(flow)
      const next: PrototypeDocument = {
        version: doc?.version ?? PROTOTYPE_SCHEMA_VERSION,
        flows,
        activeFlowId: doc?.activeFlowId ?? flow.id
      }
      return writePluginKey(ctx.graph.rootId, PROTOTYPE_DOC_PLUGIN_KEY, next, 'Set flow start')
    },

    /** Make a flow the one preview/presentation starts from. */
    setActivePrototypeFlow(flowId: string): boolean {
      const root = ctx.graph.getNode(ctx.graph.rootId)
      const doc = root ? readPrototypeDocument(root) : null
      if (!doc || !doc.flows.some((flow) => flow.id === flowId)) return false
      const next: PrototypeDocument = { ...doc, activeFlowId: flowId }
      return writePluginKey(ctx.graph.rootId, PROTOTYPE_DOC_PLUGIN_KEY, next, 'Set active flow')
    },

    /** Add a flow and make it active; returns the new flow id (null on failure). */
    addPrototypeFlow(name?: string): string | null {
      const root = ctx.graph.getNode(ctx.graph.rootId)
      if (!root) return null
      const doc = readPrototypeDocument(root)
      const flows = [...(doc?.flows ?? [])]
      if (flows.length >= 64) return null
      const flow: PrototypeFlow = {
        id: `flow-${crypto.randomUUID()}`,
        name: (name?.trim() || `Flow ${flows.length + 1}`).slice(0, 128),
        // Empty start = no entry yet; setPrototypeStartNode fills it in.
        startNodeId: flows[0]?.startNodeId ?? ''
      }
      flows.push(flow)
      const next: PrototypeDocument = {
        version: doc?.version ?? PROTOTYPE_SCHEMA_VERSION,
        flows,
        activeFlowId: flow.id
      }
      return writePluginKey(ctx.graph.rootId, PROTOTYPE_DOC_PLUGIN_KEY, next, 'Add flow')
        ? flow.id
        : null
    },

    renamePrototypeFlow(flowId: string, name: string): boolean {
      const trimmed = name.trim()
      if (!trimmed) return false
      const root = ctx.graph.getNode(ctx.graph.rootId)
      const doc = root ? readPrototypeDocument(root) : null
      if (!doc) return false
      const flows = doc.flows.map((flow) =>
        flow.id === flowId ? { ...flow, name: trimmed.slice(0, 128) } : flow
      )
      if (!flows.some((flow) => flow.id === flowId)) return false
      const next: PrototypeDocument = { ...doc, flows }
      return writePluginKey(ctx.graph.rootId, PROTOTYPE_DOC_PLUGIN_KEY, next, 'Rename flow')
    },

    deletePrototypeFlow(flowId: string): boolean {
      const root = ctx.graph.getNode(ctx.graph.rootId)
      const doc = root ? readPrototypeDocument(root) : null
      if (!doc || !doc.flows.some((flow) => flow.id === flowId)) return false
      const flows = doc.flows.filter((flow) => flow.id !== flowId)
      const next: PrototypeDocument = { ...doc, flows }
      if (doc.activeFlowId === flowId) delete next.activeFlowId
      return writePluginKey(ctx.graph.rootId, PROTOTYPE_DOC_PLUGIN_KEY, next, 'Delete flow')
    },

    setPrototypeConnectionsOverlay(overlay: PrototypeConnectionsOverlay | null): void {
      ctx.state.prototypeConnections = overlay
      ctx.requestRender()
    },

    setPrototypeSettings(settings: PrototypeSettings): boolean {
      const root = ctx.graph.getNode(ctx.graph.rootId)
      const doc = root ? readPrototypeDocument(root) : null
      const next: PrototypeDocument = {
        version: doc?.version ?? PROTOTYPE_SCHEMA_VERSION,
        flows: doc?.flows ?? [],
        activeFlowId: doc?.activeFlowId,
        settings
      }
      return writePluginKey(
        ctx.graph.rootId,
        PROTOTYPE_DOC_PLUGIN_KEY,
        next,
        'Update prototype settings'
      )
    },

    getPrototypeSettings(): PrototypeSettings | null {
      const root = ctx.graph.getNode(ctx.graph.rootId)
      const doc = root ? readPrototypeDocument(root) : null
      return doc?.settings ?? null
    },

    connectPrototypeNodes(
      sourceId: string,
      destId: string,
      transition?: PrototypeTransition
    ): boolean {
      const source = ctx.graph.getNode(sourceId)
      if (!source || !ctx.graph.getNode(destId)) return false
      const interactions = readNodeInteractions(source)
      const newInteraction: PrototypeInteraction = {
        id: `interaction-${crypto.randomUUID()}`,
        trigger: 'click',
        action: { type: 'navigate', destinationId: destId },
        transition: transition ?? { kind: 'smartAnimate', durationMs: 300 }
      }
      return writePluginKey(
        sourceId,
        INTERACTIONS_PLUGIN_KEY,
        [...interactions, newInteraction],
        'Connect prototype nodes'
      )
    }
  }
}

export type PrototypeActions = ReturnType<typeof createPrototypeActions>
export type { PrototypeRenderState }
