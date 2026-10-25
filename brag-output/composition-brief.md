# Hyperframes Composition Brief: ZenuxsDesign

## Objective
Create a short launch-style brag video for ZenuxsDesign, the open-source design editor that opens native Figma `.fig` files.

## Output
- Composition directory: `brag-output/composition/`
- Rendered video: `brag-output/brag.mp4`
- Format: landscape — 1920x1080
- Duration: 23.2 seconds

## Source Material
- Project root: `/home/azaz/Projects/zenuxs-desigen`
- Primary files read: `index.html` (boot splash + loader palette), `README.md` (copy + claims), `packages/docs/public/screenshot.png` (editor UI reference), `packages/core/src/constants.ts` (SELECTION_COLOR `#3B82F6`, COMPONENT_COLOR `#9747FF`)
- Product name: ZenuxsDesign (from `index.html` `<title>`)
- Tagline / strongest claim: "Open-source design editor. Opens `.fig` and `.pen` files — read and write native Figma files."
- Key UI or visual moment to recreate: the editor shell from `packages/docs/public/screenshot.png` (left pages/layers panel, canvas with a design, right inspector, bottom toolbar, Share button); the dithered pencil boot-splash icon with its scan sweep from `index.html`
- Copy that must appear verbatim:
  - "Figma actively fights programmatic access." (README "Why")
  - "This doesn't." (framing, asserts nothing)
  - "The open-source design editor." (README line 1, re-cased)
  - "> opens .fig files natively" (trimmed from "read and write native Figma files")
  - "AI builds designs." (README heading)
  - "90+ tools behind the chat." (re-cased from "90+ tools create and modify nodes")
  - "Interactive prototypes." (README heading)
  - "Wire triggers. Present the flow." (re-cased from "wire triggers to navigation … present the flow in a live preview")
  - "Open source. MIT. ~7 MB." (README license + desktop claim)
  - "Your data never leaves your machine." (README "Why")

## Creative Direction
- Tone preset: `polished`
- Creative direction: quiet premium product film with one defiant opening line — "the tool that opens the files Figma wants closed"
- Interpretation: longer holds, confidence through restraint; minimal SFX; push slides and dissolves; no chaos
- Angle: The project's own "Why" section is the ad — Figma fights programmatic access; this tool opens the files anyway. The dithered pencil boot-splash scan is the brand signature; the recreated editor is the proof.
- Hook: dithered pencil scan behind README's verbatim "Figma actively fights programmatic access." → snap to "This doesn't."
- Outro / punchline: logo lands on a strong cue; closing line "Your data never leaves your machine."
- Avoid:
  - Generic SaaS language
  - Abstract filler visuals
  - Unrelated visual redesign
  - Equalizer/waveform visuals

## Visual Identity
- Background: `#111315` (dark scenes); editor mockup: canvas `#F7F8FA`, panels `#FFFFFF`, panel borders `#E5E7EB`, text `#17191C`, muted `#8A919B`
- Text: `#F5F7FA` on dark; `#17191C` on light
- Accent: `#9747FF` (component purple); `#3B82F6` selection blue only inside the recreated editor chrome
- Display font: Schibsted Grotesk 700–900 (brand moments)
- Body font: Schibsted Grotesk 300–400; JetBrains Mono for the programmatic voice (terminal line, chat input, outro chips)
- Mockup font: Inter — strictly inside the recreated editor UI (the real app's font; deliberate exemption)
- Visual references from the project: boot-splash dithered pencil icon + scan sweep (`index.html`), editor shell (`packages/docs/public/screenshot.png`), component purple `#9747FF`, selection blue `#3B82F6`

## Storyboard
Use the storyboard in `brag-output/brag-plan.md` as the creative contract.

Scene summary:
1. Hook: the defiant line — 3.8s — dithered pencil scan behind "Figma actively fights programmatic access." then "This doesn't."
2. Reveal: the editor — 4.94s — editor shell assembles; copy "The open-source design editor." + `> opens .fig files natively`; canvas elements pop at 4.91/5.34/6.00
3. AI builds designs — 5.46s — chat panel types "Build a pricing page"; headline + "90+ tools behind the chat."; 3 pricing cards pop at 12.55/13.11/13.64
4. Interactive prototypes — 4.36s — phone device frame; cursor taps Continue at 17.47s; screen springs to next state
5. Outro — 4.64s — logo lands at 19.66s; "Open source. MIT. ~7 MB."; "Your data never leaves your machine."; music fades

Scene boundaries: 0 / 3.8 / 8.74 / 14.2 / 18.56 / 23.2. Push slide transitions (0.5s, power3.inOut) at 3.8, 8.74, 14.2; color dip to black into scene 5 at ~18.56.

## Audio
- Audio role: warm steady bed + sparse professional accents
- Audio arc: steady bed from 0s under the defiant hook; bed lifts slightly for the editor reveal; keypress rhythm carries the AI scene; tap accent at the prototype payoff; quiet bong at the logo; fade to silence 21.7→23.2s
- Music: `assets/music/happy-beats-business-moves-vol-12-by-ende-dot-app.mp3` (117.4s, ~110 BPM)
- Music treatment: volume 0.32, `data-start="0"`, no intro fade; fade out over the final 1.5s
- Music cue guidance: bundled preset JSON at `/home/azaz/.agents/skills/brag/assets/music/cues/happy-beats-business-moves-vol-12-by-ende-dot-app.music-cues.json` (copy into `assets/music/cues/`). Strong cues: 8.74s (transition into scene 3), 17.47s (prototype tap), 19.66s (logo land) — 3 locks, marked `// beat-locked`. Beat grids: scene-2 canvas elements 4.91/5.34/6.00; scene-3 cards 12.55/13.11/13.64 — mark `// beat-grid`.
- Audio-reactive treatment: subtle — radial purple glow on dark scenes breathes with RMS/bass. Extract per-frame audio data with the gsap skill's extractor (`/home/azaz/.codex/.tmp/plugins/plugins/hyperframes/skills/gsap/scripts/extract-audio-data.py` — the `media-use` skill is not installed in this environment; this is its equivalent helper). If extraction fails, skip audio-reactive and note it — do not block the render.
- Audio-coupled moments:
  - Scene 1 — soft drop accent when "This doesn't." lands
  - Scene 2 — card-place on first and last canvas element
  - Scene 3 — randomized keyboard keypresses while typing; card-place on first/last card
  - Scene 4 — ui click at the tap
  - Scene 5 — single quiet bong at logo land
- SFX selection guidance: read `/home/azaz/.agents/skills/brag/assets/sfx/sfx-analysis.md`; prefer low high-frequency-risk sounds; keyboard keypresses randomized across files so repeats don't sound robotic
- Exact SFX choice: Hyperframes chooses filenames, timestamps, density, and volume based on the implemented animation. Candidate families: `interface/drop_001`, `interface/bong_001`, `ui/mouseclick1.ogg`, `casino/card-place-*`, `keyboard/keypress-*`.
- Audio files: music already copied to `assets/music/`; copy chosen SFX into `assets/sfx/**`

## Hyperframes Instructions
Load the composition-building Hyperframes skills — `hyperframes` (composition contract + `data-*` timing, format; motion, eases and seek-safe keyframes in motion references; look via house-style), `hyperframes-registry` (ready-made effects, transitions, titles), and the gsap skill's audio scripts. In this environment the Hyperframes skills live on disk at `/home/azaz/.codex/.tmp/plugins/plugins/hyperframes/skills/{hyperframes,hyperframes-cli,hyperframes-registry,gsap}/` (there is no `media-use` skill installed; the gsap skill's `scripts/extract-audio-data.py` and `hyperframes/references/audio-reactive.md` cover music extraction and audio-reactive wiring). /brag is its own workflow: skip the `hyperframes` storyline step: don't read `references/types/*` or `references/story.md`, don't propose storylines, and don't write a `SPEC.md`. The brag plan and composition brief replace them, including the LOOK line: `LOOK: quiet premium product film — near-black #111315 frames around a light, precise editor mockup; component purple #9747FF as the single accent; Schibsted Grotesk display type with JetBrains Mono for the programmatic voice; restrained push-slide transitions; everything grounded in the real product UI.` Also skip the hyperframes `usage`, `history`, `feedback` and REVIEW.md steps; `check` is brag's gate. Do not route into a generic launch-video workflow.

Requirements:
- Show at least one real UI, copy, or visual element from the source project (the editor recreation and the boot-splash scan are both required).
- Keep all text readable in the final render (mockup UI text ≥ 14px; primary copy per the plan's reading floors).
- Keep the video within 15–25 seconds (23.2s).
- Include the planned music/SFX layer.
- Treat `/brag` audio notes as guidance, not a fixed cue sheet. Choose SFX after the visual animation exists.
- Treat music cue metadata as optional timing hints. Hyperframes decides exact animation timing and should ignore cues that hurt readability, scene pacing, or the product story.
- Major reveals may move toward nearby strong cues within about 0.15s. Smaller entrances may align to nearby beat points within about 0.10s. Use only 1-3 strong cue locks (8.74 / 17.47 / 19.66).
- Use SFX to support motion and interaction; restraint when the edit is already busy.
- Honor the planned music fade-out 21.7→23.2s.
- Audio-reactive: extract audio data and wire the dark-scene glow to RMS/bass (subtle, 3-6% on glow presence); skip gracefully if extraction fails.
- Use local assets for audio and any required runtime/media dependencies.
- Run `npx hyperframes check` before render — it is brag's single gate. (Invoke the cached CLI binary directly if `npx` hits the repo's npm override conflict.)
- Keep creation and rendering local. Remote or publishing workflows require a separate explicit user request.
