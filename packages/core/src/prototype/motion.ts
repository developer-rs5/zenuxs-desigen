import type {
  PrototypeEasing,
  PrototypeSpring,
  PrototypeTransition
} from '@open-pencil/scene-graph'

/**
 * Pure motion math for the prototype runtime (spec §3D / FigCraft):
 * easing curves, analytic physical damped springs, and transition progress.
 */

/** Solve y for x on a cubic bezier with fixed start/end points using binary bisection. */
export function cubicBezierProgress(
  x1: number,
  y1: number,
  x2: number,
  y2: number,
  x: number
): number {
  if (x <= 0) return 0
  if (x >= 1) return 1

  const fin = (v: number, fallback: number) => (Number.isFinite(v) ? v : fallback)
  const cx1 = Math.min(1, Math.max(0, fin(x1, 0.42)))
  const cx2 = Math.min(1, Math.max(0, fin(x2, 0.58)))
  const cy1 = Math.min(10, Math.max(-10, fin(y1, 0.0)))
  const cy2 = Math.min(10, Math.max(-10, fin(y2, 1.0)))

  const b = (p1: number, p2: number, s: number) => {
    const u = 1 - s
    return 3 * u * u * s * p1 + 3 * u * s * s * p2 + s * s * s
  }

  let lo = 0
  let hi = 1
  for (let i = 0; i < 48; i++) {
    const mid = (lo + hi) / 2
    if (b(cx1, cx2, mid) < x) lo = mid
    else hi = mid
  }
  return b(cy1, cy2, (lo + hi) / 2)
}

/**
 * Physical damped harmonic oscillator step response solver ported from FigCraft.
 */
export class PhysicalSpring {
  readonly w0: number
  readonly zeta: number
  readonly settle: number

  constructor(mass: number, stiffness: number, damping: number) {
    const ok = (v: number, lo: number, d: number) => (Number.isFinite(v) && v >= lo ? v : d)
    const m = Math.min(1e4, ok(mass, 0.01, 1.0))
    const k = Math.min(1e6, ok(stiffness, 0.01, 100.0))
    const c = Math.min(1e6, ok(damping, 0.0, 15.0))

    this.w0 = Math.sqrt(k / m)
    this.zeta = c / (2.0 * Math.sqrt(k * m))

    const rate =
      this.zeta < 1.0
        ? this.zeta * this.w0
        : this.w0 / (this.zeta + Math.sqrt(this.zeta * this.zeta - 1.0))
    const kSettle = this.zeta < 1.0 ? 6.9 : 9.2
    const s = rate > 1e-6 ? Math.min(10.0, Math.max(0.05, kSettle / rate)) : 10.0
    this.settle = Number.isFinite(s) ? s : 10.0
  }

  at(t: number): number {
    if (t >= 1.0) return 1.0
    const tau = t * this.settle
    let x = 1.0

    if (this.zeta < 1.0) {
      const wd = this.w0 * Math.sqrt(1.0 - this.zeta * this.zeta)
      x =
        1.0 -
        Math.exp(-this.zeta * this.w0 * tau) *
          (Math.cos(wd * tau) + ((this.zeta * this.w0) / wd) * Math.sin(wd * tau))
    } else if (Math.abs(this.zeta - 1.0) < 1e-9) {
      x = 1.0 - Math.exp(-this.w0 * tau) * (1.0 + this.w0 * tau)
    } else {
      const s = Math.sqrt(this.zeta * this.zeta - 1.0)
      const r1 = -this.w0 / (this.zeta + s)
      const r2 = -this.w0 * (this.zeta + s)
      x = 1.0 - (r2 * Math.exp(r1 * tau) - r1 * Math.exp(r2 * tau)) / (r2 - r1)
    }
    return Number.isFinite(x) ? x : 1.0
  }
}

const SPRING_PRESETS: Record<string, [number, number, number]> = {
  gentle: [1.0, 100.0, 15.0],
  quick: [1.0, 300.0, 20.0],
  bouncy: [1.0, 600.0, 15.0],
  slow: [1.0, 80.0, 20.0]
}

const EASING_BEZIERS: Record<string, readonly [number, number, number, number]> = {
  linear: [0, 0, 1, 1],
  ease: [0.25, 0.1, 0.25, 1],
  easeIn: [0.42, 0, 1, 1],
  easeOut: [0, 0, 0.58, 1],
  easeInOut: [0.42, 0, 0.58, 1]
}

export function easingProgress(easing: PrototypeEasing, p: number): number {
  const t = Math.min(1, Math.max(0, p))

  if (typeof easing === 'string') {
    if (easing === 'linear') return t
    if (easing === 'easeIn') return t * t * t
    if (easing === 'easeOut') return 1.0 - Math.pow(1.0 - t, 3)
    if (easing === 'easeInOut') {
      return t < 0.5 ? 4.0 * t * t * t : 1.0 - Math.pow(-2.0 * t + 2.0, 3) / 2.0
    }
    const c1 = 1.70158
    if (easing === 'easeInBack') {
      return (c1 + 1.0) * t * t * t - c1 * t * t
    }
    if (easing === 'easeOutBack') {
      return 1.0 + (c1 + 1.0) * Math.pow(t - 1.0, 3) + c1 * Math.pow(t - 1.0, 2)
    }
    if (easing === 'easeInOutBack') {
      const c2 = c1 * 1.525
      return t < 0.5
        ? (Math.pow(2.0 * t, 2) * ((c2 + 1.0) * 2.0 * t - c2)) / 2.0
        : (Math.pow(2.0 * t - 2.0, 2) * ((c2 + 1.0) * (t * 2.0 - 2.0) + c2) + 2.0) / 2.0
    }
    if (easing in SPRING_PRESETS) {
      const [m, k, c] = SPRING_PRESETS[easing]
      return new PhysicalSpring(m, k, c).at(t)
    }
    const bezier = EASING_BEZIERS[easing] ?? EASING_BEZIERS.easeOut
    return cubicBezierProgress(bezier[0], bezier[1], bezier[2], bezier[3], t)
  }

  if (typeof easing === 'object') {
    if (easing.type === 'customBezier') {
      return cubicBezierProgress(easing.x1, easing.y1, easing.x2, easing.y2, t)
    }
    if (easing.type === 'customSpring') {
      return new PhysicalSpring(easing.mass, easing.stiffness, easing.damping).at(t)
    }
  }

  return t
}

/**
 * Normalized spring progress (compatibility export): f(0)=0, f(1)=1 exactly,
 * overshoot inside the segment. Physics mode uses zeta = damping / (2·sqrt(k·m)).
 */
export function springProgress(config: PrototypeSpring, p: number): number {
  const clamped = Math.min(1, Math.max(0, p))
  if (clamped === 0) return 0
  if (clamped === 1) return 1
  const stiffness = Math.max(1e-3, config.stiffness ?? 100)
  const damping = Math.max(0, config.damping ?? 10)
  const mass = Math.max(1e-3, config.mass ?? 1)
  const zeta = damping / (2 * Math.sqrt(stiffness * mass))
  const omega = 2 * Math.PI * Math.max(0.5, Math.sqrt(stiffness / mass) / 12)
  if (!Number.isFinite(zeta) || !Number.isFinite(omega)) return clamped
  if (zeta >= 1) {
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

export const SPRING_DEFAULT_DURATION_MS = 400

export function transitionDurationMs(transition: PrototypeTransition): number {
  if (transition.kind === 'instant') return 0
  if (transition.kind === 'spring') return transition.durationMs ?? SPRING_DEFAULT_DURATION_MS
  return transition.durationMs ?? 300
}

export function transitionSettled(transition: PrototypeTransition, elapsedMs: number): boolean {
  return elapsedMs >= transitionDurationMs(transition)
}

/** Linear time progress eased by the transition's curve; 1 means finished. */
export function transitionProgress(transition: PrototypeTransition, elapsedMs: number): number {
  const duration = transitionDurationMs(transition)
  if (duration <= 0) return 1
  const linear = Math.min(1, Math.max(0, elapsedMs / duration))
  if (transition.kind === 'spring') {
    const stiffness = Math.max(1e-3, transition.spring.stiffness ?? 100)
    const damping = Math.max(0, transition.spring.damping ?? 15)
    const mass = Math.max(1e-3, transition.spring.mass ?? 1)
    return new PhysicalSpring(mass, stiffness, damping).at(linear)
  }
  if (transition.kind === 'instant') return 1
  const easing = 'easing' in transition && transition.easing ? transition.easing : 'easeOut'
  return easingProgress(easing, linear)
}

export function lerpNumber(from: number, to: number, t: number): number {
  return from + (to - from) * Math.min(1, Math.max(0, t))
}
