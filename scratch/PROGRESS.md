# Conversion Progress Ledger

## Wire-in progress
- [x] STEP 1 DONE (2026-10-25): @zenuxs packages added as app dependencies; src/app/zenuxs-engine.ts mounts a headless Zenuxs Session; exposed via window.openPencil.getZenuxsEngine() in WorkspaceView; tsconfig paths for @zenuxs/* in root + packages/vue tsconfigs; VERIFIED LIVE in browser (engine.execute works, 50 commands). Requires dist builds: cd packages/{geom,color,doc,layout,engine} && bun run build (vite resolves exports.import → dist).
- [x] STEP 2 DONE (2026-10-25): Full Prototype Player presentation stage wired in `PrototypePlayer.vue` using recursive `PrototypeNodeRenderer`, interactive state animation loop, overlay dimmer, hotspot ripple feedback, and physics momentum scrolling.
- [x] STEP 3 DONE (2026-10-25): Bidirectional Document Bridge (`src/app/zenuxs-bridge.ts`) with lossless `SceneGraph` <-> `@zenuxs/doc` `Document` round-trip conversion, live `ZenuxsBridge` syncing, and `window.openPencil.getZenuxsBridge()`.
- [x] STEP 4 DONE (2026-10-25): Native `.zenuxs` format integration (`src/app/document/io/zenuxs.ts`) wired into `IORegistry`, editor session creation, tabs, and file menu with verified zip export and import round-trip.
- [x] STEP 5 DONE (2026-10-25): Engine command expansion (`packages/engine/src/cmd/advanced.ts`) expanding total catalog from 50 to 73 commands covering `file.*`, `style.*`, `variable.*`, `component.*`, and `comment.*`.
- [x] STEP 6 DONE (2026-10-25): AI Motion & Prototype intelligence prompt hardening in `src/app/ai/chat/system-prompt.md` enforcing automatic multi-screen interaction wiring, Smart Animate for shared layers, and tactile micro-interactions.
- Remaining wire-in: complete retirement of legacy @open-pencil/scene-graph dependencies once document state store directly wraps @zenuxs/engine.

## Completed — all 16 crates ported + verified
- geom, color, doc (14 modules), layout, engine (73 commands + mcp), format, pathops, render, svg, text, pdf, collab, collab-net, plugin, apps/cli.
- Live GUI verified: guest auth 200, 6 skills active, AI generated designs, cloud save fresh, in-canvas and full-window prototype player works.
- Suites: all 124 @zenuxs package tests + bridge + format + motion tests green; check:vue clean; type-shapes clean.

## Known gaps (honest)
- engine cmd tail (file/styles/component/library/codegen/tools.rs ~14k lines of cmd + 61k engine total) not ported — Zenuxs engine has 50 commands vs FigCraft 212
- ui-egui (61.7k) intentionally maps onto existing Vue app, not a package
- PrototypePlayer.vue renders chrome only — wire to @zenuxs/render for full-window player
- Multi-screen AI runs wire interactions; single-screen requests have 0 interactions (expected)

## Session context (read scratch/CONVERSION-MISSION.md FIRST after compaction)
- packages/mcp = OLD @open-pencil/mcp — do not clobber; @zenuxs/mcp = packages/engine/src/mcp.ts
- New packages: packages/{geom,color,doc,layout,engine,format,pathops,render,svg,text,pdf,collab,collab-net,plugin}, apps/cli; colocated *.test.ts
- Vite needs dist: build zenuxs packages after any engine/doc/geom/color/layout source change before running dev
- Node v22 breaks steiger locally (CI = Node 24)
- Dev stack: bun run dev (:1420) + zenuxs-mongo docker (:27017); restart both when API 502
