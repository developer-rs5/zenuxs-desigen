# Conversion Progress Ledger

## Wire-in progress
- [x] STEP 1 DONE (2026-10-25): @zenuxs packages added as app dependencies; src/app/zenuxs-engine.ts mounts a headless Zenuxs Session; exposed via window.openPencil.getZenuxsEngine() in WorkspaceView; tsconfig paths for @zenuxs/* in root + packages/vue tsconfigs; VERIFIED LIVE in browser (engine.execute works, 50 commands). Requires dist builds: cd packages/{geom,color,doc,layout,engine} && bun run build (vite resolves exports.import → dist).
- Remaining wire-in: step 2 = feed live document ops into the Zenuxs session (bridge adapter OpenPencil SceneGraph → @zenuxs/doc Document); step 3 = switch editor session to @zenuxs/doc model; step 4 = retire @open-pencil/*.

## Completed — all 16 crates ported + verified
- geom, color, doc (14 modules), layout, engine (core+mcp), format, pathops, render, svg, text, pdf, collab, collab-net, plugin, apps/cli — commits 3ad53673 → 48dc2b06
- Live GUI verified: guest auth 200, 6 skills active, AI generated CINEPULSE 158-node design (0 layout errors), cloud save fresh (107KB), in-canvas prototype preview works
- Fixed: springProgress export regression (1ed20dd7)
- Suites: 203 tests 0 fail + app suites green; check:vue clean incl. @zenuxs paths; type-shapes clean

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
