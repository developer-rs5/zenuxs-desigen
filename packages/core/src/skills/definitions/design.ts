import type { SemanticSkill } from '#core/skills/types'

/** Page/screen structure skills (spec §21 pattern library, §38 organization). */
export const DESIGN_SKILLS: readonly SemanticSkill[] = [
  {
    id: 'design.landing-page',
    name: 'landing-page',
    category: 'design',
    description: 'Marketing landing page structure: hero, proof, features, CTA, footer.',
    version: '1.0.0',
    triggers: ['landing page', 'hero section', 'marketing page', 'splash page'],
    aliases: ['landing', 'hero'],
    requires: [],
    defaults: { sections: 'hero → social proof → features → CTA → footer', cta: 'one primary CTA' },
    operations: ['render', 'batch_update', 'node_move', 'stock_photo'],
    knowledge: [
      'A landing page is a single scrolling page, not an app screen: one clear hero (headline + subcopy + primary CTA), then proof, features, and a closing CTA.',
      'Reuse the document’s existing type scale and spacing (4px grid) before inventing new values; when the document already has a design system, extend it (see systems.design-system).',
      'Responsive intent: state desktop and mobile composition (hero stacks, CTA full-width on mobile) as separate frames when asked — responsive layout is not animation.',
      'Buttons get hover/pressed micro-interactions only when requested (see state.interaction); do not add page transitions to a static page.',
      'Common mistake: several competing CTAs or an all-text hero. Prefer one primary action and real visual hierarchy.'
    ].join('\n'),
    validation: [
      'Exactly one dominant hero heading and one primary CTA above the fold.',
      'Spacing follows the document’s existing scale; no orphan values off the 4px grid.',
      'Text contrast readable against its background.'
    ],
    examples: [
      {
        prompt: 'Create a clean analytics landing page.',
        intent: 'static landing page: hero + features + CTA, no prototype'
      }
    ]
  },
  {
    id: 'design.dashboard',
    name: 'dashboard',
    category: 'design',
    description: 'Dashboard/admin structure: nav, KPI grid, content panels, data states.',
    version: '1.0.0',
    triggers: ['dashboard', 'analytics dashboard', 'admin panel', 'admin page'],
    aliases: ['stats page', 'analytics'],
    requires: [],
    defaults: { density: 'comfortable', structure: 'sidebar + KPI grid + detail panels' },
    operations: ['render', 'batch_update', 'node_move'],
    knowledge: [
      'A dashboard is a framed application screen: navigation (sidebar or top bar), a grid of KPI/stat cards, and detail panels (chart areas, tables).',
      'Data surfaces need state thinking: loading (skeleton), empty, and error presentations are states of the same screen (see state.loading) — not three unrelated frames unless asked.',
      'Build skeleton-first: grid columns sized by calc (never mental math), gray placeholder blocks for every region, describe the root, fix with batch_update, then replace each section with real content via replace_id and finish with one batched stock_photo call.',
      'Chart areas are placeholders (rectangles + labels), not fake data visualizations; never fake unsupported capabilities.',
      'Responsive: on mobile the sidebar becomes a drawer (responsive transformation + overlay interaction, see design.responsive and prototype.overlay).',
      'Do not overfit: adapt palette, density, and sections to the request and existing document; do not always emit the same dark-sidebar layout.'
    ].join('\n'),
    validation: [
      'One primary nav surface; KPI cards align to a consistent grid.',
      'Loading/empty/error mentioned in the request exist as states or frames.'
    ],
    examples: [
      {
        prompt: 'Create a clean analytics dashboard.',
        intent: 'static dashboard screen: nav + KPI grid; states only if requested'
      }
    ]
  },
  {
    id: 'design.mobile',
    name: 'mobile',
    category: 'design',
    description: 'Mobile app screen conventions: viewport, thumb zone, touch targets.',
    version: '1.0.0',
    triggers: [
      'mobile app',
      'mobile screen',
      'phone screen',
      'phones',
      'ios app',
      'android app',
      'mobile behavior'
    ],
    aliases: ['phone', 'app screen'],
    requires: [],
    defaults: { viewport: '390×844', touchTarget: 44, navigation: 'bottom tab bar' },
    operations: ['render', 'node_move', 'node_resize', 'batch_update'],
    knowledge: [
      'Mobile screens default to a 390×844 frame. Primary actions live in the thumb zone (lower 2/3); top bars hold navigation, not primary actions.',
      'Touch targets ≥44px. Bottom tab bar for 3–5 top-level destinations; stack navigation for drill-down; top-right is for secondary actions.',
      'App-shell composition: status/top bar → content canvas → bottom dock, panels floating on x/y over a non-flex canvas area. Build it skeleton-first — gray placeholder blocks per region, describe the root, fix layout, then replace each placeholder with real content (replace_id) — and name image placeholders for stock_photo.',
      'Mobile design is layout adaptation — never model it as animation (spec §24).',
      'When the request implies flows (onboarding, checkout), combine with prototype.navigation and motion skills rather than drawing disconnected screens.'
    ].join('\n'),
    validation: [
      'Frame is phone-sized; interactive elements ≥44px.',
      'Navigation pattern is one of: tabs, stack, or drawer — not all three at once.'
    ],
    examples: [
      {
        prompt: 'Make a mobile onboarding flow.',
        intent: 'platform=mobile; screens=onboarding sequence; prototype flow between them'
      }
    ]
  },
  {
    id: 'design.responsive',
    name: 'responsive',
    category: 'responsive',
    description: 'Responsive transformation: breakpoints, reflow, sidebar→drawer.',
    version: '1.0.0',
    triggers: [
      'responsive',
      'breakpoint',
      'breakpoints',
      'on mobile',
      'mobile-friendly',
      'work on mobile',
      'for mobile',
      'tablet',
      'sidebar into a drawer',
      'sidebar to drawer'
    ],
    aliases: ['adaptive', 'mobile layout', 'mobile version'],
    requires: ['design.mobile'],
    defaults: { breakpoints: 'desktop 1280, tablet 834, mobile 390' },
    operations: ['render', 'node_move', 'node_resize', 'batch_update', 'create_interaction'],
    knowledge: [
      'Responsive behavior is layout adaptation, NOT animation. Model it as separate compositions per breakpoint or flex/grid reflow — never as a transition between breakpoints.',
      'A sidebar becoming a mobile drawer is three things: a responsive transformation (structure), an overlay (the drawer node), and an interaction (open/close) — optionally with motion. Model all that apply (see prototype.overlay).',
      'Prefer restructuring (stack columns, collapse nav, increase touch targets) over uniformly shrinking the desktop layout.',
      'Explicit user instructions override these defaults (spec §17).'
    ].join('\n'),
    validation: [
      'Mobile composition is restructured, not a scaled-down desktop copy.',
      'No animated "breakpoint transition" exists in the prototype.'
    ],
    examples: [
      {
        prompt: 'Make this desktop layout work properly on mobile.',
        intent: 'responsive: restructure for 390px; not motion, not prototype'
      }
    ]
  },
  {
    id: 'design.onboarding',
    name: 'onboarding',
    category: 'design',
    description: 'First-run onboarding flow: sequence, progress, skip, hand-off.',
    version: '1.0.0',
    triggers: ['onboarding', 'onboarding flow', 'welcome flow', 'first-run flow'],
    aliases: ['onboarding screens', 'first run'],
    requires: ['design.mobile', 'prototype.navigation'],
    defaults: {
      steps: '3–4 screens',
      progress: 'dots or step indicator',
      last: 'primary Get started CTA'
    },
    operations: [
      'render',
      'create_prototype_flow',
      'connect_screens',
      'set_interaction_transition'
    ],
    knowledge: [
      'Onboarding is a connected sequence of screens (welcome → value props → permissions/setup → start), not one frame. Each step is its own screen; the last step hands off to the main app.',
      'Every step needs a visible Skip/Next affordance and progress indication; wire the flow with prototype.navigation (On load or click → next screen, usually fade or slide).',
      'Set the first screen as the flow start so Present opens correctly.',
      'Combine with motion only when the request mentions transitions; do not animate every step by default (spec §53).'
    ].join('\n'),
    validation: [
      'All steps exist as separate screens and are connected in order.',
      'Flow start is the first onboarding screen; Present walks the sequence.'
    ],
    examples: [
      {
        prompt: 'Make a mobile onboarding flow.',
        intent: 'screens: 3–4 steps; prototype: sequential navigate; motion only if asked'
      }
    ]
  }
]
