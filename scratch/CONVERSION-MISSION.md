# FigCraft → ZenuxsDesign: Complete Conversion Mission

**READ THIS FILE FIRST after any session compaction. This is the single source of truth.**

## Mission (user's locked requirements)

1. Convert FigCraft (`/home/azaz/reference-outside-workspace/figcraft`, 238,000 LOC Rust, 16 crates + 4 apps) to TypeScript **1:1**: same file names (`lib.rs`→`lib.ts`, `*_tests.rs`→`*.test.ts`), same export names, same snake_case functions/fields, same serde JSON shapes.
2. Convert identity: `figcraft` → `zenuxs` / `ZenuxsDesign` (packages `@zenuxs/*`, format `.zenuxs`).
3. Nothing else changes. ZenuxsDesign features (AI chat, OAuth, MongoDB, landing, 6 skills) stay wired.
4. Execute ALL phases autonomously, no questions. Push to `origin/master` per phase.
5. Repo: `/home/azaz/Projects/zenuxs-desigen` (master, origin `developer-rs5/zenuxs-desigen.git`). Use `export PATH="$HOME/.bun/bin:$PATH"`.

## Conversion conventions (locked)

| Rust | TypeScript |
|---|---|
| `crates/figcraft-X/src/f.rs` | `packages/X/src/f.ts` |
| struct + serde derive | interface + factory, same fields |
| `#[serde(tag="type", rename_all="camelCase")]` | `{ type: 'camelCaseTag', ... }` union |
| `Option<T>` | `T \| null` (skip_serializing_if → omitted key) |
| `Result<T,E>` | typed `throw` (DocError etc.) or `T \| Error` |
| snake_case | **kept snake_case** |
| `imbl::OrdMap` | copy-on-write `Map` with same API (`node`, `node_mut`, `changed_ids`) |
| serde flatten (Paint.kind, Node.kind) | `serializePaint`/`omitNodeDefaults` helpers reproduce byte shape |
| kurbo | ported subset in `packages/geom/src/kurbo.ts` (DONE) |
| tiny-skia | Canvas2D/OffscreenCanvas backend (Phase: render) |
| skrifa/harfrust | fontkit/harfbuzzjs (Phase: text) |
| linesweeper | clipper-style port (Phase: pathops) |
| wasmi | WebAssembly API in Worker (Phase: plugin) |
| postcard (collab wire) | ported encoder (same bytes) |
| egui UI | web canvas UI mirroring module structure (Phase: ui) |

## Crate → package mapping (16 + 4 apps)

```
packages/geom        @zenuxs/geom        757 LOC    ✅ DONE (commit 3ad53673)
packages/color       @zenuxs/color       1,808      ✅ DONE (commit 3ad53673)
packages/doc         @zenuxs/doc        11,301      ⚙️ CORE DONE (lib/node/ids + tests). REMAINING: props.ts, text.ts, vector.ts, vector_faces.ts, vector_regions.ts, proto.ts, proto_expr.ts, proto_expr_parse.ts, styles.ts, library.ts, colors.ts, comments.ts, geometry.ts, handoff.ts + their tests
packages/layout      @zenuxs/layout      3,046      ⬜ auto-layout engine (lib.rs single file; Measure trait, hug/fill/fixed, grid, constraints)
packages/text        @zenuxs/text        5,864      ⬜ shaping via harfbuzzjs, fontdb
packages/pathops     @zenuxs/pathops     1,594      ⬜ boolean ops via clipper
packages/render      @zenuxs/render      9,125      ⬜ Canvas2D raster backend, Pixmap-shaped API, effects (blur/fx/grain/glass/backdrop)
packages/svg         @zenuxs/svg         4,642      ⬜ import/export
packages/pdf         @zenuxs/pdf         2,587      ⬜ PDF write (jsPDF or minimal writer)
packages/format      @zenuxs/format     22,526      ⬜ .zenuxs zip (document.json + images/<sha256> + thumbnail.png + versions/), .fig import (kiwi/zstd via fflate+ruzstd-wasm)
packages/engine      @zenuxs/engine     82,802      ⬜ Session, DocState, History (full-doc snapshots, limit 1000), command registry (spec()), 212 commands, tools.rs pointer plumbing, ViewState, Prefs
packages/ui          @zenuxs/ui         61,735      ⬜ web UI mirroring FigApp modules (canvas, layers, right panel, present/prototype, menus, i18n)
packages/mcp         @zenuxs/mcp         2,891      ⬜ stdio JSON-RPC MCP server (18 tools: list_commands, run_command, batch, create_node, set_properties, inspect_document, get_node, select, export, screenshot, open_file, save_file, undo, redo, pointer, key, type_text, inspect_ui)
packages/collab      @zenuxs/collab      8,025      ⬜ CRDT replica (Positions = OrdMap<NodeId,String>), postcard wire (WIRE_VERSION=1)
packages/collab-net  @zenuxs/collab-net  7,144      ⬜ WebSocket client/host
packages/plugin      @zenuxs/plugin      2,343      ⬜ WASM interpreter sandbox, fuel metering
apps/                4 apps                         ⬜ design shell, cli, server, web
```

## Source reference paths (READ-ONLY, never modify)

- `/home/azaz/reference-outside-workspace/figcraft/crates/*/src/*.rs`
- Key files already read & analyzed: geom (all), color (all), doc/src/{lib,node,ids,proto,props,text,vector,styles,library,geometry,comments,handoff}.rs, layout/lib.rs (via agent), engine/src/{lib,cmd/mod,catalog}.rs, ui-egui/src/{lib,present,proto_canvas}.rs
- Prototype engine formulas: `smart_interpolate` (name_path matching `\u{1f}`, decompose [cx,cy,θ,sx,sy], shortest-arc unwrap), `transition_frames` (MoveIn/MoveOut/Push/SlideIn/SlideOut offsets ±(1−t), from_on_top for Out), `fling_axis` (DECAY 2.5/8.0, SPRING 16.0, FLING_STOP 6.0, 240Hz substeps), `rubber_band` (limit·(1−1/(1+0.55·over/limit))), device bezels (phone w·0.06/6min, corner w·0.13; iPad 0.05/8min + r 0.04; MacBook 0.025 + bottom 0.022; Desktop 0.02 + bottom 0.08+6), 19 DEVICES list in doc/proto.rs:854-1017, overlay_rect 8 positions.

## Already ported into the EXISTING app (earlier commits, keep intact)

- `packages/scene-graph/src/prototype.ts` — extended schemas (devices 19, settings, transitions incl. smartAnimate/moveIn/moveOut/push/slideIn/slideOut, easings incl. back/spring presets/custom bezier/customSpring, actions incl. back/scrollTo/swapOverlay/openUrl/setVariableMode, overlay positions)
- `packages/core/src/prototype/{smart-animate,physics-scrolling,device,transitions,motion}.ts` — FigCraft algorithms ported (commit e03c15e9)
- `packages/core/src/canvas/overlays/prototype-connections.ts` — noodles (computeNoodleCurve, arrowheads, + handle)
- `src/components/prototype/PrototypePlayer.vue`, `src/components/properties/PrototypeDeviceSection.vue` — UI
- 63 tests passing across those.

## Work protocol (execute in order, update this file after EACH step)

1. After finishing a file/package: run its tests, then update `PROGRESS.md`, then commit `feat(zenuxs): <thing>`, push.
2. Never leave tests failing. Never modify `/home/azaz/reference-outside-workspace/**`.
3. Tests colocated `*.test.ts`; run via `bun test packages/<name>`.
4. Register each new package in root `package.json` workspaces + `bun install`.
5. Gates before commit: `bun test packages/<name>`, `bun run format`, `bun run test:type-shapes`.
6. check:arch (steiger) fails on Node v22 locally (`ERR_UNKNOWN_FILE_EXTENSION .ts`) — environment bug, skip it; CI runs Node 24.

## Phase order (remaining)

1. **doc remaining files** (props, text, vector, vector_faces, vector_regions, proto, proto_expr, proto_expr_parse, styles, library, colors, comments, geometry, handoff) — port faithfully; tests from `*_tests.rs`
2. **layout** — full port of lib.rs (Measure, clamp_size, axis_factors, set_size, layout_page, layout_up, flow_children, coherent_sizing, layout_frame, GridCell/GridGeometry/grid_place/grid_geometry, apply_constraints, scale_group_children, grid_lines, grids_shown, grid_snap_lines)
3. **pathops** — boolean ops via clipper-lib or ported linesweeper subset; brush/width profiles
4. **text** — fontdb (fontkit), shaping (harfbuzzjs), layout (paragraphs, runs, bidi via existing unicode libs)
5. **render** — Canvas2D rasterizer mirroring render API: Pixmap, draw node → paths/fills/gradients/images, effects (blur via CanvasFilter, shadows, backdrop), color profiles via @zenuxs/color
6. **svg** — import (DOM parse → doc model) and export
7. **format** — .zenuxs zip: fflate zip + document.json (serde-shape via omitNodeDefaults/serializePaint) + images/<sha256> + thumbnail.png + versions/; .fig import via @open-pencil/kiwi decoder bridge
8. **engine** — Session (docs[], active, clipboard, prefs, tool state, ui_requests, journal), DocState (doc Arc→frozen ref, selection, page, History undo/redo full-doc, saved_doc ptr-compare, revision, view, interaction, text_edit), execute(id, params) registry with `spec(id, label, params, history, run)`, `all_commands()` OnceLock, `guard::run` panic-guard equivalent (try/catch → EngineError, rollback), after_command normalize + record; port cmd groups: create, edit, lists, arrange, structure, section, layout, file, page, view, text, styles, image, variables, component, library, proto, proto_actions, props (KEYS/LAYOUT_KEYS helpers), codegen, devinspect, annotations, tools; catalog.rs MENU tree 100%
9. **ui** — web components mirroring ui-egui modules under `packages/ui/src/` (state machines + logic; rendering via DOM/Canvas); ZenuxsApp = FigApp port (run() dispatch, UiState ~120 fields, panels, present.ts full presenter with physics + device bodies)
10. **mcp, collab, collab-net, plugin**
11. **apps/** — cli (command runner), server (collab host), web (worker bootstrap), design (desktop shell wiring into existing src/)
12. **Wire-in** — replace OpenPencil packages progressively; keep AI/OAuth/MongoDB; retire replaced packages; landing stays

## Session log

- Session 1 (this): Phase-1 foundation done (geom, color, doc core) — commit 3ad53673. Prototype port earlier (e03c15e9, d8d43d44, ce2be2ba). This file created before compaction per user request.
