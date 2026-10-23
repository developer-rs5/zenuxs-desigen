/**
 * Per-run design direction assignment.
 *
 * The skills explain *how* to design well, but a model that follows them can
 * still produce the same page twice: same centred hero, same three cards, same
 * palette family. Prompt text alone does not prevent that — the previous
 * conversation is a strong attractor. This module assigns a concrete direction
 * per run, drawn from a catalog that is deliberately spread across
 * compositions, palettes, and type pairings, and it refuses to hand out a
 * direction that recent runs already used.
 *
 * The directive is guidance, not a template: a brief that pins brand colors,
 * fonts, or a layout always wins, and the model is told so explicitly. What it
 * may not do is drift back to the previous run's shape.
 */

export interface VariationPalette {
  name: string
  background: string
  surface: string
  text: string
  muted: string
  accent: string
  /** One line on how the color behaves, so the model uses it as a system. */
  note: string
}

export interface VariationType {
  display: string
  body: string
  note: string
}

export interface DesignDirection {
  id: string
  name: string
  /** The surface mode the composition was written for. */
  mode: 'persuade' | 'operate' | 'read' | 'experience'
  configuration: string
  palette: VariationPalette
  type: VariationType
  /** The one element a visitor would remember. */
  signature: string
  motion: string
}

/**
 * Directions are intentionally not variations of one another: each names a
 * different composition, color system, and type pairing, so two consecutive
 * runs cannot land on the same page shape even when the prompts are similar.
 */
export const DESIGN_DIRECTIONS: readonly DesignDirection[] = [
  {
    id: 'offset-editorial',
    name: 'Offset editorial',
    mode: 'persuade',
    configuration:
      'Asymmetric 5/7 split: a narrow left rail carries the display headline and a short paragraph, the wide right column carries one oversized artifact that bleeds past the section edge. Section order starts with evidence, not with a pitch.',
    palette: {
      name: 'Warm paper and oxblood',
      background: '#F4EFE6',
      surface: '#FBF7F0',
      text: '#1C1917',
      muted: '#6F6459',
      accent: '#7B2D35',
      note: 'Paper ground everywhere; oxblood only on the one element that must be found first.'
    },
    type: {
      display: 'Instrument Serif',
      body: 'Public Sans',
      note: 'Serif display at 64–96, body at 16 with generous leading; no third weight.'
    },
    signature: 'One oversized artifact (screen, object, or figure) cropped by the section edge.',
    motion: 'Artifact settles with a short upward drift; text does not animate.'
  },
  {
    id: 'console-wall',
    name: 'Console wall',
    mode: 'operate',
    configuration:
      'Full-bleed dark workspace: a compact command rail on the left, a dense primary pane in the middle, and a live status column on the right. Density is the point; the hierarchy comes from column width, not from cards.',
    palette: {
      name: 'Graphite and signal lime',
      background: '#0C0E11',
      surface: '#151A20',
      text: '#EEF2F6',
      muted: '#8A97A6',
      accent: '#C6F24E',
      note: 'Lime is reserved for live state and the primary action; everything else is graphite steps.'
    },
    type: {
      display: 'Archivo',
      body: 'IBM Plex Sans',
      note: 'Condensed-feeling display at 28–40; tabular numerals for every metric.'
    },
    signature:
      'A working pane with real rows, statuses, and one inline control — not a screenshot of one.',
    motion: 'Rows settle in a single stagger; no looping decoration.'
  },
  {
    id: 'stacked-ledger',
    name: 'Stacked ledger',
    mode: 'read',
    configuration:
      'Single measured column with a persistent side index: the reading column holds the argument, a hairline rule separates it from a narrow margin column used for notes and figures. No card containers anywhere.',
    palette: {
      name: 'Chalk and ink blue',
      background: '#FBFBF9',
      surface: '#F1F3F0',
      text: '#14181C',
      muted: '#5C6670',
      accent: '#1F4B99',
      note: 'Near-white ground, one blue used for links, rules, and the active index entry only.'
    },
    type: {
      display: 'Literata',
      body: 'Literata',
      note: 'One family in two optical sizes; body measure around 66 characters.'
    },
    signature: 'A margin figure that interrupts the reading column at one deliberate point.',
    motion: 'Index highlights on scroll position; nothing else moves.'
  },
  {
    id: 'full-bleed-stage',
    name: 'Full-bleed stage',
    mode: 'experience',
    configuration:
      'The work owns the first viewport edge to edge; navigation is a single floating line of small text over the artifact. The first piece is shown at the scale it deserves, with the next piece peeking in at the bottom third.',
    palette: {
      name: 'Bone and cobalt',
      background: '#E9E5DE',
      surface: '#F7F5F1',
      text: '#161616',
      muted: '#6B675F',
      accent: '#1B3FD8',
      note: 'Bone ground; cobalt appears once as a positional marker, never as a button fill.'
    },
    type: {
      display: 'Bricolage Grotesque',
      body: 'Manrope',
      note: 'Display at 96–140 for the title of the work; caption-size body with wide tracking.'
    },
    signature: 'The artifact itself, uncropped, with its real caption and index number beside it.',
    motion: 'A slow horizontal reveal on the next piece; no entrance animation on the current one.'
  },
  {
    id: 'split-thermometer',
    name: 'Split thermometer',
    mode: 'persuade',
    configuration:
      'Vertical split with a single continuous measure: a narrow left column states the claim, the right column is one tall instrument (gauge, timeline, or comparison bar) that runs the full section height. Content hangs off the instrument, not off cards.',
    palette: {
      name: 'Sand and rust',
      background: '#EFE7DA',
      surface: '#FBF4E8',
      text: '#231D17',
      muted: '#7A6A57',
      accent: '#B4462B',
      note: 'Sand ground with rust only on the measured value and its label.'
    },
    type: {
      display: 'Schibsted Grotesk',
      body: 'Figtree',
      note: 'Display at 44–56 with tight tracking; labels at 11 uppercase with wide tracking.'
    },
    signature: 'One tall instrument the whole section is built around.',
    motion: 'The instrument animates from zero once, then stays still.'
  },
  {
    id: 'mosaic-grid',
    name: 'Mosaic grid',
    mode: 'persuade',
    configuration:
      'Irregular mosaic: one large tile, two medium tiles of different heights, and a strip of small tiles. Tile sizes encode importance; no two rows repeat the same rhythm.',
    palette: {
      name: 'Deep forest and chalk',
      background: '#0F1F1A',
      surface: '#173029',
      text: '#F2F6F1',
      muted: '#9CB3A7',
      accent: '#E8D9A8',
      note: 'Forest ground with one pale sand accent for emphasis; secondary text is tinted green, never gray.'
    },
    type: {
      display: 'Fraunces',
      body: 'Work Sans',
      note: 'Fraunces at low optical weight for display; Work Sans for everything functional.'
    },
    signature: 'A mosaic where the largest tile is a real demonstration, not a headline.',
    motion: 'Tiles fade up in importance order, once.'
  },
  {
    id: 'rail-and-canvas',
    name: 'Rail and canvas',
    mode: 'operate',
    configuration:
      'Persistent 72px icon-and-label rail, a canvas that fills the rest, and a contextual inspector that slides in only when something is selected. The empty state is designed as carefully as the populated one.',
    palette: {
      name: 'Slate and apricot',
      background: '#101418',
      surface: '#1A2027',
      text: '#EDF1F5',
      muted: '#8794A2',
      accent: '#F0A46B',
      note: 'Apricot is the single interactive accent; selected states use a surface step, not a colored block.'
    },
    type: {
      display: 'Onest',
      body: 'Onest',
      note: 'One neutral family; 13px labels, 15px body, 24px section titles.'
    },
    signature: 'A designed empty state with a real first action inside the canvas area.',
    motion: 'Inspector slides in over 180ms; selection outline appears instantly.'
  },
  {
    id: 'poster-stack',
    name: 'Poster stack',
    mode: 'experience',
    configuration:
      'Three stacked poster bands of different heights, each with its own type scale, separated by full-width rules. The stack reads like a printed program rather than a web page.',
    palette: {
      name: 'Ink and vermilion',
      background: '#F2F0EB',
      surface: '#FFFFFF',
      text: '#101010',
      muted: '#62605B',
      accent: '#D8412F',
      note: 'Black type on paper, vermilion used for exactly one band number and one rule.'
    },
    type: {
      display: 'Bodoni Moda',
      body: 'Karla',
      note: 'High-contrast display at 72–110; small caps labels; body never wider than the band.'
    },
    signature: 'A poster band whose layout changes completely from the one above it.',
    motion: 'Bands advance by scroll position, not by hover effects.'
  },
  {
    id: 'bento-narrative',
    name: 'Bento narrative',
    mode: 'persuade',
    configuration:
      'Bento where each cell tells a different part of one story: a stat cell, a product cell, a quote cell, and a wide proof cell. Every cell has its own internal composition — the grid is the only shared structure.',
    palette: {
      name: 'Aubergine and pistachio',
      background: '#1B1424',
      surface: '#241A30',
      text: '#F5F1FA',
      muted: '#AE9FBF',
      accent: '#B7D98B',
      note: 'Aubergine ground; pistachio only for proof points and the primary action.'
    },
    type: {
      display: 'Gantari',
      body: 'Gantari',
      note: 'One family, three weights; numbers set larger than the labels beside them.'
    },
    signature: 'One cell that is a real working control rather than a claim.',
    motion: 'Cells reveal once on first paint; no hover transforms.'
  },
  {
    id: 'document-flow',
    name: 'Document flow',
    mode: 'read',
    configuration:
      'Long-form flow with an anchored table of contents, chapter openers that span the full width, and inline callouts that sit in the margin instead of interrupting the text. Navigation stays visible without a shadow.',
    palette: {
      name: 'Cool paper and teal',
      background: '#F7F8F7',
      surface: '#ECEFED',
      text: '#111614',
      muted: '#5A6763',
      accent: '#0E6E62',
      note: 'Teal marks structure (active chapter, links, rules) and never fills a large area.'
    },
    type: {
      display: 'Petrona',
      body: 'Source Sans 3',
      note: 'Serif display for chapter openers, sans for body and UI; 1.65 line height.'
    },
    signature: 'A chapter opener that pairs a real diagram with a one-sentence thesis.',
    motion: 'Table of contents tracks scroll; chapter openers do not animate.'
  },
  {
    id: 'instrument-panel',
    name: 'Instrument panel',
    mode: 'operate',
    configuration:
      'Split cockpit: a primary readout strip across the top, two stacked working panes below, and a bottom log that stays in view. Panels share one border language and no shadows.',
    palette: {
      name: 'Steel and amber',
      background: '#12161A',
      surface: '#1B2127',
      text: '#E9EEF3',
      muted: '#8695A3',
      accent: '#F2B544',
      note: 'Amber only for warnings and the active readout; borders are 1px steel, not shadows.'
    },
    type: {
      display: 'Chivo',
      body: 'Azeret Mono',
      note: 'Chivo for labels, Azeret Mono only for values and log lines — mono stays in its lane.'
    },
    signature: 'A live log with real, varied lines that scrolls independently of the page.',
    motion: 'Readout values tick in place; no ambient animation.'
  },
  {
    id: 'collage-editorial',
    name: 'Collage editorial',
    mode: 'experience',
    configuration:
      'Overlapping composition: a large image panel, a rotated type block, and a small metadata card that overlaps the image corner. Everything is aligned to one invisible baseline so the overlap reads as composition, not accident.',
    palette: {
      name: 'Clay and cream',
      background: '#EDE6DC',
      surface: '#F8F2E9',
      text: '#201B16',
      muted: '#75685A',
      accent: '#2E5E4E',
      note: 'Clay ground, cream panels, green used once for the metadata label and one rule.'
    },
    type: {
      display: 'Wix Madefor Display',
      body: 'Rubik',
      note: 'Display 56–72; metadata at 10 uppercase with 0.18em tracking.'
    },
    signature: 'One deliberate overlap where the type block crosses the image edge.',
    motion: 'The overlap eases into place once; no parallax.'
  },
  {
    id: 'command-sheet',
    name: 'Command sheet',
    mode: 'operate',
    configuration:
      'Centered working surface on a quiet ground: one primary command field, a grouped results list with keyboard hints, and a footer of contextual shortcuts. The page has one job and no marketing furniture.',
    palette: {
      name: 'Porcelain and indigo',
      background: '#F4F5F7',
      surface: '#FFFFFF',
      text: '#15181D',
      muted: '#66707C',
      accent: '#3D3BD6',
      note: 'White sheet on porcelain grey; indigo only on the focused command field and active row marker.'
    },
    type: {
      display: 'Epilogue',
      body: 'Epilogue',
      note: 'One family; 18px command input, 14px rows, 11px keyboard hints.'
    },
    signature: 'A real command field with a designed focus state and keyboard hints.',
    motion: 'Results appear instantly; focus transition over 120ms.'
  },
  {
    id: 'terrace-grid',
    name: 'Terrace grid',
    mode: 'persuade',
    configuration:
      'Horizontal bands that step inward as they descend, each band holding one claim and one visual at a different scale. The stepping silhouette replaces the hero entirely.',
    palette: {
      name: 'Limestone and olive',
      background: '#EFEEE7',
      surface: '#FAF9F3',
      text: '#1B1D18',
      muted: '#6D7064',
      accent: '#556B2F',
      note: 'Limestone ground, olive accent on the stepping edge and the primary action only.'
    },
    type: {
      display: 'Host Grotesk',
      body: 'Libre Franklin',
      note: 'Display at 40–60; body 15–16 with a narrow measure so bands stay short.'
    },
    signature: 'The stepped section edge that carries the eye down the page.',
    motion: 'Bands reveal once as they enter; the step edge stays static.'
  }
]

const MAX_REMEMBERED = 8
const usedDirectionIds: string[] = []

function randomUnit(): number {
  const values = new Uint32Array(1)
  crypto.getRandomValues(values)
  return values[0] / 0x1_0000_0000
}

/** Directions used recently in this app session, most recent last. */
export function recentDesignDirectionIds(): readonly string[] {
  return [...usedDirectionIds]
}

export function resetDesignDirectionHistory(): void {
  usedDirectionIds.length = 0
}

/**
 * Picks a direction not in `exclude`. When every direction has been used the
 * oldest half is released, so a long session keeps rotating instead of
 * dead-ending on the full catalog.
 */
export function pickDesignDirection(
  exclude: readonly string[] = [],
  random: () => number = randomUnit
): DesignDirection {
  const excluded = new Set(exclude)
  let pool = DESIGN_DIRECTIONS.filter((direction) => !excluded.has(direction.id))
  if (pool.length === 0) pool = [...DESIGN_DIRECTIONS]
  const index = Math.min(pool.length - 1, Math.floor(random() * pool.length))
  return pool[index]
}

function describeDirection(direction: DesignDirection): string[] {
  return [
    `- Direction: ${direction.name} (${direction.mode})`,
    `- Composition: ${direction.configuration}`,
    `- Palette: ${direction.palette.name} — background ${direction.palette.background}, surface ${direction.palette.surface}, text ${direction.palette.text}, muted ${direction.palette.muted}, accent ${direction.palette.accent}. ${direction.palette.note}`,
    `- Type: ${direction.type.display} for display, ${direction.type.body} for body. ${direction.type.note}`,
    `- Signature element: ${direction.signature}`,
    `- Motion: ${direction.motion}`
  ]
}

const PREVIOUS_DIRECTION_LABELS: Record<string, string> = Object.fromEntries(
  DESIGN_DIRECTIONS.map((direction) => [direction.id, direction.name])
)

/**
 * The per-run instruction appended to the system prompt. Null when the message
 * is not a design request, so a question never inherits a layout directive.
 */
export function nextDesignVariationDirective(
  messageText: string,
  random: () => number = randomUnit
): string | null {
  if (!looksLikeDesignRequest(messageText)) return null

  const avoided = recentDesignDirectionIds()
  const direction = pickDesignDirection(avoided, random)
  usedDirectionIds.push(direction.id)
  while (usedDirectionIds.length > MAX_REMEMBERED) usedDirectionIds.shift()

  const previous = avoided
    .slice(-4)
    .map((id) => PREVIOUS_DIRECTION_LABELS[id] ?? id)
    .filter(Boolean)

  const lines = [
    '[Design variation for this request]',
    'This is a different design task from the previous ones. Compose it from scratch; do not reuse the structure, palette, or type pairing of your earlier output in this conversation or document.',
    '',
    'Assigned direction (a starting point that guarantees variety — adapt it to the brief):',
    ...describeDirection(direction)
  ]

  if (previous.length > 0) {
    lines.push(
      '',
      `Already used in this session — treat each as an anti-reference: ${previous.join(', ')}.`
    )
  }

  lines.push(
    '',
    'Rules: the brief wins on brand colors, fonts, and explicit layout requests — keep their constraint and vary everything they left open. Never copy this direction into the canvas as literal chrome (no direction notes, no palette swatches, no annotations). If the brief is a modification of existing work rather than a new design, keep the existing design language and only vary what the request changes.'
  )

  return lines.join('\n')
}

const BUILD_VERB_PATTERN =
  /\b(build|create|design|make|redesign|restyle|generate|draft|compose|lay\s?out|sketch|prototype|turn\s+(this|it)\s+into)\b/i

const SURFACE_NOUN_PATTERN =
  /\b(page|screen|app|landing|dashboard|website|site|ui|interface|component|hero|section|poster|deck|pricing|portfolio|onboarding|settings|checkout|signup|login|profile|feed|gallery|store|menu|form|modal|empty\s+state)\b/i

const QUESTION_START_PATTERN =
  /^(what|how|why|where|when|who|which|does|do|is|are|can|could|should|would)\b/i

/**
 * Whether a message is asking for a surface to be drawn rather than answered.
 *
 * A build verb wins over the question form ("Can you build a dashboard?" is a
 * request), while a genuine question about the editor ("What is a component?")
 * never inherits a layout directive.
 */
export function looksLikeDesignRequest(messageText: string): boolean {
  const text = messageText.trim()
  if (text.length < 8) return false
  if (BUILD_VERB_PATTERN.test(text)) return true
  if (QUESTION_START_PATTERN.test(text)) return false
  return SURFACE_NOUN_PATTERN.test(text)
}
