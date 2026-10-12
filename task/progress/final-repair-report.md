# ZENUXS — FINAL CLOSURE REPAIR + REAL UI VERIFICATION REPORT

Mission: task/final-closure-repair.md · Evidence log: task/progress/final-closure-repair-progress.md

## 1. What was previously wrong
Previous report claimed `PRODUCTION READY` but:
- Its prototype "verification" was state-assertions only (`state.prototypePreview != null`, engine ticks) — exactly what mission §6/§8/§32 forbids as sufficient. **Real Play/Present UI had never been driven.**
- A user-observed concern existed: "click Play → no visible result".
- Gate count was misreported as "15/15" (actual chain = 18 checks).

## 2. What I independently reproduced (real app, real mouse, screenshots in /tmp/ui-verify)
- Present button DOES open a preview surface (state + button icon + framed start screen) — but **two real product bugs made the prototype effectively unusable**:
  - **Repro A**: after a click-navigate, state flipped to the destination screen while pixels stayed blank page-background (`245,245,245` sample points) — destination authored at world x460..820 sat off-camera (pan 620), camera never followed. After the fix, pixel proof: `30,42,73` (navy Screen A) → `40,82,49` (green Screen B).
  - **Repro B**: authored slide (3000ms) never visibly played under a real mouse — rAF sampler captured only 2 states (A, then B). Direct in-page dispatch DID animate → isolated to input layer.

## 3. Root causes discovered
1. **Camera never re-framed on navigation** (`packages/core/src/editor/prototype/actions.ts`): `startPrototypePreview` zoomToBounds the start node only; `runNavigate` changed `screenId` but nothing moved the camera → destination rendered off-screen → "runtime ticks but visual state never changes" (mission §12 FAIL class).
2. **Double pointer-up per physical click** (`previewPointerUp` idempotency): `useCanvasInput` invokes `onMouseUp()` from BOTH the `pointerup` listener (line 452) and the `mouseup` listener (line 472) → `previewPointerUp` ran twice → second `runtime.click` re-dispatched navigate → `outgoing === screenId` → `screenTransition = null` → **in-flight transition cleared instantly** (authored motion never visible; also explains "play button produced no visible result" when combined with bug 1).
3. Gate-count reporting error (15 vs 18) — report defect, not code.

## 4. Fixes implemented
1. `frameCurrentScreen()` called from `sync()`: tracks `framedScreenId`, re-frames `zoomToBounds` on runtime screen change; reset on start/stop. + engine test `navigation re-frames the camera onto the destination screen`.
2. `gestureActive` arm/drain guard: set in `previewPointerDown` (armed even on empty press), drained in `previewPointerUp`; duplicate delivery becomes a no-op. (A bad regex splice briefly corrupted the file; tsc caught it; block rewritten cleanly.)
3. Report corrections (this document).

## 5. Real UI tests performed (all with real Chromium, real mouse, screenshots)
| Test | Result |
|---|---|
| Present opens prototype (fresh + persisted profiles) | PASS (icon play→stop→play, preview state, framed screen) |
| Pixel-classify navigation before/after (navy A → green B) | PASS (`30,42,73` → `40,82,49`) |
| Real-mouse slide (3000ms authored) rAF sampler | PASS — **322 distinct intermediate states** (B: 360→0px, A: 0→−360px) |
| Mid/settled screenshots | PASS (60-slide-t250 navy → 61-slide-t750 green → 62-settled) |
| Spring visually animates (opacity crossfade) | PASS — 35 distinct states, settles on B |
| Spring parameter sensitivity (bounce 0.1 vs 0.9) | PASS — 57-state smooth curve vs 30-state overshoot (tail 855→803→760.9 oscillation) |
| AI creates prototype → Present → tap → screen2 | PASS — 9/9 (`ui-ai-present.ts`): 2 screens, BtnLogin navigate authored, rect 0→440, 3 distinct transition frames, exit→edit (AI adds fade)→replay, 0 errors |
| Interaction persists across reload; Play works after refresh | PASS (§16) |
| Multiple flows: FlowA/FlowB active-flow selection | PASS (§17 — Present starts selected flow, no stale fallback) |
| `.pen` executable round trip (write→reopen via real dialog→Present→tap) | PASS 5/5 (§18) |

## 6. Exact prototype Play/Present result
**WORKS.** Click Present → runtime opens on the flow's start screen (camera framed), button switches to stop state; tap → navigate with visible transition; exit returns to workspace; replay reopens.

## 7. Exact motion runtime result
**WORKS, visibly.** Slide: 322 unique rAF states, both screens translating (proof of visible movement). Spring: 35 unique states via opacity crossfade; bounce parameter changes the curve measurably. `set_interaction_transition` verified live.

## 8. AI → prototype → Play result
**9/9 PASS.** Real relay: AI built 2 full-screen frames + BtnLogin click→navigate (slide); Present opens Screen1_Login; real tap → Screen2_Dashboard (rect 0→440, mid-transition frame captured); exit; AI edit adds fade; replay works. Zero console/page errors.

## 9. `.pen` result
**Executable round trip PASS (5/5)**: authored graph written through app `IORegistry.writeDocument('pen')` (1120 B) → reopened through the app's real `openFileDialog` path → both screens + navigate interaction intact (same id) → Present → real tap → navigation executes. CLI cross-check: `pen → fig → pen` conversion succeeds with stable node ids. Engine: 53 pen tests + execution-on-reopened-graph test green.

## 10. Code export result
**PASS (scoped subset, genuinely usable)**: export e2e **16/16** — generated code RUNS in-page: click→setState fade animates opacity strictly between endpoints; hover works from pure CSS with NO script in bundle; skipped features (spring/drag/scroll/longPress/guard/setVariant/overlay) produce no behavior and are explicitly reported. dom-css unit 30/30.

## 11. Environment/toolchain result
- **Gate chain = 18 checks (NOT 15)** — corrected. Latest `bun run check`: **EXIT=0, all 18 green** (incl. changelog/secret/type-shapes/dupes).
- Git LFS: CI self-bootstraps (`setup-bun` `lfs: true`, ci.yml:159); local install only needed to run fixture tests locally.
- gitleaks: `check:secrets` falls back to `go run gitleaks/v8@v8.30.1` — CI has Go; no machine dependency.
- official Node: only host-local (host `/usr/bin/node` lacks TS-strip → oxlint jsPlugins/steiger fail); CI runners unaffected.
- `CHOKIDAR_USEPOLLING`: host-local workaround only (inotify budget eaten by `antigravity-ide`, 56k/65k watches). NOT baked into project config — CI/clean hosts don't need it.
- `OPENROUTER_API_KEY` (real-llm spec) + local relay: genuine secrets, documented, guards kept.

## 12. Exact automated test numbers (DEFINITIVE, this repair pass)
- `bun run check`: **EXIT=0 / 18 checks** (re-run after all edits: EXIT=0)
- Engine prototype cluster (actions, scene-graph, motion, pen, export): **97/97**
- **Full engine (definitive, quiet host): 3522 pass / 1 skip / 0 fail** (560 files, 585s, 312,797 expects)
- Earlier 5 fails during host load (Android emulator @158% CPU) = RESOURCE/LOAD FLAKE, proven: same 5 files → 26/26 isolated + 0-fail full run once emulator stopped; all were `timed out` (explicit setDefaultTimeout 30/60/180s), zero assertion failures; fixture integrity verified (PK zip)
- **Full E2E (definitive): 585 passed / 0 failed / 3 skipped** (588 tests, 34.0m; skips = WebKit-only tooltip test + 2 Linux-skipped snap-guide visuals — platform-limited by design)
- Prototype e2e: **16/16**; export e2e: **16/16**; settings e2e 14/14; chat e2e 42/42 (real-llm excluded — env key)
- Real-AI Phase-6 QA (prior): 26/26; Real-UI repair QA: AI-Present 9/9, spring/reload/flows 7/7, pen round trip 5/5
- Lint 0/0, tsc 0, format clean

## 13. Exact remaining limitations
1. Export subset: spring/drag/scroll/longPress/guard/setVariant/overlay exported as reported-unsupported (intentional per spec §10; never faked).
2. App Save-As writes `.fig` only; `.pen` write path in-app is the IORegistry/CLI (open is supported in-app). Documented, not a regression.
3. Host-local env: official Node + inotify headroom (polling workaround) needed only on this machine; recorded commands.
4. `real-llm.spec.ts` needs `OPENROUTER_API_KEY` (env blocked, by design).
5. Real-model QA depends on local relay availability (`localhost:20128`).


## Appendix A — FINAL ACCEPTANCE MATRIX (mission §31)
Legend: Code=implemented · Unit=engine tests · E2E=browser suite · RUI=real UI (screenshot/pixel) · RIX=real user interaction (mouse) · Persist=survives save/reload

| Capability | Code | Unit | E2E | REAL UI | REAL INTERACTION | Persisted | Status |
|---|---:|---:|---:|---:|---:|---:|---|
| Create prototype | yes | 97 | 16 | yes | n/a | yes | **VERIFIED** |
| Play/Present | yes | 17 | 16 | yes (icon/state/framed) | yes (click toggles) | yes | **VERIFIED** |
| Click | yes | yes | yes | yes (pixel A→B) | yes (real mouse) | yes | **VERIFIED** |
| Scroll | yes | yes | yes | engine+e2e | dispatch verified | — | VERIFIED (engine/E2E) |
| Drag | yes | yes | yes | engine+e2e | dispatch verified | — | VERIFIED (engine/E2E) |
| Long press | yes | yes | yes | engine+e2e | dispatch verified | — | VERIFIED (engine/E2E) |
| Navigation | yes | 17 | 16 | yes (322 motion states) | yes (tap→screen2) | yes (reload test) | **VERIFIED** |
| Overlay | yes | yes | 16 | e2e overlay open/close | real click e2e | yes | VERIFIED (engine/E2E) |
| State | yes | yes | 16 | e2e setState | yes | yes | VERIFIED (engine/E2E) |
| Variant | yes | yes | yes | engine | tool-verified | yes | VERIFIED (engine) |
| Fade | yes | yes | 16 | yes (AI-turn fade authored+played) | yes | yes | **VERIFIED** |
| Slide | yes | yes | 16 | yes (322 states, screenshots) | yes (real mouse) | yes | **VERIFIED** |
| Spring | yes | yes | 16 | yes (35 states crossfade) | yes; bounce 0.1 vs 0.9 curves differ | yes | **VERIFIED** |
| Keyframe | yes | yes | yes | engine tests | engine-driven ticks | yes | VERIFIED (engine) |
| Sequence | yes | yes | yes | engine tests | engine-driven ticks | yes | VERIFIED (engine) |
| Parallel | yes | yes | yes | engine tests | engine-driven ticks | yes | VERIFIED (engine) |
| AI-created prototype | yes | skills 61/61 | 42/42 | yes (9/9 QA) | yes (tap on AI-built btn) | yes | **VERIFIED** |
| AI-created motion | yes | 201 | 42/42 | yes (fade added by AI turn) | yes | yes | **VERIFIED** |
| Save/reopen | yes | pen 53+ | 16 | yes (.pen 5/5 + reload) | yes (tap after reload) | yes | **VERIFIED** |
| Undo/redo | yes | 267 editor | yes | e2e undo | e2e | yes | VERIFIED (engine/E2E) |
| `.pen` round trip | yes | 53+exec test | — | yes (5/5 write→reopen→Present→tap) | yes | yes | **VERIFIED** |
| Code export | yes | 30 | 16 (code RUNS in page) | n/a (generated code executed) | click/hover in generated page | n/a | **VERIFIED (scoped subset)** |

Notes:
- Rows marked VERIFIED (engine/E2E) are covered by deterministic engine tests + browser E2E rather than ad-hoc manual runs; every PIXEL-CRITICAL row (Present, Click, Navigation, Fade/Slide/Spring, AI-created, Save/reopen) additionally has REAL UI + real-mouse evidence per mission §4/§12/§32.
- Scroll/drag/long-press dispatch paths (`previewPointerMove/Scroll`, `beginDrag`, `scheduleLongPress`) are engine-tested; the gesture guard fix re-verified them through the full prototype e2e 16/16 (press→scale→release spring, drag consumption, long-press tests all green).

## Appendix B — verification-status distinction (mission §32)
```
Spring runtime:     IMPLEMENTED ✅ Unit ✅ E2E ✅ Real UI ✅ Real interaction ✅ Persistence ✅ Params-visible ✅
Play/Present:       IMPLEMENTED ✅ Unit ✅ E2E ✅ Real UI ✅ Real interaction ✅ Persistence ✅
Navigation (click): IMPLEMENTED ✅ Unit ✅ E2E ✅ Real UI ✅ Real interaction ✅ Persistence ✅
AI→prototype→Play:  IMPLEMENTED ✅ Unit ✅ E2E ✅ Real UI ✅ Real interaction ✅ Persistence ✅
Export (subset):    IMPLEMENTED ✅ Unit ✅ E2E ✅ generated-code-executed ✅ Unsupported-reported ✅
Scroll/Drag/LongP:  IMPLEMENTED ✅ Unit ✅ E2E ✅ Real UI ➖ (covered via same canvas input path) Real interaction ✅(e2e) Persistence ✅
```

## 14. Final status: **PRODUCTION READY**

Evidence (all re-verified in this repair pass, quiet host):
1. **Real Play/Present path works**: button → runtime opens framed on start screen; exit → workspace; replay works (real Chromium + real mouse + screenshots `/tmp/ui-verify/`).
2. **Two real product bugs found by real UI testing and fixed** (previous report missed both): camera-follow-on-navigate (`frameCurrentScreen`) and duplicate pointer-up killing in-flight transitions (`gestureActive` guard) — each with engine test + real-UI pixel/sampler proof.
3. **Real interactions work**: tap→navigate proven with 322 distinct mid-transition states; scroll/drag/long-press covered by engine + prototype e2e 16/16 through the same guarded input path.
4. **Motion visibly works**: slide (translate 360→0/0→−360, screenshots), spring (35-state opacity crossfade), **parameter change visibly changes the curve** (bounce 0.1 vs 0.9).
5. **AI-created prototype works end-to-end** (9/9): AI builds screens+interaction → workspace shows design → Present → real tap navigates → exit → AI adds motion → replay.
6. **Save/reopen preserves executable behavior**: reload test (interaction persisted, Play+tap work) and `.pen` executable round trip 5/5 (write via app adapter → reopen via real dialog → Present → tap).
7. **Automation gates clean**: `bun run check` EXIT=0 (18 checks); full engine **3522/1skip/0fail**; full E2E **585 passed/0 failed/3 platform-skips**; lint 0/0; tsc 0; format clean.
8. **Remaining limitations intentional & scoped**: export subset with typed unsupported-reporting (e2e proves reported-not-faked); app Save-As is .fig (`.pen` open in-app, write via IORegistry/CLI); host-local env (official Node, inotify headroom — polling NOT baked into project); OPENROUTER_API_KEY + local relay are genuine secrets.
9. Gate-count reporting corrected: **18 checks** (previous report's "15" was a miscount).
10. §30 dead-path sweep clean: present handler wired (3 refs), prototypePreview fully consumed (state→TopBar+renderer), nodeVisuals consumed at `scene.ts:479`, interaction write/read paths connected, zero test-only branches in product code.
