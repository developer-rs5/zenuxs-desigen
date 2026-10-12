# FINAL CLOSURE REPAIR + REAL UI VERIFICATION — progress

Mission: task/final-closure-repair.md (source of truth)

## Phases
Phase 0 — Baseline verification (save mission, confirm prior gates)
Phase 1 — Play/Present entry-point trace + user-bug reproduction (REAL UI, screenshots)
Phase 2 — .pen executable round trip (save→reopen→Play works)
Phase 3 — Prototype→code export closure (run generated code)
Phase 4 — Environment/toolchain closure (gate count, polling, deps)
Phase 5 — Real prototype interaction QA (click/scroll/drag/longpress/nav/overlay/state)
Phase 6 — Real motion QA (fade/slide/spring/keyframe visual proof)
Phase 7 — AI → prototype → Present QA (real relay)
Phase 8 — Persistence/undo/reopen QA
Phase 9 — Full regression
Phase 10 — Final audit + acceptance matrix + report

## Log
### Phase 0 — STARTED (2026-10-08)
- Mission saved to task/final-closure-repair.md.
- Prior state inherited: bun run check EXIT=0, engine 3510/5 (5 load-flake), E2E 578/7triaged→21/21, QA 26/26 (BUT §13 present test asserted only runtime state via store.state.prototypePreview — NOT visible UI. This is exactly what mission §6-§8 forbids as sufficient. Real UI verification NOT yet done.)
- Key doubt to resolve: user observed Play/Present button click → no visible result.

### Phase 1 — Play/Present trace + user-bug reproduction: DONE, ROOT CAUSE FOUND (2026-10-08)
**Trace**: TopBar.vue:35 `togglePrototypePreview` → `store.startPrototypePreview()` (core prototype/actions.ts) → `resolveStartNode` (flow entry → explicit → activeFlow → first FRAME) → `createPrototypeRuntime` → `sync()` sets `state.prototypePreview` → renderer `pipeline.ts:331` draws only preview screens + backdrop on the CANVAS (no separate overlay/window). Pointer path: `useCanvasInput.ts:225` → `previewPointerDown/Up` → `runtime.click` → navigate action.

**Reproduction (real UI, screenshots in /tmp/ui-verify)**:
- Present DOES open: preview state true, button icon play→square, start screen framed, screenshots 12/22 confirm.
- **REAL BUG (user-observed class)**: after click-navigate, state flipped to Screen B but **pixels stayed blank page-background** (245,245,245) — Screen B at world x460..820 with camera pan=620 sat OFF-SCREEN RIGHT. `startPrototypePreview` frames start node; **navigation never re-framed camera** → "runtime ticks but visual state never changes" (mission §12 FAIL condition). Earlier apparent "Screen A still visible" was stale frame in a reused profile with duplicate nodes.
- Also confirmed earlier: blank-fill frames render invisible (my authoring bug, not product).

**FIX**: `packages/core/src/editor/prototype/actions.ts` — `frameCurrentScreen()` called from `sync()`: tracks `framedScreenId`, on runtime screen change calls `zoomToBounds` on the destination. Reset in start/stop.
**TEST**: new engine test `navigation re-frames the camera onto the destination screen` — 17/17 pass. tsc 0, lint 0/0, oxfmt clean.
**REAL UI PROOF AFTER FIX**: pixel classify before click = `30,42,73` (navy Screen A) → after click = `40,82,49` (green Screen B); screenshot `30-after-nav-FIXED.png` shows Screen B centered. Button cycle: play → stop(square) → play (probe-btn).

### Phase 4 — Environment/toolchain closure findings (2026-10-08)
- **Gate count inconsistency RESOLVED (mission §22)**: `bun run check` chains **18** commands (build:packages, lint, tsgo, typecheck:server, check:vue, check:native-test, check:i18n, check:docs, check:changelog, check:packages, check:deps, check:audit, check:secrets, check:monorepo, check:arch, test:type-shapes, test:tools, test:dupes). Previous report's "15/15" was WRONG (miscount). Correct phrasing: **18 checks, all green**.
- **Per-dependency verdict (mission §20)**:
  - Git LFS: required only for fixture tests; CI bootstraps automatically (`.github/actions/setup-bun` `lfs: true` runs `git lfs install/pull` in ci.yml:159 + heavy-tests.yml:21). Machine-local install needed only for local test runs → document, no repo change needed.
  - gitleaks: `tools/secret-scan` falls back `gitleaks` → `go run github.com/zricethezav/gitleaks/v8@v8.30.1` → CI has Go → **CI self-bootstraps, no machine dependency**. Local binary was a convenience.
  - official Node: only needed locally because host's /usr/bin/node lacks TS-strip (breaks oxlint jsPlugins + steiger); CI runners ship proper Node. Machine-local, documented.
  - CHOKIDAR_USEPOLLING: **local-only workaround** — host's inotify budget eaten by `antigravity-ide` (56k/65k watches). CI runners are clean; project itself does NOT require polling → do NOT bake into config (mission §21 satisfied by documenting).
  - OPENROUTER_API_KEY / local relay: genuine secrets — documented, not embedded. real-llm spec keeps env guard.
- Verdict: no repo/CI changes required for env closure; all gaps are host-local and documented (commands recorded in final report §11).

### Phase 5-6 — REAL interaction + motion QA: 2 REAL BUGS FOUND + FIXED (2026-10-08)
**Bug 1 — camera never followed navigation** (fixed above, Phase 1): state flipped to destination but pixels stayed blank (destination off-screen). Proof: pixel classify before=30,42,73 (navy A) → after=40,82,49 (green B).

**Bug 2 — duplicate pointer-up killed every transition** (NEW): `useCanvasInput` fires `onMouseUp` from BOTH the `pointerup` listener (via onPointerUp) and the `mouseup` listener → `previewPointerUp` ran twice per click → 2nd `runtime.click` re-dispatched navigate → `outgoing === screenId` → `screenTransition = null` → **instant swap, authored motion never visible** (mission §12 FAIL: "animation exists... runtime ticks but visual state never changes" — here runtime ran but transition was cleared). Direct-dispatch probe proved runtime motion was fine (translateX 284→114→settle); real-mouse sampling showed only 2 states → double-dispatch isolated as cause.
**FIX**: `gestureActive` arm/drain guard in `previewPointerDown/Up` (`packages/core/src/editor/prototype/actions.ts`). Rewrote the block after a bad regex splice corrupted it (tsc caught it immediately).
**VERIFIED**: tsc 0, lint 0/0, engine prototype tests **17/17**, real-UI rAF sampler under REAL mouse click: **312-322 unique intermediate states** (Screen B translateX 360→0, Screen A 0→−360 over 3s authored slide), screenshots 60-slide-t250 (navy) → 61-slide-t750 (green) → 62-settled.

### Phase 7 — AI → prototype → Present (mission §14/§26): 9/9 PASS (2026-10-08)
Real relay (ag/gemini-3.8-flash), real settings-UI config, fresh profile `/tmp/ui-ai-v1`, script `scratch/qa/ui-ai-present.ts`, shots 70-7x in /tmp/ui-verify:
1. AI created 2 full-screen frames (390×844 login + dashboard) + authored `BtnLogin` click→navigate interaction (real tools).
2. Real Present button opens runtime (`Screen1_Login`, rect 0,0,390,844).
3. Real mouse tap on BtnLogin → rect 0→440 (Screen2_Dashboard); rAF sampler: 3 distinct frames (A, A>B mid-transition, B).
4. Exit → workspace (preview null).
5. AI edit turn: "Add a fade transition..." → interaction now has `fade`.
6. Play again → runtime reopens on Screen1.
Zero page/console errors. Screenshots verified.

### Phase 8 — spring visual + reload + multi-flow: 7/7 + param sensitivity (2026-10-08)
Script `scratch/qa/ui-spring-reload.ts` (fresh profile), all real-UI:
- **§13 spring visibly animates**: 35 distinct sampled states (opacity crossfade 1000→0 head 0,1000,994.8,851.7…), settles on Screen B. NOTE: spring crossfades via opacity (render-state.ts:188-193), not translateX — first attempt sampled wrong field.
- **§13 param sensitivity** (`ui-spring-params.ts`): bounce 0.1 → 57 states, smooth rise, tail 944→956 (settling); bounce 0.9 → 30 states, fast overshoot (head 0,1.7,18.7,83.6,179.6,319.8) tail 855.6→803→760.9 (oscillating back). **Changing spring parameter visibly changes runtime behavior.** `set_interaction_transition` verified live.
- **§16 reload**: interaction persisted (pluginData survives), Play after reload opens Screen A, tap works → Screen B. Shotted.
- **§17 multi-flow**: `create_prototype_flow` flow-a/flow-b authored, `set_active_flow` switches, **Present starts FlowA→Screen A, FlowB→Screen B** — no stale fallback. 7/7 passed, 0 errors.

### Phase 2 — .pen EXECUTABLE round trip (mission §18): 5/5 PASS (2026-10-08)
Script `scratch/qa/ui-pen-roundtrip.ts` (real UI, fresh profile):
1. Author prototype via real tools (Screen A/B + click→navigate slide).
2. Write `.pen` (1120 bytes) via the app's own `IORegistry.writeDocument('pen')` — same adapter CLI convert uses; saved to /tmp/roundtrip.pen.
3. Reopen through the app's REAL `openFileDialog` path (intercepted `showOpenFilePicker` → `assertSupportedDesignFile` → `openFileInNewTab`).
4. Both screens present, navigate interaction intact (same interaction id).
5. Real Present button → Screen A; real tap → rect 0→460 (Screen B). **Saved prototype remains executable.**
Also re-verified: CLI `convert --format pen` (prior 53/53), export e2e **16/16** (generated code runs: fade mid-flight, CSS hover, unsupported reported), dom-css unit **30/30**.

### Phase 3/4 closure: DONE
- Code export: e2e 16/16 + unit 30/30 + real CLI run (prior pass). Unsupported (spring/drag/scroll/longPress/guard/setVariant/overlay) reported-not-faked (test: 'skipped features are reported and produce no behavior').
- Env: gate count corrected to **18**; LFS/gitleaks/Node/polling verdicts recorded (CI self-bootstraps LFS+Go; polling is host-local only).

### Phase 9 — regression triage (2026-10-08/09)
- `bun run check` after prototype fixes: **EXIT=0, 18/18 checks** (recorded above).
- Prototype engine cluster 97/97; prototype e2e 16/16; export e2e 16/16.
- Full engine run during host load (Android emulator `qemu-system-x86` @158% CPU + inotify exhaustion) showed **5 timeout-class fails** (material3 text/vars, component-metadata ×2, heavy fixtures hook, glyph-blob): all `timed out`, zero assertion failures. Per-file timeouts are explicit (setDefaultTimeout 30/60/180s in test files).
- **Classification = RESOURCE/LOAD FLAKE, proven**: after host reboot (emulator off, load 0.72), the exact same 5 files → **26 pass / 0 fail (194s)**. Not code, not fixtures (PK zip intact).
- Definitive full engine re-run LAUNCHED on quiet host.

### Phase 9 — DEFINITIVE ENGINE RESULT (quiet host, 2026-10-09)
`bun test tests/engine`: **3522 pass / 1 skip / 0 fail** (560 files, 585s, 312797 expects). All prior 5 fails proven load-flake (26/26 isolation + 0 fail full run once emulator stopped).

### Phase 9-10 — FINAL RESULTS (2026-10-09)
- **Full E2E (definitive)**: **585 passed / 0 failed / 3 skipped** (588, 34.0m). Skips = 1 WebKit-only + 2 Linux-skipped snap guides (platform-limited, documented).
- **Final `bun run check`**: **EXIT=0 → 18/18 checks** (after all edits incl. CHANGELOG 2 new Fixed bullets, format, lint).
- **Full engine**: 3522 pass / 1 skip / 0 fail.
- §30 dead-path sweep: CLEAN (present handler wired; prototypePreview consumed by TopBar+renderer; nodeVisuals consumed at scene.ts:479; write/read paths connected; zero test-only branches; unsupported always typed).
- Acceptance matrix (23 VERIFIED cells) + §32 status distinctions written into task/progress/final-repair-report.md.
- **FINAL STATUS: PRODUCTION READY** — full report: task/progress/final-repair-report.md.
