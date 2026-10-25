# Brag Plan: ZenuxsDesign

## What is this app?
ZenuxsDesign is an open-source design editor (Vue 3 + Skia/CanvasKit + Yoga WASM, Tauri desktop + web) that opens and writes native Figma `.fig` files, builds designs with a built-in 90+-tool AI, runs interactive prototypes, and is fully scriptable — CLI, XPath, `eval`, MCP — with no account and no server.

## The angle
The project's own "Why" is the ad: Figma is a closed platform that actively fights programmatic access; this is the tool that opens those files anyway. The video plays it straight and confident — a quiet premium product film where every claim is the project's real copy. The dithered-pencil boot-splash scan (from `index.html`) is the recurring brand signature; the recreated editor UI is the proof.

## Hook (first 2-3 seconds)
Dark frame. The dithered pencil icon (boot-splash recreation) scans with its accent sweep in the background while README's verbatim line lands as big display type: **"Figma actively fights programmatic access."** — then snaps to **"This doesn't."** underlined by the same scan sweep in component purple.

## Key moments (the middle)
- **The editor, assembled** — a faithful recreation of the real editor shell: pages/layers panel, canvas holding a design, right inspector, bottom toolbar, Share button. Canvas elements pop onto the beat grid.
- **AI builds designs** — the AI chat panel slides in; "Build a pricing page" types out with keypress sounds; three pricing cards materialize on the canvas, one per beat.
- **Interactive prototypes** — the design sits in a phone device frame; a cursor taps Continue and the screen smart-animates to the next state.

## Outro / punchline
Color dip to black. The pencil icon's scan completes. Wordmark lands on a strong cue, then the project's own closing lines: `Open source. MIT. ~7 MB.` and **"Your data never leaves your machine."**

## User flow worth showing
Entry → key action → result: open the editor with a `.fig` document on the canvas → describe what you want in the AI chat ("Build a pricing page") → the design appears on canvas → present it as an interactive prototype on a device. These are scenes 2–4; the flow is the centerpiece, stat cards appear nowhere.

## Tone
- Preset: `polished`
- Creative direction: quiet premium product film with one defiant opening line — "the tool that opens the files Figma wants closed"
- Interpretation: 5 scenes, longer holds, confidence through restraint. SFX minimal (typing, one tap, one logo accent). Transitions are push slides and dissolves; no chaos, no all-caps shouting.

## Format: landscape — 1920x1080
## Duration: 23.2s

## Visual identity (from the project)
- Background: `#111315` (dark scenes, from `index.html` loader vars); editor light theme: canvas `#F7F8FA`, panels `#FFFFFF`, text `#17191C`, muted `#8A919B`
- Accent: `#9747FF` (component purple — `COMPONENT_COLOR` in `packages/core/src/constants.ts`); selection blue `#3B82F6` (`SELECTION_COLOR`) appears only inside the recreated editor as selection chrome
- Text: `#F5F7FA` on dark; `#17191C` on light
- Display font: **Schibsted Grotesk** (700–900, tight tracking) — brand moments
- Body font: Schibsted Grotesk 300–400; **JetBrains Mono** for the programmatic voice (terminal lines, chat input, MIT chips)
- Mockup font: **Inter** — only inside the recreated editor UI, where the real app uses it (deliberate brand exemption from the banned-fonts list)
- Strongest visual element: the dithered pencil boot-splash icon with its scan sweep; the light editor shell from `packages/docs/public/screenshot.png`

## Share copy (draft)
ZenuxsDesign reads and writes native .fig files, builds designs with 90+ AI tools, and never sends your data anywhere. Open source, MIT, ~7 MB.

## Audio direction
- Role: warm steady bed + sparse professional accents
- Music: `happy-beats-business-moves-vol-12-by-ende-dot-app.mp3` (117.4s, ~110 BPM, "steady and clean" — the polished pick)
- Music treatment: full volume posture 0.32, starts at 0s, no intro fade; gentle fade-out 21.7s → 23.2s
- Music cue guidance: bundled preset at `/home/azaz/.agents/skills/brag/assets/music/cues/happy-beats-business-moves-vol-12-by-ende-dot-app.music-cues.json` (also copied into composition assets). Strong cues: **8.74s** (push into AI scene), **17.47s** (prototype tap payoff), **19.66s** (logo land). Beat-grid windows: scene-2 canvas elements at 4.91 / 5.34 / 6.00; scene-3 pricing cards at 12.55 / 13.11 / 13.64.
- Audio-reactive treatment: subtle — the dark scenes' radial purple glow breathes with music RMS/bass (extract per-frame data with the gsap skill's `extract-audio-data.py`). No waveform/equalizer visuals.
- SFX posture: minimal but present; motion-matched; professional restraint
- Audio-coupled moments: typed chat prompt (randomized keyboard keypresses), card-by-card canvas pops (card-place on first and last only), simulated cursor tap (ui click), logo land (single quiet bong)
- Restraint rule: no SFX on transitions; nothing aggressive; SFX volume ≤ 0.6

## Storyboard

### Scene 1 — Hook: the defiant line — 3.8s
Dark `#111315`. Giant ghosted dithered pencil icon (right side, ~8% opacity) with the accent scan-sweep bar running its boot-splash sweep; radial purple glow bottom-left breathes with music RMS. Text: "Figma actively fights programmatic access." (76px, enters 0.25s, settled ≥1.6s), then "This doesn't." (100px, 900, snaps in at ~2.2s with a purple scan underline).
Sequential/interaction: none (text + icon scan)
Audio intent: steady, confident; the bed establishes calm before the payoff
Audio-coupled idea: soft drop accent when "This doesn't." lands
Music: vol-12 from 0s
Transition mood: clean → Scene 2 (push slide)

### Scene 2 — Reveal: the editor — 4.94s
Light editor recreation scales in (blur-clear): window titlebar, left PAGES/LAYERS panel, canvas `#F7F8FA` with recreated design (Dimensions card, Airplane-mode toggle row, Continue button — from the docs screenshot), right inspector (Design/Code/AI tabs, Position, Layout), bottom toolbar, Share button. Overlay copy bottom-left: "The open-source design editor." then a mono terminal line `> opens .fig files natively`. Canvas elements pop at beats 4.91 / 5.34 / 6.00.
Sequential/interaction: yes — card, toggle row, button arrive one by one on the beat grid
Audio intent: bed lifts slightly; the reveal should feel like the product breathing
Audio-coupled idea: card-place sound on first and last canvas element
Music: continues
Transition mood: clean → Scene 3 (push slide, beat-locked to 8.74s)

### Scene 3 — AI builds designs — 5.46s
Same editor pushed in; right AI chat panel slides in. Headline over the canvas: "AI builds designs."; mono subline "90+ tools behind the chat." Chat input types "Build a pricing page" character by character (keypress sfx), then sends. Three pricing cards pop onto the canvas at 12.55 / 13.11 / 13.64.
Sequential/interaction: yes — typed input, then 3 cards appear one per beat
Audio intent: focused, quietly magical; keypress rhythm carries the scene
Audio-coupled idea: randomized keyboard keypresses; card-place on first/last card
Music: continues
Transition mood: clean → Scene 4 (push slide)

### Scene 4 — Interactive prototypes — 4.36s
Editor recedes; phone device frame center-right holds the pricing page. Left copy: "Interactive prototypes." then "Wire triggers. Present the flow." At 17.47s (beat-locked) a cursor glides in and taps Continue; the screen smart-animates (spring slide) to a confirmation state.
Sequential/interaction: yes — simulated cursor tap + state transition
Audio intent: playful but controlled; the tap is the scene's exclamation
Audio-coupled idea: ui click at the tap, soft whoosh-free spring (no extra sfx)
Music: continues
Transition mood: soft → Scene 5 (color dip to black at ~18.5s)

### Scene 5 — Outro — 4.64s
Black dip into dark `#111315`. Pencil icon centered, scan sweep completes; radial glow breathes. Wordmark "ZenuxsDesign" lands at 19.66s (beat-locked) with one quiet bong. Mono chips: `Open source. MIT. ~7 MB.` then "Your data never leaves your machine." holds to the end. Music fades out 21.7 → 23.2s.
Sequential/interaction: none
Audio intent: resolution; the bed settles and closes
Audio-coupled idea: single quiet bong at logo land
Music: fade-out to silence

**Music mood for this video:** steady/clean corporate bed (polished)
**Audio summary:** A steady 110 BPM bed under the whole film; keypress and card sounds tick along the beat grid, one tap accent at the prototype payoff, one quiet bong at the logo, fade to silence.

## Reading-time check
- S1: two headlines, floors met (1.65s and 1.3s settled) ✓
- S2: 4-word line (1.6s) + 5-word mono line (1.8s) ✓
- S3: 3-word headline (1.25s) + 5-word subline (1.5s); cards are UI mockup, not primary copy ✓
- S4: 2-word headline (1.25s) + 5-word subline (1.2s) ✓
- S5: chips (0.9s) + 6-word closer (2.4s) ✓
