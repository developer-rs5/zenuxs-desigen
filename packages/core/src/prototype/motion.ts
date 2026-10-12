import type {
  PrototypeEasing,
  PrototypeSpring,
  PrototypeTransition
} from '@open-pencil/scene-graph'

/**
 * Pure motion math for the prototype runtime (spec §3D): easing curves,
 * normalized springs, and transition progress. No timers, no DOM — every
 * function maps elapsed time or progress to a value so the runtime stays
 * deterministic and unit-testable.
 */

/** Solve y for x on a cubic bezier with fixed start/end points (CSS timing functions). */
function cubicBezierProgress(x1: number, y1: number, x2: number, y2: number, x: number): number {
  if (x <= 0) return 0
  if (x >= 1) return 1
  const sampleX = (t: number) =>
    3 * t * (1 - t) * (1 - t) * x1 + 3 * t * t * (1 - t) * x2 + t * t * t
  const sampleY = (t: number) =>
    3 * t * (1 - t) * (1 - t) * y1 + 3 * t * t * (1 - t) * y2 + t * t * t
  let low = 0
  let high = 1
  let t = x
  for (let i = 0; i < 24; i++) {
    const value = sampleX(t)
    if (Math.abs(value - x) < 1e-6) break
    if (value < x) low = t
    else high = t
    t = (low + high) / 2
  }
  return sampleY(t)
}

const EASING_BEZIERS: Record<PrototypeEasing, readonly [number, number, number, number]> = {
  linear: [0, 0, 1, 1],
  ease: [0.25, 0.1, 0.25, 1],
  easeIn: [0.42, 0, 1, 1],
  easeOut: [0, 0, 0.58, 1],
  easeInOut: [0.42, 0, 0.58, 1]
}

export function easingProgress(easing: PrototypeEasing, p: number): number {
  const clamped = Math.min(1, Math.max(0, p))
  const bezier = EASING_BEZIERS[easing]
  return cubicBezierProgress(bezier[0], bezier[1], bezier[2], bezier[3], clamped)
}

/**
 * Normalized progress curve for a spring: f(0) = 0, f(1) = 1 exactly
 * (endpoint-clamped), with overshoot inside the segment. Derived from the
 * standard damped-harmonic-oscillator step response; `time` mode converts the
 * friendly bounce parameter into a damping ratio, `physics` mode uses the
 * classic zeta = damping / (2·sqrt(stiffness·mass)) relation.
 */
export function springProgress(config: PrototypeSpring, p: number): number {
  const clamped = Math.min(1, Math.max(0, p))
  if (clamped === 0) return 0
  if (clamped === 1) return 1

  let zeta: number
  let omega: number
  if (config.mode === 'time') {
    const bounce = Math.min(0.999, Math.max(0, config.bounce ?? 0.25))
    zeta = 1 - bounce
    // More bounce ⇒ more oscillation periods packed into the segment.
    omega = 2 * Math.PI * (0.5 + bounce * 1.6)
  } else {
    const stiffness = Math.max(1e-3, config.stiffness ?? 100)
    const damping = Math.max(0, config.damping ?? 10)
    const mass = Math.max(1e-3, config.mass ?? 1)
    zeta = damping / (2 * Math.sqrt(stiffness * mass))
    omega = 2 * Math.PI * Math.max(0.5, Math.sqrt(stiffness / mass) / 12)
  }

  if (!Number.isFinite(zeta) || !Number.isFinite(omega)) return clamped

  if (zeta >= 1) {
    // Critically / over-damped: monotonic settle, no overshoot.
    const decay = omega * zeta
    return 1 - Math.exp(-decay * clamped) * (1 + decay * clamped)
  }

  const damped = omega * Math.sqrt(1 - zeta * zeta)
  const envelope = Math.exp(-zeta * omega * clamped)
  return (
    1 -
    envelope * (Math.cos(damped * clamped) + ((zeta * omega) / damped) * Math.sin(damped * clamped))
  )
}

/** Default settle window for springs that do not pin a duration. */
export const SPRING_DEFAULT_DURATION_MS = 400

export function transitionDurationMs(transition: PrototypeTransition): number {
  if (transition.kind === 'instant') return 0
  if (transition.kind === 'spring') return transition.durationMs ?? SPRING_DEFAULT_DURATION_MS
  return transition.durationMs
}

/**
 * Completion test by elapsed time, not curve value: spring progress overshoots
 * past 1 mid-flight, so `progress >= 1` would settle animations early and pop.
 */
export function transitionSettled(transition: PrototypeTransition, elapsedMs: number): boolean {
  return elapsedMs >= transitionDurationMs(transition)
}

/** Linear time progress eased by the transition's curve; 1 means finished. */
export function transitionProgress(transition: PrototypeTransition, elapsedMs: number): number {
  const duration = transitionDurationMs(transition)
  if (duration <= 0) return 1
  const linear = Math.min(1, Math.max(0, elapsedMs / duration))
  if (transition.kind === 'spring') return springProgress(transition.spring, linear)
  if (transition.kind === 'instant') return 1
  return easingProgress(transition.easing, linear)
}

export function lerpNumber(from: number, to: number, t: number): number {
  return from + (to - from) * Math.min(1, Math.max(0, t))
}
