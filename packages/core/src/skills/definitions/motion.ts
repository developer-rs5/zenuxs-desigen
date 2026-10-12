import type { SemanticSkill } from '#core/skills/types'

/** Motion classification skills (spec §26 motion intelligence, §53–54). */
export const MOTION_SKILLS: readonly SemanticSkill[] = [
  {
    id: 'motion.fade',
    name: 'fade',
    category: 'motion',
    description: 'Fade/crossfade transitions: opacity-only change between screens or states.',
    version: '1.0.0',
    triggers: ['fade', 'crossfade', 'dissolve', 'fade into', 'fade in', 'fade out'],
    aliases: ['opacity transition'],
    requires: [],
    defaults: { duration: 300, easing: 'easeOut' },
    operations: ['set_interaction_transition', 'create_interaction', 'validate_prototype'],
    knowledge: [
      'Fade = opacity transition (transition kind=fade). It communicates soft continuity, not spatial movement — use it between screens or state changes, not when direction matters.',
      'Defaults: ~300ms, easeOut. “Splash fades into login” = splash On load → navigate to login with fade.',
      'Do not animate everything (spec §53): fade is for hierarchy/continuity, not decoration on every element.',
      'Motion lives on the interaction (set_interaction_transition); component-level visual feedback is state.interaction, not a fade.'
    ].join('\n'),
    validation: ['Durations within 0–120000ms; fade has no direction parameter.'],
    examples: [
      {
        prompt: 'Fade the splash into login.',
        intent: 'trigger=load on splash; navigate login; transition=fade ~300ms'
      }
    ]
  },
  {
    id: 'motion.slide',
    name: 'slide',
    category: 'motion',
    description: 'Slide transitions: directional movement for enters, exits, carousels.',
    version: '1.0.0',
    triggers: [
      'slide',
      'slide in',
      'slide out',
      'from the bottom',
      'from bottom',
      'from the left',
      'from the right'
    ],
    aliases: ['slide-up', 'slide transition', 'page-transition'],
    requires: [],
    defaults: {
      duration: 400,
      easing: 'easeOut',
      direction: 'semantic: bottom-origin → up, next card → left'
    },
    operations: ['set_interaction_transition', 'create_interaction', 'validate_prototype'],
    knowledge: [
      'Slide = position/transform transition with an explicit direction. Direction is semantic: sheets enter direction=up (from bottom), carousels advance direction=left, exits reverse the entry.',
      'Defaults: ~400ms easeOut. Pair enter and exit directions so open/close feel continuous (spec §54).',
      '“Slide the checkout up from the bottom” = overlay open with slide direction=up (compose with prototype.bottom-sheet).',
      'Slide is not a page-layout change: never use motion to model responsive behavior (spec §24).'
    ].join('\n'),
    validation: ['Direction is one of left/right/up/down; durations within range.'],
    examples: [
      {
        prompt: 'Slide the checkout up from the bottom.',
        intent: 'openOverlay checkout; transition=slide direction=up ~400ms'
      }
    ]
  },
  {
    id: 'motion.spring',
    name: 'spring',
    category: 'motion',
    description: 'Spring/overshoot motion: bounce, snappy, springy feel; sensible easing.',
    version: '1.0.0',
    triggers: ['spring', 'springy', 'bounce', 'bouncy', 'snappy', 'smooth transition', 'overshoot'],
    aliases: ['spring physics', 'elastic'],
    requires: [],
    defaults: { bounce: 0.25, feel: 'snappy = shorter duration; smooth = easeInOut' },
    operations: ['set_interaction_transition', 'set_state_visual', 'create_state'],
    knowledge: [
      'Classify the feel (spec §26): spring/bounce → transition kind=spring with bounce (0=none, 1=high); snappy → shorter duration (~150–200ms) with a sharp easing; smooth → easeInOut ~300–400ms.',
      'Springs suit micro-feedback and playful entry — not dense data UIs. Avoid gratuitous motion (spec §53).',
      '“Button bounce when pressed” is a micro-interaction: press/release triggers + small state visual change, or a spring transition on a state change — never a full-screen transition (spec §27).',
      'Spring transitions do not carry easing/duration (time-based spring uses bounce only).'
    ].join('\n'),
    validation: ['spring_bounce within 0–1; no easing parameter on spring transitions.'],
    examples: [
      {
        prompt: 'Make this button bounce slightly when pressed.',
        intent: 'micro-interaction: press trigger + spring visual feedback, short timing'
      }
    ]
  },
  {
    id: 'motion.stagger',
    name: 'stagger',
    category: 'motion',
    description: 'Staggered/sequential appearance: coordinated delays across items.',
    version: '1.0.0',
    triggers: ['stagger', 'staggered', 'one by one', 'cascade in', 'sequentially appear'],
    aliases: ['cascade', 'sequence animation'],
    requires: [],
    defaults: { stepDelay: 60, order: 'top-to-bottom, left-to-right' },
    operations: [
      'create_interaction',
      'set_interaction_trigger',
      'set_state_visual',
      'set_interaction_transition'
    ],
    knowledge: [
      'Stagger = coordinated delay/orchestration across several items. Represent it with per-item interactions using trigger=afterDelay and increasing delay_ms, each animating its item (setState with a fade/slide transition, or an enter transition when supported).',
      'Keep total time readable (≤ ~600ms across the group); order follows reading direction unless told otherwise.',
      'There is no built-in timeline/keyframe system — do not fake one (spec §45). Per-item afterDelay is the real representation.',
      'If items share one parent state change, a single state transition may replace per-item stagger; choose the simpler editable structure.'
    ].join('\n'),
    validation: ['Each staggered item has a real afterDelay interaction with delay_ms ≥ 0.'],
    examples: [
      {
        prompt: 'Stagger the cards as they appear.',
        intent: 'per-card afterDelay interactions, increasing delays, short fade/slide'
      }
    ]
  }
]
