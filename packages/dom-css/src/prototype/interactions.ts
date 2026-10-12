import {
  findAnimation,
  readNodeAnimations,
  type PrototypeInteraction,
  type SceneNode
} from '@open-pencil/scene-graph'

import {
  cancelStateClaims,
  makeFinish,
  record,
  recordRuntimeFeatures,
  setClaim,
  shimBase,
  type FinishInteraction,
  type IssueEntry,
  type NodeContext,
  type WalkContext
} from './context'
import {
  animationShorthand,
  joinDeclarations,
  resolvedVisual,
  screenSelector,
  visualCSS,
  type AnimationTiming,
  type PrototypeCSSProperty
} from './css'
import { processOverlayClose, processOverlayOpen } from './overlays'
import { emitScreenNav, seedResets } from './screens'
import {
  easingToCSS,
  isSpringTransition,
  needsJS,
  triggerStrategy,
  transitionTiming,
  type PrototypeExportStatus,
  type PrototypeTriggerStrategy
} from './support'
import { processVariant } from './variant'

/**
 * Per-interaction classification and emission. Every authored interaction is
 * routed to an expression that preserves preview semantics: CSS
 * pseudo-classes where they are exact (unguarded hover with a covering
 * leave), the emitted JS runtime everywhere CSS cannot evaluate (guards,
 * variable writes, drag/scroll/longPress/release, overlays, variants,
 * navigations). Nothing is skipped for capability reasons anymore; skipped
 * counts only remain for genuine data errors (missing targets, duplicates,
 * destinations outside the export root).
 */

export function processInteraction(
  ctx: WalkContext,
  node: SceneNode,
  local: NodeContext,
  interaction: PrototypeInteraction
): void {
  const finish = makeFinish(ctx, node)
  const baseDetail = `${interaction.trigger} → ${actionDetail(ctx, interaction.action)}`

  // Preview dispatches the first interaction per trigger and never falls
  // through to later ones — even when the first is guarded at runtime.
  if (local.seenTriggers.has(interaction.trigger)) {
    finish('skipped', 'trigger', `${baseDetail} duplicates an earlier trigger`, {
      reason: 'duplicate-trigger'
    })
    return
  }
  local.seenTriggers.add(interaction.trigger)

  const strategy = triggerStrategy(interaction.trigger)
  if (strategy === 'unsupported') {
    finish('skipped', 'trigger', `${baseDetail} has no runtime mapping`, {
      reason: 'unsupported-trigger'
    })
    return
  }

  const action = interaction.action
  switch (action.type) {
    case 'navigate':
      processNavigate(ctx, node, local, interaction, baseDetail, finish)
      break
    case 'setState':
      processSetState(ctx, node, local, interaction, baseDetail, finish)
      break
    case 'playAnimation':
      processPlay(ctx, node, local, interaction, baseDetail, finish)
      break
    case 'openOverlay':
      processOverlayOpen(ctx, node, local, interaction, baseDetail, finish)
      break
    case 'closeOverlay':
      processOverlayClose(ctx, node, local, interaction, baseDetail, finish)
      break
    case 'setVariant':
      processVariant(ctx, node, local, interaction, baseDetail, finish)
      break
    default:
      finish('skipped', 'action', `${baseDetail} has no emitter`, {
        reason: 'unsupported-trigger'
      })
  }
}

function actionDetail(ctx: WalkContext, action: PrototypeInteraction['action']): string {
  switch (action.type) {
    case 'navigate': {
      const destination = ctx.graph.getNode(action.destinationId)
      return `navigate to "${destination ? destination.name : action.destinationId}"`
    }
    case 'setState':
      return `setState "${action.state}"`
    case 'playAnimation':
      return `play ${action.group === true ? 'group ' : ''}animation "${action.animationId}"`
    case 'openOverlay':
      return `openOverlay "${action.overlayId}"`
    case 'closeOverlay':
      return 'closeOverlay'
    case 'setVariant':
      return `setVariant "${action.variant}"`
    default:
      return 'action'
  }
}

function transitionLabel(transition: PrototypeInteraction['transition']): string {
  if (!transition) return 'instant'
  if (transition.kind === 'fade' || transition.kind === 'slide') {
    return `${transition.kind} ${transition.durationMs}ms ${easingToCSS(transition.easing)}`
  }
  if (transition.kind === 'spring') return 'spring'
  return 'instant'
}

function pseudoFor(strategy: PrototypeTriggerStrategy): ':hover' | ':active' | null {
  if (strategy === 'css-hover') return ':hover'
  if (strategy === 'css-active') return ':active'
  return null
}

// --- setState ---------------------------------------------------------------

interface SetStateOutcome {
  status: 'exported' | 'exported-approximate'
  emittedAs?: string
  subIssues: IssueEntry[]
}

/** Motion claims: interaction-authored transition wins; instant cancels. */
function applySetStateMotion(
  ctx: WalkContext,
  local: NodeContext,
  interaction: PrototypeInteraction,
  authored: PrototypeInteraction['transition'],
  properties: readonly PrototypeCSSProperty[]
): void {
  if (interaction.transition?.kind === 'instant') {
    cancelStateClaims(local.claims, properties)
    return
  }
  const timing = transitionTiming(authored)
  if (!timing) return
  for (const property of properties) setClaim(ctx, local.claims, property, timing, 'interaction')
}

/** Push a JS-routed state op (guard/setVars attach via shimBase). */
function emitRuntimeState(
  ctx: WalkContext,
  local: NodeContext,
  interaction: PrototypeInteraction,
  stateName: string,
  baseDetail: string,
  node: SceneNode,
  finish: FinishInteraction
): void {
  const action = interaction.action
  const vars = action.type === 'setState' ? action.setVars : undefined
  const op = {
    kind: 'state' as const,
    state: stateName,
    ...shimBase(local, interaction, Boolean(interaction.guard) || Boolean(vars)),
    ...(vars ? { vars } : {})
  }
  ctx.shim.push(op)
  recordRuntimeFeatures(ctx, node, baseDetail, interaction)
  finish('exported', 'action', `${baseDetail} via delegated runtime`)
}

/** CSS pseudo-class emission for an exact hover/press setState. */
function emitCSSSetState(
  ctx: WalkContext,
  local: NodeContext,
  interaction: PrototypeInteraction,
  strategy: PrototypeTriggerStrategy,
  vcss: ReturnType<typeof visualCSS>,
  outcome: SetStateOutcome
): void {
  const pseudo = pseudoFor(strategy)
  if (!pseudo) return
  ctx.css.push(`${local.selector}${pseudo}{${joinDeclarations(vcss)}}`)
  if (interaction.trigger === 'hoverEnter' && !local.leaveCovered) {
    outcome.status = 'exported-approximate'
    outcome.emittedAs = ':hover (reverts to the base state when the pointer leaves)'
  }
}

function processSetState(
  ctx: WalkContext,
  node: SceneNode,
  local: NodeContext,
  interaction: PrototypeInteraction,
  baseDetail: string,
  finish: FinishInteraction
): void {
  const action = interaction.action
  if (action.type !== 'setState') return
  const model = local.model
  const target = model ? model.states.find((state) => state.name === action.state) : undefined
  if (!model || !target) {
    finish('skipped', 'action', `${baseDetail} targets a state that does not exist`, {
      reason: 'missing-target'
    })
    return
  }

  const authored = interaction.transition ?? target.transition
  const resolved = resolvedVisual(node, target.visual)
  const vcss = visualCSS(node, resolved, local.only)
  if (local.authoredBlur > 0 && resolved.blur !== 0) local.blurGap = true
  applySetStateMotion(ctx, local, interaction, authored, vcss.properties)

  const strategy = triggerStrategy(interaction.trigger)
  const isHover = strategy === 'css-hover'
  // A guarded/setVars hover interaction anywhere on the node forces both
  // hover directions through JS: CSS cannot evaluate a guard at fire time,
  // and a JS-applied enter must be reverted by a JS leave (parity with
  // preview's sticky stateVisuals).
  const js =
    needsJS(interaction.trigger, action, Boolean(interaction.guard)) || (isHover && local.hoverJs)

  if (js) {
    emitRuntimeState(ctx, local, interaction, target.name, baseDetail, node, finish)
    return
  }

  const outcome: SetStateOutcome = { status: 'exported', subIssues: [] }
  const leaveNeedsRuntime =
    isHover && interaction.trigger === 'hoverLeave' && !local.hoverLeaveExact
  if (leaveNeedsRuntime) {
    // Preview applies the leave state when the pointer exits. Removing
    // `:hover` lands exactly on it only when the leave target equals the
    // seeded base and no JS setState can have moved the attribute meanwhile;
    // otherwise a delegated leave op writes it (exact preview parity).
    emitRuntimeState(ctx, local, interaction, target.name, baseDetail, node, finish)
    return
  }
  if (!isHover || interaction.trigger !== 'hoverLeave') {
    emitCSSSetState(ctx, local, interaction, strategy, vcss, outcome)
  }

  recordRuntimeFeatures(ctx, node, baseDetail, interaction)
  for (const sub of outcome.subIssues) record(ctx, node.id, node.name, sub)
  finish(
    outcome.status,
    'action',
    baseDetail,
    outcome.emittedAs ? { emittedAs: outcome.emittedAs } : {}
  )
}

// --- playAnimation ----------------------------------------------------------

function resolvePlayEntries(
  node: SceneNode,
  local: NodeContext,
  targetId: string,
  isGroup: boolean
): AnimationTiming[] | null {
  if (isGroup) {
    const timings = local.groupTimings.get(targetId)
    return timings && timings.length > 0 ? timings : null
  }
  const name = local.animationNames.get(targetId)
  if (!name) return null
  const container = readNodeAnimations(node)
  const animation = container ? findAnimation(container, targetId) : null
  if (!animation) return null
  return [
    {
      name,
      durationMs: animation.durationMs,
      timing: easingToCSS(animation.easing ?? 'linear'),
      delayMs: 0,
      loop: animation.playMode === 'loop'
    }
  ]
}

function processPlay(
  ctx: WalkContext,
  node: SceneNode,
  local: NodeContext,
  interaction: PrototypeInteraction,
  baseDetail: string,
  finish: FinishInteraction
): void {
  const action = interaction.action
  if (action.type !== 'playAnimation') return
  const entries = resolvePlayEntries(node, local, action.animationId, action.group === true)
  if (!entries) {
    finish('skipped', 'action', `${baseDetail} references an animation that does not exist`, {
      reason: 'missing-target'
    })
    return
  }

  const shorthand = animationShorthand(entries)
  let status: PrototypeExportStatus = 'exported'
  let emittedAs: string | undefined
  const partial = action.group === true ? local.groupPartial.get(action.animationId) : undefined
  if (partial && partial.resolved < partial.total) {
    status = 'exported-approximate'
    emittedAs = `group playback with ${partial.resolved} of ${partial.total} items`
  }

  const pseudo = pseudoFor(triggerStrategy(interaction.trigger))
  const guarded = Boolean(interaction.guard)
  if (pseudo && !needsJS(interaction.trigger, action, guarded)) {
    ctx.css.push(`${local.selector}${pseudo}{${shorthand}}`)
  } else {
    const playClass = `op-play-${ctx.playSeq}`
    ctx.playSeq += 1
    ctx.css.push(`${local.selector}.${playClass}{${shorthand}}`)
    ctx.shim.push({
      kind: 'play',
      playClass,
      ...shimBase(local, interaction, Boolean(interaction.guard))
    })
    recordRuntimeFeatures(ctx, node, baseDetail, interaction)
  }

  finish(status, 'action', `${baseDetail} → ${shorthand}`, emittedAs ? { emittedAs } : {})
}

// --- navigate ---------------------------------------------------------------

function processNavigate(
  ctx: WalkContext,
  node: SceneNode,
  local: NodeContext,
  interaction: PrototypeInteraction,
  baseDetail: string,
  finish: FinishInteraction
): void {
  const action = interaction.action
  if (action.type !== 'navigate') return
  const destinationId = action.destinationId
  if (!ctx.graph.getNode(destinationId)) {
    finish('skipped', 'action', `${baseDetail} targets a node that does not exist`, {
      reason: 'missing-target'
    })
    return
  }
  if (!ctx.screenIds.includes(destinationId) || !local.screenId) {
    finish('skipped', 'action', `${baseDetail} leaves the export root (no screen emitted)`, {
      reason: 'destination-outside-root'
    })
    return
  }

  const spring = isSpringTransition(interaction.transition)
  const emission = emitScreenNav(ctx, local.screenId, destinationId, interaction.transition)
  ctx.navDestIds.add(destinationId)
  // The outgoing screen stays visible only while its screen transition runs;
  // an instant swap hides it with `visibility` immediately.
  const sourceTiming = ctx.screenRules.get(local.screenId)?.timing
  ctx.shim.push({
    kind: 'navigate',
    destSel: screenSelector(destinationId),
    dest: destinationId,
    leaveVisible: sourceTiming !== undefined,
    resets: seedResets(ctx, destinationId),
    ...shimBase(local, interaction, Boolean(interaction.guard))
  })
  ctx.navCount += 1
  recordRuntimeFeatures(ctx, node, baseDetail, interaction)

  const status: PrototypeExportStatus = emission.status
  const emittedAs: string | undefined = emission.emittedAs
  if (spring) {
    record(ctx, node.id, node.name, {
      feature: 'transition',
      detail: `${baseDetail} authors a spring transition (sampled into linear() easing)`,
      status: 'exported'
    })
  }
  finish(
    status,
    'action',
    `${baseDetail} with ${transitionLabel(interaction.transition)}`,
    emittedAs ? { emittedAs } : {}
  )
}
