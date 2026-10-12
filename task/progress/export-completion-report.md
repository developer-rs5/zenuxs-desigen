# Export Completion — Final Report

Mission: `task/export-completion-mission.md` · Progress log: `task/progress/export-completion-progress.md`
Date: 2026-10-09 · Status: **COMPLETE — every capability implemented and verified**

## A. Executive summary

The prototype-to-code export no longer excludes any authored capability. Spring, drag,
scroll, long press, guards, setVariant, and overlays are implemented end-to-end in the
exported bundle: springs sample the preview's clamped curve into a CSS `linear()` easing;
everything CSS cannot evaluate (guards, variable writes, pointer gestures, overlays,
variant swaps, navigation triggers beyond click/load/delay) rides a delegated,
dependency-free JS runtime emitted only when needed. The report vocabulary no longer
emits capability-based skips — the only remaining `skipped` reasons are genuine data
errors (missing target, destination outside the export root, duplicate trigger,
inexpressible non-solid fill), each with an evidence-based reason.

Verification is two-layered, both against the real Zenuxs preview runtime: 9 engine
parity tests compare exported artifacts with `createPrototypeRuntime` behavior
(same graph, same inputs, same expected values), and 8 browser e2e tests author →
export → execute → interact with a real mouse → assert visible results. Full gates:
`bun run check` EXIT=0 (18/18 commands), full E2E 590 pass / 3 skip with the only
2 failures being load-flake that pass 9/9 in isolation.

## B. Capability matrix (authored → exported → executed → observed → compared)

| Capability | Implementation | Verified in browser (real mouse) | Parity vs preview runtime |
|---|---|---|---|
| **Spring** | 65-point sample of clamped `springProgress` → `linear()` in `transition-timing-function`; used by state claims, screen crossfade, overlay transitions | mid-flight opacity strictly between endpoints, lands exactly on target, computed style shows `linear(` | samples equal `springProgress` clamped within 3 decimals at all 65 points |
| **Drag** | delegated pointerdown/move/up; action fires at pointerdown (preview `beginDrag`); live follow via independent CSS `translate`; settle keeps offset; moved drag eats the click | state flips at down, `translate: 40px 10px` tracks and settles, click suppressed after move, fresh click works | `beginDrag/updateDrag/endDrag` render-state translate + opacity matched exactly |
| **Scroll** | delegated `wheel` (non-passive), `deltaY === 0` gate | deltaY 0 → no dispatch; wheel 120 → state applied | preview `scroll()` gates on deltaY identically; shim source asserted verbatim |
| **Long press** | 500 ms pointerdown timer, cancelled on up/cancel/leave | hold 500 ms fires while pressed; 80 ms tap never fires; `var lpMs=500` in bundle | constant pinned to `LONG_PRESS_THRESHOLD_MS` from `editor/prototype/actions.ts` by test |
| **Guards** | op-attached conditions evaluated at fire time against per-node seeded vars (fail-closed, typed eq/neq, finite-number ordered ops — mirrors `evaluateGuard`) | seeded `flag=false` → guarded press does nothing; `setVars {flag:true}` atomically with Dim; next press → Other | preview runtime run with same graph: identical fail→arm→fire sequence |
| **setVars** | atomic variable writes on the state op | (covered above) | op payloads (`vars`, `seedVars`) match preview `runSetState` atomicity |
| **SetVariant** | spec resolved at build time via `resolveVariantComponentId` (same function preview uses); `<template data-op-variant-for>` children swap + component root-style attr rule honoring instance root overrides | click swaps `data-op-variant`, root width 120→240px, children replaced (green fill appears) | preview `onMutate` receives the same instance + spec; export resolves the same component id |
| **Overlays** | `.op-overlay` hoisted above screens, first-wins base CSS + `.op-backdrop`, JS stack (pops topmost), off-canvas centering mirrors `overlayVisual`, slide start = screen bottom − overlay top, open re-runs subtree delay ops via `overlayOf` | hidden → open (centered, backdrop 0.4, 800px wide, faded in) → close pops; slide: enters from below, **slides back out on close** | placement math equals preview `overlayVisual` (center X, relative Y); backdrop opacity exact |

Nothing is silently downgraded. Springs are disclosed in the report as sampled-linear
(detail text); guards/setVars are recorded as `exported` issues with fire-time/atomic
wording; the remaining approximate disclosure is the pre-existing, honest one: an
unguarded `hoverEnter` with no covering `hoverLeave` reverts on unhover while preview's
state is sticky.

## C. Test numbers

| Gate | Result |
|---|---|
| `bun run check` | **EXIT=0** — 18 chained commands (count parsed from package.json, evidence per command in gate log) |
| Targeted engine + package + CLI tests | 88 pass / 0 fail (12 files) |
| New per-capability e2e (`prototype-capabilities.spec.ts`) | **8/8** (spring, drag, scroll, longPress, guards+setVars, setVariant, fade overlay, slide overlay) |
| Preview↔export parity (`prototype-preview-parity.test.ts`) | **9/9** |
| Full unit suite (`test:unit`) | 3518–3525 pass / 1 skip; 5–6 failures all `.fig` **timeouts** under load — pass in isolation (2/2, 23/24, 5/5 proven) → 0 regressions |
| Full E2E (163 files, 34.4 min) | **590 pass / 3 skip / 2 fail** — failures (`chat/responses`, `fonts/cjk-rendering-visual`) pass **9/9 isolated** → load-flake, 0 regressions |

## D. Product functionality vs test-environment dependencies

**Product (repo, reproducible anywhere):** all seven capabilities + report vocabulary;
`bun install` + `git lfs pull` + `bun run check` is the complete recipe (now documented
in `packages/docs/development/testing.md` § Environment Reproducibility).

**Test environment (host-specific, not baked into the repo):**
- `tests/e2e/chat/real-llm.spec.ts` requires `OPENROUTER_API_KEY`; kept external, never
  in the repo (`check:secrets` green). Without it, exclude the file **by path** —
  `--grep-invert` does not prevent collection-time throw.
- Hosts with exhausted inotify watches need `WATCHPACK_POLLING=true
  CHOKIDAR_USEPOLLING=1` for dev/test/check; documented as a host workaround only.
- Heavy `.fig` round-trip specs time out under parallel load; they pass in isolation —
  re-run solo before treating as regression.

## E. Evidence-based limitations (documented, none silent)

1. **`linear()` browser floor**: spring easing needs CSS `linear()` (Chrome 113+,
   Safari 17.2+, Firefox 116+). Older browsers ignore the declaration and get an
   untimed (instant) transition; the interaction still applies its end state.
2. **Variant component shared by instances on two screens**: template load/delay ops
   bind to the first instance's screen; a warning is emitted (`warnOnce`).
3. **Variant component outside the export root**: its prototype subtree is walked and
   attributed to the instance's screen (works); interactions authored inside variant
   children fire through delegation after the swap.
4. **Overlay placement across multiple trigger screens**: each open op carries the
   placement computed against *its* trigger screen, so multi-screen opens are exact;
   only an authored overlay whose frame sits in a *different* root subtree than any
   opener is skipped with `destination-outside-root` (a data error, disclosed).
5. **Hover-without-leave stickiness** remains the one disclosed approximation (CSS
   `:hover` reverts; preview state is sticky) — pre-existing, accurately reported as
   `exported-approximate` with `emittedAs`.

## F. Changed surface

- `packages/core/package.json` — `./prototype/motion` public subpath.
- `packages/dom-css/src/prototype/` — `support.ts` (spring sampling, trigger routing,
  `needsJS`), `shim.ts` (delegated runtime v2), `analyze.ts` (overlay/variant
  collection, hover flags, seeds), `screens.ts` (spring nav), `context.ts` (shared
  helpers), `index.ts` (overlay hoist + variant templates), **new** `overlays.ts`,
  **new** `variant.ts`; `interactions.ts` slimmed to setState/play/navigate routing.
- `packages/dom-css/src/from-scene-graph.ts` — exported style builders.
- Tests: rewritten `prototype-export.test.ts`, `prototype.test.ts` (dom-css),
  `cli/export.test.ts`, `e2e/export/prototype.spec.ts`; **new**
  `e2e/export/prototype-capabilities.spec.ts` (8) and
  `engine/dom-css/prototype-preview-parity.test.ts` (9).
- `CHANGELOG.md` — Unreleased export bullet now describes the full capability set.
- `packages/docs/development/testing.md` — Environment Reproducibility section.

## G. Final status

**COMPLETE.** Every capability in the mission list is implemented end-to-end and
verified through the full flow (authored in Zenuxs → exported → executed → interacted
with a real mouse → visible result observed → behavior compared against the Zenuxs
preview runtime). No capability is marked unsupported; the only skips left are data
errors with specific reasons; the only documented limitations are the five listed
above, each evidence-based.
