# FigCraft vs. ZenuxsDesign: Full Feature, Tool, Ecosystem & AI Usability Audit

> **Date:** 2026-10-29 (source-linked baseline)
> **Source References:**  
> - Reference: `/home/azaz/reference-outside-workspace/figcraft` (Rust clean-room Figma reimplementation, pinned at `92b83521afc0fc4abbcfb0c7adb169d5674647b5`, 569 unique registered command IDs)
> - Implementation: `/home/azaz/Projects/zenuxs-desigen` (Vue 3 + CanvasKit WASM + Yoga WASM + partial `@zenuxs/*` TS port + generative AI layer)
>
> **Reading this document:** Part 1 records the evidence status of Zenuxs surfaces, not a parity percentage. Package implementation, UI reachability, automation reachability, and behavior tests are distinguished in [`docs/figcraft-parity/capability-evidence.json`](figcraft-parity/capability-evidence.json). The generated [`command-inventory.json`](figcraft-parity/command-inventory.json) is authoritative for exact command counts and IDs. The running app still uses the OpenPencil editor; Zenuxs packages remain partial and are not the authoritative document runtime. Part 2's source-size figures are descriptive only and are not parity evidence. Since the first draft, vector path healing, the in-app plugin marketplace, desktop multi-window, and plugin-result sync have shipped.

---

## Part 1: Comprehensive Comparison Matrix (21 Feature Areas)

| # | Feature Area | FigCraft (Rust Reference) | ZenuxsDesign (Current Status) | Evidence status (see linked domain) | Can AI Use It? | How AI Uses It (Tool / Syntax / Command) |
|---|---|---|---|---|---|---|
| **1** | **Canvas & Navigation** | Pan, zoom (0.02×–256×), rulers, guides, layout grids, pixel grid, outline mode, zoom-to-fit, multi-window. | Pan, zoom, on-canvas rulers, guides, layout grids, pixel grid, zoom dropdown, fit selection/canvas, additional desktop windows. | `package-only` — canvas/selection | **YES** | `viewport_zoom_to_fit({})`, `view.zoomIn`, `view.zoomFit`, `describe({ depth })`. |
| **2** | **Selection & Transform** | Snapping (distance/geometry), rotate, flip H/V, resize constraints, numeric input, multi-select. | Canvas selection, marquee, bounding box handles, rotation, flip H/V, distribute spacing, numeric fields. | `package-only` — canvas/selection | **YES** | `update_node({ id, x, y, width, height, rotation })`, `transform.move`, `transform.resize`, `align.distributeH`, `object.flipH/V`. |
| **3** | **Layers & Document Hierarchy** | Pages list, layer tree, reorder, group, ungroup, frame selection, lock, hide, rename, search. | FigCraft-style left rail (56px) + split pages & layer tree, drag-reorder, rename, eye/lock toggles. | `package-only` — canvas/selection | **YES** | `object.group`, `object.ungroup`, `rename_node({ id, name })`, `set_locked`, `set_visible`, `reparent_node`. |
| **4** | **Shapes & Vector Drawing** | Rectangles, ellipses, lines, arrows, polygons, stars, Bézier Pen/Pencil, path edit, corner smoothing, Boolean ops, shape builder. | Rect, ellipse, polygon, star, line, vector network blobs, CanvasKit pen tool, Boolean Union/Subtract/Intersect/Exclude. | `package-only` — shapes/paint/effects | **YES** | JSX `<Rectangle>`, `<Ellipse>`, `<Line>`, `<Star points={5} innerRadius={0.4}>`, `boolean_union({ ids })`, `boolean_subtract({ ids })`. |
| **5** | **Paints, Colors & Fills** | Solid, linear, radial, angular, diamond gradients, image fills (fill, fit, crop, tile), multiple fills/strokes, blend modes, sRGB/Display P3. | Solid, linear/radial/angular gradients, image fills, multiple fills, all CanvasKit blend modes, culori color conversions. | `package-only` — shapes/paint/effects | **YES** | JSX props `bg="#HEX"`, `linearGradient({ ... })`, `radialGradient({ ... })`, `blendMode="multiply"`, `set_fill`, `set_image_fill`. |
| **6** | **Strokes & Borders** | Stroke weight, inside/center/outside align, caps, joins, miter limit, dashes, per-side weights, variable width profiles. | Stroke weight, color, inside/center/outside alignment, stroke dashes, per-side borders (`borderTopWeight`, etc.). | `package-only` — shapes/paint/effects | **YES** | JSX props `stroke="#HEX"`, `strokeWidth={N}`, `borderTopWeight={N}`, `set_stroke`. |
| **7** | **Effects & Shadows** | Drop shadow, inner shadow with spread, layer blur, background blur, progressive blur, glass refraction, noise/texture. | Drop shadows, inner shadows, layer blur, background blur, glass refraction effects, CanvasKit WebGL rendering. | `package-only` — shapes/paint/effects | **YES** | JSX prop `shadow="0 8 24 #00000033"`, `blur={N}`, `dropShadow({ ... })`, `layerBlur({ ... })`. |
| **8** | **Frames, Groups, Sections & Masks** | Clipping frames, auto-layout frames, sections, alpha masks, vector masks, convert between group/frame/section. | Clipping frames, auto-layout frames, sections, mask flag (`is_mask`), convertToGroup/Frame/Section commands. | `package-only` — shapes/paint/effects | **YES** | JSX `<Frame overflow="hidden">`, `<Section>`, `<Group>`, `object.mask`, `object.convertToFrame`, `object.convertToSection`. |
| **9** | **Auto-Layout & Grids** | Horizontal/vertical auto layout, wrap, gap, padding, hug/fill/fixed, min/max dimensions, CSS Grid tracks (`fr`, fixed, hug). | Yoga WASM auto-layout: flex row/col, gap, padding, wrap, fill/hug/fixed sizing, min/max, 2-column/multi-column CSS Grid. | `automation-wired` — layout/text | **YES** | `<Frame flex="col\|row" gap={16} p={24} w="fill" h="hug">`, `columns="1fr 1fr"`, `items="center"`, `justify="between"`. |
| **10** | **Typography & Text** | Text editing on canvas, font families, mixed text styles, line height, letter/paragraph spacing, OpenType, variable fonts, RTL. | Text nodes, Google Fonts auto-loader, CanvasKit text shaping, fontSize, fontWeight, lineHeight, letterSpacing, textAlign, `dir="rtl"`. | `automation-wired` — layout/text | **YES** | `<Text size={24} weight="bold" color="#FFF" lineHeight={32} font="Inter" dir="rtl">`. |
| **11** | **Components & Variants** | Main components, instances, component sets, variants (`Category/Value`), property definitions, instance swap, overrides. | SceneGraph Component (`#9747ff`), Instance nodes, InstanceOverrideState (`self` and `descendants`), variant combiner. | `automation-wired` — components/variables | **YES** | `create_component({ id })`, `combine_as_variants({ ids })`, `create_instance({ component_id, x, y })`, `get_components({})`. |
| **12** | **Styles & Design Tokens (Variables)** | Color/Text/Effect styles; Variables (`COLOR`, `FLOAT`, `STRING`, `BOOLEAN`); collections, Light/Dark modes, aliases, scopes, bindings. | Variable collections, Color/Float/String/Boolean variables, variable bindings to fills, strokes, padding, gaps, corner radius, text. | `automation-wired` — components/variables | **YES** | `create_collection({ name })`, `create_variable({ collection_id, name, type, value })`, `bind_variable({ node_id, field, variable_id })`. |
| **13** | **Prototyping & Interactions** | Triggers (`onClick`, `onHover`, `onPress`, `onDrag`, `afterDelay`), actions (`navigate`, `overlay`, `setVariable`), Smart Animate, device frames. | Semantic prototype engine: `create_interaction`, `connect_screens`, `create_bottom_sheet`, `create_state`, `smartAnimate`, physical spring transitions. | `automation-wired` — prototyping | **YES** | `connect_screens({ from_id, to_id, transition: "smartAnimate" })`, `create_interaction`, `create_bottom_sheet`, `validate_prototype`. |
| **14** | **Mobile Device Templates** | Device frames in Presentation View (iPhone 16, MacBook, etc.) with bezel, dynamic island, home bar. | Permanent iPhone 16 Pro device chassis (`426×886`) on canvas & in prototype player with buttons, status bar, dynamic island, home bar. | `automation-wired` — prototyping | **YES** | Mandatory mobile template instruction in system prompt + `src/app/ai/templates/mobile-device.ts`. |
| **15** | **Dev Mode & Code Handoff** | Inspect measurements, redlines, code generation (CSS, HTML, React, Leptos, SwiftUI, Compose), annotations. | Inspect tab in Right Panel: CSS/Tailwind code gen, measurements, redlines, `design_to_tokens`, annotations commands. | `automation-wired` — boards/templates/handoff | **YES** | `design_to_tokens({ format: "tailwind"\|"css"\|"json" })`, `dev.inspect`, `dev.code.css`, `dev.code.tailwind`, `dev.code.react`. |
| **16** | **Assets & File Import/Export** | SVG import/export, PNG/JPG/WebP/PDF export (1x, 2x, 3x), `.figcraft` zip, experimental `.fig` reader/writer. | SVG import/export, PNG/PDF export, native `.zenuxs` zip archive (`document.json` + `images/` + `thumbnail.png`), Figma `.fig` import. | `ui-wired` — formats/import-export | **YES** | `export_image({ node_id, format: "png"\|"svg"\|"pdf", scale: 1\|2\|3 })`, `vector.export`. |
| **17** | **Whiteboard & Boards Mode** | No dedicated registered board-command family; the FIG importer maps unsupported sticky-note/connector layers to stand-ins. | Zenuxs adds `board.sticky.create`, `board.connector.create`, `board.timer`, and `board.vote.cast/tally` commands in `packages/engine/src/cmd/boards.ts`; no Zenuxs board UI is wired. | `automation-wired` — boards/templates/handoff | **YES** | `board.sticky.create({ text, color, x, y })`, `board.connector.create({ from, to })`, or JSX `<Frame name="Sticky" ...>`. |
| **18** | **Starter Templates** | 8 built-in templates: Mobile App, Landing Page, Dashboard, Design System, Wireframe, Slides, Social, Icon Set. | `@zenuxs/engine/src/cmd/templates.ts`: `template.list`, `template.create` supporting all 8 starter templates. | `automation-wired` — boards/templates/handoff | **YES** | `template.list({})`, `template.create({ id: "mobile-app" \| "landing-page" \| "dashboard" \| ... })`. |
| **19** | **WASM Sandboxed Plugins** | Sandboxed WASM plugin runtime (`wasmi`), memory caps, fuel metering, host calls, plugin UI panels. | `@zenuxs/plugin`: sandboxed WebAssembly runtime (`runPlugin`) implementing the FigCraft ABI (`figcraft_run`, `figcraft` host imports, reply buffer), manifest validation, host-call/log/string budgets, and an in-app marketplace that installs, runs, and reports output; `ui_show` and `widget_render` replies are accepted but panels are not rendered. | `ui-wired` — plugins | **PARTIAL** (Host/Developer feature). | Install from the Plugins rail, then `runPlugin(wasmBytes, host)`. |
| **20** | **Collaboration & Live Sessions** | WebSocket live sessions: shared cursors, selections, cursor chat, spotlight, follow mode. | WebRTC peer-to-peer (Trystero) + Yjs document CRDT: live cursors, remote selections, presence avatar stack, room share URLs. | **EXCLUDED** from FigCraft parity; not a gap. | **NO** (Human multiplayer). | Handled in app UI via `src/app/collab/`; excluded by approved scope. |
| **21** | **Generative AI & Image Sourcing** | No generative AI product layer; FigCraft exposes its registered command surface. | **ZenuxsDesign-specific**: Tool-loop AI agent, Vision image verification (`source_image`), AI image generation, default design skills, auto-repair critic. | `automation-wired` — CLI/MCP/SDK/AI; current AI operations use OpenPencil FigmaAPI. | **YES** (Core Driver) | Full conversational agent driving the canvas with 50-step budget. |

---

## Part 2: Detailed Audit of What FigCraft Had & What Is Pending in ZenuxsDesign

### 1. Engine & Command Breadth (Rust vs. TypeScript)
- **FigCraft**: 569 unique registered command IDs at pinned revision `92b83521afc0fc4abbcfb0c7adb169d5674647b5`. The old 570 count was an occurrence count that included a macro documentation mention in addition to the registered IDs.
- **ZenuxsDesign**: the current registry returns 265 rows / 243 unique IDs, including 22 duplicated IDs and 29 unmatched unique IDs. Exact-ID comparison reports 214 implemented, 334 missing non-collaboration FigCraft IDs, and 21 collaboration IDs excluded (214 + 334 + 21 = 569). The previous 111/570 engine statement is stale. See [`command-inventory.json`](figcraft-parity/command-inventory.json) and [`capability-evidence.json`](figcraft-parity/capability-evidence.json).
- **Closed since the first draft**: deleting vector points now heals the curve instead of breaking the path. Each point that joined two segments leaves one merged segment whose Bézier handles are solved so the curve still passes through it; region loops are re-indexed and repaired. The same operation backs the canvas Delete action (`removeVertices`) and `vector.deleteHeal`.
- **Still pending**:
  - 334 non-collaboration command IDs, including library/branch/version areas of `crates/engine/src/`.
  - Fine-grained pointer commands (`pointer.down`, `pointer.move`, `pointer.up`): gestures are driven by the UI rather than headless engine coordinates.
  - Clipper-grade path clipping from `crates/pathops`; the port covers boolean ops and stroke outlining without reproducing the Rust clipping engine.

### 2. Rust-to-TypeScript Source-Size Context (Not Parity Evidence)
Source size counts every `.ts`/`.rs` file under each crate's `src/`, including tests. It describes repository contents only; it does not measure functional coverage or parity. Use the source-linked capability evidence and generated command inventory for status.

| FigCraft Crate | ZenuxsDesign Equivalent | TS Files / LOC | Rust Files / LOC | Scope and integration note (not parity status) |
|---|---|---|---|---|
| `crates/geom` | `@zenuxs/geom` | 7 / 1,887 | 4 / 757 | Geometry primitives include points, rects, affine transforms, Bézier paths, radii, and smooth corners. |
| `crates/color` | `@zenuxs/color` | 12 / 2,205 | 10 / 1,808 | Color package includes color spaces, paints, gradients, patterns, blend modes, named colors, and ICC profiles. |
| `crates/doc` | `@zenuxs/doc` | 18 / 4,653 | 33 / 11,301 | Document modules include nodes, geometry, vectors, text, prototypes, libraries, styles, and handoff. |
| `crates/layout` | `@zenuxs/layout` | 3 / 1,061 | 6 / 3,046 | Flex/grid, hug/fill/fixed sizing, min/max, constraints, and grid lines; the running app uses Yoga (`@open-pencil/yoga-layout`). |
| `crates/text` | `@zenuxs/text` | 2 / 195 | 19 / 5,785 | Line wrapping and measurement use an injected shaper; the running app shapes text with CanvasKit. |
| `crates/pathops` | `@zenuxs/pathops` | 2 / 409 | 8 / 1,594 | Boolean operations, stroke outlining, and Bézier handle healing; Clipper-grade clipping is not reproduced. |
| `crates/render` | `@zenuxs/render` | 2 / 470 | 40 / 9,125 | Canvas2D paint/effect helper and path extraction; the app renderer is CanvasKit/Skia in `@open-pencil/core`. |
| `crates/svg` | `@zenuxs/svg` | 2 / 260 | 19 / 4,208 | Node-to-SVG output and basic importer used by `@zenuxs/pdf`; app SVG flows use OpenPencil. |
| `crates/pdf` | `@zenuxs/pdf` | 2 / 207 | 12 / 2,527 | Frame-to-PDF export with a raster fallback; not used by the running app. |
| `crates/format` | `@zenuxs/format` | 2 / 329 | 50 / 22,407 | `.zenuxs` archive round-trip; `.fig` read/write lives in `@open-pencil/fig` and `@open-pencil/kiwi`. |
| `crates/engine` | `@zenuxs/engine` | 14 / 3,151 | 267 / 82,263 | 265 registry rows / 243 unique IDs; 214 exact-ID matches and 334 missing non-collaboration IDs. |
| `crates/plugin` | `@zenuxs/plugin` | 2 / 522 | 9 / 2,343 | FigCraft ABI, manifest validation, host functions, call/log/string budgets, and app marketplace; widget/panel rendering and bundle loading remain incomplete. |
| `crates/collab` | `@zenuxs/collab` | 2 / 241 | 28 / 8,025 | Collaboration is explicitly excluded from parity; shipped app stack uses Yjs + Trystero under `src/app/collab/`. |
| `crates/collab-net` | `@zenuxs/collab-net` | 2 / 216 | 28 / 7,144 | Collaboration networking is explicitly excluded from parity. |
| `crates/mcp` | `@zenuxs/engine` (`mcp.ts`) | 1 / 170 | 8 / 1,774 | Engine MCP helper exposes selected commands; the app's existing MCP package is OpenPencil-owned. |
| `crates/ui-egui` | Vue 3 app (`src/`) | — | — | Architectural divergence: Rust `egui` is replaced by Vue 3 + Tailwind 4 + Reka UI for browser and Tauri. |

The FigCraft apps (`apps/figcraft`, `apps/figcraft-cli`, 12,129 Rust LOC) map onto the Vue app and the OpenPencil CLI, not a line-for-line port.

### 3. Designer Project Management Options (What Designer Can Do)
In FigCraft / ZenuxsDesign, a designer manages projects across these dimensions:
1. **Multi-Page Hierarchy**: Divide project into "Cover", "Flows", "Screens", "Design System", "Archive".
2. **Design Tokens / Variables Library**: Centralized palette and spacing tokens that toggle between Light Mode and Dark Mode with one click.
3. **Component Architecture**: Atomic master components (Buttons, Inputs, Cards) with variant properties (`Size=SM|MD|LG`, `State=Default|Hover|Pressed`).
4. **Interactive Prototyping**: Connect screens with click/drag triggers, smart-animate overlays, bottom-sheets, and test them live in presentation view inside realistic phone chassis.
5. **Developer Handoff**: Dedicated Inspect panel generating production-ready CSS, Tailwind, or React JSX with token variables preserved.

---

## Part 3: Exact Guide — How AI Uses Every Feature in ZenuxsDesign

### 1. Layout & Structure (Auto-Layout, Flex & Grid)
AI uses the `render` tool with JSX syntax:
```jsx
// Horizontal Auto-Layout Row with Gap and Padding
<Frame name="NavBar" flex="row" justify="between" items="center" w="fill" h={64} px={24} bg="#111315">
  <Text size={18} weight="bold" color="#FFFFFF">AppName</Text>
  <Frame flex="row" gap={12} items="center">
    <Icon name="solar:bell-bold" size={20} color="#FFFFFF" />
    <Icon name="solar:settings-bold" size={20} color="#FFFFFF" />
  </Frame>
</Frame>

// CSS Grid Layout
<Frame name="DashboardGrid" grid columns="1fr 1fr" columnGap={16} rowGap={16} w="fill">
  <Frame name="MetricCard1" flex="col" p={16} rounded={12} bg="#181A20" />
  <Frame name="MetricCard2" flex="col" p={16} rounded={12} bg="#181A20" />
</Frame>
```

### 2. Design Tokens & Variables (Light/Dark Modes)
AI creates and binds tokens using semantic variable tools:
```json
// 1. Create a Token Collection
create_collection({ "name": "Brand Tokens" })

// 2. Create Variables
create_variable({ "collection_id": "col_1", "name": "color/primary", "type": "COLOR", "value": "#02DA96" })
create_variable({ "collection_id": "col_1", "name": "spacing/card-padding", "type": "FLOAT", "value": "16" })

// 3. Bind Variable to a Node
bind_variable({ "node_id": "0:45", "field": "fills/0/color", "variable_id": "var_1" })
bind_variable({ "node_id": "0:45", "field": "paddingLeft", "variable_id": "var_2" })
```

### 3. Components & Variants
AI builds master components and variants:
```json
// 1. Render base variant button frames via render tool (Button/Primary, Button/Secondary)
// 2. Convert to Master Component
create_component({ "id": "0:120" })
create_component({ "id": "0:121" })

// 3. Combine into a Component Set with Variant Properties
combine_as_variants({ "ids": ["0:120", "0:121"] })

// 4. Create Live Instance on a Screen
create_instance({ "component_id": "0:120", "x": 100, "y": 200 })
```

### 4. Interactive Prototyping & Motion
AI wires screen flows, modals, and micro-interactions:
```json
// Wire Screen Navigation with Smart Animate
connect_screens({
  "from_id": "0:35",
  "to_id": "0:78",
  "transition": "smartAnimate",
  "duration_ms": 300
})

// Wire Bottom Sheet Slide-Up Modal
create_bottom_sheet({
  "sheet_id": "0:92",
  "trigger_node_id": "0:44"
})

// Button Pressed Micro-Interaction
create_state({ "node_id": "0:44", "name": "pressed" })
set_state_visual({ "node_id": "0:44", "state": "pressed", "visual": { "scale": 0.97 } })

// Validate Prototype (Autonomous Critic Gate)
validate_prototype({})
```

### 5. Permanent Mobile Device Template (iPhone 16 Pro)
Whenever generating mobile screens, AI wraps screens inside the device chassis:
```jsx
<Frame name="iPhone 16 Pro — Onboarding" w={426} h={886} rounded={54} bg="#18191D" stroke="#32343C" strokeWidth={2} flex="col" items="center" justify="center" p={16} shadow="0 28 64 #00000077">
  {/* Hardware Buttons */}
  <Rectangle x={-2} y={120} w={3} h={28} rounded={2} bg="#2E3038" />
  <Rectangle x={-2} y={164} w={3} h={50} rounded={2} bg="#2E3038" />
  <Rectangle x={-2} y={226} w={3} h={50} rounded={2} bg="#2E3038" />
  <Rectangle x={425} y={174} w={3} h={68} rounded={2} bg="#2E3038" />

  {/* Screen Viewport */}
  <Frame name="ScreenViewport" w={393} h={852} rounded={44} bg="#0B0D11" overflow="hidden" flex="col">
    {/* Status Bar + Dynamic Island */}
    <Frame name="StatusBar" w="fill" h={54} flex="row" justify="between" items="center" px={24} pt={6}>
      <Text size={15} weight="bold" color="#FFFFFF">9:41</Text>
      <Frame name="DynamicIsland" w={122} h={35} rounded={18} bg="#000000" flex="row" justify="end" items="center" pr={11}>
        <Frame name="Camera" w={11} h={11} rounded={6} bg="#111118" />
      </Frame>
      <Frame name="SystemStatus" flex="row" gap={6} items="center">
        <Icon name="solar:cell-signal-full-bold" size={16} color="#FFFFFF" />
        <Icon name="solar:wifi-bold" size={16} color="#FFFFFF" />
        <Icon name="solar:battery-charge-bold" size={20} color="#FFFFFF" />
      </Frame>
    </Frame>

    {/* App Content */}
    <Frame name="AppContent" flex="col" w="fill" grow={1} overflow="hidden">
      {/* Real Screen Content Here */}
    </Frame>

    {/* Home Indicator */}
    <Frame name="HomeIndicator" w="fill" h={34} flex="row" justify="center" items="center" pb={8}>
      <Rectangle w={140} h={5} rounded={3} bg="#FFFFFF" opacity={0.8} />
    </Frame>
  </Frame>
</Frame>
```

### 6. Vector & Boolean Shapes
AI creates custom icons or compound shapes:
```json
boolean_union({ "ids": ["0:14", "0:15"] })
boolean_subtract({ "ids": ["0:16", "0:17"] })
```

### 7. Verified Image Sourcing & AI Generation
AI sources photos or generates original vector art/bitmaps:
```json
// Verified Library Photo
source_image({
  "requests": [
    { "id": "0:25", "subject": "modern architectural coffee shop", "style": "photo", "orientation": "landscape" }
  ]
})

// Original AI Image Generation
generate_image({
  "requests": [
    { "id": "0:38", "prompt": "3d metallic geometric sphere abstract, dark background, cyan accent" }
  ]
})
```

### 8. Whiteboard & Brainstorming (Boards Mode)
AI renders sticky notes and flowchart connectors:
```json
board.sticky.create({ "text": "Launch Campaign Q4", "color": "yellow", "x": 100, "y": 100 })
board.connector.create({ "from": 12, "to": 15 })
```

### 9. Starter Templates
AI or user can spin up complete baseline documents:
```json
template.create({ "id": "mobile-app" })     // 4 screens + wired prototype flow
template.create({ "id": "landing-page" })   // Complete responsive 1440w landing page
template.create({ "id": "dashboard" })      // Analytics grid + charts + table
template.create({ "id": "design-system" })  // Color tokens, typography, buttons, inputs
```

### 10. Developer Handoff
AI exports tokens and code:
```json
design_to_tokens({ "format": "tailwind" })
export_image({ "node_id": "0:1", "format": "png", "scale": 2 })
```

---

## Part 4: Conclusion & Next Steps
1. **Measured status, not a parity score**: the inventory reports 214 exact-ID matches, 334 missing non-collaboration FigCraft IDs, 21 explicit collaboration exclusions, 22 duplicate Zenuxs IDs, and 29 unmatched unique Zenuxs IDs. The canvas, scene graph, and renderer still run on OpenPencil packages. Part 1 links each domain to source evidence and reports no overall parity percentage.
2. **AI is the differentiator**: FigCraft had no generative AI. The tool-loop agent, design skills, image sourcing, and vision verification are original work in this project, not part of the port.
3. **Closed since the first draft**: vector path healing (canvas Delete and `vector.deleteHeal`), the in-app plugin marketplace, and desktop multi-window.
4. **Still open**:
   - Migrate the running app off `@open-pencil/*` (334 files under `src/` import it). The SceneGraph is still the document owner; `@zenuxs/engine` is bridged, not authoritative.
   - Remaining engine command specs (~459) and deeper doc/render/format coverage if full command and file-format parity is the goal.
   - Plugin host commands mutate the engine session, but the result is not yet synced back to the live canvas.
   - Multi-track After Effects motion timeline (neither Figma nor FigCraft has it; both use Smart Animate and physics springs).
