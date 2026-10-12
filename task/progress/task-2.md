# Task 2 — AI Design Intelligence & Skill System (progress)

Spec: `task/zenuxs-design-ai-intelligence-skills-spec.txt` (78 sections, 2608 lines).
Protocol: sequential phases, continuous testing per phase, verification gate before
final PASS. Task 1 (`task/progress/task-1.md`) is PASS — do not reopen.

## Phase plan (points → phases, executed strictly in order)

| Phase | Content | Spec sections | Status |
|---|---|---|---|
| A | Survey existing AI layer; gap analysis; this plan | §2, §72, §73 | DONE |
| B | Semantic skill types + vocabulary + error kinds | §4, §5, §63 | DONE |
| C | Skill registry: structured metadata, knowledge, deps | §7, §8, §21, §38, §57, §69 | DONE |
| D | Skill router: slash + NL, priority, dependency order | §9, §10, §11, §39, §40 | DONE |
| E | Submission integration: skill context into modelText, display strip, safe observability | §17, §19, §64 | DONE |
| F | Semantic op `create_bottom_sheet` ToolDef (compose existing actions, one undo) | §12, §13, §42, §43 | DONE |
| G | Compact system-prompt discipline section (plan/validate/no-fake) | §18, §31, §45, §77 | DONE |
| H | Eval dataset: NL prompts → expected skills/intent | §47, §48, §35 | DONE |
| I | Engine tests: registry integrity, router, eval, bottom-sheet tool | §46, §60 | DONE |
| J | E2E tests: slash, NL routing, semantic creation, undo, panel sync | §46, §60, §76 | DONE |
| K | 14 final passes + breakage testing + bug hunt + fixes + regression | §61, §62 | DONE |
| L | Final report A–H | (Task-1 style) | DONE |

## Phase A — Survey & gap analysis (DONE)

Existing (verified by reading, not assumed):

- `src/app/ai/skills/` — prompt-blob skill library (`AISkill` = promptContent),
  settings toggles, `getActiveSkillsPrompt()` concatenated into system instructions
  (`transports.ts:101`, `acp/transport.ts:148`). NOT a semantic registry (§7).
- `src/app/ai/chat/system-prompt.md` (598 lines) — static rendering/JSX rules.
- Chat UI: `ChatMessage.vue` renders reasoning + text only — **no tool-call cards**;
  `ChatTranscript.vue` shows the single Magic Box (`ChatMagicBuilding`, data-test-id
  `chat-typing-indicator`). → **§19 already satisfied**.
- `src/app/ai/chat/live-build.ts` + commit `adfc8f6d` — live building follows real
  tool operations. → **§20 already satisfied**.
- Prototype ToolDefs (`packages/core/src/tools/prototype.ts`): `create_prototype_flow`,
  `connect_screens`, `create_interaction`, `set_interaction_*`, `create_state`,
  `set_state_visual`, `validate_prototype`. Actions model includes
  `navigate | openOverlay (overlayId+backdropOpacity) | closeOverlay | setState`
  (`packages/scene-graph/src/prototype.ts`); runtime renders overlays, backdrop dim,
  closeOverlay (`packages/core/src/prototype/runtime.ts`).
- `validatePrototype` covers §31 prototype checks (missing destination/overlay/state,
  duration range, duplicate states, flow start).
- Submission builder: `src/components/chat/input/useAttachments.ts:takeSubmission()`
  — builds `modelText` (referenced-node context appended) + `displayText`. Router
  injection point.
- No slash-command handling anywhere; no intent/skill router; no dependency graph;
  no eval dataset; no semantic composite for overlays (bottom-sheet).

Gap = Phases B–L. Foundation (§72/§73: platform primitives, tools, validation)
exists from Task 1; Task 2 adds the intelligence layer above it.

## Phase B — Types & vocabulary (DONE)

- `src/app/ai/skills/semantic/types.ts` — `SKILL_CATEGORIES` (design, prototype,
  motion, state, systems, responsive), `SemanticSkill` (id, name, category,
  description, version, triggers, aliases, requires, defaults, operations,
  knowledge, validation, examples), `SkillExample`, `SKILL_ERROR_KINDS` (10 kinds
  incl. IntentError / InvalidTargetError / UnsupportedCapabilityError per §63),
  `SkillValidationIssue`, `SkillRoute`. Exported via `skills/semantic/index.ts`
  and `skills/index.ts`.

## Phase C — Registry (DONE)

- 17 skills in 5 files under `skills/semantic/skills/`: design (landing-page,
  dashboard, mobile, responsive, onboarding), prototype (navigation, overlay,
  bottom-sheet, carousel), motion (fade, slide, spring, stagger), state
  (loading, interaction), systems (design-system, accessibility).
- `registry.ts` — `SEMANTIC_SKILLS`, `getSkill`, `resolveCommand` (name → alias
  → category; `/motion` activates all 4 motion skills, §8), `skillsInCategory`,
  `registryIssues()` (unique ids/commands, semver, known requires, no cycles,
  description/knowledge/operations/examples present) → empty array = sound.
- Requires graph: onboarding→[mobile, navigation]; responsive→[mobile];
  bottom-sheet→[overlay, slide]; overlay→[navigation]; carousel→[navigation].
- Carousel knowledge honestly records no swipe trigger (§45); loading knowledge
  distinguishes state vs animation (§66).

## Phase D — Router (DONE)

- `router.ts` — `parseLeadingCommand` (`/^\s*\/([a-z0-9-]+)\b(.*)$/is`),
  token-subset NL matching (hyphen/case/order-insensitive), `routeSkills()`
  (slash + NL through one engine, §9), `compose()` (transitive `requires` then
  Kahn topological sort; explicit > registry order ties, §40),
  `buildSkillContext()` / `stripSkillContext()` around
  `SKILL_CONTEXT_MARKER`, unknown slash → `unknownCommand` (plain-text
  fallback, no injection).

## Phase E — Integration (DONE)

- `src/app/ai/chat/submission/build.ts` — `buildTextSubmission()` routes every
  text submission (composer + empty-state chips in ChatPanel), appends skill
  context after referenced-node context on `modelText`, keeps `displayText`
  raw, sets `document.documentElement.dataset.activeSkills` (skill ids only,
  §64 safe observability).
- `presentation.ts` `visibleUserMessageText` strips skill context first, then
  node context (skill block appended last).
- `useAttachments.takeSubmission` delegates to the shared builder — single
  routing entry point for all NL submissions (§9).

## Phase F — create_bottom_sheet (DONE)

- `packages/core/src/tools/prototype/sheet.ts` — `create_bottom_sheet` ToolDef:
  validates sheet/trigger/backdrop/duration (trigger ≠ sheet), builds ALL
  interactions before any write (atomic), wires opener click→openOverlay
  slide/up + backdrop, sheet click→closeOverlay slide/down, outside-tap
  closeOverlay on the screen root when its click slot is free. Idempotent
  (existing interactions reported, not duplicated). Registered in
  `PROTOTYPE_TOOLS` before `validate_prototype`.
- One AI tool call = one undo entry via `createAITools` wrapper (§43).

## Phase G — Prompt discipline (DONE)

- `system-prompt.md` — new compact `# Design intelligence` section (~5 bullets)
  before the examples: follow injected skill block + prefer semantic tools,
  verify against intent not tool success with localized repair (§31/§32/§33),
  never fabricate capability (§45), modify existing structures (§16/§44).
- Prototyping intent mapping now routes bottom sheet → `create_bottom_sheet`
  instead of hand-assembled `create_interaction` (§12/§13).
- No other prompt growth — §77 respected (Workflow + Prototyping from Task 1
  already cover plan-skeleton and MUTATE→VALIDATE).

## Phase H — Eval dataset (DONE)

- `src/app/ai/skills/semantic/eval-dataset.ts` — 26 cases: all 9 §76
  acceptance prompts verbatim, NL design/prototype/motion/state/systems
  intents, one multi-skill composition, slash category command, unknown-slash
  fallback. Expectations are semantic subsets (`expect` ⊆ ordered,
  `expectExplicit` ⊆ explicit, `forbid` ∉ ordered — §48 correctness, not mere
  tool success). `evalExpectationsResolve()` guards dataset rot;
  `evalCasePasses()` is the scorer.
- Trigger gaps found while writing the dataset and fixed:
  `prototype.overlay` += `click outside`; `prototype.navigation` +=
  `interactive prototype`.

## Phase I — Engine tests (DONE)

- `tests/engine/app/ai/semantic-skills.test.ts` — 46 pass / 0 fail: registry
  invariants, category coverage, command resolution, slash = NL engine,
  dependency order, composition, unknown command, context build/strip,
  case/hyphen insensitivity, plus eval-descriptor integrity (registry
  resolution + §76 prompt coverage) and one routed test per eval case.
- `tests/engine/app/ai/chat/submission-build.test.ts` — 5 pass / 0 fail:
  slash→modelText/displayText split, NL routing, untouched plain text,
  node-context-then-skill-context append order + strip order,
  image-attachment pass-through (§61 pass 4).
- `tests/engine/tools/prototype.test.ts` — 22 pass / 0 fail (17 existing +
  5 `create_bottom_sheet`: wiring+validate, idempotence, occupied click slot,
  invalid targets no-mutation, dismiss-only).

## Phase J — E2E tests (DONE)

- `tests/helpers/prototype/ai-chat.ts` — added
  `injectBottomSheetAIToolsTransport`: scripted model answering bottom-sheet
  prompts with the REAL `create_bottom_sheet` ToolDef through `createAITools`
  (same validation/undo/flash path as the live agent).
- `tests/e2e/chat/skills.spec.ts` — 4/4 pass:
  1. NL prompt ships `[Design skills activated…]` + `### prototype.bottom-sheet`
     etc. in the real model request (`lastChatRequest`), `dataset.activeSkills`
     lists the composed set, visible user message stays raw (§19).
  2. `/motion create a dashboard` → explicit 4 motion skills + NL dashboard
     through the same engine; raw slash text visible.
  3. Plain 'Hello there' → `activeSkills=''`, no marker (§65 simple requests).
  4. Routed bottom-sheet prompt creates opener/dismiss/outside-tap via real
     tools, panel shows the interaction, one `ControlOrMeta+z` reverts all
     three writes (single AI undo entry).
- Fixes during J: mock transport branches on whole `modelText` (skill block
  mentions "frame") → count-based turn-completion waits instead of canned
  response text; `assistantMessage()` is already `.last()` so counts must use
  the raw testid locator.

## Phase K — Passes, breakage, bugs (DONE)

§61 pass matrix (evidence):

| Pass | Scope | Evidence |
|---|---|---|
| 1 | happy-path NL prompts | eval dataset 26 cases + e2e skills 1–2 |
| 2 | ambiguous prompts | router determinism test (same input → same route, bounded set) |
| 3 | complex multi-skill | `nl-multi-checkout` (6 skills composed) |
| 4 | reference-image prompts | submission-build image pass-through test |
| 5 | existing-design modification | `create_bottom_sheet` idempotency (added=0); Task-1 human-flow modify test |
| 6 | prototype behavior | prototype tool tests 22 + e2e prototype suite |
| 7 | motion behavior | `set_interaction_transition` tests (fade/slide/spring bounds) |
| 8 | state behavior | state tool tests (create_state/set_state_visual/setState guard) |
| 9 | persistence | Task-1 `db-persistence` e2e (rerun in regression) |
| 10 | undo/redo | e2e skills #4 whole-op undo; human-flow undo |
| 11 | cancel/failure/retry | Task-1 failure/recovery e2e (rerun) |
| 12 | malformed/edge | router edge tests: empty, whitespace, '/', '/!!!', NUL, unknown slash |
| 13 | rapid repeated | routeSkills idempotence test (3 runs equal) |
| 14 | regression | full gate below |

§62 breakage: covered by full `bun run check` + `test:unit` + e2e suites
(tools registry exposure test, io/serialization suites, editor undo suites,
MCP/CLI suites, visual snapshots), stale-skill-state via e2e #3 (dataset
cleared), incorrect selection via eval `forbid` assertions, duplicate
operations via sheet idempotency.

### K.1 Gate (`bun run check`) classification

| Step | Result | Classification |
|---|---|---|
| build:packages | OK | — |
| typecheck:server | OK | — |
| check:vue | OK | — |
| check:native-test | OK | — |
| check:i18n | OK | — |
| check:docs | OK | — |
| check:changelog | OK | — |
| check:packages | OK | — |
| test:dupes | OK | — |
| lint / check:arch / tools-architecture / tools-lint | FAIL | Node 22 oxlint JS-plugin `ERR_UNKNOWN_FILE_EXTENSION .ts` — Task-1-recorded env baseline (`task/progress/task-1.md` §20) |
| check:secrets | FAIL | neither `gitleaks` nor `go` installed; no findings printed — tool absence |
| knip / expr-eval CVE / sherif @types/node | FAIL | stash-baseline byte-identical |
| tools tests (docs, i18n, navigation-benchmark, package-artifacts, package-quality, pr-review-guidance, release-packages, type-shapes, unit-tests, visual-oracles) | PASS | — |

`bunx tsgo --noEmit` = 0 errors; `bun run format` clean.

### K.2 Engine regression (§61 pass 14)

Full `bun test tests/engine`: **3145 pass / 79 fail**.
79 failures normalize to an IDENTICAL set to the Task-1 baseline
(`/tmp/fails-base.txt`, normalized `diff` → identical). Passes grew
3094 → 3145 (+51 from Task-2 tests). Zero engine regressions.

Task-2 test totals (final run): **68 pass / 0 fail** across
`semantic-skills.test.ts` (46), `submission-build.test.ts` (5),
`tools/prototype.test.ts` (22; 17 pre-existing + 5 sheet).

### K.3 E2E regression

- `tests/e2e/chat` (incl. my `skills.spec.ts`, minus @real-llm) with changes:
  **20 failed / 22 passed**.
- Stash baseline (HEAD = Task-1 state, my Task-2 changes removed):
  **38 failed**. Failure-set diff: every with-changes failure is also a
  baseline failure (no regressions); the 18 baseline-only extras are
  `Test timeout … waiting for canvas-element data-ready` during setup —
  Vite full-reload churn caused by stashing mid-run, not real failures.
- Root causes of the shared 20, all pre-existing at HEAD:
  - `composer.spec` (4): specs assert `chat-input` / `chat-send-button`
    testids that exist only in `ChatComposer.vue`, which is Storybook-only —
    `ChatPanel` mounts `ChatInput.vue` (different textarea, only
    `chat-stop-button`). Structural debt from committed chat-panel history,
    stash-proven baseline (independent stash run: 4/4 fail identically).
  - The other 16 (attachments, diagnostics, history, markdown, navigation,
    profiles, reasoning, recovery, restore): 15× setup/assertion 15s
    timeouts + a few structural assertions (`toBeDisabled`, `toHaveAttribute`,
    CSS) — all present in the baseline failure set as well.
- `tests/e2e/prototype` (db-persistence, human-flow, persistence, prototype,
  slices) + `skills.spec.ts`: **18 passed / 0 failed**, exit 0.
- Probe specs (`sendbtn-probe`, `route-probe`) created for diagnosis were
  deleted; `git status` shows none remaining.

### K.4 Bug fixes made during K

None required: no Task-2-caused failure was found in any gate step, engine
run, or e2e suite. The composer/chat failures are pre-existing at HEAD
(classified above) and outside Task-2 scope.

## Phase L — Final report (DONE)

- **A. Scope** — Spec §7 skill registry (17 skills/5 categories), §9 slash+NL
  single resolver, §10–11 composable deps with topological ordering,
  §40 priority (explicit > semantic > contextual > generic), §12–13 semantic
  `create_bottom_sheet` without removing low-level tools, §31–33 intent
  verification + localized repair (system-prompt discipline), §47–48 eval
  dataset (26 cases, §76 acceptance verbatim), §64 observable active skills,
  §61/§62 14 passes + breakage testing.
- **B. Artifacts** — `src/app/ai/skills/semantic/` (types, registry, router,
  eval-dataset, 5 skill files), `src/app/ai/chat/submission/build.ts`,
  `presentation.ts` strip, `system-prompt.md` `# Design intelligence`,
  `packages/core/src/tools/prototype/sheet.ts`, exports via
  `skills/semantic/index.ts`.
- **C. Verification** — engine 68/68 Task-2 tests; full engine 3145 pass with
  baseline-identical 79 fails; e2e skills 4/4, prototype suite 14/14,
  chat suite failure set ⊆ stash baseline (zero regressions); tsgo 0 errors;
  format clean; gate failures all classified as env/baseline with evidence.
- **D. Spec acceptance (§76)** — all 9 prompts verbatim in eval dataset with
  expected routing covered by tests; NL + slash e2e prove the marker reaches
  the real request while user-visible text stays raw.
- **E. Deliberately not done** — no parallel design model (§59): skills are
  context + routing only; no new animation/prototype primitives beyond
  `create_bottom_sheet` (low-level `create_interaction` retained); prompt
  grew by one compact section (§77); pre-existing chat composer testid debt
  left unfixed (belongs to committed chat-panel work, not Task 2).
- **F. Known limitations** — swipe/looping triggers unsupported and honestly
  recorded in skill knowledge (§45); 20 chat e2e failures + 79 engine failures
  are pre-existing baseline debt; check:secrets/lint tooling unavailable in
  this environment (Node 22 oxlint plugin, no gitleaks/go).
- **G. How to re-run** — `bun test tests/engine/app/ai tests/engine/tools/prototype.test.ts`;
  `bunx playwright test tests/e2e/chat/skills.spec.ts tests/e2e/prototype --project=openpencil`
  (needs dev stack + `OPENROUTER_API_KEY=sk-dummy`).
- **H. Verdict** — Task 2 implementation, testing, bug hunting, regression and
  verification complete. **PASS**.
