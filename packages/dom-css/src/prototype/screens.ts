import type { PrototypeTransition, SceneGraph } from '@open-pencil/scene-graph'
import { readNodeStateModel } from '@open-pencil/scene-graph'

import { warnOnce, type WalkContext } from './context'
import { formatNumber, nodeSelector, prototypeScreenCSS, screenSelector } from './css'
import { isSpringTransition, transitionTiming } from './support'

/**
 * Screen-structure emission for navigate interactions: `.op-screen`
 * stacking, crossfade/slide entry and exit rules, and the per-screen
 * `transition` declarations. Mirrors preview's `collectScreenVisuals`
 * (`packages/core/src/prototype/render-state.ts`): fade lerps opacity
 * (in = p, out = 1 − p), slide offsets both screens by the destination
 * screen's bounds.
 */

export interface ScreenRuleRecord {
  timing?: string
  baseOpacity?: boolean
  leavingOpacity?: boolean
  baseTransform?: string
  leavingTransform?: string
}

export interface NavEmission {
  status: 'exported' | 'exported-approximate'
  emittedAs?: string
}

interface ScreenOffset {
  x: number
  y: number
}

type SlideDirection = 'left' | 'right' | 'up' | 'down'

export function screenRec(ctx: WalkContext, screenId: string): ScreenRuleRecord {
  const existing = ctx.screenRules.get(screenId)
  if (existing) return existing
  const created: ScreenRuleRecord = {}
  ctx.screenRules.set(screenId, created)
  return created
}

/** `data-op-state` resets mirroring preview's `seedInitialStates` on entry. */
export function seedResets(ctx: WalkContext, screenId: string): Array<readonly [string, string]> {
  const resets: Array<readonly [string, string]> = []
  const visit = (id: string): void => {
    const node = ctx.graph.getNode(id)
    if (!node) return
    const model = readNodeStateModel(node)
    if (model?.states.some((state) => state.name === model.initial)) {
      resets.push([nodeSelector(node.id), model.initial])
    }
    for (const childId of node.childIds) visit(childId)
  }
  visit(screenId)
  return resets
}

function registerTransition(ctx: WalkContext, screenId: string, timing: string): boolean {
  const rec = screenRec(ctx, screenId)
  if (rec.timing === undefined) {
    rec.timing = timing
    ctx.css.push(
      `${screenSelector(screenId)}{transition: opacity ${timing}, transform ${timing}, visibility ${timing}}`
    )
    return true
  }
  if (rec.timing !== timing) {
    warnTransitionConflict(ctx, screenId, rec, timing)
    return false
  }
  return true
}

function warnTransitionConflict(
  ctx: WalkContext,
  screenId: string,
  rec: ScreenRuleRecord,
  timing: string
): void {
  warnOnce(
    ctx,
    `Screen "${screenId}" has conflicting navigate transitions (${rec.timing} vs ${timing}); kept ${rec.timing}`
  )
}

/** Fade entry/exit: hidden screens sit at opacity 0, active at their authored opacity. */
function emitFadeRules(ctx: WalkContext, sourceId: string, destId: string): void {
  const destRec = screenRec(ctx, destId)
  if (!destRec.baseOpacity) {
    destRec.baseOpacity = true
    const opacity = authoredOpacity(ctx.graph, destId)
    ctx.css.push(
      `${screenSelector(destId)}{opacity: calc(0 * ${formatNumber(opacity)})}`,
      `${screenSelector(destId)}.is-active{opacity: calc(1 * ${formatNumber(opacity)})}`
    )
  }
  const sourceRec = screenRec(ctx, sourceId)
  if (!sourceRec.leavingOpacity) {
    sourceRec.leavingOpacity = true
    const opacity = authoredOpacity(ctx.graph, sourceId)
    ctx.css.push(
      `${screenSelector(sourceId)}.is-leaving{opacity: calc(0 * ${formatNumber(opacity)})}`
    )
  }
}

/** Slide entry/exit offsets; first emission per direction stands, conflicts warn. */
function emitSlideRules(
  ctx: WalkContext,
  sourceId: string,
  destId: string,
  direction: SlideDirection,
  width: number,
  height: number,
  result: NavEmission
): void {
  const incoming = slideOffset(direction, width, height)
  const outgoing = slideOffset(oppositeDirection(direction), width, height)
  const inSig = `${direction}|${incoming.x}|${incoming.y}`
  const outSig = `${direction}|${outgoing.x}|${outgoing.y}`
  const destRec = screenRec(ctx, destId)
  if (destRec.baseTransform === undefined) {
    destRec.baseTransform = inSig
    ctx.css.push(
      `${screenSelector(destId)}{transform: translate(${incoming.x}px, ${incoming.y}px)}`,
      `${screenSelector(destId)}.is-active{transform: translate(0px, 0px)}`
    )
  } else if (destRec.baseTransform !== inSig) {
    downgrade(result, "the screen's existing slide direction")
    warnOnce(
      ctx,
      `Screen "${destId}" is entered from conflicting slide directions; kept ${destRec.baseTransform}`
    )
  }
  const sourceRec = screenRec(ctx, sourceId)
  if (sourceRec.leavingTransform === undefined) {
    sourceRec.leavingTransform = outSig
    ctx.css.push(
      `${screenSelector(sourceId)}.is-leaving{transform: translate(${outgoing.x}px, ${outgoing.y}px)}`
    )
  } else if (sourceRec.leavingTransform !== outSig) {
    downgrade(result, "the screen's existing slide direction")
    warnOnce(
      ctx,
      `Screen "${sourceId}" exits with conflicting slide directions; kept ${sourceRec.leavingTransform}`
    )
  }
}

function downgrade(result: NavEmission, emittedAs: string): void {
  result.status = 'exported-approximate'
  result.emittedAs = emittedAs
}

function authoredOpacity(graph: SceneGraph, screenId: string): number {
  const node = graph.getNode(screenId)
  return node ? node.opacity : 1
}

/** Preview's screen slide offsets: incoming starts off-screen, outgoing ends there. */
function slideOffset(direction: SlideDirection, width: number, height: number): ScreenOffset {
  switch (direction) {
    case 'left':
      return { x: width, y: 0 }
    case 'right':
      return { x: -width, y: 0 }
    case 'up':
      return { x: 0, y: height }
    default:
      return { x: 0, y: -height }
  }
}

function oppositeDirection(direction: SlideDirection): SlideDirection {
  if (direction === 'left') return 'right'
  if (direction === 'right') return 'left'
  if (direction === 'up') return 'down'
  return 'up'
}

/**
 * Emit screen rules for one navigate interaction. Spring transitions sample
 * the clamped spring curve into a `linear()` easing and crossfade like fade
 * (preview clamps spring progress before it drives opacity); instant
 * navigation is honest only while neither endpoint carries a timed screen
 * transition the swap would inherit, otherwise reported approximate.
 */
export function emitScreenNav(
  ctx: WalkContext,
  sourceId: string,
  destId: string,
  transition: PrototypeTransition | undefined
): NavEmission {
  if (!ctx.screenCssPushed) {
    ctx.css.push(prototypeScreenCSS())
    ctx.screenCssPushed = true
  }
  const timing = transitionTiming(transition)
  if (!timing) return emitInstantNav(ctx, sourceId, destId)

  const result: NavEmission = { status: 'exported' }
  for (const screenId of [destId, sourceId]) {
    if (!registerTransition(ctx, screenId, timing)) {
      const rec = ctx.screenRules.get(screenId)
      downgrade(result, `the screen's existing ${rec ? rec.timing : timing} transition`)
    }
  }

  if (transition?.kind === 'fade' || isSpringTransition(transition)) {
    emitFadeRules(ctx, sourceId, destId)
  } else if (transition?.kind === 'slide') {
    const destNode = ctx.graph.getNode(destId)
    emitSlideRules(
      ctx,
      sourceId,
      destId,
      transition.direction,
      destNode ? destNode.width : 0,
      destNode ? destNode.height : 0,
      result
    )
  }
  return result
}

function emitInstantNav(ctx: WalkContext, sourceId: string, destId: string): NavEmission {
  const inherited = [sourceId, destId].find((id) => ctx.screenRules.get(id)?.timing !== undefined)
  if (!inherited) return { status: 'exported' }
  warnOnce(
    ctx,
    `Instant navigate shares screen "${inherited}" with a timed navigate; the timed transition applies`
  )
  return {
    status: 'exported-approximate',
    emittedAs: "instant swap using the screen's existing transition"
  }
}
