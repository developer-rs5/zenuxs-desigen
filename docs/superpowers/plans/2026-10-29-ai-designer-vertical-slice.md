# AI Designer Vertical Slice Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a tested prompt-to-editable Zenuxs-backed design flow with reusable structure, a vector asset, and a playable prototype interaction.

**Architecture:** Add the missing vector creation operation to `@zenuxs/engine`, carry vector and supported prototype data through the existing Zenuxs bridge, and expose a small set of typed Zenuxs-backed AI tools for a representative design flow. Preserve the current Vue/Tauri shell and existing AI behavior outside the migrated operations; do not claim that this vertical slice completes document ownership migration or the remaining FigCraft parity backlog.

**Tech Stack:** Bun, TypeScript, Valibot, Vercel AI SDK, `@zenuxs/doc`, `@zenuxs/engine`, OpenPencil SceneGraph bridge, Vue 3, Playwright.

**Spec:** [AI Designer: Full ZenuxsDesign Workflow](../specs/2026-10-29-ai-designer-full-product-workflow-design.md)

## Global Constraints

- The target is the current OpenPencil workspace and its existing Vue/Tauri product shell, not a separate replacement application.
- Zenuxs packages are already present, but the live editor and AI currently operate on OpenPencil-owned state and tools. The implementation must therefore establish and migrate the relevant integration seam rather than assume that the Zenuxs engine is already the editor's callable mutation path.
- The canonical document and engine APIs own AI design mutations as the Zenuxs migration reaches each supported surface. The AI must not maintain a parallel authoritative document or silently commit only to a bridged copy.
- Keep product orchestration in the app AI domain and design operations in the owning public package/tool surface. Do not import workspace internals across package boundaries.
- Treat the existing OpenPencil canvas and tools as compatibility surfaces during migration. Switch each workflow only when state, selection, undo, persistence, and rendered behavior stay consistent.
- Preserve lazy credential resolution for providers. Never expose saved secrets to prompts, tools, or persistent design state.
- Bound tool steps, asset sizes, network operations, and generated output. Validate provider-owned download URLs and keep existing trust boundaries.
- Use typed runtime schemas, useful surfaced errors, deterministic document mutations where possible, and existing undo/history contracts.
- Follow `AGENTS.md`, the FigCraft parity evidence, package ownership boundaries, existing localization and UI patterns, and applicable attribution/license requirements.
- No online collaboration capability is added, and the existing product shell and user-facing behavior remain intact.

## Review Focus

- Invalid, non-finite, or underspecified vector input must fail explicitly without inserting a malformed node; pin this in Task 1's engine tests.
- AI operations targeting a missing node or prototype destination must surface an error and leave both the engine document and visible graph unchanged; pin this in Task 2's tool/bridge tests.
- Vector networks and supported navigation interactions must survive Zenuxs-to-SceneGraph application and follow-up sync without being silently erased; pin this in Task 1's bridge round-trip tests.
- A tool failure after earlier successful mutations must not report a successful design; pin the failure path and returned tool status in Task 2.
- When a requested image provider is unavailable, the AI must not claim that an image was inserted; pin the existing unavailable-tool/fallback behavior in Task 3 if image operations are advertised by the migrated flow.

---

### Task 1: Create Zenuxs vectors and preserve prototype/vector state in the bridge

**Files:**
- Modify: `packages/engine/src/cmd/core.ts`
- Modify: `packages/engine/src/tests.test.ts`
- Modify: `src/app/zenuxs-bridge.ts`
- Modify: `tests/engine/zenuxs-bridge.test.ts`

**Interfaces:**
- Consumes: `VectorNetwork` and `Node` from `@zenuxs/doc`; existing `Session.execute()` command contract; existing `EngineGraphPatch`, `sceneGraphToZenuxsDoc()`, and `applyEngineChanges()` bridge APIs.
- Produces: the registered `shape.vector` command with params `{ points: Array<[number, number]>; closed?: boolean }`; created nodes use `VectorNetwork.from_points(points, closed)` and return the normal `{ ok: true, id }` result. The bridge preserves the vector network and the navigation interactions represented by `proto.interaction.add` when applying engine changes and syncing the graph back into Zenuxs.

- [x] **Step 1: Write failing engine tests**

Add `shape_vector_creates_open_and_closed_networks` to `packages/engine/src/tests.test.ts`. Assert that open points create a vector node with the expected vertices and `n - 1` segments, that `closed: true` creates the closing segment and one region when there are at least three points, and that selection contains the created ID.

Add `shape_vector_rejects_invalid_points` and assert that empty input, fewer than two points, malformed coordinate tuples, and non-finite coordinates throw without changing node count.

- [x] **Step 2: Run focused engine tests and verify failure**

Run: `bun test packages/engine/src/tests.test.ts`

Expected: FAIL because `shape.vector` is not registered.

- [x] **Step 3: Implement and register `shape.vector`**

Implement `shape.vector` in the existing shape command family in `packages/engine/src/cmd/core.ts`. Validate the points array and each finite coordinate; reject fewer than two points, and reject a closed network with fewer than three. Insert a vector `Node` with `VectorNetwork.from_points(points, closed)` and return its ID using existing creation-command conventions.

- [x] **Step 4: Add vector/prototype bridge round-trip tests**

Add tests that execute `shape.vector` and `proto.interaction.add` through `zenuxsBridge`, apply engine changes, and assert the resulting SceneGraph vector network and interaction preserve points, closure, trigger, destination, and transition. Then call `syncToZenuxs()` on the resulting graph and assert those values remain in the Zenuxs document.

- [x] **Step 5: Implement bridge field mapping**

Extend `sceneGraphToZenuxsDoc()`, `engineNodeFields()`, and the interaction conversion path in `src/app/zenuxs-bridge.ts` to carry vector networks and the supported navigation interaction shape without changing unrelated graph fields. Do not silently drop unsupported action or transition variants; return or surface a descriptive conversion error.

- [x] **Step 6: Run focused tests**

Run: `bun test packages/engine/src/tests.test.ts tests/engine/zenuxs-bridge.test.ts`

Expected: all selected engine and bridge tests pass.

- [x] **Step 7: Commit**

```bash
git add packages/engine/src/cmd/core.ts packages/engine/src/tests.test.ts src/app/zenuxs-bridge.ts tests/engine/zenuxs-bridge.test.ts
git commit -m "feat: create Zenuxs vector nodes"
```

### Task 2: Expose bounded Zenuxs-backed AI design tools

**Files:**
- Create: `src/app/ai/tools/zenuxs-design.ts`
- Modify: `src/app/ai/tools/index.ts`
- Create: `tests/engine/zenuxs-ai-tools.test.ts`

**Interfaces:**
- Consumes: Task 1's `shape.vector` command and bridge round-trip; the app's `EditorStore`; `getZenuxsEngine()`, `zenuxsBridge`, Valibot, and the existing AI SDK `tool()`/`valibotSchema` setup.
- Produces: `createZenuxsDesignTools(store: EditorStore)` returning typed tools named `zenuxs_create_screen`, `zenuxs_create_rectangle`, `zenuxs_create_text`, `zenuxs_create_vector`, `zenuxs_set_node_properties`, `zenuxs_make_component`, and `zenuxs_add_navigation`. Each tool validates its parameters, syncs the current editor graph and selection into the Zenuxs session, executes only its declared engine command, applies the resulting engine patch to the visible graph, and records the graph patch as an undoable editor entry. Tool errors are explicit and do not produce success-shaped results.

- [x] **Step 1: Write failing tool tests**

Create tests for each tool's exact command mapping and resulting node data. Assert vector creation and component marking are visible in the graph, the property tool applies only supported visual fields, navigation points to an existing frame, selection IDs stay consistent, and one editor undo reverts each applied tool mutation.

Add invalid-parameter and missing-destination tests. Assert the tool returns a surfaced error, leaves the graph and engine document unchanged, and does not add an undo entry.

- [x] **Step 2: Run focused tests and verify failure**

Run: `bun test tests/engine/zenuxs-ai-tools.test.ts`

Expected: FAIL because the Zenuxs AI tool factory does not exist.

- [x] **Step 3: Implement the typed Zenuxs design tool factory**

Create the seven named tools in `src/app/ai/tools/zenuxs-design.ts`. Use Valibot schemas for all model-provided input; do not expose an arbitrary command-ID executor. `zenuxs_set_node_properties` accepts only the explicitly typed visual fields needed for this slice (name, dimensions/position, fills, and corner radii) and rejects unknown properties. Follow the existing plugin engine-patch flow for syncing, applying changes, layout settlement, render invalidation, and undo/redo. Preserve the active page and selection. Return a clear tool error when a command or bridge operation fails.

- [x] **Step 4: Integrate the factory into `createAITools()`**

Add the seven tool definitions to the existing tool set returned by `src/app/ai/tools/index.ts`. Keep image sourcing/generation conditional on its current verified provider availability; do not advertise image insertion as a Zenuxs-backed operation in this slice. Keep existing unrelated tools and provider credential behavior unchanged.

- [x] **Step 5: Run focused unit and bridge tests**

Run: `bun test tests/engine/zenuxs-ai-tools.test.ts tests/engine/zenuxs-bridge.test.ts`

Expected: all selected tests pass, including the failure and undo cases.

- [x] **Step 6: Commit**

```bash
git add src/app/ai/tools/zenuxs-design.ts src/app/ai/tools/index.ts tests/engine/zenuxs-ai-tools.test.ts
git commit -m "feat: expose Zenuxs design tools to AI"
```

### Task 3: Teach the AI to structure and validate the representative design

**Files:**
- Modify: `src/app/ai/chat/system-prompt.md`
- Modify: `src/app/ai/tools/index.ts`
- Modify: `src/app/ai/chat/prototype-critic.ts`
- Create: `tests/engine/app/ai/zenuxs-prototype-validation.test.ts`
- Modify: `tests/engine/zenuxs-ai-tools.test.ts`

**Interfaces:**
- Consumes: Task 2's tool names and result/error shapes; existing `createPrototypeCritic()`, layout/media critics, and AI repair transport in `src/app/ai/chat/transports.ts`.
- Produces: concise instructions to plan the requested screens/areas, build containers before their contents, promote repeated structures to components, create a vector when it fits the brief, connect a real prototype destination, and validate before claiming completion. The prototype critic validates the Zenuxs-backed navigation state produced by this slice and provides at most one localized repair instruction per run, matching the existing bounded repair policy.

- [x] **Step 1: Add failing Zenuxs prototype validation tests**

Test a valid existing destination, a missing destination, and a malformed interaction. Assert exact `{ ok, errors }` results and verify that the one repair round is consumed once and then stops.

- [x] **Step 2: Implement validation against the active Zenuxs-backed document**

Update the AI prototype validation path so it checks the Zenuxs document/graph projection created by Task 2 rather than validating only OpenPencil tool results. Reuse the existing critic interface and bounded repair contract; surface validator failures rather than treating a thrown validator as successful.

- [x] **Step 3: Update the design instructions**

Append a focused AI-design workflow section to `system-prompt.md` describing brief interpretation, a concise visible plan before mutations, brief-driven screen structure, repeated component use, vector choice, existing-node prototype destinations, and the validation/repair handoff. Preserve the existing one-root render rule, layout/containment rules, and conditional image-provider instructions.

- [x] **Step 4: Run focused unit tests**

Run: `bun test tests/engine/zenuxs-ai-tools.test.ts`

Expected: valid interactions pass; invalid interactions return clear errors and bounded repair stops after one round.

- [x] **Step 5: Commit**

```bash
git add src/app/ai/chat/system-prompt.md src/app/ai/tools/index.ts src/app/ai/chat/prototype-critic.ts tests/engine/zenuxs-ai-tools.test.ts tests/engine/app/ai/zenuxs-prototype-validation.test.ts
git commit -m "feat: validate AI-authored Zenuxs prototypes"
```

### Task 4: Verify the prompt-to-playable-design flow in the editor

**Files:**
- Create: `tests/helpers/prototype/zenuxs-ai-chat.ts`
- Create: `tests/e2e/chat/zenuxs-designer.spec.ts`
- Modify: `docs/figcraft-parity/capability-evidence.json`
- Modify: `CHANGELOG.md`

**Interfaces:**
- Consumes: Tasks 1–3's vector command, bridge conversion, AI tools, prototype validator, and existing Playwright `ChatHarness`/editor fixtures.
- Produces: a deterministic, model-independent browser integration test that submits a design prompt through the real chat UI and runs actual Zenuxs AI tool definitions to build at least two screens, a reusable component, a vector asset, and a valid navigation interaction. The test verifies visible canvas/layer results, prototype playback or its existing preview surface, a surfaced invalid-operation case, undo behavior, and follow-up editing. Capability evidence must state only what this test proves.

- [ ] **Step 1: Add a scripted transport helper**

Create a helper following `tests/helpers/prototype/ai-chat.ts`: intercept the chat transport, inspect the prompt, execute the actual `createAITools()` definitions, and return tool events/results through the production chat stream shape. The scripted plan must create two distinct frames, a repeated component, one vector asset, and an interaction whose destination is the second frame.

- [ ] **Step 2: Add a failing browser integration test**

Create an E2E test that submits a representative product-design brief, verifies the brief plan is visible before mutations, verifies both frames and the component/vector in the canvas document/layer tree, validates the interaction destination, opens the prototype player and navigates to the second screen, then performs the exact number of undo operations recorded for the generated mutations and confirms the structures are removed. Submit a follow-up prompt and assert it changes the existing design rather than creating a parallel document.

- [ ] **Step 3: Run the focused browser test and verify failure**

Run: `bunx playwright test tests/e2e/chat/zenuxs-designer.spec.ts --project=openpencil --timeout=120000`

Expected: FAIL until the scripted transport and product integration are complete.

- [ ] **Step 4: Implement only required app integration fixes**

Use the test failure to fix the specific integration gap in the planned AI tool, bridge, chat, or prototype surface. Preserve existing authentication and fixture setup; do not add a test-only production API or require a real model/provider.

- [ ] **Step 5: Run focused and adjacent checks**

Run:

```bash
bunx playwright test tests/e2e/chat/zenuxs-designer.spec.ts --project=openpencil --timeout=120000
bun test packages/engine/src/tests.test.ts tests/engine/zenuxs-bridge.test.ts tests/engine/zenuxs-ai-tools.test.ts
```

Expected: both commands pass. If the test environment cannot exercise Tauri, state that limitation; do not claim native runtime verification.

- [ ] **Step 6: Update evidence and changelog**

Update the `prototyping` and `shapes/paint/effects` evidence rows only for the specific AI-to-canvas behaviors verified by the new tests. Do not upgrade unrelated capability statuses. Add one present-tense outcome under the appropriate `Unreleased` category in `CHANGELOG.md`.

- [ ] **Step 7: Commit**

```bash
git add tests/helpers/prototype/zenuxs-ai-chat.ts tests/e2e/chat/zenuxs-designer.spec.ts docs/figcraft-parity/capability-evidence.json CHANGELOG.md
git commit -m "test: verify Zenuxs AI design flow"
```

## Explicitly deferred

- Full Zenuxs document ownership migration for all editor, history, file I/O, and automation workflows.
- Zenuxs-backed image import/generation and verified provider asset insertion. Existing image providers remain conditional; this slice uses a vector asset.
- The remaining FigCraft command and capability gaps, CLI/MCP/SDK parity, and feature-wide verification. Use `docs/figcraft-parity/command-inventory.json` and `capability-evidence.json` to scope follow-on plans.
- Whole-repository validation gates. Run focused checks for each task; broaden validation when integration results or the final review require it.
