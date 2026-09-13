import type { AISkill } from '../types'

// ── Default Pre-installed Skill: UI/UX Pro Max ────────────────────────────
export const UI_UX_PRO_MAX_DEFAULT: AISkill = {
  id: 'ui-ux-pro-max',
  name: 'ui-ux-pro-max',
  displayName: 'UI/UX Pro Max',
  description:
    'AI design intelligence with 79 UI styles, 192 color palettes, 74 font pairings, 119 UX guidelines, and design systems for web interfaces.',
  version: '2.13.0',
  author: 'NextLevelBuilder',
  sourceUrl: 'https://github.com/nextlevelbuilder/ui-ux-pro-max-skill',
  tags: ['ui', 'ux', 'design', 'design-system', 'accessibility', 'typography', 'colors'],
  isDefault: true,
  enabled: true,
  promptContent: `
=== UI/UX PRO MAX — DESIGN INTELLIGENCE ===
You are equipped with the UI/UX Pro Max Design Intelligence Skill.
When designing, building, or reviewing web interfaces, landing pages, dashboards, or components, you MUST adhere to the following 10 Priority Rules:

1. ACCESSIBILITY (CRITICAL):
   - Contrast ratio minimum 4.5:1 for normal text, 3:1 for large text (WCAG AA).
   - Never remove focus rings without providing an accessible alternative.
   - All icon-only buttons MUST have aria-label. All images must have meaningful alt text.
   - Full keyboard navigability: tab order, Enter/Space actuation.

2. TOUCH & INTERACTION (CRITICAL):
   - Minimum touch target size: 44×44px with ≥8px spacing between touch elements.
   - Interactive elements must show instant visual feedback (hover, focus-visible, active states).
   - Never rely on hover alone for critical actions or information.

3. PERFORMANCE & ZERO CLS (HIGH):
   - Zero Cumulative Layout Shift (CLS < 0.1): Reserve dimensions for images, banners, and media.
   - Use modern lightweight typography (Google Fonts like Inter, Outfit, Plus Jakarta Sans, Cormorant Garamond).
   - Clean SVG icons inline — never use raw emojis as UI icons.

4. BRAND-SPECIFIC AESTHETIC ADAPTATION & ZERO GENERIC TEMPLATES (CRITICAL):
   NEVER default to a generic, repetitive SaaS template! Deeply tailor the visual identity, palette, micro-interactions, and atmosphere to the brand's exact DNA:
   - Gaming, Hardware & Cyber (e.g. ASUS TUF Gaming, ROG, Razer, Alienware, Cyberpunk):
     * Vibe: Tactical, military-grade ruggedness, mechanical engineering, weaponized telemetry HUD.
     * Colors: Stealth matte charcoal (#0A0D14, #121622), gunmetal slate (#18202E), tactical hazard amber / electric safety orange (#FF9900, #FF7700), neon gold (#FFB700), brushed titanium (#8F9CAE).
     * Visual Language: Angular chamfered geometric cuts (clip-path: polygon(...)), carbon-fiber and hex grid mesh patterns, mechanical panel lines (1px solid rgba(255, 153, 0, 0.2)), tactical stencil badges ("TUF CERTIFIED", "MIL-STD-810H").
     * Interactive Hardware Elements: Aura Sync RGB lighting preview switcher, live FPS game benchmark simulator (Cyberpunk 2077, Warzone, Apex), dual-fan cooling airflow & thermal HUD gauge, audio sound effect click triggers.
     * Fonts: Aggressive industrial/gaming display fonts (Orbitron, Teko, Rajdhani, Chakra Petch) + technical mono/clean sans (Inter, JetBrains Mono).
   - Soft UI Evolution: Subtle multi-layer shadows, soft pastel backdrops, premium organic feeling.
   - Modern Dark Mode: Deep slate (#0B0F17, #121826) with vivid neon accents and glowing borders.
   - Minimalist SaaS: Crisp typography, high contrast borders (1px solid var(--border)), spacious 80px+ section paddings.
   - Glassmorphism: backdrop-filter: blur(16px), subtle translucent surfaces, hairline border highlights.
   - Editorial & Luxury: Serif headings (Cormorant Garamond, Playfair) paired with clean sans body, muted champagne gold/warm stone accents.
   - Bento Grid: Asymmetric card grids with rounded corners (16-24px), subtle hover lift (translateY(-3px)), nested badges.

5. LAYOUT & RESPONSIVE HIERARCHY (HIGH):
   - Mobile-first responsive layout (breakpoints: 640px, 768px, 1024px, 1280px).
   - Strict 8px spacing system: 4px, 8px, 16px, 24px, 32px, 48px, 64px, 96px.
   - Viewport meta tag mandatory. No horizontal overflow or forced horizontal scrolling.

6. TYPOGRAPHY & COLOR HARMONY (MEDIUM):
   - Curated font pairings matching the brand identity:
     * Gaming & Cyber: Orbitron or Rajdhani (headings) + Inter / JetBrains Mono (body)
     * Modern Tech: Plus Jakarta Sans (headings) + Inter (body)
     * Premium/Luxury: Cormorant Garamond / Playfair (headings) + Montserrat (body)
     * SaaS/Fintech: Outfit (headings) + Inter / Roboto (body)
     * Creative/Bold: Syne / Cabinet Grotesk (headings) + DM Sans (body)
   - Base body font: ≥15-16px, line-height: 1.5 to 1.6.
   - Harmonious semantic CSS variables: --bg, --card, --border, --text-primary, --text-muted, --accent, --accent-hover.
   - Never use raw default colors (plain #FF0000, #00FF00, #0000FF).

7. MOTION & MICRO-ANIMATIONS (MEDIUM):
   - Sub-50ms perceived interaction response: smooth CSS transitions (0.2s - 0.3s cubic-bezier(0.16, 1, 0.3, 1)).
   - Respect prefers-reduced-motion media query.

8. FORMS & FEEDBACK (MEDIUM):
   - Clear, visible labels above inputs (never placeholder-only).
   - Clear input focus states with accent glow (box-shadow: 0 0 0 3px var(--accent-ring)).
   - Inline validation and helpful placeholder text.

9. NAVIGATION & CTA ARCHITECTURE (HIGH):
   - Single-page sites: sticky/fixed nav bar with smooth-scrolling links (<a href="#hero">, <a href="#features">, <a href="#about">, <a href="#pricing">, <a href="#contact">).
   - Primary CTA above the fold in hero section, repeated in pricing/footer.
   - Conversion-optimized section flow: Hero → Social Proof/Stats → Key Features/Value Prop → Visual Showcase/Bento Grid → Testimonials → Pricing/FAQ → Contact Form → Footer.

10. PAGE ARCHITECTURE & CRAFTSMANSHIP (CRITICAL):
    - DEFAULT ARCHITECTURE (SINGLE-PAGE): If the user does not specify multiple pages, build a complete, production-grade SINGLE-PAGE website (index.html) with clean section IDs and smooth-scrolling navigation.
    - MULTI-PAGE ARCHITECTURE: If and only if the user explicitly specifies multiple pages (e.g. asks for Home, About, Services, Contact pages), generate all requested pages (index.html, about.html, services.html, contact.html) with working cross-page links (<a href="index.html">, <a href="about.html">).
    - ZERO PLACEHOLDERS: Real, authentic, compelling copywriting tailored to the brand/domain. Never leave "Lorem ipsum" or placeholder text. Use high-quality photography from Unsplash (https://images.unsplash.com/...) or clean inline SVG icons.
    - VANILLA JS INTERACTIVITY: Provide working JavaScript for mobile menu drawer toggle, interactive tabs/accordions, modal dialogs, and form submission feedback.
=== END UI/UX PRO MAX ===
`.trim()
}

export const UI_UX_PRO_MAX_SKILL = UI_UX_PRO_MAX_DEFAULT
