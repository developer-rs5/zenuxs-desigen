# Audit item 3.15 / Spec §10 — Prototype → Code Export: RESOLVED

**Status:** RESOLVED — the first export target (standalone HTML/CSS + a small JS
shim) is implemented, validated, and reported.

## Where it lives

`packages/dom-css/src/prototype/`:

- `support.ts` — classification vocabulary: report types, reason tokens, the
  `EASING_TO_CSS` map (a rename of `EASING_BEZIERS`, not an approximation), and
  trigger/action strategy predicates.
- `css.ts` — pure CSS text builders whose templates mirror the preview oracle
  (`packages/core/src/canvas/scene.ts` state visuals, `render-state.ts` screen
  offsets, `keyframes.ts` timing).
- `screens.ts`, `animations.ts`, `interactions.ts`, `analyze.ts`, `context.ts`
  — the walker that reads prototype data through the public
  `@open-pencil/scene-graph` readers and emits CSS plus shim ops.
- `shim.ts` — the dependency-free IIFE emitted only when JS-dependent
  interactions exist. It never evaluates guards or variable writes.
- `index.ts` — `exportPrototypeBundle(graph, options) → { bundle, report }`,
  reusing `sceneGraphToDesignDocument` and `html-export.ts`; implies
  `html: 'standalone'`.

Inputs are the public scene-graph readers only; Core is never imported, so
`packages/dom-css` stays framework-neutral. Surfaced from
`packages/dom-css/src/index.ts`, and reachable from the CLI as
`open-pencil export <file> --format html --prototype` (`--json` prints the
report and nothing else).

## Implemented scope (v1)

| Authored | Emitted as |
| --- | --- |
| `instant`, `fade`, `slide` transitions | `transition` with the exact CSS timing keyword |
| screen `navigate` | `.op-screen` sections + active-class swap; fade crossfades both screens (in = p, out = 1 − p), slide offsets both by the destination bounds |
| state visuals | `[data-op-state]` rules with preview parity (opacity product, translate, center-anchored scale/rotation, top-left-anchored proportional size scale, absolute corner radius, solid fill, `blur(radius/2)`) |
| `hoverEnter`/`hoverLeave` → `setState` | pure CSS `:hover` |
| `press` → `setState` | pure CSS `:active` |
| `click` / `load` / `afterDelay` | shim ops |
| `playAnimation` (animation + group) | `@keyframes` + `animation … <delay>ms`, cumulative group delays, `fill-mode: forwards`, loop → `infinite` |
| `setState` | `data-op-state` attribute |
| flows | flow start reported against the exported screens |

## Supported / unsupported pointer

Everything else is **reported `skipped` with a reason and emitted as nothing** —
never downgraded:

`spring` (never as linear/ease), `drag` / `scroll` / `longPress` / `release`,
interactions carrying a `guard`, `setVariant`, `setVars` writes, overlays
(`openOverlay`/`closeOverlay`), navigate destinations outside the export root,
gradient/image fills, and the state-blur parity gap when the authored layer
blur is non-zero (preview composes both; CSS cannot).

Report invariants are test-enforced: `total === exported + approximate +
skipped` for interactions, states, animations, and flows; `skipped` always
carries a `reason`; `exported-approximate` always carries an `emittedAs`; the
report is emitted whether or not anything was withheld.

## Why this solution

- HTML/CSS is the one target that can express the supported subset with zero
  runtime dependency for hover/press, and the design already had an honest
  standalone HTML export to build on.
- The report is the "export compatibility validator" the mission asks for:
  source semantics → supported? → mapping → generated representation →
  unsupported fallback, per interaction.
- Parity was taken from the preview oracle by reading it, not by importing
  Core, so `dom-css` keeps no editor dependency.

## Validation

`packages/dom-css/tests/prototype.test.ts`,
`tests/engine/dom-css/prototype-export.test.ts` (easing-curve parity against
`#core/prototype/motion`, real pluginData fixtures, unsupported-feature
containment), `tests/engine/cli/export.test.ts`, and
`tests/e2e/export/prototype.spec.ts` (executes the generated bundle in a
browser: click → fade animates mid-flight, hover works with no script, skipped
features produce no behavior).

## Phase-2 leftovers

- `spring` → needs CSS `linear()` sampling of the damped-oscillator step
  response. That math lives in `packages/core/src/prototype/motion.ts` and is
  not public; it needs an `@open-pencil/core/prototype` public subpath (or a
  moved pure module) before the exporter may use it.
- Guards, `setVars`, `setVariant`, overlays, and pointer/timer triggers beyond
  `click`/`load`/`afterDelay` remain shim work, not CSS work.
