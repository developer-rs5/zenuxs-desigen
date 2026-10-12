import type { SkillRoute } from './types'

/**
 * Skill-routing eval dataset (spec §47): natural-language prompts paired with
 * the intent they must activate. Expectations are semantic-correctness checks
 * (§48) — `expect` ids must appear in `route.ordered`, `expectExplicit` in
 * `route.explicit`, `forbid` nowhere — not "the router returned something".
 */
export interface SkillEvalCase {
  id: string
  prompt: string
  /** Skill ids that must be present in the composed order. */
  expect: string[]
  /** Skill ids that must be explicit slash-command seeds, if any. */
  expectExplicit?: string[]
  /** Skill ids that must NOT activate (false-positive guard). */
  forbid?: string[]
}

export const SKILL_EVAL_CASES: SkillEvalCase[] = [
  // §76 acceptance prompts, verbatim.
  {
    id: 'acceptance-onboarding-flow',
    prompt: 'Make a mobile onboarding flow',
    expect: ['design.mobile', 'design.onboarding', 'prototype.navigation']
  },
  {
    id: 'acceptance-splash-fade',
    prompt: 'Make the splash fade into login',
    expect: ['motion.fade'],
    forbid: ['motion.slide', 'motion.spring']
  },
  {
    id: 'acceptance-menu-bottom-sheet',
    prompt: 'Turn this menu into a bottom sheet',
    expect: ['prototype.bottom-sheet', 'prototype.overlay', 'motion.slide']
  },
  {
    id: 'acceptance-button-interactive',
    prompt: 'Make the button feel interactive',
    expect: ['state.interaction']
  },
  {
    id: 'acceptance-loading-states',
    prompt: 'Add loading, success and error states',
    expect: ['state.loading'],
    forbid: ['motion.fade', 'motion.spring']
  },
  {
    id: 'acceptance-connect-screens',
    prompt: 'Connect these screens into a prototype',
    expect: ['prototype.navigation']
  },
  {
    id: 'acceptance-smooth-transition',
    prompt: 'Add a smooth transition between them',
    expect: ['motion.spring']
  },
  {
    id: 'acceptance-screenshot-prototype',
    prompt: 'Turn this screenshot into an editable interactive prototype',
    expect: ['prototype.navigation']
  },
  {
    id: 'acceptance-dashboard-responsive',
    prompt: 'Make the existing dashboard responsive and add mobile navigation',
    expect: ['design.dashboard', 'design.responsive', 'design.mobile', 'prototype.navigation'],
    forbid: ['design.landing-page']
  },

  // Design intent (§47: plain NL phrasings, not skill names).
  {
    id: 'nl-dashboard',
    prompt: 'Create an admin panel with charts and a KPI row',
    expect: ['design.dashboard'],
    forbid: ['design.landing-page']
  },
  {
    id: 'nl-landing-page',
    prompt: 'Build a hero section with pricing below',
    expect: ['design.landing-page'],
    forbid: ['design.dashboard']
  },
  {
    id: 'nl-responsive-drawer',
    prompt: 'Turn the sidebar into a mobile drawer',
    expect: ['design.responsive', 'design.mobile', 'prototype.overlay']
  },

  // Prototype intent.
  {
    id: 'nl-click-opens-screen',
    prompt: 'Click the card to open the details screen',
    expect: ['prototype.navigation'],
    forbid: ['prototype.overlay']
  },
  {
    id: 'nl-open-modal',
    prompt: 'Make this button open a modal',
    expect: ['prototype.overlay', 'prototype.navigation']
  },
  {
    id: 'nl-click-outside-closes',
    prompt: 'Make the menu close when I click outside',
    expect: ['prototype.overlay'],
    forbid: ['prototype.bottom-sheet']
  },
  {
    id: 'nl-swipe-onboarding',
    prompt: 'Let the user swipe between onboarding screens',
    expect: ['prototype.carousel', 'design.onboarding', 'design.mobile']
  },

  // Motion intent.
  {
    id: 'nl-slide-checkout',
    prompt: 'Slide the checkout up from the bottom',
    expect: ['motion.slide', 'prototype.bottom-sheet']
  },
  {
    id: 'nl-bouncy-button',
    prompt: 'Make this button bounce slightly when pressed',
    expect: ['motion.spring', 'state.interaction']
  },
  {
    id: 'nl-stagger-cards',
    prompt: 'Stagger the cards as they appear',
    expect: ['motion.stagger'],
    forbid: ['motion.fade', 'motion.spring']
  },

  // State and systems intent.
  {
    id: 'nl-selected-tab',
    prompt: 'Make the selected tab visually different',
    expect: ['state.interaction'],
    forbid: ['state.loading']
  },
  {
    id: 'nl-accessible-form',
    prompt: 'Make this form accessible to screen readers',
    expect: ['systems.accessibility']
  },
  {
    id: 'nl-premium-page',
    prompt: 'Make this page look more premium',
    expect: ['systems.design-system'],
    forbid: ['systems.accessibility']
  },

  // Multi-skill composition in one request (§10).
  {
    id: 'nl-multi-checkout',
    prompt:
      'Build a mobile app checkout flow with loading, success and error states, a springy button, and a bottom sheet',
    expect: [
      'design.mobile',
      'state.loading',
      'motion.spring',
      'prototype.bottom-sheet',
      'prototype.overlay',
      'prototype.navigation'
    ]
  },

  // Slash commands share the same engine (§9).
  {
    id: 'slash-bottom-sheet',
    prompt: '/bottom-sheet open the menu from the bottom when clicked',
    expect: ['prototype.bottom-sheet', 'prototype.overlay', 'motion.slide'],
    expectExplicit: ['prototype.bottom-sheet']
  },
  {
    id: 'slash-category-motion',
    prompt: '/motion create a dashboard',
    expect: ['motion.fade', 'motion.slide', 'motion.spring', 'motion.stagger', 'design.dashboard'],
    expectExplicit: ['motion.fade', 'motion.slide', 'motion.spring', 'motion.stagger']
  },
  {
    id: 'slash-unknown-falls-back',
    prompt: '/not-a-skill build a dashboard',
    expect: ['design.dashboard'],
    expectExplicit: [],
    forbid: ['prototype.navigation']
  },

  // Command/NL equivalence for the added slash names (audit §3.4).
  {
    id: 'slash-splash',
    prompt: '/splash show a brand screen before the app opens',
    expect: ['patterns.splash', 'prototype.navigation'],
    expectExplicit: ['patterns.splash']
  },
  {
    id: 'nl-splash-entry',
    prompt: 'Create a splash/loading entry state',
    expect: ['patterns.splash', 'state.loading', 'prototype.navigation'],
    forbid: ['motion.slide']
  },
  {
    id: 'slash-modal',
    prompt: '/modal make the confirm dialog',
    expect: ['prototype.overlay'],
    expectExplicit: ['prototype.overlay']
  },
  {
    id: 'nl-page-transition',
    prompt: 'Add a page transition between these screens',
    expect: ['motion.slide'],
    forbid: ['motion.spring', 'design.responsive']
  },

  // Final-closure mission §9–§10 prompts, verbatim.
  {
    id: 'mission-mobile-behavior',
    prompt: 'Change the mobile behavior',
    expect: ['design.mobile'],
    forbid: ['design.dashboard', 'design.landing-page']
  },
  {
    id: 'mission-card-interactive',
    prompt: 'Make the card interactive.',
    expect: ['state.interaction']
  },

  // Vocabulary that only exists inside skill knowledge (audit §4.8).
  {
    id: 'nl-keyboard-focus',
    prompt: 'Fix the tab order and focus ring on this form',
    expect: ['systems.accessibility']
  },
  {
    id: 'nl-breakpoint',
    prompt: 'Adjust this design for the tablet breakpoint',
    expect: ['design.responsive', 'design.mobile']
  },

  // Pattern library (audit §4.9).
  {
    id: 'pattern-login',
    prompt: 'Make a login screen for the app',
    expect: ['patterns.login'],
    forbid: ['patterns.signup']
  },
  {
    id: 'pattern-pricing',
    prompt: 'Add a pricing table with three plans',
    expect: ['patterns.pricing'],
    forbid: ['design.dashboard']
  },
  {
    id: 'pattern-toast',
    prompt: 'Show a toast when the item is saved',
    expect: ['patterns.toast'],
    forbid: ['patterns.tooltip']
  },
  {
    id: 'pattern-pagination',
    prompt: 'Add pagination under this list',
    expect: ['patterns.pagination']
  },

  // Document model knowledge (audit §4.17).
  {
    id: 'nl-document-model',
    prompt: 'Explain the document model for prototype references',
    expect: ['systems.document-model'],
    forbid: ['design.dashboard']
  },

  // Image references (§14, §15, §49): one prompt combines reference + intent.
  {
    id: 'image-ref-mobile-login',
    prompt:
      'Reference image attached: a mobile login design. Make this feel more premium and slide the login panel upward',
    expect: ['patterns.login', 'systems.design-system', 'motion.slide'],
    forbid: ['design.dashboard', 'patterns.signup']
  },
  {
    id: 'image-ref-match-tokens',
    prompt: 'Match the reference screenshot layout and color tokens',
    expect: ['systems.design-system'],
    forbid: ['design.landing-page', 'design.dashboard']
  },

  // Modification of existing canvas content (§16, §50): edit, do not recreate.
  {
    id: 'modify-existing-checkout-sheet',
    prompt: 'Slide the existing checkout panel up from the bottom',
    expect: ['patterns.checkout', 'motion.slide', 'prototype.overlay', 'prototype.bottom-sheet'],
    forbid: ['design.dashboard']
  },
  {
    id: 'modify-existing-sheet-fade',
    prompt: 'Change the existing bottom sheet transition to a fade instead of a slide',
    expect: ['prototype.bottom-sheet', 'motion.fade'],
    forbid: ['design.dashboard', 'motion.stagger']
  },
  {
    id: 'modify-error-state-login',
    prompt: 'Add an error state to the existing login form',
    expect: ['state.loading', 'patterns.login'],
    forbid: ['patterns.signup', 'motion.fade']
  },
  {
    id: 'modify-settings-mobile',
    prompt: 'Give the existing settings screen a mobile version',
    expect: ['design.responsive', 'design.mobile', 'patterns.settings'],
    forbid: ['design.landing-page']
  },

  // Component and variant work (§7): state/consistency, not new screens.
  {
    id: 'component-hover-variant',
    prompt: 'Add a hover state to this button variant',
    expect: ['state.interaction'],
    forbid: ['state.loading', 'prototype.navigation', 'design.dashboard']
  },
  {
    id: 'component-variant-tokens',
    prompt: 'Keep the component variants on the shared design tokens',
    expect: ['systems.design-system'],
    forbid: ['design.dashboard', 'state.loading']
  },

  // Ambiguity (§37, §61): underspecified prompts resolve deterministically.
  {
    id: 'ambiguity-animate-this',
    prompt: 'Animate this',
    expect: [],
    forbid: ['motion.fade', 'motion.slide', 'motion.spring', 'prototype.navigation']
  },
  {
    id: 'ambiguity-slide-and-fade',
    prompt: 'Make the button slide and fade',
    expect: ['motion.slide', 'motion.fade', 'state.interaction'],
    forbid: ['motion.spring', 'motion.stagger']
  },
  {
    id: 'ambiguity-tap-sheet-or-button',
    prompt: 'Make the button slide up when tapped',
    expect: ['motion.slide', 'prototype.bottom-sheet', 'state.interaction'],
    forbid: ['motion.spring', 'design.dashboard']
  },
  {
    id: 'ambiguity-phones-modern',
    prompt: 'Design something modern for phones',
    expect: ['design.mobile'],
    forbid: ['design.dashboard', 'design.landing-page']
  },

  // Context-aware requests (§16, §17): anaphora and the current document.
  {
    id: 'context-anaphora-without-target',
    prompt: 'Make it feel better',
    expect: [],
    forbid: ['state.interaction', 'motion.fade', 'systems.design-system']
  },
  {
    id: 'context-selected-card-modal',
    prompt: 'Turn the selected card into a modal',
    expect: ['prototype.overlay', 'prototype.navigation'],
    forbid: ['prototype.bottom-sheet', 'patterns.tooltip']
  },

  // Multi-turn continuation (§51): follow-ups about the document already built.
  {
    id: 'multi-turn-panel-slide-up',
    prompt: 'Now make the panel slide up',
    expect: ['prototype.overlay', 'motion.slide', 'prototype.bottom-sheet'],
    forbid: ['design.dashboard']
  },
  {
    id: 'multi-turn-button-responsive',
    prompt: 'Now make the button feel responsive',
    expect: ['state.interaction'],
    forbid: ['motion.spring', 'state.loading']
  },

  // Slash and natural language express one intent one way (§9): equal sets.
  {
    id: 'equiv-nl-modal-confirm',
    prompt: 'Make a modal for the confirm dialog',
    expect: ['prototype.overlay'],
    forbid: ['prototype.bottom-sheet']
  },
  {
    id: 'equiv-nl-bottom-sheet',
    prompt: 'Open the menu from the bottom as a sheet when clicked',
    expect: ['prototype.bottom-sheet', 'prototype.overlay', 'motion.slide'],
    forbid: ['design.dashboard']
  },

  // Adversarial and regression guards (§45, §68): must NOT activate.
  {
    id: 'adversarial-unknown-command-remainder-routes',
    prompt: '/bottem sheet please open the menu',
    expect: ['prototype.bottom-sheet', 'prototype.overlay'],
    expectExplicit: [],
    forbid: ['design.dashboard']
  },
  {
    id: 'adversarial-loading-skeleton-not-motion',
    prompt: 'Add a loading skeleton to the dashboard',
    expect: ['state.loading', 'design.dashboard'],
    forbid: ['motion.fade', 'motion.spring']
  },
  {
    id: 'adversarial-settings-not-profile',
    prompt: 'Open the settings screen',
    expect: ['patterns.settings'],
    forbid: ['patterns.profile', 'patterns.login']
  },
  {
    id: 'adversarial-progress-not-loading',
    prompt: 'Show the progress percentage in the header',
    expect: [],
    forbid: ['state.loading', 'patterns.pagination']
  }
]

/** Dataset integrity: every referenced skill id exists in the registry. */
export function evalExpectationsResolve(knownIds: ReadonlySet<string>): string[] {
  const problems: string[] = []
  for (const evalCase of SKILL_EVAL_CASES) {
    for (const id of [
      ...evalCase.expect,
      ...(evalCase.expectExplicit ?? []),
      ...(evalCase.forbid ?? [])
    ]) {
      if (!knownIds.has(id)) problems.push(`${evalCase.id}: unknown skill "${id}"`)
    }
  }
  return problems
}

/** True when a route satisfies the case's semantic expectations (§48). */
export function evalCasePasses(evalCase: SkillEvalCase, route: SkillRoute): boolean {
  const ordered = new Set(route.ordered)
  if (!evalCase.expect.every((id) => ordered.has(id))) return false
  if (evalCase.forbid?.some((id) => ordered.has(id))) return false
  if (evalCase.expectExplicit) {
    const explicit = new Set(route.explicit)
    if (!evalCase.expectExplicit.every((id) => explicit.has(id))) return false
  }
  return true
}
