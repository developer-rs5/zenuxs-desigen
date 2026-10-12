import type { SemanticSkill } from '#core/skills/types'

/** State-model and micro-interaction skills (spec §25, §27). */
export const STATE_SKILLS: readonly SemanticSkill[] = [
  {
    id: 'state.loading',
    name: 'loading',
    category: 'state',
    description: 'Logical states: loading, success, error, empty — modeled as state, not frames.',
    version: '1.0.0',
    triggers: [
      'loading state',
      'success state',
      'error state',
      'empty state',
      'loading success',
      'and error states',
      'uploading',
      'skeleton loading'
    ],
    aliases: ['states', 'progress states', 'error', 'success'],
    requires: [],
    defaults: { states: 'name them for the domain (idle/uploading/done/failed)' },
    operations: ['create_state', 'set_state_visual', 'create_interaction', 'validate_prototype'],
    knowledge: [
      'State = a logical condition the interface can be in (spec §4). Loading, success, error, empty, disabled, selected, expanded are signals that a request needs explicit state modeling (spec §25).',
      'Model with create_state (named states + initial + visual) and switch them via setState interactions. Do NOT draw each state as an unrelated static frame unless the user wants separate frames.',
      'Keep loading STATE distinct from loading ANIMATION (spec §66): the state is the model; any motion is a separate transition on the setState interaction. A looping spinner animation is not a runtime primitive yet — do not fake it (spec §45).',
      'Example: file upload → states idle/uploading/success/error with setState transitions between them.',
      'After creating, validate: initial state defined, no duplicate names, all setState targets exist (validate_prototype).'
    ].join('\n'),
    validation: [
      'Initial state exists among the defined states.',
      'Every setState interaction targets a defined state (validate_prototype).'
    ],
    examples: [
      {
        prompt: 'Add loading, success, and error states.',
        intent: 'create_state ×3 on the target node; initial=loading or existing initial preserved'
      }
    ]
  },
  {
    id: 'state.interaction',
    name: 'micro-interaction',
    category: 'state',
    description: 'Micro-interactions: hover/press feedback, selected visuals, affordance.',
    version: '1.0.0',
    triggers: [
      'feel clickable',
      'feel interactive',
      'feel responsive',
      'press feedback',
      'button feedback',
      'hover state',
      'pressed state',
      'selected tab',
      'micro-interaction',
      'make the button',
      'interactive'
    ],
    aliases: ['micro interaction', 'hover', 'pressed', 'feedback'],
    requires: [],
    defaults: { pressScale: 0.98, timing: '100–150ms' },
    operations: [
      'create_state',
      'set_state_visual',
      'create_interaction',
      'set_interaction_trigger'
    ],
    knowledge: [
      'Micro-interaction ≠ page transition (spec §27). “Make the button feel clickable” = hover/press/release triggers + a small visual delta (scale ~0.98, slight opacity) with quick timing — never a full-screen motion.',
      'Model: create_state (default/pressed or default/hovered) + set_state_visual for the delta + interactions trigger=hoverEnter/hoverLeave/press/release → setState.',
      'Selected tabs: a visually distinct selected state (fill/weight/color change) plus setState on click — a state change, not navigation, unless screens actually change.',
      'Feedback must be subtle and short; the goal is affordance, not spectacle (spec §53).'
    ].join('\n'),
    validation: [
      'Visual delta is small (scale ≤ 1, opacity 0–1) and timings ≤ ~200ms.',
      'Every hover/press trigger has a matching leave/release or returns to initial state.'
    ],
    examples: [
      {
        prompt: 'Make this button feel interactive.',
        intent: 'hover/press states + small transform; not a page transition'
      },
      {
        prompt: 'Make the selected tab visually different.',
        intent: 'selected state visual + click→setState'
      }
    ]
  }
]
