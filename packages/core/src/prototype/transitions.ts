import type { PrototypeDirection, PrototypeTransition } from '@open-pencil/scene-graph'

export interface FramePlacement {
  /** Offsets as fractions of frame dimensions (x, y) */
  fromOffset: [number, number]
  fromAlpha: number
  toOffset: [number, number]
  toAlpha: number
  /** True when the outgoing frame draws above the incoming frame (MoveOut, SlideOut) */
  fromOnTop: boolean
}

export function directionVector(dir: PrototypeDirection): [number, number] {
  switch (dir) {
    case 'left':
      return [-1.0, 0.0]
    case 'right':
      return [1.0, 0.0]
    case 'up':
      return [0.0, -1.0]
    case 'down':
      return [0.0, 1.0]
    default:
      return [-1.0, 0.0]
  }
}

/**
 * Computes exact frame placements and opacity curves for screen-to-screen transitions.
 * Directly ported from FigCraft (`transition_frames`).
 */
export function transitionFramePlacement(
  transition: PrototypeTransition,
  t: number
): FramePlacement {
  const mul = ([x, y]: [number, number], k: number): [number, number] => [x * k, y * k]
  const base: FramePlacement = {
    fromOffset: [0.0, 0.0],
    fromAlpha: 1.0,
    toOffset: [0.0, 0.0],
    toAlpha: 1.0,
    fromOnTop: false
  }

  const clampedT = Math.min(1.0, Math.max(0.0, t))

  switch (transition.kind) {
    case 'instant':
      return { ...base, fromAlpha: 0.0 }

    case 'fade':
    case 'dissolve':
      return { ...base, fromAlpha: 1.0 - clampedT, toAlpha: clampedT }

    case 'smartAnimate':
      return { ...base, toAlpha: clampedT }

    case 'slide': {
      // Legacy slide compatibility: incoming slides in, outgoing slides out
      const d = directionVector(transition.direction)
      return {
        ...base,
        fromOffset: mul(d, clampedT),
        toOffset: mul(d, -(1.0 - clampedT))
      }
    }

    case 'moveIn': {
      const d = directionVector(transition.direction)
      return {
        ...base,
        toOffset: mul(d, -(1.0 - clampedT))
      }
    }

    case 'moveOut': {
      const d = directionVector(transition.direction)
      return {
        ...base,
        fromOffset: mul(d, clampedT),
        fromOnTop: true
      }
    }

    case 'push': {
      const d = directionVector(transition.direction)
      return {
        ...base,
        fromOffset: mul(d, clampedT),
        toOffset: mul(d, -(1.0 - clampedT))
      }
    }

    case 'slideIn': {
      const d = directionVector(transition.direction)
      return {
        ...base,
        fromOffset: mul(d, 0.3 * clampedT),
        toOffset: mul(d, -(1.0 - clampedT))
      }
    }

    case 'slideOut': {
      const d = directionVector(transition.direction)
      return {
        ...base,
        fromOffset: mul(d, clampedT),
        toOffset: mul(d, -0.3 * (1.0 - clampedT)),
        fromOnTop: true
      }
    }

    case 'spring':
      return { ...base, toAlpha: clampedT, fromAlpha: 1.0 - clampedT }
  }
}
