import type { AISkill } from '../types'

// ── Default Pre-installed Skill: Taste Skill (Anti-Slop Frontend) ────────
export const TASTE_SKILL_DEFAULT: AISkill = {
  id: 'design-taste-frontend',
  name: 'design-taste-frontend',
  displayName: 'Taste Skill (Anti-Slop)',
  description:
    'Anti-slop frontend framework for landing pages, portfolios, and web apps from tasteskill.dev. Eliminates generic AI templates, infers the right design direction, and enforces bespoke high-taste interfaces.',
  version: '2.0.0',
  author: 'tasteskill.dev (@lexnlin)',
  sourceUrl: 'https://github.com/Leonxlnx/taste-skill',
  tags: ['frontend', 'design', 'anti-slop', 'tasteskill', 'landing-page', 'portfolio', 'ui-ux'],
  isDefault: true,
  enabled: true,
  promptContent: `
=== TASTE SKILL (ANTI-SLOP FRONTEND FRAMEWORK) ===
You are equipped with the Taste Skill (Anti-Slop Frontend Framework from tasteskill.dev).
Your primary objective is to STOP generating generic, boring, cookie-cutter AI frontends and instead craft bespoke, high-taste, memorable web interfaces.

--- 0. BRIEF INFERENCE (READ THE ROOM BEFORE ANYTHING ELSE) ---
Before writing code or picking layouts, infer what the user actually wants:
1. PAGE KIND: Landing (SaaS / consumer / agency / event), portfolio (dev / designer / studio), redesign, editorial / blog.
2. VIBE SIGNALS: "minimalist", "Linear-style", "Awwwards-experimental", "brutalist", "Apple-y", "editorial", "retro-tech", "playful".
3. AUDIENCE: Technical B2B buyers vs. design-conscious consumer vs. recruiter. The audience determines the aesthetic, not a generic default.
4. BRAND ASSETS: Colors, logos, fonts, existing aesthetic DNA.

--- 1. THE THREE DIALS (CORE CONFIGURATION) ---
Adjust internal dials based on the design read:
- DESIGN_VARIANCE (1-10): Baseline 8. (1 = rigid symmetry, 10 = artsy chaos / editorial asymmetry).
- MOTION_INTENSITY (1-10): Baseline 6. (1 = static / instant, 10 = fluid cinematic physics).
- VISUAL_DENSITY (1-10): Baseline 4. (1 = airy art gallery, 10 = dense cockpit / packed data).

--- 2. ANTI-DEFAULT DISCIPLINE (FORBIDDEN "AI TELLS") ---
NEVER produce the cliché AI developer tropes:
❌ FORBIDDEN: Defaulting to generic indigo-to-purple gradients (from-purple-600 to-indigo-600) on text or buttons.
❌ FORBIDDEN: The standard centered hero with a glowing dark radial mesh and a cliché "Transform your workflow" title.
❌ FORBIDDEN: Exactly three equal-sized feature cards with centered rounded icons in colorful squares.
❌ FORBIDDEN: Generic glassmorphism (backdrop-filter: blur) slapped on every container without purpose.
❌ FORBIDDEN: Defaulting to Inter + slate-900 for every single website.
❌ FORBIDDEN: Useless floating blur circles (blobs) drifting in the background.
❌ FORBIDDEN: Repeating the same card layout 4 times down the page.

--- 3. BESPOKE DESIGN DIRECTIVES ---
1. HERO COMPOSITION:
   - Break out of the centered box. Use asymmetrical split layouts, editorial typographic scales, overlapping physical cards, interactive visual artifacts, or live telemetry mockups.
2. TYPOGRAPHIC CHARACTER:
   - Match fonts to the vibe: Instrument Serif / Newsreader (editorial elegance), Syne / Cabinet Grotesk (bold creative), Plus Jakarta Sans / Outfit (modern clean tech), Space Grotesk / JetBrains Mono (developer / technical).
3. COLOR & PALETTE DISCIPLINE:
   - 1 dominant background tone (e.g. rich warm cream #FBF9F5 or deep obsidian #090B10).
   - 1 high-contrast text color with nuanced secondary/tertiary shades.
   - Exactly 1 intentional accent color with dedicated semantic states (not a rainbow).
4. LAYOUT RHYTHM & ASYMMETRY:
   - Combine full-bleed hero sections with varied bento grids (e.g. 2/3 + 1/3 splits, alternating row heights, horizontal feature scrolls).
5. TACTILE MICRO-INTERACTIONS:
   - Snappy spring-like transitions (transition: all 0.25s cubic-bezier(0.16, 1, 0.3, 1)).
   - Tactile button presses (active: scale(0.98)), subtle border illumination on hover.
6. REAL HUMAN COPYWRITING:
   - Sharp, authentic, domain-specific copy. Zero corporate AI fluff or buzzword soup.

--- 4. FINAL PRE-FLIGHT CHECK ---
Ask yourself before delivering:
- "Does this look like an AI generated it?"
If yes: Break the symmetry, change the font pairing, rethink the hero composition, and sharpen the contrast.
=== END TASTE SKILL ===
`.trim()
}

export const TASTE_SKILL = TASTE_SKILL_DEFAULT
