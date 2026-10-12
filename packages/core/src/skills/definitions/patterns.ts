import type { SemanticSkill } from '#core/skills/types'

/**
 * Pattern library (spec §21): reusable screen/component structures. Knowledge
 * stays compact — structure, hierarchy, states, and accessibility — the router
 * injects it only when a request actually selects the pattern.
 */
export const PATTERN_SKILLS: readonly SemanticSkill[] = [
  {
    id: 'patterns.splash',
    name: 'splash',
    category: 'patterns',
    description: 'Splash/entry screen: one brand frame that auto-advances into the app.',
    version: '1.0.0',
    triggers: ['splash', 'entry screen', 'launch screen'],
    aliases: ['splash screen', 'entry state'],
    requires: ['prototype.navigation'],
    defaults: {
      advance: 'On load → navigate to the first real screen',
      transition: 'fade ~300ms',
      content: 'brand mark + optional tagline'
    },
    operations: [
      'render',
      'create_prototype_flow',
      'create_interaction',
      'set_interaction_transition',
      'validate_prototype'
    ],
    knowledge: [
      'A splash/entry screen is ONE frame — brand mark, optional tagline, nothing else — shown while the app starts. It hands off automatically: trigger On load → navigate to the first real screen, usually with a fade (see motion.fade). It never waits for a click and never gates entry.',
      'It is not a step of an onboarding flow (see design.onboarding): no progress dots, no Skip/Next, no feature copy. Set it as the flow start when it opens first, so Present begins there.',
      'Keep it on screen only as long as it reads (~0.5–2s of perceived time, represented by the transition rather than a fake timer — afterDelay exists if a real delay is requested).',
      'Do not animate the logo by default (spec §53); motion is requested, not assumed.'
    ].join('\n'),
    validation: [
      'Exactly one frame; it auto-advances (On load → navigate) with no click gating entry.',
      'Flow start resolves to the splash and the destination screen exists (validate_prototype).'
    ],
    examples: [
      {
        prompt: 'Create a splash screen that fades into the app.',
        intent: 'one brand frame; flow start; On load → navigate with fade ~300ms'
      },
      {
        prompt: 'Show a brand screen before the app opens.',
        intent: 'splash frame + auto hand-off; no onboarding steps, no button'
      }
    ]
  },
  {
    id: 'patterns.login',
    name: 'login',
    category: 'patterns',
    description: 'Login screen: centered card, labeled fields, submit and error states.',
    version: '1.0.0',
    triggers: ['login', 'log in'],
    aliases: ['sign-in', 'signin', 'sign in'],
    requires: [],
    defaults: { fields: 'email + password', cta: 'one primary Sign in button' },
    operations: ['render', 'batch_update', 'create_state', 'create_interaction', 'describe'],
    knowledge: [
      'Login is one centered card: brand mark, a single heading, email and password fields, one primary Sign in button, and secondary text links (forgot password, create account). One column, one primary CTA — no competing actions.',
      'Field anatomy: label above the input, input ~44px tall, helper/error text below. Labels are mandatory — placeholder-only fields fail accessibility (see systems.accessibility).',
      'The form’s states belong to the card (state.loading): idle → submitting (button disabled, label changes) → error (inline message under the offending field). Model them as states, not as duplicate frames.',
      'Prototype only when asked: submit → next screen. Never fake validation feedback the user did not request.'
    ].join('\n'),
    validation: [
      'Every field has a visible label; exactly one primary CTA.',
      'Submitting and error presentations exist as states of the card.'
    ],
    examples: [
      {
        prompt: 'Make a login screen for the app.',
        intent: 'centered card: labeled email/password + one Sign in button; states only if asked'
      }
    ]
  },
  {
    id: 'patterns.signup',
    name: 'signup',
    category: 'patterns',
    description: 'Sign-up screen: account creation form with confirm, terms, and progress.',
    version: '1.0.0',
    triggers: ['create account', 'registration', 'new account'],
    aliases: ['register', 'sign up'],
    requires: [],
    defaults: {
      fields: 'email + password (+ confirm when asked)',
      cta: 'one Create account button'
    },
    operations: ['render', 'batch_update', 'create_state', 'create_interaction', 'describe'],
    knowledge: [
      'Sign-up mirrors login but carries more input: email, password, optional confirm/username, an accepted-terms line, and one primary Create account button with a "already have an account? sign in" link beneath it.',
      'Show password requirements as helper text under the field before typing, and inline errors next to the field that failed — never a single error toast for a form.',
      'States: idle → submitting (disabled button) → validation error → success (hand off to the app or onboarding, see design.onboarding). Model them as states of one screen.',
      'Keep the form to one column with a comfortable field height; split into steps only when the request says so (then it is a multi-step flow, not a single screen).'
    ].join('\n'),
    validation: [
      'One primary CTA plus a sign-in link; requirements shown before submission.',
      'Success hands off to a real destination screen when a flow was requested.'
    ],
    examples: [
      {
        prompt: 'Add a sign-up screen next to login.',
        intent: 'account form: email/password/confirm + terms line; states idle/submitting/error'
      }
    ]
  },
  {
    id: 'patterns.settings',
    name: 'settings',
    category: 'patterns',
    description: 'Settings screen: grouped rows, nav/detail panes, toggles, destructive actions.',
    version: '1.0.0',
    triggers: ['settings', 'preferences'],
    aliases: ['settings screen', 'settings page'],
    requires: [],
    defaults: { structure: 'grouped rows with section headers', density: 'comfortable' },
    operations: ['render', 'batch_update', 'create_state', 'node_move', 'describe'],
    knowledge: [
      'Settings is a navigation surface: grouped rows under section headers, each row = label (+ short current value) and one control (chevron, toggle, stepper, segmented control, or swatch). Desktop uses a nav list + detail pane; mobile stacks the list and pushes a detail screen.',
      'Controls must show their current value at rest — a toggle communicates state by position and color, a chevron row by its trailing value text.',
      'Destructive actions (delete, reset) sit apart from routine rows, use a danger treatment, and require confirmation. Unsaved changes need a visible state (disabled/primary Save) rather than silent loss.',
      'Keyboard/a11y: rows are focusable targets in visual order, and state is never color-only (see systems.accessibility).'
    ].join('\n'),
    validation: [
      'Rows are grouped with headers and every row shows its current value.',
      'Destructive actions are separated and confirmed; no control relies on color alone.'
    ],
    examples: [
      {
        prompt: 'Design a settings screen for the account section.',
        intent:
          'grouped rows + toggles/chevrons; danger actions separated; no prototype unless asked'
      }
    ]
  },
  {
    id: 'patterns.profile',
    name: 'profile',
    category: 'patterns',
    description: 'Profile screen: identity header, stats, and content sections.',
    version: '1.0.0',
    triggers: ['profile', 'avatar'],
    aliases: ['account screen', 'my profile'],
    requires: [],
    defaults: { header: 'avatar + name + handle + one primary action' },
    operations: ['render', 'batch_update', 'stock_photo', 'create_state', 'describe'],
    knowledge: [
      'Profile = identity header (avatar, name, handle/bio, one primary action such as Follow/Edit) over a small stat row (posts, followers), then tabbed or stacked content sections.',
      'Read/edit are different modes: viewing shows values; editing swaps rows for inputs with a Save affordance — model as two states of one screen, not two frames.',
      'Avatars and cover images are placeholders for stock_photo (square for avatars); keep hierarchy in the header so the name always dominates.',
      'Empty sections (no posts yet) show an empty state instead of blank space (see state.loading).'
    ].join('\n'),
    validation: [
      'Header hierarchy: avatar < name emphasis; exactly one primary action.',
      'Empty content sections carry an empty state, not an empty box.'
    ],
    examples: [
      {
        prompt: 'Make a user profile screen.',
        intent: 'avatar header + stats + content list; edit as a state, not a second frame'
      }
    ]
  },
  {
    id: 'patterns.feed',
    name: 'feed',
    category: 'patterns',
    description: 'Content feed: stacked post cards, author row, actions, loading/empty states.',
    version: '1.0.0',
    triggers: ['feed', 'news feed', 'content feed', 'timeline'],
    aliases: ['activity feed', 'stream'],
    requires: [],
    defaults: { order: 'newest first', cardMedia: 'one image placeholder per post' },
    operations: ['render', 'batch_update', 'stock_photo', 'create_state', 'describe'],
    knowledge: [
      'A feed is one vertical column of repeating post cards: author row (avatar, name, timestamp) → content text → optional media → an action row (like/comment/share with counts). Build ONE card properly, then repeat the pattern — cards share structure, not ad-hoc variations.',
      'Loading uses skeleton rows matching the real card height; an empty feed shows a short empty state; "end of feed" shows a quiet footer instead of a broken list.',
      'There is no runtime infinite scroll (spec §45) — represent continuation with a "load more" affordance or pagination (see patterns.pagination), and never claim scrolling behavior that the prototype does not have.',
      'Name every media placeholder for batched stock_photo, and keep timestamps as caption-weight text.'
    ].join('\n'),
    validation: [
      'All cards share one structure; media placeholders are named for stock_photo.',
      'Loading and empty presentations exist; continuation is a real affordance, not claimed scrolling.'
    ],
    examples: [
      {
        prompt: 'Build a news feed screen.',
        intent:
          'stacked post cards + skeleton loading state; load-more affordance, no fake infinite scroll'
      }
    ]
  },
  {
    id: 'patterns.pricing',
    name: 'pricing',
    category: 'patterns',
    description: 'Pricing table: tiers, highlighted plan, feature comparison, billing toggle.',
    version: '1.0.0',
    triggers: ['pricing', 'pricing table', 'pricing tiers', 'plans'],
    aliases: ['tier table', 'plan comparison'],
    requires: [],
    defaults: {
      tiers: '3 (plus a highlighted recommended tier)',
      billing: 'monthly/annual toggle'
    },
    operations: ['render', 'batch_update', 'create_state', 'describe'],
    knowledge: [
      'Pricing is a comparison surface: 3–4 equal tiers, each with name, price (large) + period, one-line positioning, a feature list, and one CTA. Exactly one tier is visually recommended (accent border/badge, taller or filled) — the rest stay quiet.',
      'Feature rows compare across tiers with check/dash marks so scanning works horizontally; keep row labels left-aligned and values centered.',
      'Monthly/annual is a state of the same table (state.interaction), not two frames. Price changes must stay aligned across tiers when the toggle flips.',
      'Accessibility: the recommended tier is distinguished by badge/border and text, not color alone; each tier keeps its own readable CTA label.'
    ].join('\n'),
    validation: [
      'Tiers share one row structure; exactly one recommended tier.',
      'Billing toggle is a state of the table; highlight is not color-only.'
    ],
    examples: [
      {
        prompt: 'Add a pricing section with three plans.',
        intent: '3 tiers + highlighted plan + feature rows; monthly/annual as a state'
      }
    ]
  },
  {
    id: 'patterns.checkout',
    name: 'checkout',
    category: 'patterns',
    description: 'Checkout flow: steps, form fields, order summary, loading and error states.',
    version: '1.0.0',
    triggers: ['checkout', 'order summary', 'cart summary'],
    aliases: ['shopping cart', 'checkout screen'],
    requires: [],
    defaults: {
      steps: 'cart → address → payment → review',
      summary: 'sticky order summary with item list and total'
    },
    operations: ['render', 'batch_update', 'create_state', 'create_bottom_sheet', 'describe'],
    knowledge: [
      'Checkout is either a short step sequence or one scrolling page with sections — pick one and show progress (step indicator) when there are steps. Every step: labeled inputs, a primary Continue/Pay button, and the running order summary (items, subtotal, total) visible without hunting.',
      'States matter most here (state.loading): empty cart, submitting (disabled button + progress), payment error (inline, next to the failed field), and success (confirmation screen or overlay).',
      'Mobile: the summary can be a bottom sheet (prototype.bottom-sheet) or a collapsed bar above the pay button — the total is always visible before paying.',
      'Never invent payment capability: the prototype demonstrates the flow, it does not process anything (spec §45).'
    ].join('\n'),
    validation: [
      'Total and primary action visible at every step without scrolling past the fold on mobile.',
      'Empty, submitting, and error states exist; success hands off to a confirmation.'
    ],
    examples: [
      {
        prompt: 'Make a mobile checkout flow.',
        intent: 'steps + order summary + submitting/error states; success confirmation at the end'
      }
    ]
  },
  {
    id: 'patterns.toast',
    name: 'toast',
    category: 'patterns',
    description: 'Toast/snackbar: transient corner message with optional action and auto-dismiss.',
    version: '1.0.0',
    triggers: ['toast', 'snackbar', 'transient message'],
    aliases: ['status message', 'floating message'],
    requires: [],
    defaults: { position: 'bottom center (corner on desktop)', duration: 'auto-dismiss ~4s' },
    operations: ['render', 'create_state', 'create_interaction', 'set_interaction_transition'],
    knowledge: [
      'A toast is a transient message that appears over content: one short line (optionally one action link), a subtle elevated surface, and a fixed position — bottom center on mobile, corner on desktop. It never replaces content or covers the primary action.',
      'Model it as an overlay that opens and dismisses: show → auto-dismiss after ~4s (or on click), and close it (closeOverlay) so the prototype can clear it. Enter/exit is a short fade or slide (see motion.fade / motion.slide).',
      'Toasts stack downward with an 8px gap; errors that need a decision are dialogs (prototype.overlay), not toasts. A toast must never be the only place an error appears — pair it with inline state (see state.loading).',
      'Accessibility: the message is readable text at rest size; do not rely on color alone for severity.'
    ].join('\n'),
    validation: [
      'Toast opens as an overlay with a dismissal path and a fixed position clear of the primary action.',
      'Destructive/blocking messages are dialogs, not toasts.'
    ],
    examples: [
      {
        prompt: 'Show a toast when the item is saved.',
        intent: 'overlay message, fade/slide in, auto-dismiss + close; inline state for errors'
      }
    ]
  },
  {
    id: 'patterns.tooltip',
    name: 'tooltip',
    category: 'patterns',
    description: 'Tooltip: anchored hover/focus bubble clarifying an icon or control.',
    version: '1.0.0',
    triggers: ['tooltip', 'hover tooltip', 'hover tip'],
    aliases: ['tool tip', 'hint bubble'],
    requires: [],
    defaults: { maxWidth: 200, delay: 'hover ~300ms', surface: 'dark bubble with light text' },
    operations: ['render', 'create_state', 'create_interaction', 'set_interaction_transition'],
    knowledge: [
      'A tooltip is a small anchored bubble (≤200px wide, 1–2 lines) that clarifies an icon-only control: dark surface, light text, ~6px padding, positioned above/below the trigger so it never covers the control itself.',
      'Prototype it as hover → show and leave → hide (state on the trigger, or openOverlay/closeOverlay when the bubble is its own node). Show on focus too — hover-only tips are unreachable by keyboard (see systems.accessibility).',
      'Tooltips supplement a label, they do not replace one: never put the only copy of essential information in a tip.',
      'Keep enter/exit to a fast fade; a tooltip is feedback, not a feature tour (spec §53).'
    ].join('\n'),
    validation: [
      'Bubble is anchored clear of its trigger and sized to ≤2 lines.',
      'Trigger still has a real label; tip shows on focus as well as hover when wired.'
    ],
    examples: [
      {
        prompt: 'Add a tooltip to the icon buttons.',
        intent: 'hover/focus → anchored bubble; fast fade; label stays on the button'
      }
    ]
  },
  {
    id: 'patterns.accordion',
    name: 'accordion',
    category: 'patterns',
    description: 'Accordion/disclosure list: expandable sections with headers and states.',
    version: '1.0.0',
    triggers: ['accordion', 'collapsible', 'expandable', 'disclosure'],
    aliases: ['expand collapse', 'collapsible list'],
    requires: [],
    defaults: { behavior: 'one section open at a time', indicator: 'chevron rotates on expand' },
    operations: ['render', 'batch_update', 'create_state', 'create_interaction', 'describe'],
    knowledge: [
      'An accordion is a stack of headers (label + chevron) each owning a content region. Headers are full-width rows with consistent height; the open header’s chevron points up, closed ones down — direction, not color, carries the state.',
      'Choose one behavior and apply it everywhere: one-open-at-a-time (typical for FAQ) or independent sections. Model it with create_state per section (or one state per index) plus click → setState, keeping the collapsed region hidden rather than a separate frame.',
      'Expand/collapse may animate height briefly; content must be readable at rest, and every header is a keyboard-focusable button target (see systems.accessibility).',
      'Do not nest accordions inside accordions — split into two lists instead.'
    ].join('\n'),
    validation: [
      'All headers share one height/typography; chevron direction matches state.',
      'Exactly one expansion behavior across the list; no nested accordions.'
    ],
    examples: [
      {
        prompt: 'Make this FAQ an accordion.',
        intent: 'header rows + chevrons; one-open-at-a-time states; click → setState'
      }
    ]
  },
  {
    id: 'patterns.pagination',
    name: 'pagination',
    category: 'patterns',
    description: 'Pagination: numbered pages, prev/next bounds, current-page state.',
    version: '1.0.0',
    triggers: ['pagination', 'page numbers', 'load more', 'next page'],
    aliases: ['page nav', 'paginated list'],
    requires: [],
    defaults: { pageWindow: '1 … 4 5 6 … 20', bounds: 'disabled prev on first page, next on last' },
    operations: ['render', 'batch_update', 'create_state', 'create_interaction', 'describe'],
    knowledge: [
      'Pagination is a compact control under a list: prev arrow, a window of page numbers with an ellipsis outside the window, next arrow, and a "current" page styled distinctly plus a count ("Showing 1–20 of 143").',
      'Current page is a state of the control; prev/next at the bounds are visibly disabled rather than absent. Touch targets stay ≥44px even though the numbers are small (see design.mobile).',
      'Each page shows a list slice of the same card/row structure — do not design a different layout per page. Load-more is the alternative when the list is infinite-feel; pick one, not both.',
      'Accessibility: the current page is marked by weight/underline and position, not color alone, and the control is keyboard reachable in reading order.'
    ].join('\n'),
    validation: [
      'Current page and disabled bounds are visually distinct without relying on color.',
      'All pages reuse the same list structure; only the slice changes.'
    ],
    examples: [
      {
        prompt: 'Add pagination under this list.',
        intent: 'prev/window/next + current state + count; disabled bounds; same rows per page'
      }
    ]
  }
]
