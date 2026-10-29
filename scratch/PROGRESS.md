# Conversion Progress Ledger

Last corrected: 2026-10-27, after measuring the packages directly. Earlier
versions of this file claimed "all 16 crates ported + verified"; that was not
true and contradicted its own gap list.

## Wire-in progress
- [x] STEP 1 (2026-10-25): `@zenuxs/*` packages added as app dependencies; `src/app/zenuxs-engine.ts` mounts a headless Zenuxs `Session` (111 registered specs, up from 50) exposed via `window.openPencil.getZenuxsEngine()`.
- [x] STEP 2 (2026-10-25): Prototype Player presentation stage in `PrototypePlayer.vue` using `PrototypeNodeRenderer`, interactive state animation, overlay dimmer, hotspot feedback, physics scrolling.
- [x] STEP 3 (2026-10-25): Bidirectional document bridge (`src/app/zenuxs-bridge.ts`) between `SceneGraph` and `@zenuxs/doc`, with `syncToZenuxs`, `syncFromZenuxs`, and `toEngineId`.
- [x] STEP 4 (2026-10-25): Native `.zenuxs` I/O (`src/app/document/io/zenuxs.ts`) wired into `IORegistry`, tabs, and the file menu.
- [x] STEP 5 (2026-10-25): Engine command expansion to 111 specs across create, edit, arrange, structure, pages, view, prototype, boards, vector, codegen, templates, file, style, variable, component, comment.
- [x] STEP 6 (2026-10-25): AI motion and prototype prompt hardening in `src/app/ai/chat/system-prompt.md`.
- [x] STEP 7 (2026-10-27): Plugin runs are synced back to the live canvas. `runPluginById` rebuilds the engine document from the on-screen graph, mirrors the canvas selection, then `commitEnginePatch` replays the engine diff onto the SceneGraph and pushes one undo entry per run. Covered by `tests/engine/zenuxs-bridge.test.ts` (created nodes, field changes, deleted subtrees, empty patch).
- [ ] Remaining wire-in: retire the OpenPencil document owner. 334 files under `src/` still import `@open-pencil/*`; 4 import `@zenuxs/*`. The SceneGraph is authoritative and the Zenuxs session is bridged.

## Measured package state (inventory and evidence refreshed 2026-10-29)
- 14 `@zenuxs/*` packages + `apps/cli`; the app depends on 9 of them.
- `bun test` across all 14 packages: 172 pass, 0 fail, 916 assertions.
- FigCraft parity inventory: 569 unique registered IDs at pinned revision `92b83521afc0fc4abbcfb0c7adb169d5674647b5`. The old 570 occurrence count included one macro documentation mention.
- Zenuxs registry: 265 rows / 243 unique IDs, 22 duplicated IDs, and 29 unmatched unique IDs. Exact-ID comparison: 214 implemented, 334 missing non-collaboration FigCraft IDs, and 21 collaboration IDs excluded (214 + 334 + 21 = 569). The previous 111/570 engine count is stale.
- Generated report: [`docs/figcraft-parity/command-inventory.json`](../docs/figcraft-parity/command-inventory.json). Source-linked feature evidence: [`docs/figcraft-parity/capability-evidence.json`](../docs/figcraft-parity/capability-evidence.json).
- Engine includes 48 `text.*` commands including `text.create`; this does not establish feature or command parity beyond the generated exact-ID inventory.
- Closest to 1:1: `geom` (7 files / 1,887 LOC), `color` (12 / 2,205), `.zenuxs` format (2 / 329).
- Partial: `doc` (18 / 4,653), `layout` (3 / 1,061), `pathops`, `engine`, `plugin`, `mcp`.
- Replaced or narrow: `render` (2 / 470), `text` (2 / 195), `svg`, `pdf`, `collab`, `collab-net`.
- `@zenuxs/layout`, `@zenuxs/text`, `@zenuxs/render`, `@zenuxs/svg`, and `@zenuxs/pdf` are not used by the running app, which uses Yoga, CanvasKit, and OpenPencil's SVG/PDF paths.
- Source size comparison: `docs/figcraft-vs-zenuxsdesign-audit.md` Part 2.

## Shipped since the audit
- Vector path healing: deleting points merges the two incident segments and solves Bézier handles so the curve still passes through the deleted point, with region-loop repair. Canvas Delete uses `removeVertices`; the engine exposes `vector.deleteHeal`.
- In-app plugin marketplace: real FigCraft WASM ABI, host-call/log/string budgets, persisted installs, per-run output and logs; catalog entries without a build state why.
- Desktop multi-window: `create_new_window` command, label validation, focus-existing behavior, external URL parsing without the `url` crate; browser fallback popup. Not compiled locally (no Cargo); type-checked frontend only.

## Known gaps (honest)
- Engine command gaps: 334 non-collaboration FigCraft IDs remain missing, including library/branch/version areas; see the generated command inventory for the exact IDs and source paths.
- Document/render/format depth: `@zenuxs/doc` is module-complete but much smaller than Rust; `.fig` read/write is OpenPencil's, not `@zenuxs/format`; CanvasKit draws the app while `@zenuxs/render` is a helper.
- Plugin runs now land on the live canvas as one undoable step per run.
- Multi-track motion timeline not built.
- Native window command requires a Cargo build to verify (CI has Rust; this machine does not).

## Next parity plans
- Base each dependency-ordered domain plan on missing and blocked rows in the checked-in command inventory and capability evidence, not estimated percentages or source size.
- Preserve the approved online-collaboration exclusion; it is recorded separately and is not a parity gap.

## Session context
- `packages/mcp` is the old OpenPencil MCP; `@zenuxs/engine/mcp` is the engine MCP surface.
- Vite and tsconfig alias the 9 app-used `@zenuxs/*` packages to source, so dev no longer needs package `dist` builds. Packages outside that list resolve through workspace exports.
- Node v22 breaks `check:arch` (steiger) and `lint` locally; CI uses Node 24.
- Dev stack: `bun run dev` (:1420) + MongoDB for the Zenuxs server (:3000).
- E2E recipe: `bunx playwright test <spec> --project=openpencil --timeout=120000` with the auth server and MongoDB running.
