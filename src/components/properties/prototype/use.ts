import { computed, reactive, ref, watch } from 'vue'

import {
  readNodeInteractions,
  readNodeStateModel,
  readPrototypeDocument,
  type PrototypeAction,
  type PrototypeEasing,
  type PrototypeInteraction,
  type PrototypeSpring,
  type PrototypeStateModel,
  type PrototypeTrigger,
  type PrototypeTransition
} from '@open-pencil/scene-graph'
import { useI18n } from '@open-pencil/vue'

import { useEditorStore } from '@/app/editor/active-store'

export type PrototypeActionType = PrototypeInteraction['action']['type']
export type {
  PrototypeEasing,
  PrototypeSpring,
  PrototypeTrigger,
  PrototypeTransition
} from '@open-pencil/scene-graph'

export function usePrototypeSection() {
  const store = useEditorStore()
  const { panels, pages } = useI18n()

  const node = computed(() => store.selectedNode.value)

  // pluginData lives in the plain graph; sceneVersion is the reactive signal.
  const interactions = computed(() => {
    void store.state.sceneVersion
    const target = node.value
    return target ? readNodeInteractions(target) : []
  })

  const stateModel = computed(() => {
    void store.state.sceneVersion
    const target = node.value
    return target ? readNodeStateModel(target) : null
  })

  const prototypeDoc = computed(() => {
    void store.state.sceneVersion
    const root = store.graph.getNode(store.graph.rootId)
    return root ? readPrototypeDocument(root) : null
  })

  const flows = computed(() => prototypeDoc.value?.flows ?? [])

  const activeFlow = computed(() => {
    const doc = prototypeDoc.value
    if (!doc || doc.flows.length === 0) return null
    return doc.flows.find((flow) => flow.id === doc.activeFlowId) ?? doc.flows[0]
  })

  const flowOptions = computed(() =>
    flows.value.map((flow) => ({ value: flow.id, label: flow.name }))
  )

  const isFlowStart = computed(() => {
    void store.state.sceneVersion
    const target = node.value
    if (!target) return false
    return activeFlow.value?.startNodeId === target.id
  })

  // Local buffer so renaming a flow never writes the graph per keystroke.
  const flowNameDraft = ref('')
  watch(
    activeFlow,
    (flow) => {
      flowNameDraft.value = flow?.name ?? ''
    },
    { immediate: true }
  )

  function selectFlow(flowId: string) {
    if (flowId) store.setActivePrototypeFlow(flowId)
  }

  function addFlow() {
    store.addPrototypeFlow()
  }

  function removeFlow() {
    const flow = activeFlow.value
    if (flow) store.deletePrototypeFlow(flow.id)
  }

  function commitFlowName() {
    const flow = activeFlow.value
    if (!flow) return
    const name = flowNameDraft.value.trim()
    if (!name || name === flow.name) {
      flowNameDraft.value = flow.name
      return
    }
    store.renamePrototypeFlow(flow.id, name)
  }

  const frameOptions = computed(() => {
    void store.state.sceneVersion
    const page = store.graph.getNode(store.state.currentPageId)
    if (!page) return []
    return page.childIds.flatMap((id) => {
      const frame = store.graph.getNode(id)
      return frame?.type === 'FRAME' && frame.name ? [{ value: frame.id, label: frame.name }] : []
    })
  })

  const triggerOptions = computed<Array<{ value: PrototypeTrigger; label: string }>>(() => [
    { value: 'load', label: panels.value.triggerLoad },
    { value: 'click', label: panels.value.triggerClick },
    { value: 'press', label: panels.value.triggerPress },
    { value: 'release', label: panels.value.triggerRelease },
    { value: 'hoverEnter', label: panels.value.triggerHoverEnter },
    { value: 'hoverLeave', label: panels.value.triggerHoverLeave },
    { value: 'afterDelay', label: panels.value.triggerAfterDelay }
  ])

  const actionOptions = computed<Array<{ value: PrototypeActionType; label: string }>>(() => [
    { value: 'navigate', label: panels.value.actionNavigate },
    { value: 'openOverlay', label: panels.value.actionOpenOverlay },
    { value: 'closeOverlay', label: panels.value.actionCloseOverlay },
    { value: 'setState', label: panels.value.actionSetState }
  ])

  const transitionKindOptions = computed(() => [
    { value: 'instant', label: panels.value.transitionInstant },
    { value: 'fade', label: panels.value.transitionFade },
    { value: 'slide', label: panels.value.transitionSlide },
    { value: 'spring', label: panels.value.transitionSpring }
  ])

  const easingOptions = computed<Array<{ value: string; label: string }>>(() => [
    { value: 'linear', label: panels.value.easingLinear },
    { value: 'ease', label: panels.value.easingEase },
    { value: 'easeIn', label: panels.value.easingEaseIn },
    { value: 'easeOut', label: panels.value.easingEaseOut },
    { value: 'easeInOut', label: panels.value.easingEaseInOut }
  ])

  const directionOptions = [
    { value: 'left', labelKey: 'directionLeft' as const },
    { value: 'right', labelKey: 'directionRight' as const },
    { value: 'up', labelKey: 'directionUp' as const },
    { value: 'down', labelKey: 'directionDown' as const }
  ]

  const springModeOptions = computed(() => [
    { value: 'time', label: panels.value.springModeTime },
    { value: 'physics', label: panels.value.springModePhysics }
  ])

  /** Runtime defaults from `springProgress`, mirrored so the fields read back. */
  const SPRING_DEFAULTS = { bounce: 0.25, stiffness: 100, damping: 10, mass: 1 } as const

  const stateOptions = computed(() =>
    (stateModel.value?.states ?? []).map((state) => ({ value: state.name, label: state.name }))
  )

  function commitInteractions(next: PrototypeInteraction[]) {
    const target = node.value
    if (target) store.setPrototypeInteractions(target.id, next)
  }

  function patchInteraction(index: number, patch: Partial<PrototypeInteraction>) {
    const next = interactions.value.map((item, i) => (i === index ? { ...item, ...patch } : item))
    commitInteractions(next)
  }

  function setTrigger(index: number, trigger: PrototypeTrigger) {
    const current = interactions.value.at(index)
    if (!current) return
    const next: PrototypeInteraction = { ...current, trigger }
    // Keep stored value and NumberField display in sync (validate_prototype
    // rejects afterDelay without an explicit delay). Build the full entry here:
    // patchInteraction spreads the original, which would resurrect a deleted delayMs.
    if (trigger === 'afterDelay') next.delayMs = current.delayMs ?? 500
    else delete next.delayMs
    commitInteractions(interactions.value.map((item, i) => (i === index ? next : item)))
  }

  function setActionType(index: number, type: PrototypeActionType) {
    const firstFrame = frameOptions.value[0]?.value ?? ''
    let action: PrototypeAction
    if (type === 'navigate') action = { type, destinationId: firstFrame }
    else if (type === 'openOverlay') action = { type, overlayId: firstFrame, backdropOpacity: 0.3 }
    else if (type === 'swapOverlay') action = { type, overlayId: firstFrame }
    else if (type === 'closeOverlay') action = { type }
    else if (type === 'back') action = { type }
    else if (type === 'scrollTo') action = { type, destinationId: firstFrame }
    else if (type === 'openUrl') action = { type, url: 'https://' }
    else if (type === 'playAnimation') action = { type, animationId: '' }
    else if (type === 'setVariant') action = { type, variant: '' }
    else if (type === 'setVariableMode') action = { type, collectionId: '', modeId: '' }
    else action = { type: 'setState', state: stateOptions.value[0]?.value ?? '' }
    patchInteraction(index, { action })
  }

  function defaultTransition(): PrototypeTransition {
    return { kind: 'fade', durationMs: 300, easing: 'easeOut' }
  }

  function setTransitionKind(index: number, kind: PrototypeTransition['kind']) {
    if (kind === 'instant') patchInteraction(index, { transition: { kind } })
    else if (kind === 'fade')
      patchInteraction(index, { transition: { kind, durationMs: 300, easing: 'easeOut' } })
    else if (kind === 'dissolve') patchInteraction(index, { transition: { kind, durationMs: 300 } })
    else if (kind === 'smartAnimate')
      patchInteraction(index, { transition: { kind, durationMs: 300 } })
    else if (kind === 'slide')
      patchInteraction(index, {
        transition: { kind, direction: 'down', durationMs: 300, easing: 'easeOut' }
      })
    else if (
      kind === 'moveIn' ||
      kind === 'moveOut' ||
      kind === 'push' ||
      kind === 'slideIn' ||
      kind === 'slideOut'
    )
      patchInteraction(index, {
        transition: { kind, direction: 'left', durationMs: 300 }
      })
    else patchInteraction(index, { transition: { kind: 'spring', spring: { mode: 'time' } } })
  }

  /** Spring edits ride the same undo-batched interaction write as duration/easing. */
  function patchInteractionSpring(index: number, patch: Partial<PrototypeSpring>) {
    const transition = interactions.value[index]?.transition
    if (transition?.kind !== 'spring') return
    patchInteraction(index, {
      transition: { ...transition, spring: { ...transition.spring, ...patch } }
    })
  }

  function patchStateSpring(index: number, patch: Partial<PrototypeSpring>) {
    const transition = stateModel.value?.states[index]?.transition
    if (transition?.kind !== 'spring') return
    patchState(index, { transition: { ...transition, spring: { ...transition.spring, ...patch } } })
  }

  function addInteraction() {
    const target = node.value
    if (!target) return
    commitInteractions([
      ...interactions.value,
      {
        id: crypto.randomUUID(),
        trigger: 'click',
        action: { type: 'navigate', destinationId: frameOptions.value[0]?.value ?? '' },
        transition: defaultTransition()
      }
    ])
  }

  function removeInteraction(index: number) {
    commitInteractions(interactions.value.filter((_, i) => i !== index))
  }

  function commitModel(model: PrototypeStateModel | null) {
    const target = node.value
    if (target) store.setPrototypeStateModel(target.id, model)
  }

  function addState() {
    const states = [...(stateModel.value?.states ?? [])]
    const base = stateModel.value?.initial ?? 'default'
    let name = base
    let suffix = 1
    while (states.some((state) => state.name === name)) name = `${base} ${++suffix}`
    commitModel({
      version: stateModel.value?.version ?? 1,
      initial: states[0]?.name ?? name,
      states: [...states, { name, visual: {} }]
    })
  }

  function patchState(index: number, patch: Partial<PrototypeStateModel['states'][number]>) {
    const model = stateModel.value
    if (!model) return
    commitModel({
      ...model,
      states: model.states.map((state, i) => (i === index ? { ...state, ...patch } : state))
    })
  }

  function setStateTransition(index: number, kind: PrototypeTransition['kind']) {
    if (kind === 'instant') patchState(index, { transition: { kind } })
    else if (kind === 'fade')
      patchState(index, { transition: { kind, durationMs: 300, easing: 'easeOut' } })
    else if (kind === 'dissolve') patchState(index, { transition: { kind, durationMs: 300 } })
    else if (kind === 'smartAnimate') patchState(index, { transition: { kind, durationMs: 300 } })
    else if (kind === 'slide')
      patchState(index, {
        transition: { kind, direction: 'down', durationMs: 300, easing: 'easeOut' }
      })
    else if (
      kind === 'moveIn' ||
      kind === 'moveOut' ||
      kind === 'push' ||
      kind === 'slideIn' ||
      kind === 'slideOut'
    )
      patchState(index, {
        transition: { kind, direction: 'left', durationMs: 300 }
      })
    else patchState(index, { transition: { kind: 'spring', spring: { mode: 'time' } } })
  }

  function patchStateDuration(index: number, durationMs: number) {
    const transition = stateModel.value?.states[index]?.transition
    if (transition && transition.kind !== 'instant' && transition.kind !== 'spring') {
      patchState(index, { transition: { ...transition, durationMs } })
    }
  }

  function patchStateEasing(index: number, easing: PrototypeEasing) {
    const transition = stateModel.value?.states[index]?.transition
    if (transition && transition.kind !== 'instant' && transition.kind !== 'spring') {
      patchState(index, { transition: { ...transition, easing } })
    }
  }

  function removeState(index: number) {
    const model = stateModel.value
    if (!model) return
    const states = model.states.filter((_, i) => i !== index)
    if (states.length === 0) {
      commitModel(null)
      return
    }
    commitModel({
      ...model,
      initial: states.some((state) => state.name === model.initial)
        ? model.initial
        : (states[0]?.name ?? model.initial),
      states
    })
  }

  // Local buffers so typing a state name never writes the graph per keystroke.
  const stateNames = reactive<Record<string, string>>({})
  watch(
    stateModel,
    (model) => {
      for (const key of Object.keys(stateNames)) Reflect.deleteProperty(stateNames, key)
      for (const state of model?.states ?? []) stateNames[state.name] = state.name
    },
    { immediate: true }
  )

  function commitStateName(index: number, original: string) {
    const name = stateNames[original]?.trim()
    if (!name || name === original) {
      stateNames[original] = original
      return
    }
    const model = stateModel.value
    if (!model || model.states.some((state, i) => i !== index && state.name === name)) {
      stateNames[original] = original
      return
    }
    commitModel({
      ...model,
      initial: model.initial === original ? name : model.initial,
      states: model.states.map((state, i) => (i === index ? { ...state, name } : state))
    })
  }

  function blurInput(event: KeyboardEvent) {
    const target = event.currentTarget
    if (target instanceof HTMLInputElement) target.blur()
  }

  return {
    store,
    panels,
    pages,
    node,
    interactions,
    stateModel,
    flows,
    activeFlow,
    flowOptions,
    isFlowStart,
    flowNameDraft,
    selectFlow,
    addFlow,
    removeFlow,
    commitFlowName,
    frameOptions,
    triggerOptions,
    actionOptions,
    transitionKindOptions,
    easingOptions,
    directionOptions,
    springModeOptions,
    SPRING_DEFAULTS,
    stateOptions,
    patchInteraction,
    setTrigger,
    setActionType,
    setTransitionKind,
    patchInteractionSpring,
    patchStateSpring,
    addInteraction,
    removeInteraction,
    addState,
    patchState,
    setStateTransition,
    patchStateDuration,
    patchStateEasing,
    removeState,
    stateNames,
    commitStateName,
    blurInput
  }
}
