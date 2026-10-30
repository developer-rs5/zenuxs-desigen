# AI Designer: Full ZenuxsDesign Workflow

## Intent

Make ZenuxsDesign's AI a capable end-to-end design partner that uses the
product's actual design capabilities rather than producing only a static
canvas. A user should be able to describe a product or experience in natural
language and receive an editable design with clear visual direction, reusable
parts, appropriate assets, and a working motion/prototype flow.

The requested experience is "design like a real human designer": understand
the brief, make coherent design decisions, build the work in the editor, check
the result, and support iteration. This means competent, reviewable design
work; it does not claim that an AI can replace human judgment.

## Current state

- The AI chat already builds canvas content through tool calls and has
  layout, prototype, and media checks. Its system prompt documents rendering,
  layout, containment, and component conventions.
- The AI tool factory imports `@open-pencil/core/tools` and operates on an
  OpenPencil `EditorStore` and `SceneGraph`.
- Zenuxs document and engine packages expose document, component, vector,
  layout, text, prototype, template, and other operations through a separate
  session, but the live editor still uses the OpenPencil graph as its
  authoritative state.
- Image sourcing/generation and component operations already exist in the
  AI surface. Their existence does not establish that the generated result is
  consistently composed, reusable, verified, or reachable through Zenuxs
  state.

The approved FigCraft parity design remains the architecture constraint:
Zenuxs document state and `@zenuxs/engine` become authoritative through
reviewable migrations; the Vue/Tauri shell remains; online collaboration is
out of scope. The parity inventory is evidence for capability gaps, not a
claim that every capability is complete.

The target is the current OpenPencil workspace and its existing Vue/Tauri
product shell, not a separate replacement application. Zenuxs packages are
already present, but the live editor and AI currently operate on
OpenPencil-owned state and tools. The implementation must therefore establish
and migrate the relevant integration seam rather than assume that the Zenuxs
engine is already the editor's callable mutation path.

## Goals

- Let the AI interpret a brief, form a design direction, and build the result
  as editable document nodes in the current product.
- Use Zenuxs document and engine operations as the authoritative mutation,
  undo, and automation path for supported AI workflows.
- Build meaningful structure: separate screens and sections, use reusable
  components for repeated patterns, and keep decorative or one-off elements
  appropriately simple.
- Create or adapt vector assets when useful; source or generate raster images
  when they materially improve the design and the configured tools allow it.
- Create motion and prototype interactions that connect to valid document
  destinations and can be played in the existing product experience.
- Review generated work for layout/containment, visual completeness, asset
  suitability, and prototype validity; repair clear defects and report
  unresolved ones.
- Let users refine the output through follow-up prompts and direct editing.
- Expose applicable Zenuxs capabilities to AI through governed tool surfaces
  as parity work lands, without bypassing permissions, credential handling,
  resource limits, validation, or undo/history.

## Non-goals

- Replacing the Vue/Tauri application shell or recreating FigCraft's UI.
- Claiming subjective "human equivalence" or promising that every generated
  design needs no human review.
- Forcing images, animation, or componentization into every result. The brief
  and design direction determine what is useful.
- Adding online collaboration, presence, or shared-cursor behavior.
- Porting all remaining capabilities in one change. The work is phased and
  each phase must leave the app buildable and testable.
- Removing the existing OpenPencil graph bridge before equivalent UI,
  history, document I/O, and AI flows have regression coverage.

## Product behavior

1. **Understand the brief.** The AI identifies the product, audience, platform,
   key content, and desired outcome. It asks a concise clarification only when
   an unresolved decision would materially change the design; otherwise it
   states its assumptions and proceeds.
2. **Plan before building.** It establishes the visual direction and a
   lightweight screen/section/component outline, then builds those areas
   before filling them. The plan is concise and available to the user while
   the AI works.
3. **Build a coherent design.** It creates the requested screens and
   sections, uses layout primitives rather than fragile placement where
   appropriate, and organizes repeated patterns into reusable components.
   The result remains editable using the existing editor.
4. **Use assets intentionally.** It creates vector/icon assets or uses
   available image tools when they fit the visual direction. Imported or
   generated media must pass through the existing verified asset pipeline
   when that pipeline is available. If a desired tool/provider is unavailable,
   it says so and uses a suitable fallback rather than pretending the asset
   was created or verified.
5. **Add motion and prototype behavior.** It connects requested interactions,
   transitions, overlays, and states to existing document nodes. Motion should
   clarify feedback or navigation, not be added decoratively by default.
6. **Inspect and repair.** It runs applicable layout, media, and prototype
   validation, makes bounded repairs for clear failures, and leaves uncertain
   visual or product decisions for the user rather than silently making
   irreversible assumptions.
7. **Hand off for iteration.** The user can preview/play the result, inspect
   the layer/component structure, undo or revise AI work, and continue with
   follow-up prompts. The final response is brief and reports what was built
   and any remaining blockers.

The requested platform and level of detail come from the user's brief. The AI
must not assume every design is a mobile app, website, dashboard, or
multi-screen flow.

## Architecture and constraints

- The canonical document and engine APIs own AI design mutations as the
  Zenuxs migration reaches each supported surface. The AI must not maintain a
  parallel authoritative document or silently commit only to a bridged copy.
- Keep product orchestration in the app AI domain and design operations in
  the owning public package/tool surface. Do not import workspace internals
  across package boundaries.
- Treat the existing OpenPencil canvas and tools as compatibility surfaces
  during migration. Switch each workflow only when state, selection, undo,
  persistence, and rendered behavior stay consistent.
- Preserve lazy credential resolution for providers. Never expose saved
  secrets to prompts, tools, or persistent design state.
- Bound tool steps, asset sizes, network operations, and generated output.
  Validate provider-owned download URLs and keep existing trust boundaries.
- Use typed runtime schemas, useful surfaced errors, deterministic document
  mutations where possible, and existing undo/history contracts.
- Follow `AGENTS.md`, the FigCraft parity evidence, package ownership
  boundaries, existing localization and UI patterns, and applicable
  attribution/license requirements.

## Delivery approach

Deliver an integrated vertical slice first, then widen capability coverage
against the checked-in parity inventory:

1. **Representative end-to-end slice** — from the existing AI prompt flow,
   create an editable multi-screen design in Zenuxs document/engine state;
   organize repeated patterns into a reusable component; create a vector or
   use an image when the brief benefits and the relevant tool/provider is
   available; connect at least one playable prototype interaction; run
   applicable validation; and preserve visible updates, persistence,
   selection, undo, follow-up editing, and error reporting.
2. **Zenuxs AI mutation foundation** — establish the app integration seam
   needed by that slice without creating a second authoritative document.
3. **Widen structured generation, assets, vectors, prototype, motion, quality,
   and iteration** — handle more design types and capability depth using the
   same governed tool path, existing providers, critics, and player.
4. **Parity expansion** — for each remaining applicable inventory domain,
   wire and test its AI operations on supported surfaces. Update capability
   evidence as functionality is proven; do not infer completion from tool
   registration alone.

The precise package seams, command batches, and migration ordering are for
the implementation plan to resolve after this design is approved. No
wholesale graph-owner switch is implied by the first vertical slice.
The representative slice must preserve browser and Tauri support; where a
test environment cannot exercise one runtime, record that limitation instead
of claiming cross-runtime verification.

## Acceptance criteria

- A natural-language brief can produce an editable result using Zenuxs
  document/engine state for the migrated workflow, with no silent
  OpenPencil-only mutation path for that workflow.
- A design flow can contain multiple screens/sections and reusable components
  where patterns repeat; its node structure is inspectable and remains
  editable.
- Asset use is intentional. When image sourcing/generation is requested and
  configured, the result records the actual inserted asset and its source
  outcome; unavailable providers are surfaced with a usable fallback.
- A requested prototype has valid existing destinations, can be played in the
  product, and has behavior tests for its document mutations and validation.
- Applicable layout, media, and prototype checks run after generation; tests
  cover repair behavior, unresolved errors, and provider/tool-unavailable
  cases without success-shaped fallbacks.
- AI changes remain recoverable through the product's undo/history behavior,
  and follow-up prompts can modify the existing design rather than rebuilding
  an unrelated parallel document.
- Focused engine/app tests cover representative prompt-to-document,
  component/vector, asset, prototype, and repair flows. UI integration tests
  verify the visible editor and player behavior; visual tests are added for
  pixel-affecting renderer changes.
- Capability evidence distinguishes package availability, UI reachability,
  automation reachability, and verified behavior. The remaining parity rows
  are explicit rather than implied complete.
- No online collaboration capability is added, and the existing product shell
  and user-facing behavior remain intact.

## Open implementation choices

- The plan should decide the smallest supported Zenuxs AI tool surface and
  migration seam that avoids a second source of truth.
- The plan should use existing critics and tests where they establish the
  behavior, adding only validation that closes an evidenced gap.
- Visual quality evaluation must be reproducible and grounded in committed
  fixtures, screenshots, or explicit interaction assertions; subjective
  claims alone are not acceptance evidence.
