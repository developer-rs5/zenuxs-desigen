/**
 * Prototype data: interactions (trigger → actions) with transitions, flows and
 * overflow. (Converted 1:1 from FigCraft `crates/doc/src/proto.rs`,
 * `proto_expr.rs`, `proto_expr_parse.rs`.)
 */

import type { NodeId } from './ids'
import type { Color } from '@zenuxs/color'

/** Deepest nesting of conditional blocks followed. */
export const MAX_ACTION_DEPTH = 16

/** Trigger kinds (serde `tag = "type"`, camelCase). */
export type Trigger =
  | { type: 'onClick' }
  | { type: 'onHover' }
  | { type: 'onPress' }
  | { type: 'onDrag' }
  | { type: 'mouseEnter' }
  | { type: 'mouseLeave' }
  | { type: 'mouseDown' }
  | { type: 'mouseUp' }
  | { type: 'afterDelay'; ms: number }
  | { type: 'keyPress'; key: string }

/** The modifier keys of a key combination. */
export interface KeyMods {
  ctrl: boolean
  alt: boolean
  shift: boolean
  /** Command (macOS), the Windows key elsewhere. */
  cmd: boolean
}

export const KeyMods = {
  default(): KeyMods {
    return { ctrl: false, alt: false, shift: false, cmd: false }
  },

  /** `key` with these modifiers, as a key trigger stores it: `Ctrl+Alt+Shift+Cmd+K`. */
  combo(mods: KeyMods, key: string): string {
    let s = ''
    const pairs: Array<[boolean, string]> = [
      [mods.ctrl, 'Ctrl'],
      [mods.alt, 'Alt'],
      [mods.shift, 'Shift'],
      [mods.cmd, 'Cmd']
    ]
    for (const [on, name] of pairs) {
      if (on) s += name + '+'
    }
    return s + key
  },

  /** A key combination's modifiers and key (tolerates aliases like Control/Option/⌘). */
  split(combo: string): [KeyMods, string] {
    const mods = KeyMods.default()
    let rest = combo.trim()
    for (;;) {
      const at = rest.indexOf('+')
      if (at <= 0) break
      const m = rest.slice(0, at).trim().toLowerCase()
      const k = rest.slice(at + 1)
      if (k.length === 0) break
      if (m === 'ctrl' || m === 'control' || m === '⌃') mods.ctrl = true
      else if (m === 'alt' || m === 'option' || m === 'opt' || m === '⌥') mods.alt = true
      else if (m === 'shift' || m === '⇧') mods.shift = true
      else if (m === 'cmd' || m === 'command' || m === 'meta' || m === 'super' || m === 'win' || m === '⌘') mods.cmd = true
      else break
      rest = k.trim()
    }
    return [mods, rest]
  }
}

/** The controller buttons a key/gamepad trigger can name (standard layout order). */
export const GAMEPAD_BUTTONS: readonly string[] = [
  'Gamepad A',
  'Gamepad B',
  'Gamepad X',
  'Gamepad Y',
  'Gamepad LB',
  'Gamepad RB',
  'Gamepad LT',
  'Gamepad RT',
  'Gamepad View',
  'Gamepad Menu',
  'Gamepad LS',
  'Gamepad RS',
  'Gamepad Up',
  'Gamepad Down',
  'Gamepad Left',
  'Gamepad Right',
  'Gamepad Home'
]

export function gamepad_button(index: number): string | null {
  return GAMEPAD_BUTTONS[index] ?? null
}

export function is_gamepad_button(key: string): boolean {
  const t = key.trim()
  return GAMEPAD_BUTTONS.some((b) => b.toLowerCase() === t.toLowerCase())
}

/** Alternative spellings people type for keys, as the keys' names. */
export function key_alias(k: string): string | null {
  const t = k.toLowerCase()
  switch (t) {
    case 'space':
    case ' ':
      return 'Space'
    case 'return':
    case 'enter':
      return 'Enter'
    case 'esc':
    case 'escape':
      return 'Escape'
    case 'left':
    case 'arrowleft':
    case '←':
      return 'ArrowLeft'
    case 'right':
    case 'arrowright':
    case '→':
      return 'ArrowRight'
    case 'up':
    case 'arrowup':
    case '↑':
      return 'ArrowUp'
    case 'down':
    case 'arrowdown':
    case '↓':
      return 'ArrowDown'
    case 'tab':
      return 'Tab'
    case 'backspace':
      return 'Backspace'
    case 'delete':
      return 'Delete'
    default:
      return null
  }
}

export const Trigger = {
  label(t: Trigger): string {
    switch (t.type) {
      case 'onClick':
        return 'On click'
      case 'onHover':
        return 'While hovering'
      case 'onPress':
        return 'While pressing'
      case 'onDrag':
        return 'On drag'
      case 'mouseEnter':
        return 'Mouse enter'
      case 'mouseLeave':
        return 'Mouse leave'
      case 'mouseDown':
        return 'Mouse down'
      case 'mouseUp':
        return 'Mouse up'
      case 'afterDelay':
        return `After delay ${t.ms}ms`
      case 'keyPress':
        return is_gamepad_button(t.key) ? t.key : `Key/Gamepad ${t.key}`
    }
  },

  /** Whether a key trigger fires for `key` with exactly the modifiers `mods`. */
  fires_on_key(t: Trigger, key: string, mods: KeyMods): boolean {
    if (t.type !== 'keyPress') return false
    const [m, want] = KeyMods.split(t.key)
    const alias = key_alias(want)
    if (m.ctrl !== mods.ctrl || m.alt !== mods.alt || m.shift !== mods.shift || m.cmd !== mods.cmd) {
      return false
    }
    return want.toLowerCase() === key.toLowerCase() || (alias !== null && alias === key)
  }
}

export type Direction = 'left' | 'right' | 'top' | 'bottom'

/** Easing curves (serde `tag = "type"` for the custom ones). */
export type Easing =
  | 'linear'
  | 'easeIn'
  | 'easeOut'
  | 'easeInOut'
  | 'easeInBack'
  | 'easeOutBack'
  | 'easeInOutBack'
  | 'gentle'
  | 'quick'
  | 'bouncy'
  | 'slow'
  | { type: 'customBezier'; x1: number; y1: number; x2: number; y2: number }
  | { type: 'customSpring'; mass: number; stiffness: number; damping: number }

export const Easing = {
  CUSTOM_BEZIER: { type: 'customBezier', x1: 0.42, y1: 0, x2: 0.58, y2: 1 } as const,
  CUSTOM_SPRING: { type: 'customSpring', mass: 1, stiffness: 100, damping: 15 } as const,

  ALL: [
    'linear',
    'easeIn',
    'easeOut',
    'easeInOut',
    'easeInBack',
    'easeOutBack',
    'easeInOutBack',
    'gentle',
    'quick',
    'bouncy',
    'slow'
  ] as const,

  label(e: Easing): string {
    if (typeof e === 'string') {
      switch (e) {
        case 'linear':
          return 'Linear'
        case 'easeIn':
          return 'Ease in'
        case 'easeOut':
          return 'Ease out'
        case 'easeInOut':
          return 'Ease in and out'
        case 'easeInBack':
          return 'Ease in back'
        case 'easeOutBack':
          return 'Ease out back'
        case 'easeInOutBack':
          return 'Ease in and out back'
        case 'gentle':
          return 'Gentle'
        case 'quick':
          return 'Quick'
        case 'bouncy':
          return 'Bouncy'
        case 'slow':
          return 'Slow'
      }
    }
    return e.type === 'customBezier' ? 'Custom bezier' : 'Custom spring'
  },

  /** A spring's mass, stiffness and damping (null for the curves). */
  spring(e: Easing): [number, number, number] | null {
    if (typeof e === 'string') {
      switch (e) {
        case 'gentle':
          return [1, 100, 15]
        case 'quick':
          return [1, 300, 20]
        case 'bouncy':
          return [1, 600, 15]
        case 'slow':
          return [1, 80, 20]
        default:
          return null
      }
    }
    return e.type === 'customSpring' ? [e.mass, e.stiffness, e.damping] : null
  },

  is_spring(e: Easing): boolean {
    return Easing.spring(e) !== null
  },

  /** How long an animation with this easing plays (seconds) for `ms`. */
  seconds(e: Easing, ms: number): number {
    const spring = Easing.spring(e)
    if (spring) return new Spring(spring[0], spring[1], spring[2]).settle
    return ms / 1000
  },

  /** Evaluate the curve at `t` (0..1). */
  eval(e: Easing, t0: number): number {
    const t = Number.isFinite(t0) ? Math.min(1, Math.max(0, t0)) : 1
    // Rust f32 casts snap the endpoint back to exactly 1.
    if (t === 1) return 1
    const back = 1.70158
    if (typeof e === 'string') {
      switch (e) {
        case 'linear':
          return t
        case 'easeIn':
          return t * t * t
        case 'easeOut':
          return 1 - Math.pow(1 - t, 3)
        case 'easeInOut':
          return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2
        case 'easeInBack':
          return (back + 1) * t * t * t - back * t * t
        case 'easeOutBack':
          return 1 + (back + 1) * Math.pow(t - 1, 3) + back * Math.pow(t - 1, 2)
        case 'easeInOutBack': {
          const c2 = back * 1.525
          return t < 0.5
            ? (Math.pow(2 * t, 2) * ((c2 + 1) * 2 * t - c2)) / 2
            : (Math.pow(2 * t - 2, 2) * ((c2 + 1) * (t * 2 - 2) + c2) + 2) / 2
        }
        case 'gentle':
        case 'quick':
        case 'bouncy':
        case 'slow': {
          const [m, k, c] = Easing.spring(e)!
          return new Spring(m, k, c).at(t)
        }
        default:
          return t
      }
    }
    if (e.type === 'customSpring') {
      return new Spring(e.mass, e.stiffness, e.damping).at(t)
    }
    return cubic_bezier(t, e.x1, e.y1, e.x2, e.y2)
  }
}

/** CSS `cubic-bezier(x1, y1, x2, y2)` at time `t`. */
function cubic_bezier(t: number, x1: number, y1: number, x2: number, y2: number): number {
  const fin = (v: number, d: number): number => (Number.isFinite(v) ? v : d)
  const cx1 = Math.min(1, Math.max(0, fin(x1, 0.42)))
  const cx2 = Math.min(1, Math.max(0, fin(x2, 0.58)))
  const cy1 = Math.min(10, Math.max(-10, fin(y1, 0)))
  const cy2 = Math.min(10, Math.max(-10, fin(y2, 1)))
  const b = (p1: number, p2: number, s: number): number => {
    const u = 1 - s
    return 3 * u * u * s * p1 + 3 * u * s * s * p2 + s * s * s
  }
  let lo = 0
  let hi = 1
  for (let i = 0; i < 48; i++) {
    const mid = (lo + hi) / 2
    if (b(cx1, cx2, mid) < t) lo = mid
    else hi = mid
  }
  return b(cy1, cy2, (lo + hi) / 2)
}

/** A damped spring (unit mass-spring-damper released from 0 towards 1). */
export class Spring {
  w0: number
  zeta: number
  /** Seconds until it stays within ~0.1% of the end. */
  settle: number

  constructor(mass: number, stiffness: number, damping: number) {
    const ok = (v: number, lo: number, d: number): number => (Number.isFinite(v) && v >= lo ? v : d)
    const m = Math.min(1e4, ok(mass, 0.01, 1))
    const k = Math.min(1e6, ok(stiffness, 0.01, 100))
    const c = Math.min(1e6, ok(damping, 0, 15))
    this.w0 = Math.sqrt(k / m)
    this.zeta = c / (2 * Math.sqrt(k * m))
    const rate =
      this.zeta < 1 ? this.zeta * this.w0 : this.w0 / (this.zeta + Math.sqrt(this.zeta * this.zeta - 1))
    const kSettle = this.zeta < 1 ? 6.9 : 9.2
    const s = rate > 1e-6 ? Math.min(10, Math.max(0.05, kSettle / rate)) : 10
    this.settle = Number.isFinite(s) ? s : 10
  }

  /** Its position at `t` (0..1) of its settling time. */
  at(t: number): number {
    if (t >= 1) return 1
    const tau = t * this.settle
    let x: number
    if (this.zeta < 1) {
      const wd = this.w0 * Math.sqrt(1 - this.zeta * this.zeta)
      x =
        1 -
        Math.exp(-this.zeta * this.w0 * tau) *
          (Math.cos(wd * tau) + ((this.zeta * this.w0) / wd) * Math.sin(wd * tau))
    } else if (Math.abs(this.zeta - 1) < 1e-9) {
      x = 1 - Math.exp(-this.w0 * tau) * (1 + this.w0 * tau)
    } else {
      const s = Math.sqrt(this.zeta * this.zeta - 1)
      const r1 = -this.w0 / (this.zeta + s)
      const r2 = -this.w0 * (this.zeta + s)
      x = 1 - (r2 * Math.exp(r1 * tau) - r1 * Math.exp(r2 * tau)) / (r2 - r1)
    }
    return Number.isFinite(x) ? x : 1
  }
}

export type Transition =
  | { type: 'instant' }
  | { type: 'dissolve' }
  | { type: 'smartAnimate' }
  | { type: 'moveIn'; direction: Direction }
  | { type: 'moveOut'; direction: Direction }
  | { type: 'push'; direction: Direction }
  | { type: 'slideIn'; direction: Direction }
  | { type: 'slideOut'; direction: Direction }

export const Transition = {
  default(): Transition {
    return { type: 'instant' }
  },

  direction(t: Transition): Direction | null {
    return 'direction' in t ? t.direction : null
  },

  /** The same transition with another direction (no-op for directionless ones). */
  with_direction(t: Transition, d: Direction): Transition {
    switch (t.type) {
      case 'moveIn':
        return { type: 'moveIn', direction: d }
      case 'moveOut':
        return { type: 'moveOut', direction: d }
      case 'push':
        return { type: 'push', direction: d }
      case 'slideIn':
        return { type: 'slideIn', direction: d }
      case 'slideOut':
        return { type: 'slideOut', direction: d }
      default:
        return t
    }
  },

  /** Whether a drag of (dx, dy) starts it on an "on drag" trigger. */
  accepts_drag(t: Transition, dx: number, dy: number): boolean {
    const d = Transition.direction(t)
    if (d === null) return true
    switch (d) {
      case 'left':
        return dx < 0 && Math.abs(dx) >= Math.abs(dy)
      case 'right':
        return dx > 0 && Math.abs(dx) >= Math.abs(dy)
      case 'top':
        return dy < 0 && Math.abs(dy) >= Math.abs(dx)
      case 'bottom':
        return dy > 0 && Math.abs(dy) >= Math.abs(dx)
    }
  },

  /** The opposite motion (used when a "while hovering/pressing" state reverts). */
  reversed(t: Transition): Transition {
    const opp = (d: Direction): Direction =>
      d === 'left' ? 'right' : d === 'right' ? 'left' : d === 'top' ? 'bottom' : 'top'
    switch (t.type) {
      case 'moveIn':
        return { type: 'moveOut', direction: opp(t.direction) }
      case 'moveOut':
        return { type: 'moveIn', direction: opp(t.direction) }
      case 'push':
        return { type: 'push', direction: opp(t.direction) }
      case 'slideIn':
        return { type: 'slideOut', direction: opp(t.direction) }
      case 'slideOut':
        return { type: 'slideIn', direction: opp(t.direction) }
      default:
        return t
    }
  },

  label(t: Transition): string {
    switch (t.type) {
      case 'instant':
        return 'Instant'
      case 'dissolve':
        return 'Dissolve'
      case 'smartAnimate':
        return 'Smart animate'
      case 'moveIn':
        return 'Move in'
      case 'moveOut':
        return 'Move out'
      case 'push':
        return 'Push'
      case 'slideIn':
        return 'Slide in'
      case 'slideOut':
        return 'Slide out'
    }
  }
}

export type OverlayPosition =
  | 'center'
  | 'topLeft'
  | 'topCenter'
  | 'topRight'
  | 'bottomLeft'
  | 'bottomCenter'
  | 'bottomRight'
  | 'manual'

export const OverlayPosition = {
  ALL: [
    'center',
    'topLeft',
    'topCenter',
    'topRight',
    'bottomLeft',
    'bottomCenter',
    'bottomRight',
    'manual'
  ] as const,

  label(p: OverlayPosition): string {
    switch (p) {
      case 'center':
        return 'Center'
      case 'topLeft':
        return 'Top left'
      case 'topCenter':
        return 'Top center'
      case 'topRight':
        return 'Top right'
      case 'bottomLeft':
        return 'Bottom left'
      case 'bottomCenter':
        return 'Bottom center'
      case 'bottomRight':
        return 'Bottom right'
      case 'manual':
        return 'Manual'
    }
  }
}

/** One prototype action (serde `tag = "type"`). */
export type Action =
  | { type: 'navigate'; dest: NodeId; preserve_scroll?: boolean }
  | { type: 'back' }
  | { type: 'scrollTo'; dest: NodeId; offset?: [number, number] }
  | {
      type: 'openOverlay'
      dest: NodeId
      position?: OverlayPosition
      close_on_outside?: boolean
      background?: Color | null
      offset?: [number, number] | null
    }
  | { type: 'swapOverlay'; dest: NodeId }
  | { type: 'closeOverlay' }
  | { type: 'openUrl'; url: string }
  | { type: 'changeTo'; dest: NodeId }
  | { type: 'setVariable'; variable: string; value: unknown; expr?: Expr }
  | { type: 'setVariableMode'; collection: string; mode: string }
  | { type: 'conditional'; blocks: ConditionalBlock[] }

/** One if / else-if / else block: the actions run when `condition` holds (null: else). */
export interface ConditionalBlock {
  condition: Expr | null
  actions: Action[]
}

export const ConditionalBlock = {
  /** The first block whose condition holds (a block without a condition is the else). */
  choose(blocks: ConditionalBlock[], vars: Record<string, unknown>, modes: Record<string, string>): ConditionalBlock | null {
    for (const b of blocks) {
      if (b.condition === null || Expr.holds(b.condition, vars, modes)) return b
    }
    return null
  }
}

/** Visit every action, descending into conditional blocks. */
export function walk(actions: readonly Action[], visit: (a: Action) => void, depth = 0): void {
  for (const a of actions) {
    visit(a)
    if (a.type === 'conditional' && depth < MAX_ACTION_DEPTH) {
      for (const b of a.blocks) walk(b.actions, visit, depth + 1)
    }
  }
}

/** Call `f` on every action in `actions` and in their conditional blocks (mutable walk). */
export function walk_mut(actions: Action[], f: (a: Action) => void, depth = 0): void {
  for (const a of actions) {
    f(a)
    if (a.type === 'conditional' && depth < MAX_ACTION_DEPTH) {
      for (const b of a.blocks) walk_mut(b.actions, f, depth + 1)
    }
  }
}

/** Keep the actions `keep` accepts, inside conditional blocks too. */
export function retain_deep(actions: Action[], keep: (a: Action) => boolean, depth = 0): void {
  const filtered: Action[] = []
  for (const a of actions) {
    if (!keep(a)) continue
    if (a.type === 'conditional' && depth < MAX_ACTION_DEPTH) {
      for (const b of a.blocks) retain_deep(b.actions, keep, depth + 1)
      if (!a.blocks.some((b) => b.actions.length > 0)) continue
    }
    filtered.push(a)
  }
  actions.length = 0
  actions.push(...filtered)
}

export const Action = {
  label(a: Action): string {
    switch (a.type) {
      case 'navigate':
        return 'Navigate to'
      case 'back':
        return 'Back'
      case 'scrollTo':
        return 'Scroll to'
      case 'openOverlay':
        return 'Open overlay'
      case 'swapOverlay':
        return 'Swap overlay'
      case 'closeOverlay':
        return 'Close overlay'
      case 'openUrl':
        return 'Open link'
      case 'changeTo':
        return 'Change to'
      case 'setVariable':
        return 'Set variable'
      case 'setVariableMode':
        return 'Set variable mode'
      case 'conditional':
        return 'Conditional'
    }
  },

  /** The variables the action (and what it nests) sets or reads. */
  variables(a: Action): string[] {
    const out: string[] = []
    walk([a], (x) => {
      if (x.type === 'setVariable') {
        out.push(x.variable)
        if (x.expr) out.push(...Expr.variables(x.expr))
      } else if (x.type === 'conditional') {
        for (const b of x.blocks) {
          if (b.condition) out.push(...Expr.variables(b.condition))
        }
      }
    })
    return out
  },

  /** The destination node id, when the action navigates somewhere. */
  dest(a: Action): NodeId | null {
    switch (a.type) {
      case 'navigate':
      case 'scrollTo':
      case 'openOverlay':
      case 'swapOverlay':
      case 'changeTo':
        return a.dest
      default:
        return null
    }
  }
}

/** What happens when the user does something. */
export interface Interaction {
  trigger: Trigger
  actions: Action[]
  transition?: Transition
  duration_ms?: number
  easing?: Easing
  /** Mouse enter, leave, down and up: how long after the gesture the actions run (ms). */
  delay_ms?: number
}

/** Longest delay a trigger waits (ms). */
export const MAX_DELAY_MS = 600_000

export const Interaction = {
  defaultDuration(): number {
    return 300
  },

  /** Seconds between the gesture and the actions (the delay of a mouse trigger). */
  delay_secs(it: Interaction): number {
    switch (it.trigger.type) {
      case 'mouseEnter':
      case 'mouseLeave':
      case 'mouseDown':
      case 'mouseUp':
        return Math.min(MAX_DELAY_MS, it.delay_ms ?? 0) / 1000
      default:
        return 0
    }
  }
}

export type Overflow = 'none' | 'horizontal' | 'vertical' | 'both'
export type ScrollPosition = 'scrolls' | 'fixed' | 'sticky'

/** A prototype flow's starting point on a page. */
export interface Flow {
  name: string
  start: NodeId
  description: string
}

export type DeviceRotation = 'portrait' | 'landscape'

/** A colour a device model comes in (its body; the glass around the screen stays black). */
export interface DeviceColor {
  name: string
  rgb: [number, number, number]
}

/** A device prototypes are presented on: its name and screen size in points (held upright). */
export interface Device {
  name: string
  width: number
  height: number
  /** It can be turned to landscape (phones and tablets; laptops and desktops can't). */
  rotates: boolean
  /** The colours it comes in, the default first. */
  colors: DeviceColor[]
}

/** Prototype device settings on a page. */
export interface PrototypeSettings {
  device: string
  background: Color
  rotation: DeviceRotation
  color: string
  /** The screen of the CUSTOM_DEVICE (points, width × height). */
  custom_size: [number, number]
  /** Responsive: the presented frame is resized to the screen and re-laid out. */
  responsive: boolean
}

/** The devices to pick from ("None" presents the frame at its own size). */
function c(name: string, r: number, g: number, b: number): DeviceColor {
  return { name, rgb: [r, g, b] }
}

export const PrototypeSettings = {
  DEVICES: [
    { name: 'iPhone 17', width: 402, height: 874, rotates: true, colors: [c('Black', 0x38, 0x39, 0x3d), c('White', 0xe9, 0xe9, 0xe5)] },
    { name: 'iPhone 17 Pro', width: 402, height: 874, rotates: true, colors: [c('Black', 0x38, 0x39, 0x3d), c('Silver', 0xd7, 0xd7, 0xd5)] },
    { name: 'iPhone 17 Pro Max', width: 440, height: 956, rotates: true, colors: [c('Black', 0x38, 0x39, 0x3d), c('Silver', 0xd7, 0xd7, 0xd5)] },
    { name: 'iPhone Air', width: 420, height: 912, rotates: true, colors: [c('Black', 0x38, 0x39, 0x3d), c('Silver', 0xd7, 0xd7, 0xd5)] },
    {
      name: 'iPhone 16',
      width: 393,
      height: 852,
      rotates: true,
      colors: [c('Black', 0x3a, 0x3b, 0x3f), c('White', 0xee, 0xed, 0xe8), c('Pink', 0xec, 0xbf, 0xcb), c('Teal', 0xa3, 0xcf, 0xc6), c('Blue', 0x72, 0x84, 0xd4)]
    },
    { name: 'iPhone 16 Pro', width: 402, height: 874, rotates: true, colors: [c('Black', 0x3b, 0x3a, 0x38), c('White', 0xec, 0xeb, 0xe6)] },
    {
      name: 'iPhone 16 Pro Max',
      width: 440,
      height: 956,
      rotates: true,
      colors: [c('Black', 0x3b, 0x3a, 0x38), c('White', 0xec, 0xeb, 0xe6), c('Natural', 0xbf, 0xb9, 0xaf), c('Sand', 0xc6, 0xac, 0x8f)]
    },
    { name: 'iPhone 16 Plus', width: 430, height: 932, rotates: true, colors: [c('Black', 0x3a, 0x3b, 0x3f), c('White', 0xee, 0xed, 0xe8)] },
    { name: 'iPhone 15 Pro', width: 393, height: 852, rotates: true, colors: [c('Black', 0x3b, 0x3a, 0x38), c('Silver', 0xd7, 0xd7, 0xd5)] },
    { name: 'iPhone 15 Pro Max', width: 430, height: 932, rotates: true, colors: [c('Black', 0x3b, 0x3a, 0x38), c('Silver', 0xd7, 0xd7, 0xd5)] },
    { name: 'iPhone 15 Plus', width: 430, height: 932, rotates: true, colors: [c('Black', 0x3a, 0x3b, 0x3f), c('White', 0xee, 0xed, 0xe8)] },
    { name: 'iPhone 14 Pro', width: 393, height: 852, rotates: true, colors: [c('Black', 0x3b, 0x3a, 0x38), c('Silver', 0xd7, 0xd7, 0xd5)] },
    { name: 'iPhone 14 Pro Max', width: 430, height: 932, rotates: true, colors: [c('Black', 0x3b, 0x3a, 0x38), c('Silver', 0xd7, 0xd7, 0xd5)] },
    { name: 'iPhone 14', width: 390, height: 844, rotates: true, colors: [c('Black', 0x3a, 0x3b, 0x3f), c('White', 0xee, 0xed, 0xe8)] },
    { name: 'Android Compact', width: 412, height: 917, rotates: true, colors: [c('Black', 0x2e, 0x2f, 0x33), c('Silver', 0xd6, 0xd8, 0xdb), c('Green', 0xa6, 0xc0, 0xa3)] },
    { name: 'Android Medium', width: 700, height: 840, rotates: true, colors: [c('Black', 0x2e, 0x2f, 0x33), c('Silver', 0xd6, 0xd8, 0xdb)] },
    {
      name: 'iPad mini',
      width: 744,
      height: 1133,
      rotates: true,
      colors: [c('Grey', 0x6a, 0x6b, 0x6f), c('Silver', 0xe0, 0xe1, 0xe3), c('Blue', 0x9c, 0xb1, 0xc9), c('Purple', 0xc6, 0xbc, 0xd7)]
    },
    {
      name: 'MacBook Air',
      width: 1280,
      height: 832,
      rotates: false,
      colors: [c('Silver', 0xc9, 0xca, 0xce), c('Grey', 0x7b, 0x7c, 0x80), c('Dark blue', 0x2e, 0x33, 0x3d), c('Cream', 0xe0, 0xd9, 0xcb)]
    },
    {
      name: 'Desktop',
      width: 1440,
      height: 1024,
      rotates: false,
      colors: [c('Silver', 0xb8, 0xb9, 0xbd), c('Black', 0x2c, 0x2c, 0x2e)]
    }
  ] as Device[],

  /** The device whose screen is `custom_size` (no body is drawn around it). */
  CUSTOM_DEVICE: 'Custom size',
  /** A new custom size. */
  CUSTOM_DEFAULT: [1280, 720] as [number, number],
  /** The largest side a custom size may have (points). */
  CUSTOM_MAX: 10_000,

  /** A custom screen side: finite, at least 1, at most CUSTOM_MAX. */
  custom_side(v: number): number | null {
    return Number.isFinite(v) && v >= 1 ? Math.min(PrototypeSettings.CUSTOM_MAX, Math.round(v)) : null
  },

  default(): PrototypeSettings {
    return {
      device: 'None',
      background: { r: 0x1e / 255, g: 0x1e / 255, b: 0x1e / 255, a: 1 },
      rotation: 'portrait',
      color: '',
      custom_size: [1280, 720],
      responsive: false
    }
  },

  isDefault(s: PrototypeSettings): boolean {
    const d = PrototypeSettings.default()
    return (
      s.device === d.device &&
      s.rotation === d.rotation &&
      s.color === d.color &&
      s.custom_size[0] === d.custom_size[0] &&
      s.custom_size[1] === d.custom_size[1] &&
      !s.responsive &&
      s.background.r === d.background.r &&
      s.background.g === d.background.g &&
      s.background.b === d.background.b
    )
  },

  /** The chosen device model, held upright (null for "None" or an unknown name). */
  model(s: PrototypeSettings): Device | null {
    if (s.device === PrototypeSettings.CUSTOM_DEVICE) return null
    return PrototypeSettings.DEVICES.find((d) => d.name === s.device) ?? null
  }
}

// ------------------------------ Expr (prototype expressions) ------------------------------

/** Deepest nesting of expressions evaluated. */
export const MAX_EXPR_DEPTH = 32

/** Boolean/variable expressions in prototype conditions and setVariable. */
export type Expr =
  | { type: 'literal'; value: unknown }
  | { type: 'variable'; name: string }
  | { type: 'not'; inner: Expr }
  | {
      type: 'binary'
      op: 'and' | 'or' | 'eq' | 'neq' | 'gt' | 'lt' | 'gte' | 'lte' | 'add' | 'sub' | 'mul' | 'div'
      left: Expr
      right: Expr
    }

export const Expr = {
  /** The variables the expression reads. */
  variables(e: Expr): string[] {
    switch (e.type) {
      case 'literal':
        return []
      case 'variable':
        return [e.name]
      case 'not':
        return Expr.variables(e.inner)
      case 'binary':
        return [...Expr.variables(e.left), ...Expr.variables(e.right)]
    }
  },

  /** Whether the expression holds against `vars` and the current collection `modes`. */
  holds(e: Expr, vars: Record<string, unknown>, modes: Record<string, string>): boolean {
    return Expr.truthy(Expr.eval(e, vars, modes))
  },

  truthy(v: unknown): boolean {
    if (typeof v === 'boolean') return v
    if (typeof v === 'number') return v !== 0
    if (typeof v === 'string') return v.length > 0
    return v !== null && v !== undefined
  },

  eval(e: Expr, vars: Record<string, unknown>, modes: Record<string, string>, depth = 0): unknown {
    if (depth > MAX_EXPR_DEPTH) return null
    switch (e.type) {
      case 'literal':
        return e.value
      case 'variable':
        return e.name in vars ? vars[e.name] : (e.name in modes ? modes[e.name] : null)
      case 'not':
        return !Expr.truthy(Expr.eval(e.inner, vars, modes, depth + 1))
      case 'binary': {
        if (e.op === 'and') {
          return Expr.truthy(Expr.eval(e.left, vars, modes, depth + 1)) && Expr.truthy(Expr.eval(e.right, vars, modes, depth + 1))
        }
        if (e.op === 'or') {
          return Expr.truthy(Expr.eval(e.left, vars, modes, depth + 1)) || Expr.truthy(Expr.eval(e.right, vars, modes, depth + 1))
        }
        const l = Expr.eval(e.left, vars, modes, depth + 1)
        const r = Expr.eval(e.right, vars, modes, depth + 1)
        switch (e.op) {
          case 'eq':
            return l === r
          case 'neq':
            return l !== r
          case 'gt':
            return compare(l, r) > 0
          case 'lt':
            return compare(l, r) < 0
          case 'gte':
            return compare(l, r) >= 0
          case 'lte':
            return compare(l, r) <= 0
          case 'add':
            return num(l) + num(r)
          case 'sub':
            return num(l) - num(r)
          case 'mul':
            return num(l) * num(r)
          case 'div':
            return num(r) === 0 ? null : num(l) / num(r)
        }
        return null
      }
    }
  }
}

function num(v: unknown): number {
  if (typeof v === 'number') return v
  if (typeof v === 'boolean') return v ? 1 : 0
  if (typeof v === 'string') {
    const p = Number.parseFloat(v)
    return Number.isFinite(p) ? p : 0
  }
  return 0
}

function compare(l: unknown, r: unknown): number {
  if (typeof l === 'number' && typeof r === 'number') return l < r ? -1 : l > r ? 1 : 0
  const ls = String(l)
  const rs = String(r)
  return ls < rs ? -1 : ls > rs ? 1 : 0
}

export interface ExprError {
  message: string
  position: number
}

/** Longest expression text accepted. */
export const MAX_EXPR_TEXT = 4_000

/**
 * Parse a boolean expression (`count + 1 > 3`, `not open`, `a == "x" && b`).
 * Throws `ExprError`-shaped errors with a position.
 */
export function parseExpr(src: string): Expr {
  if (src.length > MAX_EXPR_TEXT) {
    throw { message: 'expression too long', position: 0 } satisfies ExprError
  }
  const tokens = tokenize(src)
  let pos = 0
  const peek = (): Token | null => tokens[pos] ?? null
  const next = (): Token => {
    const t = tokens[pos]
    pos += 1
    return t ?? { type: 'eof', text: '' }
  }

  function parseOr(): Expr {
    let left = parseAnd()
    while (peek()?.type === 'op' && (peek() as OpToken).text === 'or') {
      next()
      const right = parseAnd()
      left = { type: 'binary', op: 'or', left, right }
    }
    return left
  }

  function parseAnd(): Expr {
    let left = parseCompare()
    while (peek()?.type === 'op' && (peek() as OpToken).text === 'and') {
      next()
      const right = parseCompare()
      left = { type: 'binary', op: 'and', left, right }
    }
    return left
  }

  function parseCompare(): Expr {
    let left = parseAdd()
    const t = peek()
    if (t && t.type === 'op' && ['==', '!=', '>', '<', '>=', '<='].includes(t.text)) {
      next()
      const right = parseAdd()
      const op = t.text === '==' ? 'eq' : t.text === '!=' ? 'neq' : t.text === '>' ? 'gt' : t.text === '<' ? 'lt' : t.text === '>=' ? 'gte' : 'lte'
      return { type: 'binary', op, left, right }
    }
    return left
  }

  function parseAdd(): Expr {
    let left = parseMul()
    for (;;) {
      const t = peek()
      if (t && t.type === 'op' && (t.text === '+' || t.text === '-')) {
        next()
        const right = parseMul()
        left = { type: 'binary', op: t.text === '+' ? 'add' : 'sub', left, right }
      } else break
    }
    return left
  }

  function parseMul(): Expr {
    let left = parseUnary()
    for (;;) {
      const t = peek()
      if (t && t.type === 'op' && (t.text === '*' || t.text === '/')) {
        next()
        const right = parseUnary()
        left = { type: 'binary', op: t.text === '*' ? 'mul' : 'div', left, right }
      } else break
    }
    return left
  }

  function parseUnary(): Expr {
    const t = peek()
    if (t && t.type === 'op' && t.text === 'not') {
      next()
      return { type: 'not', inner: parseUnary() }
    }
    if (t && t.type === 'op' && (t.text === '-' || t.text === '!')) {
      next()
      const inner = parseUnary()
      return {
        type: 'binary',
        op: 'sub',
        left: { type: 'literal', value: 0 },
        right: inner
      }
    }
    return parseAtom()
  }

  function parseAtom(): Expr {
    const t = next()
    if (t.type === 'number') return { type: 'literal', value: Number.parseFloat(t.text) }
    if (t.type === 'string') return { type: 'literal', value: t.text.slice(1, -1) }
    if (t.type === 'word') {
      if (t.text === 'true') return { type: 'literal', value: true }
      if (t.text === 'false') return { type: 'literal', value: false }
      if (t.text === 'null') return { type: 'literal', value: null }
      return { type: 'variable', name: t.text }
    }
    if (t.type === 'op' && t.text === '(') {
      const inner = parseOr()
      const close = next()
      if (!(close.type === 'op' && close.text === ')')) {
        throw { message: 'expected )', position: pos } satisfies ExprError
      }
      return inner
    }
    throw { message: `unexpected '${t.text}'`, position: pos } satisfies ExprError
  }

  const expr = parseOr()
  if (pos < tokens.length) {
    throw { message: `unexpected trailing '${tokens[pos]?.text ?? ''}'`, position: pos } satisfies ExprError
  }
  return expr
}

type Token = { type: 'number' | 'string' | 'word' | 'op' | 'eof'; text: string }
interface OpToken extends Token {
  type: 'op'
}

const OPS = ['==', '!=', '>=', '<=', '>', '<', '+', '-', '*', '/', '(', ')', 'not', 'and', 'or', '!']

function tokenize(src: string): Token[] {
  const tokens: Token[] = []
  let i = 0
  while (i < src.length) {
    const c = src[i]
    if (/\s/.test(c)) {
      i += 1
      continue
    }
    if (c === '"' || c === "'") {
      const end = src.indexOf(c, i + 1)
      if (end < 0) throw { message: 'unterminated string', position: i } satisfies ExprError
      tokens.push({ type: 'string', text: src.slice(i, end + 1) })
      i = end + 1
      continue
    }
    if (/[0-9.]/.test(c)) {
      let j = i
      while (j < src.length && /[0-9.]/.test(src[j])) j += 1
      tokens.push({ type: 'number', text: src.slice(i, j) })
      i = j
      continue
    }
    if (/[a-zA-Z_]/.test(c)) {
      let j = i
      while (j < src.length && /[a-zA-Z0-9_]/.test(src[j])) j += 1
      const word = src.slice(i, j)
      if (word === 'and' || word === 'or' || word === 'not') tokens.push({ type: 'op', text: word })
      else tokens.push({ type: 'word', text: word })
      i = j
      continue
    }
    const two = src.slice(i, i + 2)
    if (two === '&&') {
      tokens.push({ type: 'op', text: 'and' })
      i += 2
      continue
    }
    if (two === '||') {
      tokens.push({ type: 'op', text: 'or' })
      i += 2
      continue
    }
    const op = OPS.find((o) => o === two) ?? OPS.find((o) => o === c)
    if (op) {
      tokens.push({ type: 'op', text: op })
      i += op.length
      continue
    }
    throw { message: `unexpected character '${c}'`, position: i } satisfies ExprError
  }
  return tokens
}
