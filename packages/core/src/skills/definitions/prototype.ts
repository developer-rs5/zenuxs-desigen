import type { SemanticSkill } from '#core/skills/types'

/** Prototype flow/interaction skills (spec §28 prototype intelligence). */
export const PROTOTYPE_SKILLS: readonly SemanticSkill[] = [
  {
    id: 'prototype.navigation',
    name: 'prototype',
    category: 'prototype',
    description: 'Connect screens into flows: triggers, actions, destinations, flow start.',
    version: '1.0.0',
    triggers: [
      'connect the screens',
      'connect these screens',
      'connect screens',
      'prototype flow',
      'link the screens',
      'link screens',
      'navigate to',
      'take me to',
      'click to open',
      'go to the next',
      'interactive prototype'
    ],
    aliases: ['flow', 'navigate', 'connect', 'navigation'],
    requires: [],
    defaults: {
      start: 'first or selected screen',
      transition: 'instant for clicks, fade for on-load'
    },
    operations: [
      'create_prototype_flow',
      'connect_screens',
      'create_interaction',
      'set_interaction_trigger',
      'set_interaction_action',
      'set_interaction_transition',
      'validate_prototype'
    ],
    knowledge: [
      'Vocabulary: a trigger is the event (click, press, hover, On load, afterDelay), an action is what happens (navigate, open overlay, close overlay, set state), a transition is how it moves (instant/fade/slide/spring). Keep them distinct — a component state is not a flow (spec §4).',
      'Connect screens: set the flow start (Set as flow start / create_prototype_flow), then connect_screens or create_interaction with trigger=click and action=navigate to the destination.',
      '“When it opens, show X” = trigger load + navigate. “Tap A, go to B” = click + navigate. Back = navigate to the previous screen; there is no dedicated back action.',
      'Destinations must be real nodes — after wiring, run validate_prototype and fix any missing-destination errors before replying.',
      'Modify existing flows in place (set_interaction_*); do not recreate screens the document already has (spec §16).'
    ].join('\n'),
    validation: [
      'Flow start resolves to an existing screen (validate_prototype reports no missing flow start).',
      'Every navigate interaction points at an existing destination.'
    ],
    examples: [
      {
        prompt: 'Connect these screens into a prototype.',
        intent:
          'flow start + click→navigate links between existing screens; instant/fade transitions'
      },
      {
        prompt: 'Click the card to open the details screen.',
        intent: 'trigger=click, action=navigate, destination=details screen'
      }
    ]
  },
  {
    id: 'prototype.overlay',
    name: 'overlay',
    category: 'prototype',
    description: 'Modals, dialogs, popovers, drawers: open/close overlay with backdrop.',
    version: '1.0.0',
    triggers: [
      'dialog',
      'popover',
      'open the menu',
      'open a menu',
      'popup',
      'drawer',
      'click outside'
    ],
    aliases: ['modal', 'open overlay', 'menu overlay'],
    requires: ['prototype.navigation'],
    defaults: {
      backdrop: 0.3,
      open: 'click on opener → openOverlay',
      dismiss: 'click on overlay → closeOverlay'
    },
    operations: [
      'create_interaction',
      'set_interaction_action',
      'set_interaction_transition',
      'validate_prototype'
    ],
    knowledge: [
      'An overlay is a node displayed over the current screen (action openOverlay with overlayId + backdropOpacity), not a separate screen. Closing = closeOverlay (no-op when nothing is open, so outside-click closes are safe).',
      'A modal implies: overlay + backdrop + open/close actions + a dismissal path + a transition (spec §29). Model all of them — a plain frame sitting on the page is not a modal (spec §32).',
      'Place the overlay frame beside screens on the page; wire the opener with click → openOverlay, and dismiss with click → closeOverlay on the overlay (or on a close button child).',
      'Entry motion for panels is usually slide/fade; see prototype.bottom-sheet for bottom-origin sheets.',
      'Never fake an overlay with a static rectangle — the runtime renders real overlays in Present.'
    ].join('\n'),
    validation: [
      'openOverlay targets an existing overlay node (validate_prototype).',
      'A closeOverlay path exists so the preview can dismiss it.'
    ],
    examples: [
      {
        prompt: 'Make this button open a modal.',
        intent: 'click → openOverlay {backdrop 0.3} + closeOverlay dismissal'
      },
      {
        prompt: 'Make the menu close when I click outside.',
        intent: 'click → closeOverlay on the menu/overlay (safe when closed)'
      }
    ]
  },
  {
    id: 'prototype.bottom-sheet',
    name: 'bottom-sheet',
    category: 'prototype',
    description: 'Bottom sheet: slide-up overlay, backdrop, open/close wiring.',
    version: '1.0.0',
    triggers: [
      'bottom sheet',
      'bottom-sheet',
      'slide up panel',
      'slide-up panel',
      'sheet from bottom',
      'drawer from bottom'
    ],
    aliases: ['sheet', 'slide up', 'bottom drawer'],
    requires: ['prototype.overlay', 'motion.slide'],
    defaults: {
      enter: 'slide up',
      exit: 'slide down',
      backdrop: 0.3,
      duration: 300,
      dismiss: 'click outside + close affordance'
    },
    operations: [
      'create_bottom_sheet',
      'create_interaction',
      'set_interaction_transition',
      'validate_prototype'
    ],
    knowledge: [
      'A bottom sheet = a frame presented as an overlay entering from the bottom: openOverlay with a slide-up transition, backdrop dim, and a dismissal path (closeOverlay). Prefer the create_bottom_sheet tool — it wires open/close/backdrop in one validated operation.',
      'Structure: full-width frame anchored at the bottom of the viewport, rounded top corners, optional drag handle; content is a vertical stack.',
      '“Checkout should slide up from the bottom” means the checkout sheet opens as an overlay with transition slide direction=up — not a new screen and not a static frame (spec §32).',
      'Defaults (enter slide-up, backdrop 0.3, ~300ms) apply only where the user gave no explicit values (spec §17).',
      'After creating, run validate_prototype: overlay target exists, open/close actions present, transition serializable.'
    ].join('\n'),
    validation: [
      'Sheet node exists and is targeted by openOverlay from the opener.',
      'A closeOverlay path exists; slide transition durations are within range.'
    ],
    examples: [
      {
        prompt: 'Turn this menu into a bottom sheet.',
        intent: 'existing frame → overlay; click → openOverlay slide up; dismiss via closeOverlay'
      },
      {
        prompt: 'Make checkout slide up when the cart button is tapped.',
        intent: 'trigger=tap/click on cart; openOverlay checkout; motion=vertical slide up'
      }
    ]
  },
  {
    id: 'prototype.carousel',
    name: 'carousel',
    category: 'prototype',
    description: 'Card carousels / pagers: horizontal advance with slide transitions.',
    version: '1.0.0',
    triggers: [
      'carousel',
      'swipe between',
      'swipe to the next',
      'cards horizontally',
      'pager',
      'horizontal slider'
    ],
    aliases: ['slider', 'card deck', 'swipe cards'],
    requires: ['prototype.navigation'],
    defaults: {
      advance: 'click/tap (no swipe trigger on platform)',
      direction: 'left for next, right for back'
    },
    operations: [
      'create_interaction',
      'connect_screens',
      'set_interaction_transition',
      'create_state'
    ],
    knowledge: [
      'A carousel moves horizontally between cards: each card is a screen (or state) advanced by a trigger with a slide transition (direction left = next).',
      'Platform limitation (spec §45): there is no swipe/drag trigger yet. Represent “swipe between cards” with click/tap advance and record the limitation to the user — never pretend a swipe gesture exists.',
      'Alternative modeling: one screen with a state model per page index (setState + slide) when the cards share one frame; use separate screens when cards are full frames.',
      'Optional: progress dots as a state indicator; do not invent gesture recognizers.'
    ].join('\n'),
    validation: [
      'Advance interactions exist with slide transitions in the correct direction.',
      'No swipe-trigger interactions were authored (trigger must be one of the supported set).'
    ],
    examples: [
      {
        prompt: 'Let the user swipe between onboarding screens.',
        intent: 'carousel: click/tap advance + slide left/right; swipe gesture unsupported — say so'
      }
    ]
  }
]
