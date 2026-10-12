import { springProgress, transitionDurationMs } from '@open-pencil/core/prototype/motion'
import type {
  PrototypeAction,
  PrototypeEasing,
  PrototypeStateVisual,
  PrototypeTrigger,
  PrototypeTransition
} from '@open-pencil/scene-graph'

import { formatNumber } from './css'

/**
 * Pure classification data for prototype → HTML/CSS/JS export: which authored
 * features the export can express, the exact CSS timing strings it maps to,
 * and the report vocabulary used when something cannot be expressed.
 *
 * Nothing here reads a graph or emits markup; `analyze.ts` owns the walk.
 */

/** One reported item: always discloses what was exported, approximated, or withheld. */
export interface PrototypeExportIssue {
  nodeId: string
  nodeName: string
  feature: PrototypeExportFeature
  detail: string
  status: PrototypeExportStatus
  /** Required when `status` is `skipped`. */
  reason?: PrototypeExportReason
  /** Required when `status` is `exported-approximate`. */
  emittedAs?: string
}

export type PrototypeExportFeature =
  | 'transition'
  | 'trigger'
  | 'action'
  | 'guard'
  | 'setVars'
  | 'visual'
  | 'animation'
  | 'group'
  | 'flow'

export type PrototypeExportStatus = 'exported' | 'exported-approximate' | 'skipped'

/**
 * Stable reason tokens for skipped items. Tests and the CLI report key off
 * these; details carry the human-readable context. Tokens for features that
 * the JS runtime now drives (guard, spring, setVariant, overlay, setVars,
 * unsupported-trigger) remain in the vocabulary for compatibility but are no
 * longer emitted.
 */
export type PrototypeExportReason =
  | 'guard'
  | 'spring'
  | 'unsupported-trigger'
  | 'duplicate-trigger'
  | 'setVariant'
  | 'overlay'
  | 'destination-outside-root'
  | 'missing-target'
  | 'setVars'
  | 'fill'
  | 'revert-mismatch'
  | 'inactive-flow'

export interface PrototypeExportCounts {
  total: number
  exported: number
  approximate: number
  skipped: number
}

export interface PrototypeExportReport {
  interactions: PrototypeExportCounts
  states: PrototypeExportCounts
  /** Animations plus animation groups found in the export root. */
  animations: PrototypeExportCounts
  flows: PrototypeExportCounts
  issues: PrototypeExportIssue[]
  warnings: string[]
}

export function emptyPrototypeCounts(): PrototypeExportCounts {
  return { total: 0, exported: 0, approximate: 0, skipped: 0 }
}

export function emptyPrototypeReport(): PrototypeExportReport {
  return {
    interactions: emptyPrototypeCounts(),
    states: emptyPrototypeCounts(),
    animations: emptyPrototypeCounts(),
    flows: emptyPrototypeCounts(),
    issues: [],
    warnings: []
  }
}

export function bumpCount(counts: PrototypeExportCounts, status: PrototypeExportStatus): void {
  counts.total += 1
  if (status === 'exported') counts.exported += 1
  else if (status === 'exported-approximate') counts.approximate += 1
  else counts.skipped += 1
}

/**
 * CSS timing-function keywords. These are the exact keyword equivalents of
 * `EASING_BEZIERS` in `@open-pencil/core/prototype/motion`: CSS keyword
 * timing functions and that table define the same cubic beziers, so this map
 * is a rename, never an approximation.
 */
export const EASING_TO_CSS: Record<PrototypeEasing, string> = {
  linear: 'linear',
  ease: 'ease',
  easeIn: 'ease-in',
  easeOut: 'ease-out',
  easeInOut: 'ease-in-out'
}

export function easingToCSS(easing: PrototypeEasing): string {
  return EASING_TO_CSS[easing]
}

export type PrototypeTriggerStrategy = 'css-hover' | 'css-active' | 'js' | 'unsupported'

/**
 * How a trigger is expressed: hover/press map onto pure CSS pseudo-classes
 * when the action is CSS-drivable; click/load/afterDelay plus drag, scroll,
 * longPress, release, and guarded/mutating interactions need the emitted JS
 * runtime. `unsupported` is unreachable for the authored trigger union — it
 * remains as the honest fallback for future triggers the runtime cannot map.
 */
export function triggerStrategy(trigger: PrototypeTrigger): PrototypeTriggerStrategy {
  switch (trigger) {
    case 'hoverEnter':
    case 'hoverLeave':
      return 'css-hover'
    case 'press':
      return 'css-active'
    case 'click':
    case 'load':
    case 'afterDelay':
    case 'drag':
    case 'scroll':
    case 'longPress':
    case 'release':
      return 'js'
    default:
      return 'unsupported'
  }
}

/** Shim trigger token per authored trigger (`ops[].trigger`). */
export type PrototypeShimTriggerName =
  | 'click'
  | 'load'
  | 'delay'
  | 'press'
  | 'release'
  | 'drag'
  | 'scroll'
  | 'longpress'
  | 'enter'
  | 'leave'

export function triggerAttribute(trigger: PrototypeTrigger): PrototypeShimTriggerName {
  switch (trigger) {
    case 'afterDelay':
      return 'delay'
    case 'load':
      return 'load'
    case 'click':
      return 'click'
    case 'press':
      return 'press'
    case 'release':
      return 'release'
    case 'drag':
      return 'drag'
    case 'scroll':
      return 'scroll'
    case 'longPress':
      return 'longpress'
    case 'hoverEnter':
      return 'enter'
    default:
      return 'leave'
  }
}

/**
 * Sample count for spring → `linear()` conversion. 64 points over the spring
 * window is denser than a 60 fps preview frame grid, so the emitted easing
 * reproduces the clamped preview curve (`lerpNumber` / render-state clamp)
 * to within sub-frame error.
 */
export const SPRING_SAMPLES = 64

/**
 * Hold duration before a preview press fires the longPress trigger. Mirrors
 * `LONG_PRESS_THRESHOLD_MS` in `packages/core/src/editor/prototype/actions.ts`;
 * a parity test pins the two values together.
 */
export const LONG_PRESS_THRESHOLD_MS = 500

/**
 * `<duration>ms linear(p0, …, p64)` sampling the *clamped* spring progress.
 * Preview clamps spring progress before it drives any visual (`lerpNumber`
 * clamps t to [0,1]; the screen crossfade clamps opacity), so sampling the
 * clamped curve — never the raw overshoot — is the exact expression.
 */
export function springTiming(transition: Extract<PrototypeTransition, { kind: 'spring' }>): string {
  const duration = transitionDurationMs(transition)
  const samples: string[] = []
  for (let index = 0; index <= SPRING_SAMPLES; index++) {
    const raw = springProgress(transition.spring, index / SPRING_SAMPLES)
    samples.push(formatNumber(Math.min(1, Math.max(0, raw))))
  }
  return `${formatNumber(duration)}ms linear(${samples.join(',')})`
}

export function isSpringTransition(
  transition: PrototypeTransition | undefined
): transition is Extract<PrototypeTransition, { kind: 'spring' }> {
  return transition?.kind === 'spring'
}

/**
 * CSS timing string `<duration>ms <easing>` for fade/slide keyword easings,
 * a sampled `linear()` for springs, and null for `instant` (no transition).
 */
export function transitionTiming(transition: PrototypeTransition | undefined): string | null {
  if (!transition) return null
  if (transition.kind === 'spring') return springTiming(transition)
  if (transition.kind === 'fade' || transition.kind === 'slide') {
    return `${transition.durationMs}ms ${easingToCSS(transition.easing)}`
  }
  return null
}

/**
 * Whether the shim must drive one interaction: guards and variable writes
 * cannot be expressed by a CSS pseudo-class, and navigate/overlay/variant
 * actions have no pseudo-class at all. Kept as one predicate so every
 * emission path routes identically.
 */
export function needsJS(
  trigger: PrototypeTrigger,
  action: PrototypeAction,
  guarded: boolean
): boolean {
  if (guarded) return true
  if (action.type === 'setState' && action.setVars) return true
  const strategy = triggerStrategy(trigger)
  if (strategy === 'js') return true
  if (strategy === 'unsupported') return true
  return action.type !== 'setState' && action.type !== 'playAnimation'
}

function field(value: number | string | boolean | undefined): string {
  if (value === undefined) return 'undefined'
  if (typeof value === 'number') return String(Math.round(value * 1e4) / 1e4)
  return String(value)
}

/**
 * Structural equality of two *resolved* visuals (delta fields already
 * defaulted, absolute fields already anchored to the authored node — see
 * `resolvedVisual` in `css.ts`). Used to decide whether a CSS pseudo-class
 * revert lands exactly where preview would.
 */
export function sameVisual(a: PrototypeStateVisual, b: PrototypeStateVisual): boolean {
  const keys: Array<keyof PrototypeStateVisual> = [
    'scale',
    'opacity',
    'translateX',
    'translateY',
    'rotation',
    'width',
    'height',
    'cornerRadius',
    'fill',
    'blur'
  ]
  return keys.every((key) => field(a[key]) === field(b[key]))
}
