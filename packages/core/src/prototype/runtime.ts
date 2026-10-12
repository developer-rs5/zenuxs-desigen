import {
  readNodeInteractions,
  readNodeAnimations,
  readNodeStateModel,
  type PrototypeAction,
  type PrototypeInteraction,
  type PrototypeStateVisual,
  type PrototypeTransition,
  type SceneGraph
} from '@open-pencil/scene-graph'

import { evaluateGuard, type PrototypeVars } from './guards'
import { planPlayback, playFinalVisual, playSettled, type KeyframePlay } from './keyframes'
import { transitionDurationMs, transitionProgress, transitionSettled } from './motion'
import {
  composeRenderState,
  type ActiveDrag,
  type OverlayEntry,
  type PendingTimer,
  type PrototypeRenderState,
  type ScreenTransition,
  type VisualAnimation
} from './render-state'
import { descendants, scheduleTimers, seedInitialStates } from './triggers'
import { isIdentityVisual, lerpVisual, visualBase, type PrototypeNodeVisual } from './visuals'

export type { PrototypeNodeVisual }
export type { PrototypeRenderState } from './render-state'

/**
 * Preview-mode prototype runtime (spec §8): reads interactions from the real
 * document, executes actions, and exposes a per-frame render state. The
 * runtime never mutates the scene graph — screen changes, state visuals, and
 * transitions are ephemeral overlay data the renderer consumes.
 *
 * Every method takes an explicit `nowMs`; no wall-clock reads, so the whole
 * runtime is deterministic and unit-testable.
 */

export interface PrototypeRuntimeOptions {
  /**
   * Graph-mutation channel for actions no ephemeral visual can express.
   * `setVariant` swaps the instance's main component, which is a document
   * change: the editor injects an undo-batched callback here, headless
   * runtimes omit it and the action records a warning instead of mutating.
   */
  onMutate?: (nodeId: string, variant: string) => boolean
  /**
   * Honor prefers-reduced-motion (spec §55): authored motion collapses to
   * instant while every interaction still performs its effect — navigation,
   * overlays (backdrop included), state visuals, timers, and drag tracking.
   * Core never reads matchMedia; the app passes the query result in.
   */
  reducedMotion?: boolean
}

export interface PrototypeRuntime {
  start(nowMs: number, startNodeId: string): void
  stop(): void
  tick(nowMs: number): void
  pointerDown(nodeId: string, nowMs: number): void
  pointerUp(nodeId: string, nowMs: number): void
  click(nodeId: string, nowMs: number): void
  /** Hover chain = hit node up to the screen root; diffed into enter/leave dispatch. */
  updateHover(chainIds: string[], nowMs: number): void
  /** Dispatch a drag interaction on the hit node/ancestor and start tracking. */
  beginDrag(nodeId: string, nowMs: number): void
  /** Accumulated pointer delta in world units for the active drag. */
  updateDrag(dx: number, dy: number, nowMs: number): void
  /** Release the drag; the accumulated offset settles as a node visual. */
  endDrag(nowMs: number): void
  isDragging(): boolean
  /** Wheel input: dispatches the scroll trigger for nodes with scroll interactions. */
  scroll(nodeId: string, deltaY: number, nowMs: number): void
  /** Press-hold fired by the editor after its long-press threshold. */
  longPress(nodeId: string, nowMs: number): void
  /** Start a keyframe animation or animation group on a node (also a playAnimation action path). */
  playAnimation(nodeId: string, animationIdOrGroupId: string, nowMs: number): void
  getRenderState(): PrototypeRenderState | null
  getScreenId(): string | null
  /** Non-fatal execution notes (unresolved animation/variant targets). */
  getWarnings(): readonly string[]
  /** True while transitions, animations, or timers still need future ticks. */
  hasPendingWork(nowMs: number): boolean
}

export function createPrototypeRuntime(
  graph: SceneGraph,
  options: PrototypeRuntimeOptions = {}
): PrototypeRuntime {
  let running = false
  let screenId: string | null = null
  let screenTransition: ScreenTransition | null = null
  let overlays: OverlayEntry[] = []
  let animations: VisualAnimation[] = []
  let keyframePlays: KeyframePlay[] = []
  let timers: PendingTimer[] = []
  let hoverChain: string[] = []
  let enterDepth = 0
  let drag: ActiveDrag | null = null
  const warnings: string[] = []
  /** Settled per-node state visuals (identity entries pruned). */
  const stateVisuals = new Map<string, PrototypeStateVisual>()
  /** Runtime prototype variables per node, seeded from the state model. */
  const nodeVars = new Map<string, PrototypeVars>()

  const reducedMotion = options.reducedMotion === true

  /**
   * Reduced motion replaces authored motion with instant: the effect applies
   * on the same tick, only the tween disappears. Returns null for "no motion".
   */
  function motion(transition: PrototypeTransition | undefined): PrototypeTransition | null {
    if (!transition) return null
    return reducedMotion ? { kind: 'instant' } : transition
  }

  function enterScreen(nowMs: number): void {
    timers = []
    const enteringId = screenId
    if (!enteringId) return
    seedInitialStates(graph, stateVisuals, enteringId)
    scheduleTimers(graph, timers, enteringId, nowMs)
    for (const id of descendants(graph, enteringId)) scheduleTimers(graph, timers, id, nowMs)
    // Guard cyclic OnLoad → Navigate loops (A loads→B, B loads→A) and stop
    // firing load triggers for a screen the moment a navigate leaves it.
    if (enterDepth >= 8) return
    enterDepth += 1
    try {
      fireTriggers(enteringId, 'load', nowMs)
      if (screenId !== enteringId) return
      for (const id of descendants(graph, enteringId)) {
        fireTriggers(id, 'load', nowMs)
        if (screenId !== enteringId) return
      }
    } finally {
      enterDepth -= 1
    }
  }

  function varsFor(nodeId: string): PrototypeVars {
    let vars = nodeVars.get(nodeId)
    if (!vars) {
      const node = graph.getNode(nodeId)
      const model = node ? readNodeStateModel(node) : null
      vars = { ...model?.vars }
      nodeVars.set(nodeId, vars)
    }
    return vars
  }

  /** One motion driver per node: a new play or state change cancels the old. */
  function cancelMotion(nodeId: string): void {
    animations = animations.filter((animation) => animation.nodeId !== nodeId)
    keyframePlays = keyframePlays.filter((play) => play.nodeId !== nodeId)
  }

  function currentVisual(nodeId: string, nowMs: number): PrototypeStateVisual {
    const settled = stateVisuals.get(nodeId)
    const active = animations.findLast((animation) => animation.nodeId === nodeId)
    if (!active) return settled ?? {}
    const progress = transitionProgress(active.transition, nowMs - active.startedAt)
    return {
      ...settled,
      ...lerpVisual(active.from, active.to, progress, visualBase(graph, nodeId))
    }
  }

  // Last known time for getRenderState between ticks; dispatches refresh it.
  const nowRef = { value: 0 }

  function startPlay(nodeId: string, targetId: string, preferGroup: boolean, nowMs: number): void {
    const node = graph.getNode(nodeId)
    if (!node) return
    const container = readNodeAnimations(node)
    let play = planPlayback(nodeId, container, targetId, preferGroup, nowMs)
    if (!play && !preferGroup) play = planPlayback(nodeId, container, targetId, true, nowMs)
    if (!play) {
      warnings.push(`Animation "${targetId}" not found on node "${nodeId}"`)
      return
    }
    cancelMotion(nodeId)
    if (reducedMotion) {
      // Reduced motion: settle on the plan's end frame instead of tweening
      // through it (loops collapse to their last keyframe).
      const settled = playFinalVisual(play, visualBase(graph, nodeId))
      if (isIdentityVisual(settled)) stateVisuals.delete(nodeId)
      else stateVisuals.set(nodeId, settled)
      return
    }
    keyframePlays.push(play)
  }

  function runNavigate(
    action: Extract<PrototypeAction, { type: 'navigate' }>,
    authored: PrototypeTransition | null,
    nowMs: number
  ): void {
    if (!graph.getNode(action.destinationId)) return
    const fromId = screenId
    // Jump the in-flight animation: the visible screen becomes the new
    // outgoing so crossfades never stack.
    const outgoing =
      screenTransition &&
      !transitionSettled(screenTransition.transition, nowMs - screenTransition.startedAt)
        ? screenTransition.toId
        : fromId
    screenId = action.destinationId
    overlays = []
    animations = []
    keyframePlays = []
    stateVisuals.clear()
    nodeVars.clear()
    hoverChain = []
    if (outgoing && outgoing !== screenId && authored && transitionDurationMs(authored) > 0) {
      screenTransition = {
        fromId: outgoing,
        toId: screenId,
        transition: authored,
        startedAt: nowMs
      }
    } else {
      screenTransition = null
    }
    enterScreen(nowMs)
  }

  function runOpenOverlay(
    action: Extract<PrototypeAction, { type: 'openOverlay' }>,
    authored: PrototypeTransition | null,
    nowMs: number
  ): void {
    const overlayNode = graph.getNode(action.overlayId)
    if (!overlayNode) return
    overlays.push({
      nodeId: action.overlayId,
      backdropOpacity: action.backdropOpacity ?? 0.3,
      transition: authored ?? { kind: 'instant' },
      openedAt: nowMs,
      closing: false,
      closeAt: null
    })
    scheduleTimers(graph, timers, action.overlayId, nowMs)
    for (const id of descendants(graph, action.overlayId)) scheduleTimers(graph, timers, id, nowMs)
  }

  function runCloseOverlay(authored: PrototypeTransition | null, nowMs: number): void {
    const entry = overlays.at(-1)
    if (!entry || entry.closing) return
    if (authored) entry.transition = authored
    // Instant close (authored or reduced-motion) has no settle window:
    // drop the entry now, otherwise no tick would ever clear it.
    if (transitionDurationMs(entry.transition) <= 0) {
      overlays = overlays.filter((candidate) => candidate !== entry)
      return
    }
    entry.closing = true
    entry.closeAt = nowMs
  }

  function runSetState(
    nodeId: string,
    action: Extract<PrototypeAction, { type: 'setState' }>,
    authored: PrototypeTransition | null,
    nowMs: number
  ): void {
    const node = graph.getNode(nodeId)
    if (!node) return
    const model = readNodeStateModel(node)
    const target = model?.states.find((state) => state.name === action.state)
    if (!target) return
    // Variable writes land together with the state change (atomic pair).
    if (action.setVars) {
      const vars = varsFor(nodeId)
      for (const [key, value] of Object.entries(action.setVars)) vars[key] = value
    }
    const from = currentVisual(nodeId, nowMs)
    // Motion lives on the interaction first (author attaches it there);
    // the state definition's own transition is the fallback. Reduced
    // motion collapses either source to instant, target visuals included.
    const targetTransition = motion(authored ?? target.transition) ?? ({ kind: 'instant' } as const)
    cancelMotion(nodeId)
    if (transitionDurationMs(targetTransition) <= 0) {
      if (isIdentityVisual(target.visual)) stateVisuals.delete(nodeId)
      else stateVisuals.set(nodeId, target.visual)
      return
    }
    animations.push({
      nodeId,
      from,
      to: target.visual,
      transition: targetTransition,
      startedAt: nowMs
    })
  }

  function runSetVariant(
    nodeId: string,
    action: Extract<PrototypeAction, { type: 'setVariant' }>
  ): void {
    // Document mutation by design (see PrototypeRuntimeOptions.onMutate).
    if (!options.onMutate) {
      warnings.push(`setVariant "${action.variant}" skipped: no mutation channel`)
      return
    }
    if (!options.onMutate(nodeId, action.variant)) {
      warnings.push(`setVariant "${action.variant}" failed on node "${nodeId}"`)
    }
  }

  function runInteraction(nodeId: string, interaction: PrototypeInteraction, nowMs: number): void {
    nowRef.value = nowMs
    // Guards fail closed: an interaction whose conditions do not hold never fires.
    if (interaction.guard && !evaluateGuard(interaction.guard, varsFor(nodeId))) return
    const { action } = interaction
    const authored = motion(interaction.transition)
    switch (action.type) {
      case 'navigate':
        runNavigate(action, authored, nowMs)
        break
      case 'openOverlay':
        runOpenOverlay(action, authored, nowMs)
        break
      case 'closeOverlay':
        runCloseOverlay(authored, nowMs)
        break
      case 'setState':
        runSetState(nodeId, action, authored, nowMs)
        break
      case 'playAnimation':
        startPlay(nodeId, action.animationId, action.group === true, nowMs)
        break
      case 'setVariant':
        runSetVariant(nodeId, action)
        break
    }
  }

  function matchingInteraction(
    nodeId: string,
    trigger: PrototypeInteraction['trigger']
  ): PrototypeInteraction | null {
    const node = graph.getNode(nodeId)
    if (!node) return null
    return readNodeInteractions(node).find((interaction) => interaction.trigger === trigger) ?? null
  }

  function fireTriggers(
    nodeId: string,
    trigger: PrototypeInteraction['trigger'],
    nowMs: number
  ): void {
    const interaction = matchingInteraction(nodeId, trigger)
    if (interaction) runInteraction(nodeId, interaction, nowMs)
  }

  /** First node from the hit up to the screen/overlay frame owning `trigger`. */
  function findTrigger(
    nodeId: string,
    trigger: PrototypeInteraction['trigger']
  ): { nodeId: string; interaction: PrototypeInteraction } | null {
    let currentId: string | null = nodeId
    while (currentId) {
      const interaction = matchingInteraction(currentId, trigger)
      if (interaction) return { nodeId: currentId, interaction }
      const parent: string | null | undefined = graph.getNode(currentId)?.parentId
      const parentNode = parent ? graph.getNode(parent) : null
      // Stop at the page boundary: pages/root never carry interactions.
      if (!parent || parent === graph.rootId || parentNode?.type === 'CANVAS') return null
      currentId = parent
    }
    return null
  }

  /** Walk hit node → screen/overlay frame; first node with a matching trigger wins. */
  function dispatchFrom(
    nodeId: string,
    trigger: PrototypeInteraction['trigger'],
    nowMs: number
  ): void {
    const found = findTrigger(nodeId, trigger)
    if (found) runInteraction(found.nodeId, found.interaction, nowMs)
  }

  function reset(): void {
    screenId = null
    screenTransition = null
    overlays = []
    animations = []
    keyframePlays = []
    timers = []
    stateVisuals.clear()
    nodeVars.clear()
    hoverChain = []
    drag = null
    warnings.length = 0
  }

  return {
    start(nowMs, startNodeId) {
      if (!graph.getNode(startNodeId)) return
      running = true
      reset()
      screenId = startNodeId
      nowRef.value = nowMs
      enterScreen(nowMs)
    },
    stop() {
      running = false
      reset()
    },
    tick(nowMs) {
      if (!running) return
      nowRef.value = nowMs

      if (screenTransition) {
        if (transitionSettled(screenTransition.transition, nowMs - screenTransition.startedAt)) {
          screenTransition = null
        }
      }

      for (const animation of animations) {
        if (transitionSettled(animation.transition, nowMs - animation.startedAt)) {
          animations = animations.filter((entry) => entry !== animation)
          // State visuals are complete deltas: the target replaces, never merges.
          if (isIdentityVisual(animation.to)) stateVisuals.delete(animation.nodeId)
          else stateVisuals.set(animation.nodeId, animation.to)
        }
      }

      for (const play of keyframePlays) {
        if (!playSettled(play, nowMs)) continue
        keyframePlays = keyframePlays.filter((entry) => entry !== play)
        const visual = playFinalVisual(play, visualBase(graph, play.nodeId))
        if (isIdentityVisual(visual)) stateVisuals.delete(play.nodeId)
        else stateVisuals.set(play.nodeId, visual)
      }

      overlays = overlays.filter((entry) => {
        if (!entry.closing) return true
        return !transitionSettled(entry.transition, nowMs - (entry.closeAt ?? nowMs))
      })

      const due = timers.filter((timer) => timer.dueAt <= nowMs)
      timers = timers.filter((timer) => timer.dueAt > nowMs)
      for (const timer of due) {
        const node = graph.getNode(timer.nodeId)
        if (!node) continue
        const interaction = readNodeInteractions(node).find(
          (candidate) => candidate.id === timer.interactionId
        )
        if (interaction) runInteraction(timer.nodeId, interaction, nowMs)
      }
    },
    pointerDown(nodeId, nowMs) {
      if (!running) return
      nowRef.value = nowMs
      dispatchFrom(nodeId, 'press', nowMs)
    },
    pointerUp(nodeId, nowMs) {
      if (!running) return
      nowRef.value = nowMs
      dispatchFrom(nodeId, 'release', nowMs)
    },
    click(nodeId, nowMs) {
      if (!running || drag) return
      nowRef.value = nowMs
      dispatchFrom(nodeId, 'click', nowMs)
    },
    updateHover(chainIds, nowMs) {
      if (!running) return
      nowRef.value = nowMs
      // A drag owns the pointer: hover chains resume after endDrag.
      if (drag) return
      const next = chainIds.filter((id) => id !== '')
      for (const id of hoverChain.filter((id) => !next.includes(id))) {
        dispatchFrom(id, 'hoverLeave', nowMs)
      }
      for (const id of next.filter((id) => !hoverChain.includes(id))) {
        dispatchFrom(id, 'hoverEnter', nowMs)
      }
      hoverChain = next
    },
    beginDrag(nodeId, nowMs) {
      if (!running || drag) return
      nowRef.value = nowMs
      const found = findTrigger(nodeId, 'drag')
      if (!found) return
      drag = { nodeId: found.nodeId, dx: 0, dy: 0 }
      runInteraction(found.nodeId, found.interaction, nowMs)
    },
    updateDrag(dx, dy, nowMs) {
      if (!running || !drag) return
      nowRef.value = nowMs
      drag.dx = dx
      drag.dy = dy
    },
    endDrag(nowMs) {
      if (!drag) return
      nowRef.value = nowMs
      const { nodeId, dx, dy } = drag
      drag = null
      if (dx === 0 && dy === 0) return
      const settled = stateVisuals.get(nodeId) ?? {}
      const next: PrototypeStateVisual = {
        ...settled,
        translateX: (settled.translateX ?? 0) + dx,
        translateY: (settled.translateY ?? 0) + dy
      }
      if (isIdentityVisual(next)) stateVisuals.delete(nodeId)
      else stateVisuals.set(nodeId, next)
    },
    isDragging() {
      return drag !== null
    },
    scroll(nodeId, deltaY, nowMs) {
      if (!running) return
      nowRef.value = nowMs
      // ponytail: deltaY gates dispatch only; accumulated scroll offsets stay
      // unmodeled until a scroll-driven visual is specified.
      if (deltaY === 0) return
      dispatchFrom(nodeId, 'scroll', nowMs)
    },
    longPress(nodeId, nowMs) {
      if (!running) return
      nowRef.value = nowMs
      dispatchFrom(nodeId, 'longPress', nowMs)
    },
    playAnimation(nodeId, animationIdOrGroupId, nowMs) {
      if (!running) return
      nowRef.value = nowMs
      startPlay(nodeId, animationIdOrGroupId, false, nowMs)
    },
    getRenderState() {
      if (!running || !screenId) return null
      return composeRenderState({
        graph,
        screenId,
        stateVisuals,
        screenTransition,
        overlays,
        animations,
        keyframePlays,
        drag,
        nowMs: nowRef.value
      })
    },
    getScreenId() {
      return screenId
    },
    getWarnings() {
      return warnings
    },
    hasPendingWork(nowMs) {
      if (!running) return false
      if (screenTransition || animations.length > 0 || timers.length > 0) return true
      if (keyframePlays.length > 0) return true
      return overlays.some(
        (entry) =>
          !transitionSettled(
            entry.transition,
            nowMs - (entry.closing ? (entry.closeAt ?? nowMs) : entry.openedAt)
          )
      )
    }
  }
}
