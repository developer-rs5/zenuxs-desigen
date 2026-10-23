import type { AISkill } from '../types'

// ── Default Pre-installed Skill: Designer Skills ───────────────────────────
// Distilled from https://github.com/Owl-Listener/designer-skills (MIT). The
// upstream repo is 273 skills across nine plugins; this adaptation takes the
// two collections that transfer to a canvas design generator — ui-design
// (visual-hierarchy, spacing-system, typography-scale, color-system,
// layout-grid, data-visualization) and visual-critique (composition,
// hierarchy, affordance) — and compresses them into the craft systems plus a
// self-critique pass. The interaction/prototyping/design-ops plugins are
// dropped: they govern tooling and process, not the composed result.
export const DESIGNER_SKILLS_DEFAULT: AISkill = {
  id: 'designer-skills',
  name: 'designer-skills',
  displayName: 'Designer Skills',
  description:
    'Craft systems and critique dimensions from Owl-Listener/designer-skills. Visual hierarchy tools and levels, a spacing scale, a typographic scale, layered color system, layout grid, chart selection, and a four-dimension self-critique pass (hierarchy, composition, affordance, consistency) to run before replying.',
  version: '1.0.0',
  author: 'Owl-Listener',
  sourceUrl: 'https://github.com/Owl-Listener/designer-skills',
  tags: ['design', 'hierarchy', 'spacing', 'typography', 'color', 'critique'],
  isDefault: true,
  enabled: true,
  promptContent: `
=== DESIGNER SKILLS — CRAFT SYSTEMS & CRITIQUE ===
Build to these systems, then critique your own result against the pass at the end before replying. Guidance about how to decide — never a template to copy.

--- VISUAL HIERARCHY ---
Hierarchy tools in power order:
- SIZE: larger reads first. Steps between levels ≥1.5× — a 10% size difference is invisible.
- WEIGHT: bold and filled carry mass. Bold sparingly — heavy type everywhere means heavy nowhere.
- CONTRAST/COLOR: high contrast pulls the eye. Spend it on the CTA, status, and one emphasis — not on decoration.
- SPACING: isolation reads as importance. More air around the primary element, tight grouping inside clusters.
- POSITION: top-left is seen first in LTR layouts; F-pattern and Z-pattern scanning govern the rest of the flow.
- DENSITY: isolated elements stand out; grouped elements scan as one unit.
Three levels per screen, named: PRIMARY (title, primary CTA), SECONDARY (section headings, key content), TERTIARY (supporting detail). If everything is emphasized, nothing is.

--- SPACING SYSTEM ---
One base unit (4 or 8px), one scale, used everywhere: 4 / 8 / 12 / 16 / 24 / 32 / 48 / 64. Never arbitrary values.
- Related items close together (sm steps); distinct sections far apart (lg steps).
- Padding ≥ gap within the same container; more vertical than horizontal padding at equal feel.
- Density is a mode, not an accident: data-heavy views step the scale down one; reading-focused views step up one.

--- TYPOGRAPHY SCALE ---
One ratio (1.2–1.4), 4–5 sizes in regular use — body is the base, headings step up by the ratio.
- Line-height: 1.2 headings, 1.5 body, 1.75 long-form.
- Letter-spacing: tight on large display headings, 0 on body, wide ONLY on uppercase labels/captions.
- Weights: 400/500/600/700 — two or three per screen.
- One family per role. A second family needs a reason the first could not satisfy; mono only for code, data, or measurement.
- Real copy, never lorem: long words and URLs must fit the layout you chose.

--- COLOR SYSTEM ---
Layers, in order:
1. BRAND: primary/accent hue with a full tonal scale (light steps → dark steps), not one swatch.
2. NEUTRALS: the gray ramp that carries text, surfaces, and borders — tinted from the brand hue, never pure dead gray.
3. SEMANTIC: success / warning / error / info, each with background, foreground, and border roles.
4. EXTENDED: data-viz ramp, illustration colors.
Rules: text ≥4.5:1 on its surface, large text ≥3:1, UI elements ≥3:1 adjacent. Never convey meaning by color alone — pair every color signal with a label, shape, or icon. One accent fights nothing; two accents fight each other.

--- LAYOUT GRID ---
12 columns on desktop, 8 on tablet, 4 on mobile; consistent gutters (16–24px) and page margins (16–48px). Align every element to the grid — deliberate grid-breaking for emphasis is allowed; accidental misalignment is not. Sections stack as siblings with gaps, never as overlapping frames.

--- DATA VISUALIZATION ---
Choose by the relationship, not by habit:
- Comparison → bar (grouped bars for multi-series).
- Trend over time → line (area for volume, sparkline inline).
- Part of whole → donut for few categories, stacked bar for many.
- Distribution → histogram or scatter; relationship → scatter or heat map.
Maximize data-ink: label directly on the chart when possible, start bar axes at zero, annotate the insight, use colorblind-safe ramps (never red-green as the only distinction), and simplify at small sizes rather than shrinking everything.

--- CRITIQUE PASS (MANDATORY BEFORE REPLYING) ---
Rate each dimension pass or issue, and every issue gets a specific fix you apply — not just note:
1. HIERARCHY: one clear entry point? Eye flow leads to the primary action? Size steps ≥1.5×? Exactly one emphasis zone?
2. COMPOSITION: balance intentional (not accidentally symmetric)? Macro-whitespace between sections; micro-whitespace consistent inside clusters? Spacing from the scale? Related things proximate, unrelated clearly separated — no orphaned floating elements?
3. AFFORDANCE: interactive elements look interactive? States present (default/pressed/focus/disabled)? One dominant CTA — filled, verb-labeled, where the eye lands? Destructive actions visually distinct from constructive?
4. CONSISTENCY: same role, same treatment (radius, spacing, type, color)? One icon family and one accent across the whole surface? Repeated components uniform in size and gaps?
=== END DESIGNER SKILLS ===
`.trim()
}

export const DESIGNER_SKILLS_SKILL = DESIGNER_SKILLS_DEFAULT
