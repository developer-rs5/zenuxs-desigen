import type {
  PrototypeAnimations,
  PrototypeInteraction,
  PrototypeStateVisual,
  PrototypeTransition,
  PrototypeTrigger,
  SceneGraph,
  SceneNode
} from '@open-pencil/scene-graph'
import {
  activeFlow,
  readNodeAnimations,
  readNodeInteractions,
  readNodeStateModel,
  readPrototypeDocument
} from '@open-pencil/scene-graph'

import { emitAnimation, groupAnimationTimings } from './animations'
import {
  record,
  setClaim,
  warnOnce,
  type Claim,
  type NodeContext,
  type WalkContext
} from './context'
import {
  joinDeclarations,
  nodeSelector,
  resolvedVisual,
  stateSelector,
  transitionDeclaration,
  visualCSS,
  type AnimationTiming,
  type PrototypeCSSProperty
} from './css'
import { processInteraction } from './interactions'
import type { PrototypeShimOp } from './shim'
import {
  bumpCount,
  emptyPrototypeReport,
  isSpringTransition,
  needsJS,
  sameVisual,
  transitionTiming,
  type PrototypeExportIssue,
  type PrototypeExportReport,
  type PrototypeExportStatus
} from './support'

/**
 * The prototype → HTML/CSS/JS walker: reads authored prototype data through
 * the public `@open-pencil/scene-graph` readers, emits CSS rules and shim ops
 * for the supported subset, and accounts for every interaction, state,
 * animation, and flow in a `PrototypeExportReport`. Anything CSS/JS cannot
 * express faithfully is reported skipped — never silently downgraded.
 *
 * Parity references (read, not imported — Core stays out of dom-css inputs):
 * - screen crossfade/slide offsets: `packages/core/src/prototype/render-state.ts`
 * - state visuals: `packages/core/src/canvas/scene.ts` (preview oracle)
 * - keyframe timing: `packages/core/src/prototype/keyframes.ts`
 */

export interface PrototypeScreenInfo {
  id: string
  active: boolean
}

export interface PrototypeAnalysis {
  report: PrototypeExportReport
  /** Variant root styles; prepended so they win over base node classes. */
  css: string[]
  /** JS shim ops; empty when every behavior is CSS-expressible. */
  shim: PrototypeShimOp[]
  /** Top-level screens; empty when no navigate interaction was exported. */
  screens: PrototypeScreenInfo[]
  /** Stage size override (one screen area) when screens are stacked. */
  stage: { width: number; height: number } | null
  /** nodeId → initial state name, applied as `data-op-state` attributes. */
  seeds: ReadonlyMap<string, string>
  /** Overlay frame ids (decorated `.op-overlay`, hoisted above screens). */
  overlays: ReadonlySet<string>
  /** instanceId → variant targets for `<template data-op-variant-for>` injection. */
  variants: ReadonlyMap<string, ReadonlyArray<{ componentId: string; spec: string }>>
}

type IssueEntry = Omit<PrototypeExportIssue, 'nodeId' | 'nodeName'>

/** State blur is withheld when the authored layer blur is non-zero (see warning). */
const ALL_EXCEPT_FILTER: ReadonlySet<PrototypeCSSProperty> = new Set([
  'opacity',
  'transform',
  'background-color',
  'border-radius'
])

function authoredLayerBlur(node: SceneNode): number {
  const effect = node.effects.find(
    (entry) => entry.visible && (entry.type === 'LAYER_BLUR' || entry.type === 'FOREGROUND_BLUR')
  )
  return effect ? effect.radius : 0
}

function collectSubtree(
  graph: SceneGraph,
  rootId: string
): { screenOf: Map<string, string>; screenIds: string[]; screens: SceneNode[] } {
  const screenOf = new Map<string, string>()
  const screenIds: string[] = []
  const screens: SceneNode[] = []
  const root = graph.getNode(rootId)
  if (!root) return { screenOf, screenIds, screens }
  for (const childId of root.childIds) {
    const child = graph.getNode(childId)
    if (!child) continue
    screenIds.push(child.id)
    screens.push(child)
    const visit = (id: string): void => {
      screenOf.set(id, child.id)
      const node = graph.getNode(id)
      if (!node) return
      for (const grandChild of node.childIds) visit(grandChild)
    }
    visit(child.id)
  }
  return { screenOf, screenIds, screens }
}

// --- node walks -------------------------------------------------------------

/** State model: seed attribute, per-state rules, fallback transition claims. */
function emitStateModel(
  ctx: WalkContext,
  node: SceneNode,
  local: NodeContext,
  interactions: readonly PrototypeInteraction[]
): void {
  const model = local.model
  if (!model) return
  const initial = model.states.find((state) => state.name === model.initial)
  if (initial) {
    ctx.seeds.set(node.id, model.initial)
    local.initialResolved = resolvedVisual(node, initial.visual)
  }
  for (const state of model.states) {
    emitStateRule(ctx, node, local, state.name, state.visual, state.transition)
  }

  // A JS-routed setState anywhere on the node can move the attribute away
  // from the seeded base while a CSS hover revert is pending.
  local.hasJsSetState = interactions.some(
    (entry) =>
      entry.action.type === 'setState' &&
      needsJS(entry.trigger, entry.action, Boolean(entry.guard)) &&
      entry.trigger !== 'hoverLeave'
  )
  const seedVisual = local.initialResolved

  // A guarded/setVars hover interaction forces both hover directions through
  // the runtime: CSS cannot evaluate a guard, and a JS-applied enter state
  // must be reverted by a JS leave (preview's stateVisuals are sticky).
  local.hoverJs = interactions.some(
    (entry) =>
      (entry.trigger === 'hoverEnter' || entry.trigger === 'hoverLeave') &&
      needsJS(entry.trigger, entry.action, Boolean(entry.guard))
  )

  const leave = interactions.find((entry) => {
    if (entry.trigger !== 'hoverLeave' || entry.action.type !== 'setState' || entry.guard) {
      return false
    }
    const action = entry.action
    return model.states.some((state) => state.name === action.state)
  })
  const leaveAction = leave?.action.type === 'setState' ? leave.action : undefined
  const leaveTarget = leaveAction
    ? model.states.find((state) => state.name === leaveAction.state)
    : undefined
  local.leaveCovered = Boolean(leaveTarget)
  local.hoverLeaveExact = Boolean(
    seedVisual &&
    leaveTarget &&
    !local.hasJsSetState &&
    sameVisual(seedVisual, resolvedVisual(node, leaveTarget.visual))
  )
}

function emitStateRule(
  ctx: WalkContext,
  node: SceneNode,
  local: NodeContext,
  stateName: string,
  stateVisual: PrototypeStateVisual,
  stateTransition: PrototypeTransition | undefined
): void {
  const resolved = resolvedVisual(node, stateVisual)
  if (local.authoredBlur > 0 && resolved.blur !== 0) local.blurGap = true
  const vcss = visualCSS(node, resolved, local.only)
  ctx.css.push(`${stateSelector(node.id, stateName)}{${joinDeclarations(vcss)}}`)

  let status: PrototypeExportStatus = 'exported'
  let emittedAs: string | undefined
  if (vcss.unsupported) {
    status = 'exported-approximate'
    emittedAs = 'visual without the fill channel'
    record(ctx, node.id, node.name, {
      feature: 'visual',
      detail: `state "${stateName}" fill is not a solid color`,
      status: 'skipped',
      reason: 'fill'
    })
  }
  if (isSpringTransition(stateTransition)) {
    // Springs sample into a linear() easing (support.springTiming); the claim
    // below carries it, so the state rule animates on the preview curve.
    const timing = transitionTiming(stateTransition)
    if (timing) {
      for (const property of vcss.properties) setClaim(ctx, local.claims, property, timing, 'state')
    }
    record(ctx, node.id, node.name, {
      feature: 'transition',
      detail: `state "${stateName}" authors a spring transition (sampled into linear() easing)`,
      status: 'exported'
    })
  } else {
    const timing = transitionTiming(stateTransition)
    if (timing) {
      for (const property of vcss.properties) setClaim(ctx, local.claims, property, timing, 'state')
    }
  }
  bumpCount(ctx.report.states, status)
  const entry: IssueEntry = {
    feature: 'visual',
    detail: `state "${stateName}" → [data-op-state] rule`,
    status
  }
  if (emittedAs) entry.emittedAs = emittedAs
  record(ctx, node.id, node.name, entry)
}

/** Animations: @keyframes blocks plus resolved group playback entries. */
function emitNodeAnimations(
  ctx: WalkContext,
  node: SceneNode,
  local: NodeContext,
  container: PrototypeAnimations
): void {
  for (const animation of container.animations ?? []) {
    const emitted = emitAnimation(ctx, node, animation, local)
    local.animationNames.set(animation.id, emitted.name)
  }
  for (const group of container.groups ?? []) {
    const resolved = groupAnimationTimings(node, group, local.animationNames)
    local.groupPartial.set(group.id, { resolved: resolved.resolved, total: resolved.total })
    if (resolved.timings.length === 0) {
      bumpCount(ctx.report.animations, 'skipped')
      record(ctx, node.id, node.name, {
        feature: 'group',
        detail: `group "${group.name}" resolves to no animations`,
        status: 'skipped',
        reason: 'missing-target'
      })
      continue
    }
    local.groupTimings.set(group.id, resolved.timings)
    const partial = resolved.resolved < resolved.total
    const status: PrototypeExportStatus = partial ? 'exported-approximate' : 'exported'
    bumpCount(ctx.report.animations, status)
    const entry: IssueEntry = {
      feature: 'group',
      detail: `group "${group.name}" → cumulative animation delays (${resolved.timings.length} items)`,
      status
    }
    if (partial) entry.emittedAs = `${resolved.resolved} of ${resolved.total} group items`
    record(ctx, node.id, node.name, entry)
  }
}

function visitNode(ctx: WalkContext, node: SceneNode): void {
  if (ctx.visited.has(node.id)) return
  ctx.visited.add(node.id)
  const model = readNodeStateModel(node)
  const container = readNodeAnimations(node)
  const interactions = readNodeInteractions(node)
  if (!model && !container && interactions.length === 0) return

  const authoredBlur = authoredLayerBlur(node)
  const local: NodeContext = {
    selector: nodeSelector(node.id),
    screenId: ctx.screenOf.get(node.id) ?? null,
    model,
    initialResolved: null,
    hasJsSetState: false,
    hoverLeaveExact: false,
    hoverJs: false,
    leaveCovered: false,
    authoredBlur,
    only: authoredBlur > 0 ? ALL_EXCEPT_FILTER : undefined,
    blurGap: false,
    seenTriggers: new Set<PrototypeTrigger>(),
    claims: new Map<PrototypeCSSProperty, Claim>(),
    animationNames: new Map<string, string>(),
    groupTimings: new Map<string, AnimationTiming[]>(),
    groupPartial: new Map<string, { resolved: number; total: number }>()
  }

  if (model) emitStateModel(ctx, node, local, interactions)
  if (container) emitNodeAnimations(ctx, node, local, container)
  for (const interaction of interactions) {
    processInteraction(ctx, node, local, interaction)
  }
  flushClaims(ctx, local)

  if (local.blurGap) {
    warnOnce(
      ctx,
      `Node "${node.name}" has an authored layer blur; preview composes authored and state blur, the export withholds the state blur filter`
    )
  }
}

/** One `transition` declaration per node from the winning claims. */
function flushClaims(ctx: WalkContext, local: NodeContext): void {
  if (local.claims.size === 0) return
  const claims = [...local.claims.entries()].map(([property, claim]) => ({
    property,
    timing: claim.timing
  }))
  const declaration = transitionDeclaration(claims)
  if (declaration) ctx.css.push(`${local.selector}{${declaration}}`)
}

// --- report finalization ----------------------------------------------------

/** Subtree ids of one node (inclusive), depth-first. */
function subtreeIds(graph: SceneGraph, rootId: string): string[] {
  const ids: string[] = []
  const collect = (id: string): void => {
    ids.push(id)
    const node = graph.getNode(id)
    if (node) for (const childId of node.childIds) collect(childId)
  }
  collect(rootId)
  return ids
}

/**
 * Variant component subtrees: components outside the export root are walked
 * fresh (attributed to the instance's screen so load/delay ops re-run with
 * that screen's entry); components already inside the root keep their own
 * attribution, and a shared component instanced on two screens warns — the
 * first instance's screen wins for template delay/load re-entry.
 */
function walkVariantTargets(ctx: WalkContext): void {
  const seen = new Set<string>()
  for (const walk of ctx.pendingVariantWalks) {
    if (seen.has(walk.componentId)) continue
    seen.add(walk.componentId)
    const component = ctx.graph.getNode(walk.componentId)
    if (!component) continue
    const ids = subtreeIds(ctx.graph, walk.componentId)
    const inside = ids.some((id) => ctx.screenOf.has(id))
    if (inside) {
      if (
        walk.instanceScreenId &&
        ids.some(
          (id) =>
            ctx.screenOf.get(id) !== undefined && ctx.screenOf.get(id) !== walk.instanceScreenId
        )
      ) {
        warnOnce(
          ctx,
          `Variant component "${component.name}" is shared by instances on different screens; template load/delay ops bind to the first instance's screen`
        )
      }
      continue
    }
    if (!walk.instanceScreenId) continue
    for (const id of ids) ctx.screenOf.set(id, walk.instanceScreenId)
    for (const id of ids) {
      const node = ctx.graph.getNode(id)
      if (node) visitNode(ctx, node)
    }
  }
}

/** Tag delay ops inside overlay subtrees so opening the overlay re-runs them. */
function tagOverlayDelayOps(ctx: WalkContext): void {
  for (const overlayId of ctx.overlayIds) {
    const selectors = new Set(subtreeIds(ctx.graph, overlayId).map((id) => nodeSelector(id)))
    for (const op of ctx.shim) {
      // Every op inside the overlay subtree is tagged: the shim's container
      // check must accept overlay-owned elements after the DOM hoist, and
      // opening the overlay re-runs the delay ops.
      if (selectors.has(op.sel)) op.overlayOf = overlayId
    }
  }
}

/**
 * Root-child overlays are never part of a screen subtree in preview, so
 * `seedInitialStates` never touches them: drop their seed attributes to match
 * (nested overlays live inside a screen and keep their seeds).
 */
function pruneOverlaySeeds(ctx: WalkContext): void {
  for (const overlayId of ctx.overlayIds) {
    if (ctx.navDestIds.has(overlayId)) continue
    const overlay = ctx.graph.getNode(overlayId)
    if (!overlay || overlay.parentId !== ctx.rootId) continue
    for (const id of subtreeIds(ctx.graph, overlayId)) ctx.seeds.delete(id)
  }
}

function finalize(ctx: WalkContext, screens: SceneNode[]): PrototypeAnalysis {
  walkVariantTargets(ctx)
  tagOverlayDelayOps(ctx)
  pruneOverlaySeeds(ctx)

  // Screens exist when anything can navigate or open an overlay.
  const screensEmitted = ctx.navCount > 0 || ctx.overlayIds.size > 0
  // Overlay targets are not screens unless a navigate also targets them.
  const screenIdSet = new Set(
    ctx.screenIds.filter((id) => !ctx.overlayIds.has(id) || ctx.navDestIds.has(id))
  )
  const screenNodes = screens.filter((screen) => screenIdSet.has(screen.id))

  let screenInfos: PrototypeScreenInfo[] = []
  let stage: { width: number; height: number } | null = null

  const protoRoot = ctx.graph.getNode(ctx.graph.rootId)
  const doc = protoRoot ? readPrototypeDocument(protoRoot) : null
  const active = activeFlow(doc)
  let activeId: string | null = null
  if (screensEmitted && screenNodes.length > 0) {
    activeId =
      active && screenIdSet.has(active.startNodeId)
        ? active.startNodeId
        : (screenNodes[0]?.id ?? null)
    screenInfos = [...screenIdSet].map((id) => ({ id, active: id === activeId }))
    stage = {
      width: Math.max(1, ...screenNodes.map((screen) => screen.width)),
      height: Math.max(1, ...screenNodes.map((screen) => screen.height))
    }
  }

  if (!screensEmitted) {
    // No screen structure: load/delay ops run once at start, not per entry.
    for (const op of ctx.shim) op.screen = null
  }

  for (const flow of doc ? doc.flows : []) {
    const exported = screensEmitted && screenIdSet.has(flow.startNodeId)
    bumpCount(ctx.report.flows, exported ? 'exported' : 'skipped')
    let state: FlowState = 'skipped'
    if (!screensEmitted) state = 'no-screens'
    else if (exported) state = 'exported'
    recordFlow(ctx, flow, state)
  }

  return {
    report: { ...ctx.report, warnings: [...ctx.warnings] },
    css: [...ctx.frontCss, ...ctx.css],
    shim: ctx.shim,
    screens: screenInfos,
    stage,
    seeds: ctx.seeds,
    overlays: new Set(ctx.overlayIds),
    variants: ctx.variants
  }
}

type FlowState = 'exported' | 'skipped' | 'no-screens'

function recordFlow(
  ctx: WalkContext,
  flow: { id: string; name: string; startNodeId: string },
  state: FlowState
): void {
  const detail = ((): string => {
    if (state === 'exported') return `flow "${flow.name}" starts the exported screens`
    if (state === 'no-screens') return `flow "${flow.name}" needs an exported screen structure`
    return `flow "${flow.name}" start is not a top-level screen of the export root`
  })()
  const entry: IssueEntry = {
    feature: 'flow',
    detail,
    status: state === 'exported' ? 'exported' : 'skipped'
  }
  if (state !== 'exported') entry.reason = 'inactive-flow'
  record(ctx, flow.startNodeId, flow.name, entry)
}

/** Depth-first order matching the serialized design document's children. */
function orderedRootChildren(graph: SceneGraph, rootId: string): string[] {
  const root = graph.getNode(rootId)
  if (!root) return []
  const order: string[] = []
  const visit = (id: string): void => {
    order.push(id)
    const node = graph.getNode(id)
    if (!node) return
    for (const childId of node.childIds) visit(childId)
  }
  for (const childId of root.childIds) visit(childId)
  return order
}

/** Walk the export root and build CSS/shim emission plus the full report. */
export function analyzePrototype(graph: SceneGraph, rootId: string): PrototypeAnalysis {
  const { screenOf, screenIds, screens } = collectSubtree(graph, rootId)
  const ctx: WalkContext = {
    graph,
    rootId,
    report: emptyPrototypeReport(),
    css: [],
    frontCss: [],
    shim: [],
    seeds: new Map<string, string>(),
    screenOf,
    screenIds,
    screenRules: new Map(),
    screenCssPushed: false,
    warnings: new Set<string>(),
    animSeq: 0,
    playSeq: 0,
    navCount: 0,
    overlayIds: new Set<string>(),
    navDestIds: new Set<string>(),
    overlayCssPushed: new Set<string>(),
    variants: new Map(),
    variantComponentIds: new Set<string>(),
    pendingVariantWalks: [],
    visited: new Set<string>()
  }
  for (const childId of orderedRootChildren(graph, rootId)) {
    const node = graph.getNode(childId)
    if (node) visitNode(ctx, node)
  }
  return finalize(ctx, screens)
}
