import type { AISkill } from '../types'

// ── Default Pre-installed Skill: Web Design Guidelines ─────────────────────
// Distilled from https://github.com/vercel-labs/agent-skills (MIT), which
// points at Vercel's Web Interface Guidelines (web-interface-guidelines
// command.md, ~100 rules). The upstream rules audit HTML/ARIA/keyboard code;
// this adaptation keeps the rules that transfer to canvas design review —
// hierarchy, affordance and states, forms, contrast, motion, responsive
// behaviour, anti-patterns — and drops the DOM-specific ARIA wiring,
// skip-link, and script-loading mechanics that have no meaning here.
export const WEB_DESIGN_GUIDELINES_DEFAULT: AISkill = {
  id: 'web-design-guidelines',
  name: 'web-design-guidelines',
  displayName: 'Web Design Guidelines',
  description:
    "Vercel's Web Interface Guidelines translated to canvas design. Review discipline covering hierarchy, interactive affordance, forms, contrast, motion, responsive behavior, and the anti-patterns that make a screen read as generated — run as a final check before replying.",
  version: '1.0.0',
  author: 'Vercel',
  sourceUrl: 'https://github.com/vercel-labs/agent-skills',
  tags: ['review', 'accessibility', 'ux', 'guidelines', 'anti-pattern'],
  isDefault: true,
  enabled: true,
  promptContent: `
=== WEB DESIGN GUIDELINES (VERCEL) ===
Review discipline from Vercel's Web Interface Guidelines, translated to canvas design. Treat these as rules your own output must pass before you reply — the review is a real pass, not a formality.

--- HIERARCHY & CONTENT ---
- One dominant heading per screen; every other heading steps down visibly in size or weight. Equal-weight headings = no hierarchy.
- Action-specific labels: "Save changes", not "OK". "Learn more" tells nothing — name the destination.
- Short, scannable sentences. One idea per line; the eye should never hit a wall of text where a list belongs.
- Group related controls by proximity; separate unrelated groups with a real gap, not a hairline.

--- INTERACTIVE AFFORDANCE ---
- Every interactive-looking element is visually distinct from static content: fill, border, underline, or elevation. Elements that look tappable but are not — and elements that are tappable but look static — are both failures.
- Design the states, do not imply them: default, hover, pressed, focus, disabled, loading. A screen showing only the default is a wireframe, not a design.
- The focus state is visible and high-contrast — never suppressed or replaced by nothing.
- Disabled controls explain themselves: dimmed, with the reason adjacent — not just grayed out.
- Exactly one filled primary CTA per view. Two filled buttons competing at the same weight leave the user unsure which to press.

--- FORMS ---
- Label above every field, always. A placeholder is a hint, never a label — it disappears exactly when the user needs it.
- Required fields are marked; errors sit directly under their field, in plain text, naming the problem and the fix.
- The submit action shows a loading state; a form that looks idle after submit gets submitted twice.
- Input height and every touch target ≥44px on touch surfaces.

--- TYPOGRAPHY & TEXT ---
- Body text never below the readable minimum; captions and 10px gray text never carry required information.
- Contrast: text ≥4.5:1 against its background, large display text ≥3:1, UI borders and controls ≥3:1 against adjacent color. Gray-on-gray is not elegance, it is unreadable.
- Line length stays readable (~65–75 characters equivalent); no all-caps paragraphs, no justified text rivers.
- Numbers that get compared align in columns (tabular alignment); currency and units share one format.

--- MOTION ---
- Transitions run 150–300ms; longer only for large spatial moves the user triggered.
- Motion explains a state change. Scattered decorative movement is noise; one authored moment beats ten fades.
- Never hide content behind an animation the user did not start. Content is readable the moment it exists.

--- RESPONSIVE & LAYOUT ---
- No horizontal overflow at any width: grids drop columns rather than scroll sideways.
- Touch targets stay ≥44×44 at every size — density never eats the target.
- Content order is priority order: the primary action and the key content survive the smallest layout; the least important falls away first.

--- ANTI-PATTERNS (NEVER SHIP) ---
- Emoji or unicode glyphs standing in for an icon system.
- Auto-playing or auto-advancing content the user did not request.
- Full-screen interruptions for trivial choices (a dismiss, a preference, a cookie wall).
- Hover-only actions on touch surfaces — they do not exist there.
- Ticker/marquee text as decoration; text moving is text you cannot read.
- Low-contrast "premium" gray palettes that fail at outdoor brightness.
=== END WEB DESIGN GUIDELINES ===
`.trim()
}

export const WEB_DESIGN_GUIDELINES_SKILL = WEB_DESIGN_GUIDELINES_DEFAULT
