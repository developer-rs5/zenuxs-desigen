# Task 1 — AI-Native Prototyping + Motion Engine (progress)

Source: `task/zenuxs-design-ai-prototyping-motion-spec.txt` (ONLY active task file)
Rule: Task 2 (`zenuxs-design-ai-intelligence-skills-spec.txt`) NOT read until Task 1 passes its verification gate.

## Phases (spec §15)

| Phase | Status | Notes |
|---|---|---|
| A Research | done | local doc architecture + reference study (see Log) |
| B Model | done | `packages/scene-graph/src/prototype.ts` + valibot dep, 7/7 tests |
| C Runtime | C1–C5 done | C1+C2 = 21/21 in `tests/engine/core/prototype/`; C3 renderer wired; C4 preview+authoring actions 11/11 (incl. release-outside fix); C5 e2e: `tests/e2e/prototype/` 14/14 (prototype 3, slices 5, persistence 1, human-flow 4, db-persistence 1) |
| D Editor UX | D1–D3 done | D1 TopBar Present toggle; D2 authoring actions + undo; D3 `PrototypeSection.vue` + 47 i18n keys × 8 locales + DesignPanel mount, browser-verified via the e2e spec. `check:vue` 0, `check:i18n` 0, `tsgo` 0, format clean |
| E AI | done | 9 semantic ToolDefs in `packages/core/src/tools/prototype.ts` barrel + `prototype/{helpers,interactions,states,flows,validate}.ts` (repo idiom: domain folder; was one 685-line file) — `create_prototype_flow`, `create_interaction`, `set_interaction_trigger/action/transition`, `create_state`, `set_state_visual`, `connect_screens`, `validate_prototype` in CORE_TOOLS (AI chat + MCP + CLI); §17 validation built into every write + self-check tool; intent-mapping knowledge in `src/app/ai/chat/system-prompt.md` (`# Prototyping`, line ~228). Tests: 17/17 `tests/engine/tools/prototype.test.ts`; adapter/chat suites green (`tsgo` 0) |
| F Persistence | done | F1 fig roundtrip remap fix + `tests/engine/core/prototype/persistence.test.ts` 2/2; F2 cloud e2e `tests/e2e/prototype/persistence.spec.ts` 1/1 (author → autosave POST → reload → session restore GET → panel re-inspect → destination/startNodeId = restored frame → Present runs). Recovery modal removed in `e247e443` (MongoDB authoritative) → e2e mocks `/api/documents` instead |
| G Export | deferred | spec: establish internal model first; not needed for milestone |
| §11 Live AI build | done earlier | committed `adfc8f6d` (magic box + canvas live-building) |

## Milestone definition (spec §14 vertical slice)

1. Splash → Home: OnLoad → NavigateTo → Fade 500ms ease-out. Create/edit/save/reload/preview/inspect/re-edit.
2. Button: default/hover/pressed states, press = scale-down + spring back.
3. Bottom sheet: open (backdrop + slide from bottom) + close reverse.

## Log

### 2026-10-04
- Task file read (prototyping/motion spec only). Progress file created.
- Phase A started: mapping local document/serialization/editor-tool architecture (Explore agent).
- Reference study (§12) started. Cloned to `/home/azaz/Documents/zenuxs-reference-repos/`:
  - `penpot` (sparse, `common/`) — read `common/src/app/common/types/shape/interactions.cljc`
  - `motion-forge-animation` — read `src/model/types.ts`, `src/timeline/spring.ts`
  - open-pencil: NOT cloned — this repo IS the fork (study in-place).
  - xstate / motion-vue / rive / lottie: conceptual study only (spec says do not install; motion-vue already a repo dependency; rive/lottie out of milestone scope).

#### Reference takeaways (binding for Phase B design)
- **Penpot**: interactions live ON the shape (`interactions[]` attr): `{event-type, action-type, destination, animation?}`. Events: click, mouse-press, mouse-over, mouse-enter, mouse-leave, after-delay. Actions: navigate, open-overlay, toggle-overlay, close-overlay, prev-screen, open-url. Animation attached to action: `{animation-type: dissolve|slide|push, duration(ms), easing, direction, way}`.
- **MotionForge**: doc-level `interactions[]` `{trigger: press|load|hover, source, action: navigate|toggle|sequence, targetFrameId, transition: fade|slide|scale}`; `schemaVersion` + `migrate.ts`; ALL mutations through one `ops.ts` seam; per-node `gestures` (whileHover/whileTap) and `presence` (initial/animate/exit); transitions `instant|tween|spring`; **analytic normalized spring f(p)** (fit-to-gap, f(0)=0 f(1)=1, deterministic — unit-testable, no physics loop); easing = named curves | cubic-bezier.
- **XState** (conceptual): states/events/transitions table — adopt only a small deterministic state-step model for component states, do NOT add dependency.
- **motion-vue**: DOM-based; spec forbids DOM as canvas source of truth — motion semantics (springs/keyframes/easing) are what we re-implement against scene graph + renderer.

## Decisions

- **Storage = `open-pencil` pluginData JSON** (B): `interactions` / `prototypeState` keys on source node, `prototype` (flows) on root. Round-trips .fig + server with zero kiwi schema change. Validation via valibot (`safeParse`, null on garbage — never throws on read).
- **Layers kept distinct** (§4): interaction = trigger→action; state = named visual model; motion = `Transition` object attached beside (never inside) action/state.
- **MotionForge has NO LICENSE** (all-rights-reserved) → spring/easing math written fresh in `packages/core/src/prototype/motion.ts` from textbook damped-oscillator formulas (not adapted from their code). Penpot is MPL-2.0 — used conceptual model only, no code copied.
- **C1**: pure functions only — `easingProgress` (CSS bezier solver), `springProgress` (normalized step response, f(0)=0/f(1)=1 endpoint clamps, time-mode bounce→zeta, physics-mode zeta=damping/(2√(km))), `transitionDurationMs` / `transitionProgress` (spring default 400ms), `lerpNumber`. Tests: `tests/engine/core/prototype/motion.test.ts` (suite total with runtime = 21/21).

- **C2 runtime** (`packages/core/src/prototype/runtime.ts`): deterministic; every method takes explicit `nowMs`; state in closure (screen, screenTransition, overlays, animations, timers, stateVisuals, hoverChain); `enterDepth >= 8` guards cyclic OnLoad; ancestor dispatch stops at CANVAS page boundary; `hasPendingWork(nowMs)` gates rAF. Tests: `tests/engine/core/prototype/runtime.test.ts`.
- **C3 renderer**: `RenderOverlays.prototype?: PrototypeRenderState | null`; volatile path forced while `prototype != null`; `renderPageChildren` draws only `drawIds` with backdrop rect between screens and overlays; `renderNode` applies per-node translate/scale/opacity (`scene.ts`); pipeline passes `state.prototypePreview`.
- **C4 preview wiring**: `EditorViewState.prototypePreview`; `packages/core/src/editor/prototype/actions.ts` (`createPrototypeActions`), assembled in `create.ts`, stopped on `replaceGraph`/`dispose`; `useCanvasInput` gates mousedown/move/up/dblclick/mouseleave/Escape and starts pan drag for space+left/middle. Tests: 10/10 `tests/engine/editor/prototype-actions.test.ts` (7 preview + 3 authoring).
- **D2 authoring actions**: `writePluginKey(nodeId, key, value|null, label)` single undoable transaction per key (`{label, forward, inverse}`); public `setPrototypeInteractions` / `setPrototypeStateModel` / `setPrototypeStartNode` (validates node, keeps other flows).
- **D3 panel**: `src/components/properties/PrototypeSection.vue` mounted in `DesignPanel` single-selection list; pluginData reads subscribe to `store.state.sceneVersion`; numeric fields commit-only; state names use a local buffer (`AppInput` `@change` has no payload); `const node = computed(() => store.selectedNode.value)` (store exposes raw computeds).
- **C5 e2e** (`tests/e2e/prototype/prototype.spec.ts`, 3/3): (1) add interaction → action swap → undo×2 → redo, add states → scale edit, all asserted through parsed `pluginData`; (2) frame flag sets root flow `startNodeId` + `Starts flow` hint; (3) Present enters preview (selection cleared) → click frame A navigates to B (drawIds settle on B, 5s timeout) → Present exits. Route `/demo`, undo via `ControlOrMeta+z`.

- **F persistence**: node-id instability across fig roundtrip (export mints `{sessionID,localID}` guids for source-less nodes; import mints fresh SceneNode ids) → export post-pass in `io/formats/fig/export.ts` remaps `interactions`/`prototype` pluginData through `remapPrototypePluginValue` (`scene-graph/src/prototype.ts`) via `nodeIdToGuid`; import-side `remapPrototypePluginDataIds` in `kiwi/fig/import.ts` maps guid→fresh id (after `remapInstanceSwapPropertyValues`). Migration: models carry `version:1` + valibot safeParse (null on garbage) — no v2 yet, noted as sufficient; server stores figBase64 so all doc paths are covered.

## Bugs found / fixed

- **vue-tsc failed on fresh scene-graph exports**: `@open-pencil/scene-graph` types resolve to `dist/index.d.ts`, which was stale (no prototype exports) while `tsgo` used src paths → rebuilt via `bun run build` in `packages/scene-graph`. Rebuild needed whenever prototype type exports change.
- **New e2e loaded the landing page**: `useEditorSetup()` default `goto('/')` hits `LandingPage.vue`; editor lives at `/editor` and `/demo` → spec uses `/demo` (matches `layers/panel.spec.ts` et al.).
- **`CanvasHelper.undo()` is a no-op on Linux**: it presses `Meta+z` but the `$mod` keybinding (tinykeys) resolves to Control off macOS → new spec uses `ControlOrMeta+z` locally; helper left untouched (cross-cutting).
- **Both new frames named `Frame`**: destination option ambiguous under strict mode → test renames them (`Proto Start` / `Proto Target`) before authoring.

- **`previewPointerLeave` referenced but undefined** in useCanvasInput before it was added to actions → added (clears hover chain).
- **Preview swallowed pan**: mousemove/mouseup preview branches returned even with an active pan drag → early-return only when `!drag.value`; mousedown preview branch now starts `startPanDrag` for space+left/middle; mouseup ends pan cleanly.
- **Dev stack ENOSPC crash**: Vite watched `scratch/qa/profile/` (489MB churny Chromium profile) → added `'**/scratch/**'` to `WATCH_IGNORED` in `vite/server.ts`. System inotify limits unchanged (no sudo): watches 65536, instances ~118/128.
- **Test bug (not product)**: click test's start screen had OnLoad→navigate so the click destination immediately re-navigated (correct runtime behavior) → start preview directly on home instead. Same class: release test button lives in home → preview must start on home (drawIds scoped to the start subtree).
- **Product bug: afterDelay delayMs not materialized** — panel's `setTrigger` built `next` then `patchInteraction` re-spread the original item, resurrecting the deleted `delayMs`; `validate_prototype` rejects afterDelay without delay and runtime treated it as `??0`. Fixed by `commitInteractions(map)` full-entry replace (shows 500 default, clears on leaving afterDelay). Caught by slices e2e test 1.
- **Product bug: release outside canvas stuck press visuals** — `previewPointerUp` early-returned when `previewHit` was null (lift outside canvas / over another node) so `release` never dispatched. Fixed with `pressedId` tracking in `actions.ts` (pointerDown records, pointerUp releases it even when hit is elsewhere) + engine test `'release fires on the pressed node even when the pointer lifts elsewhere'`.
- **Slices e2e geometry**: Present calls `zoomToBounds(start)` (pad 80, zoom capped at 1) → nodes authored far below/right of the start frame land off-canvas and clicks never reach it → `place()` helper pins popup/closeBtn world coords inside the start frame's visible region.
- **Slices e2e missing `add-interaction` clicks**: bottom-sheet rows don't exist until added → combobox wait timed out; also `test.setTimeout(30_000)` for the three multi-step tests (default 15s too tight).
- **Slices e2e viewport drift via `selectNode`**: `canvas.click(50,50)`-then-select relies on element coords that shift after a prior test's Present `zoomToBounds` → selection never set, `waitForFunction` hangs → replaced `selectNode` + all click-then-select pairs with `selectViaStore` (`store.select([id])`); `place()` now also pins the main frame so `zoomToBounds(main)` centers the authored layout regardless of drag drift. Result: prototype e2e 9/9 twice consecutively.
- **Persistence e2e 401 flake (env noise)**: boot-time `/api/auth/session` probe 401s unauthenticated; Chrome logs a resource error that races CanvasHelper's console-error attach → `assertNoErrors` flaked → spec waits for the probe response (+250ms settle) before constructing `CanvasHelper`. 3/3 standalone.
- **Test bug: human-flow omitted "Set as flow start"** — preview then resolved the start node via the first-FRAME fallback, which on `/demo` is a demo shape (`0:79`), so its (absent) OnLoad never navigated and the wait for `[home]` timed out every run. Not a product bug: runtime/engine OnLoad path was fine (a temporary debug spec proved Present navigates Splash→Home in <1.5s once the flow start was set). Fixed by clicking the flow-start button + asserting root `flows[0].startNodeId`; debug spec deleted afterwards.
- **`CanvasHelper.clearCanvas()` is a no-op on Linux** — `selectAll()` presses `Meta+a`, the same `$mod`-resolves-to-Control issue as `CanvasHelper.undo()`, so `/demo` shapes survive the "clear". Left untouched (cross-cutting helper); specs must not depend on an empty canvas on Linux, and flows must set an explicit flow start instead of relying on the first-FRAME fallback.
- **Chat appends selection context to prompts** — the message the transport receives is `"<prompt>\n\n[Referenced nodes …]"`; assertions on the submitted text must `toContain`, not `toBe`.
- **Warm local-first cache skips the network on reload** — after save→reload, restore reads the IndexedDB fig seeded by the save (`loadStorageDocumentIntoStore` → `localIsAuthoritative`), so no `GET /api/documents/:id` fires. The db-persistence spec proves the backend with POST 200 + an independent authenticated read-back GET instead of waiting for a restore fetch.

## Environment noise (§20 classification — NOT app bugs)

- `git lfs` not installed → `.fig` fixtures are LFS pointers → fig-parse unit failures ("invalid zip data").
- `oxlint`/`check:arch` broken on Node 22 (`ERR_UNKNOWN_FILE_EXTENSION .ts` for `steiger.config.ts`).
- `fontsource.org` fetch failures → CJK/Arabic font render tests fail (network).
- `local-first storage persist.test.ts` fails on clean HEAD too (baseline, verified in separate worktree).
- MCP port bind flake + `get_font_status` ordering flake (passes isolated).
- **Playwright regression batches run concurrently with other Playwright runs poison each other** (beforeAll hook timeouts, mass 15s failures, "N did not run"). Always run regression batches solo; a full-suite HEAD baseline in an unbuilt worktree is invalid (stale dist → 417 fails).
- **`/`-route e2e specs are baseline-broken by the landing redesign** (commits `02deb986`/`e247e443`): `src/router.ts` maps `/` → `LandingPage.vue` unconditionally, while ~84 specs `goto('/')`/`goto('/?test')` (and `useEditorSetup()` default `url='/'`) expect the editor canvas → `waitForInit` 15s timeout, mass failures across editor/panels/properties/layers/toolbar. Task-1 WIP touches none of the route/fixture chain (`git diff --name-only` has no router/landing/fixtures/canvas-helper entries) and `/demo` specs pass with the same build → classified pre-existing repo debt, not Task 1. Verification plan: prove the failing specs green under a temporary `/demo` route patch, then revert; recommend permanent fixture default `'/demo'` as follow-up.

## §19 verification passes (2026-10-04)

| Pass | Scope | Result |
|---|---|---|
| 1 Functional happy paths | slices e2e §14 (splash/nav/fade, button states, bottom sheet) + prototype.spec 3/3 + human-flow 4/4 + persistence 1/1 + db-persistence 1/1 | PASS — 14/14 prototype e2e, multiple consecutive full runs |
| 2 Edge cases | garbage pluginData, deleted destination, rapid add/undo/redo, delay materialization, AI invalid input rejected without mutation | PASS (slices tests 1/2/5, human-flow test 3) |
| 3 Broken input | invalid JSON / invalid schema pluginData → panel treats as absent, editor still works; AI `transition:'wobble'` → `{error}` and document unchanged | PASS (slices test 2, human-flow test 3) |
| 4 Rapid/race | triple add + triple undo + triple redo; rapid trigger switching | PASS (slices test 1) |
| 5 Refresh/persistence | mocked cloud save → refresh → session restore → re-inspect → Present runs; PLUS real backend chain (guest session → POST 200 → Mongo read-back → reload → restore → Present → DELETE cleanup) | PASS (persistence.spec standalone + db-persistence.spec on live localhost:3000/MongoDB) |
| 6 Editor regression | route-patched batches: editor/panels/properties/layers/toolbar. First run 37 fail/48 pass → fixed `/?test`-flag specs missed by route sed → 23 fail → stash-baseline comparison: **failing sets identical with/without Task-1 source** (10/10 suspicious specs fail on baseline; 79 engine failures byte-identical both sides). Route patch reverted after. | PASS — 0 Task-1 regressions; all residual failures are baseline (`/`-route debt, `Meta`-key undo on Linux, missing Linux snapshots, LFS/font fixtures) |
| 7 AI regression | `tests/engine/tools/prototype.test.ts` 17/17 + adapter/chat suites green; system-prompt `# Prototyping` present | PASS |
| 8 Backend/DB regression | autosave.spec 2/2 (route-patched run); storage/workspace + recovery fail **identically on baseline** → §20 pre-existing | PASS — 0 regressions |
| 9 Console/network/log | `canvas.assertNoErrors()` asserted in every prototype spec across all runs; persistence 401 classified (boot session probe, spec now waits for it) | PASS |
| 10 Code-level consistency | `tsgo` 0, `format` clean, `check:vue` 0, `check:i18n` 0, engine 3094 pass (79 fail = baseline set, diff empty), prototype engine suites green | PASS |

**PASS 6 method**: temporary `/demo` route sed over `tests/e2e` (61 files, later extended to `/?`-flag setup URLs, 28 more), run batches, `git stash push -- packages src` to drop Task-1 source while keeping the route patch, re-run failing subset, `comm` diff of failure lists → empty. Then `git checkout -- tests/e2e/` (verified: all added diff lines contained `/demo`, nothing else).

## Known limitations

- `previewHit` ignores in-flight visual offsets (slide/scale) — mid-animation clicks land on authored geometry (ponytail in actions.ts).
- MCP sibling process from the crashed dev run (PID 85585) still serves `/tmp/open-pencil-mcp/.../mcp.sock`; current stack's MCP could not rebind (harmless, socket live).
- `bunx tsgo --noEmit` = 0; prototype-related suites 306/306 across 53 files (motion/runtime/actions in `tests/engine/core/prototype/`, tools, editor actions, scene-graph schema).
- No drag/swipe trigger in the milestone model (triggers: load/click/press/release/hoverEnter/hoverLeave/afterDelay) — §26's "card carousel swipe" is covered as click→Slide/left navigation; a real swipe gesture needs a future `drag`/`swipe` trigger.
- The §26 AI tests execute real prototype ToolDefs through `createAITools` via a scripted transport override (no `OPENROUTER_API_KEY` in this environment); the live LLM agent loop itself is not exercised (tagged `@real-llm` spec exists but cannot run without a key).
- Cold-cache (cross-device) restore — reload after wiping IndexedDB — is not e2e-covered; warm-cache restore + independent backend read-back are.
- `CanvasHelper.selectAll()`/`clearCanvas()` still press `Meta+a` (no-op on Linux) — follow-up candidate, deliberately not changed here.

## §26 human-like testing (2026-10-04)

Infrastructure: `tests/helpers/prototype/ai-chat.ts` injects a chat transport override whose `sendMessages` dynamically imports `createAITools(window.openPencil.getStore())` and executes the real prototype ToolDefs from the prompt text (no LLM key available), then streams genuine `tool-input-*`/`tool-output-available` events — so tool results, validation, undo entries, and panel sync are the production path, not fabricated output.

Specs:
- `tests/e2e/prototype/human-flow.spec.ts` 4/4 — (1) designer authors Splash→Home with On load→Navigate→Fade 500ms, previews (OnLoad fires, settles on Home), exits, manually re-edits to 800ms; root flow start asserted. (2) AI modifies the flow ("slide up over 400ms") → pluginData becomes slide/up/400 through the AI tool path, prompt context verified (`lastChatRequest` contains typed text), panel shows Slide/Up, one `ControlOrMeta+z` reverts to fade/800. (3) AI invalid input ("wobble") → `{error: Invalid transition "wobble"}`, document unchanged; AI creates loading/success/error states → 3 panel rows with the right names. (4) card carousel: Card A/B, click → Slide/Left, preview advances A→B.
- `tests/e2e/prototype/db-persistence.spec.ts` 1/1 — real backend chain: auto-guest session → new document → author flow start + interaction → autosave `POST /api/documents` 200 → independent authenticated `GET /api/documents/:id` read-back (payload >100 chars) → reload → session-tab restore → panel re-inspect ("Starts flow", destination remapped to restored id) → Present runs → authenticated `deleteRemoteDocument` cleanup → `assertNoErrors`.

Example coverage (spec §26 list):

| Example | Covered by |
|---|---|
| mobile onboarding flow | human-flow test 1 + slices |
| splash fades into login/home | human-flow test 1 (OnLoad→Fade 500) + engine `OnLoad navigate with 500ms ease-out fade` |
| login button animates when pressed | slices test 3 (press → scale 0.96 spring back) |
| bottom sheet slides up | slices test 4 (openOverlay Slide/up + backdrop + close) |
| loading/success/error states | human-flow test 3 (AI `create_state` ×3 + panel rows) |
| card carousel swipes horizontally | human-flow test 4 (click→Slide/left; no drag trigger in milestone — see limitations) |
| modify existing screen so modal enters from the bottom | human-flow test 2 (AI rewrites an existing interaction to slide/up — same operation class); manual equivalent in slices test 4 |

Per-example loop (inspect understanding → inspect created → preview → manual edit → save → reload → reopen → run → AI modify → verify): understanding (`dataset.lastChatRequest`), created (parsed `pluginData` + panel), preview (Present drawIds), manual edit (duration 500→800), save/reload/reopen/run (persistence + db-persistence specs), AI modify + verify (human-flow tests 2–4 with undo proof).

## §27 security / trust boundaries

- **Validation**: AI writes go through the same ToolDef `execute` validators a human-authored value would hit (enum/range/destination-exists checks); e2e proves `transition:'wobble'` is rejected with `{error}` and the document stays byte-identical.
- **Mutation**: `createAITools` wraps execution in `store.runMutationWithLayout` + `ensureGraphFonts` — identical to the live agent path; no separate write channel.
- **Undo/redo**: `onAfterExecute` pushes one `AI: <tool>` undo entry from page snapshots; human-flow test 2 proves a single undo restores the pre-AI state.
- **Permission**: the chat transport override replaces only the LLM stream (none available here); tool registration, mutation gating, and flash/tool-log hooks are the production `createAITools` wrappers. Agent-level model permission prompting is not exercised without a key (recorded as a limitation).
- **Persistence**: AI mutations bump `sceneVersion` exactly like manual edits → same autosave/remote-save path (db-persistence covers the save chain).
- **No generated JS**: prototype behavior is declarative pluginData written by semantic ToolDefs (`create_interaction`, `set_interaction_transition`, …); no arbitrary code execution exists in the implementation.

## §28 done checklist

| # | Criterion | Evidence |
|---|---|---|
| 1 | Underlying model exists | `packages/scene-graph/src/prototype.ts` (four distinct layers, valibot schemas) + 7/7 schema tests |
| 2 | Editor can create/edit it | PrototypeSection + authoring actions; prototype/slices/human-flow e2e |
| 3 | AI can create/edit it | 9 ToolDefs, 17/17 tool tests, human-flow tests 2–3 (real tool execution via chat) |
| 4 | Preview executes it | Present: OnLoad fade, click-nav, press/spring, overlay slide, carousel slide (14/14 e2e) |
| 5 | Behavior saved | autosave POST 200 (db-persistence), persistence.spec save step |
| 6 | Survives reload | db-persistence reload → restore → re-inspect → Present; persistence.spec (mocked) |
| 7 | Invalid structures rejected safely | garbage pluginData e2e (panel treats as absent), AI wobble rejected, validate_prototype tool, deleted-destination preview fails safe |
| 8 | Existing editor still works | §19 PASS 6 route-patched regression batches, failure sets identical to baseline → 0 regressions |
| 9 | AI still works | §19 PASS 7 (adapter/chat suites, system-prompt `# Prototyping`), chat specs green |
| 10 | DB persistence works | db-persistence: guest session → POST → Mongo read-back → restore → DELETE cleanup |
| 11 | Console/network/server clean | `assertNoErrors()` in every prototype spec across all runs; boot 401 classified & awaited |
| 12 | Multiple independent test rounds | prototype e2e 14/14 × multiple runs; engine 63/63 (+306 prototype-related across 53 files); regression batches baseline-diffed |
| 13 | Real user-like flows | §26 human-flow + db-persistence (author → preview → edit → AI modify → save → reload → run) |
| 14 | Extensible without redesign | four-layer model, pluginData storage (no schema migration needed for new triggers/actions), ToolDef registry + panel driven from shared enums; new trigger/action = enum + builder + panel option |

## §29 final report

### A. Reference study
- Repos: `penpot` (`common/src/app/common/types/shape/interactions.cljc`), `motion-forge-animation` (`src/model/types.ts`, spring model — code NOT reused, no license), in-repo open-pencil architecture; xstate/motion-vue/rive/lottie conceptual only.
- Lessons: interactions live on the shape as data (`trigger → action` + animation beside it); springs as normalized deterministic `f(p)` (unit-testable, no physics loop); mutations through one undoable seam; states as named visual models distinct from both.

### B. Zenuxs Design
- Model: `interactions` / `prototypeState` pluginData on nodes, `prototype` (flows) on root — versioned, valibot-validated, `.fig`-roundtrip-safe via id remap in export/import.
- Editor: Prototype section (trigger/action/destination/transition/duration/easing/direction/states/flow-start), TopBar Present toggle, undoable authoring actions.
- Runtime: deterministic `prototype/runtime.ts` (OnLoad/afterDelay/hover/press/click dispatch, crossfade/slide/spring transitions, overlays+backdrop, state visuals, cycle guards), renderer overlay path.
- AI: 9 semantic ToolDefs + intent mapping in system prompt + live-build overlay (committed `adfc8f6d`).
- Persistence: pluginData rides the existing fig/JSON payload — autosave, cloud, `.fig` export all covered; remote-id remap on roundtrip.

### C. Files changed (summary)
| Area | Files | Reason |
|---|---|---|
| Model | `packages/scene-graph/src/prototype.ts` (+index, package.json valibot) | four-layer types + schemas owned by scene-graph |
| Motion/runtime | `packages/core/src/prototype/{motion,runtime}.ts` + tests | framework-neutral pure runtime |
| Preview/authoring | `packages/core/src/editor/prototype/` (+create.ts, view/types) | editor actions assembly point |
| Renderer | `canvas/renderer/{pipeline,types}.ts`, `canvas/scene.ts` | `PrototypeRenderState` overlay path |
| AI tools | `packages/core/src/tools/prototype.ts` + `prototype/{helpers,interactions,states,flows,validate}.ts`, `registry-core.ts` | semantic ToolDefs in the core registry |
| Fig roundtrip | `io/formats/fig/export.ts`, `kiwi/fig/import.ts` | pluginData id remap across guids |
| UI | `PrototypeSection.vue`, `DesignPanel.vue`, `TopBar.vue`, i18n messages + 8 locales | panel/Present surface |
| Input | `packages/vue/src/canvas/useCanvasInput.ts` | preview pointer gating |
| Prompt | `src/app/ai/chat/system-prompt.md` | `# Prototyping` intent mapping |
| Tests | `tests/engine/{core/prototype,editor/prototype-actions,scene-graph/prototype,tools/prototype}`, `tests/e2e/prototype/*` (5 specs), `tests/helpers/prototype/ai-chat.ts` | behavior/contract coverage |
| Docs/ops | `CHANGELOG.md`, `README.md`, `vite/server.ts` (scratch watch ignore), i18n baselines | release notes + dev stability |

### D. Testing
- Unit/engine: motion/runtime/actions/schema/tools — 63/63 in the four prototype suites; 306 prototype-related across 53 files; full engine failure set baseline-identical (empty `comm` diff).
- E2E/real UI: `tests/e2e/prototype` 14/14 across 5 specs (authoring, slices incl. broken/rapid cases, mocked persistence, human-flow AI loop, real-DB persistence) — multiple consecutive runs.
- Preview/runtime: every spec asserts live `preview.drawIds`/`nodeVisuals` states, not static data.
- Database: db-persistence full chain on the live local stack (guest → POST → Mongo read-back → reload → restore → DELETE).
- AI: engine tool tests 17/17 + adapter suites + human-flow chat tests executing real tools; `@real-llm` unavailable (no key).
- Regression: route-patched batches vs stashed baseline → 0 regressions; PASS 6–10 recorded above.

### E. Bugs found (severity → fix → verification)
1. **Product: `afterDelay` delayMs resurrected** (high) — panel `patchInteraction` re-spread the original item after `setTrigger` deleted `delayMs` → full-entry replace in `commitInteractions`; caught by slices e2e, retested.
2. **Product: release outside canvas left press visuals stuck** (medium) — `previewPointerUp` early-returned on null hit → `pressedId` tracking in `actions.ts`; engine test added.
3. **Product: fig roundtrip dropped prototype ids** (high) — export/import now remap `interactions`/`prototype` ids; persistence tests 2/2 + db-persistence destination/startNodeId assertions.
4. **Product: e2e slice viewport drift / missing flow start** (test-only) — `selectViaStore` + explicit flow start; documented above.
5. Environment noise (Meta keys, LFS, fonts, snapshots, boot-401, warm-cache restore) classified §20-style — none are app defects.

### F. Failures / limitations
- No drag/swipe trigger (carousel swipe covered as click→slide-left).
- No LLM key → AI e2e uses scripted transport over real tools; `@real-llm` spec cannot run here.
- Cold-cache restore not e2e-covered; warm restore + backend read-back are.
- `CanvasHelper` Meta-key no-ops on Linux left as follow-up (documented, not Task-1 scope).
- MotionForge spring code not reused (unlicensed) — spring math written fresh from textbook formulas.

### G. Regression status
- Editor/panels/properties/layers/toolbar batches baseline-diffed → 0 Task-1 regressions (PASS 6).
- Backend/DB: autosave green; storage/workspace + recovery failures byte-identical on baseline (PASS 8).
- AI: adapter/chat/system-prompt suites green (PASS 7); console clean in every prototype run (PASS 9); tsgo/format/check:vue/check:i18n clean (PASS 10).

### H. Final acceptance
**PASS.** The running application supports the requested capability end-to-end: a designer (or the AI through the chat) can author prototype interactions, named states, and motion transitions in the editor; Present executes them (OnLoad fade, click/slide navigation, press springs, overlay slides); edits persist through autosave to the real MongoDB backend and survive reload/reopen; invalid structures are rejected without mutating the document; AI actions run through the same validation/mutation/undo/persistence path as manual edits; existing functionality shows 0 regressions against baseline. Demonstrated live on the local stack — 14/14 prototype e2e, 63/63 prototype engine tests, real DB chain verified with authenticated read-back.

## For Task 2

(to be recorded)
