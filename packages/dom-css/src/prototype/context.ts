import type {
  PrototypeInteraction,
  PrototypeStateModel,
  PrototypeStateVisual,
  PrototypeTrigger,
  SceneGraph,
  SceneNode
} from '@open-pencil/scene-graph'

import type { PrototypeCSSProperty, AnimationTiming } from './css'
import type { ScreenRuleRecord } from './screens'
import type { PrototypeShimOp, PrototypeShimOpBase } from './shim'
import {
  bumpCount,
  triggerAttribute,
  type PrototypeExportFeature,
  type PrototypeExportIssue,
  type PrototypeExportReason,
  type PrototypeExportReport,
  type PrototypeExportStatus
} from './support'

/**
 * Shared walker state for one prototype export: graph access, emission
 * outputs, per-screen rule bookkeeping, and the accumulating report.
 */

export interface WalkContext {
  graph: SceneGraph
  rootId: string
  report: PrototypeExportReport
  css: string[]
  /** Rules that must precede state rules (variant root styles win over base classes). */
  frontCss: string[]
  shim: PrototypeShimOp[]
  seeds: Map<string, string>
  screenOf: Map<string, string>
  screenIds: string[]
  screenRules: Map<string, ScreenRuleRecord>
  screenCssPushed: boolean
  warnings: Set<string>
  animSeq: number
  playSeq: number
  navCount: number
  /** Overlay targets discovered from openOverlay actions (screen exclusion + decoration). */
  overlayIds: Set<string>
  /** Root children that a navigate targets; these stay screens even when also overlay targets. */
  navDestIds: Set<string>
  /** Overlay ids whose base CSS/backdrop rules were already emitted (first-wins). */
  overlayCssPushed: Set<string>
  /** instanceId → variant swap targets for template + CSS emission. */
  variants: Map<string, Array<{ componentId: string; spec: string }>>
  /** Variant component ids already registered (dedupe across specs/instances). */
  variantComponentIds: Set<string>
  /** Variant subtree walks deferred to finalize (components are walked once). */
  pendingVariantWalks: Array<{ componentId: string; instanceScreenId: string | null }>
  /** Node ids already visited by the walker (variant subtrees may overlap). */
  visited: Set<string>
}

/** Per-node walker state shared by state, animation, and interaction emission. */
export interface NodeContext {
  selector: string
  screenId: string | null
  model: PrototypeStateModel | null
  initialResolved: PrototypeStateVisual | null
  hasJsSetState: boolean
  hoverLeaveExact: boolean
  /** A hover interaction carries a guard → both hover directions run through JS. */
  hoverJs: boolean
  /** A valid hoverLeave setState exists, so the enter state has a defined exit. */
  leaveCovered: boolean
  authoredBlur: number
  only?: ReadonlySet<PrototypeCSSProperty>
  blurGap: boolean
  seenTriggers: Set<PrototypeTrigger>
  claims: Map<PrototypeCSSProperty, Claim>
  animationNames: Map<string, string>
  groupTimings: Map<string, AnimationTiming[]>
  groupPartial: Map<string, { resolved: number; total: number }>
}

export interface Claim {
  timing: string
  via: 'interaction' | 'state'
}

export type IssueEntry = Omit<PrototypeExportIssue, 'nodeId' | 'nodeName'>

export type FinishInteraction = (
  status: PrototypeExportStatus,
  feature: PrototypeExportFeature,
  detail: string,
  extra?: { reason?: PrototypeExportReason; emittedAs?: string }
) => void

export function warnOnce(ctx: WalkContext, message: string): void {
  if (!ctx.warnings.has(message)) ctx.warnings.add(message)
}

export function record(
  ctx: WalkContext,
  nodeId: string,
  nodeName: string,
  entry: IssueEntry
): void {
  ctx.report.issues.push({ nodeId, nodeName, ...entry })
}

/**
 * Transition claim bookkeeping: the interaction's authored motion wins over
 * the state fallback; among equals the first claim stands and conflicts are
 * warned once.
 */
export function setClaim(
  ctx: WalkContext,
  claims: Map<PrototypeCSSProperty, Claim>,
  property: PrototypeCSSProperty,
  timing: string,
  via: 'interaction' | 'state'
): void {
  const existing = claims.get(property)
  if (!existing) {
    claims.set(property, { timing, via })
    return
  }
  if (existing.timing === timing) return
  if (existing.via === 'state' && via === 'interaction') {
    claims.set(property, { timing, via })
    return
  }
  if (existing.via === 'interaction' && via === 'state') return
  warnOnce(ctx, `Conflicting ${property} transition timings on one node; kept ${existing.timing}`)
}

/** Drop state-fallback claims so an interaction-authored instant/spring stays unwritten. */
export function cancelStateClaims(
  claims: Map<PrototypeCSSProperty, Claim>,
  properties: readonly PrototypeCSSProperty[]
): void {
  for (const property of properties) {
    const existing = claims.get(property)
    if (existing?.via === 'state') claims.delete(property)
  }
}

/** Count plus record one interaction outcome in the report. */
export function makeFinish(
  ctx: WalkContext,
  node: { id: string; name: string }
): FinishInteraction {
  return (status, feature, detail, extra = {}) => {
    bumpCount(ctx.report.interactions, status)
    const entry: IssueEntry = { feature, detail, status }
    if (extra.reason) entry.reason = extra.reason
    if (extra.emittedAs) entry.emittedAs = extra.emittedAs
    record(ctx, node.id, node.name, entry)
  }
}

/** Base fields every shim op carries; guard/var seed attach only when useful. */
export function shimBase(
  local: NodeContext,
  interaction: PrototypeInteraction,
  needsSeed: boolean
): PrototypeShimOpBase {
  const base: PrototypeShimOpBase = {
    sel: local.selector,
    screen: local.screenId,
    trigger: triggerAttribute(interaction.trigger),
    delay: interaction.delayMs ?? 0
  }
  if (interaction.guard) base.guard = interaction.guard.all
  if (needsSeed && local.model?.vars) base.seedVars = local.model.vars
  return base
}

/** Disclose guard evaluation and variable writes as exported runtime behavior. */
export function recordRuntimeFeatures(
  ctx: WalkContext,
  node: SceneNode,
  baseDetail: string,
  interaction: PrototypeInteraction
): void {
  if (interaction.guard) {
    record(ctx, node.id, node.name, {
      feature: 'guard',
      detail: `${baseDetail} evaluates ${interaction.guard.all.length} guard condition(s) at fire time`,
      status: 'exported'
    })
  }
  const action = interaction.action
  if (action.type === 'setState' && action.setVars) {
    record(ctx, node.id, node.name, {
      feature: 'setVars',
      detail: `${baseDetail} writes variables ${Object.keys(action.setVars).join(', ')} atomically with the state`,
      status: 'exported'
    })
  }
}
