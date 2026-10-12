# Testing

## Overview

| Type                  | Framework  | Command              | Location        |
| --------------------- | ---------- | -------------------- | --------------- |
| E2E visual regression | Playwright | `bun run test`       | `tests/e2e/`    |
| Figma CDP reference   | Playwright | `bun run test:figma` | `tests/figma/`  |
| Unit tests            | bun:test   | `bun run test:unit`  | `tests/engine/` |

## E2E Visual Regression

Playwright creates shapes on the canvas and compares screenshots against baseline PNGs.

```sh
bun run test              # Run tests, compare against baselines
bun run test:update       # Regenerate baseline screenshots
```

### How It Works

1. Tests load the editor in a headless browser
2. The editor signals readiness via a `data-ready` HTML attribute
3. Tests create shapes via the editor's API
4. Screenshots are taken and compared against baselines using `toMatchSnapshot`
5. Page is reused across test cases for speed (~2s total)

### No-Chrome Test Mode

The editor supports a test mode that hides UI chrome (toolbar, panels) for clean screenshot capture. Activated via URL parameter.

## Figma CDP Reference Tests

A separate Playwright project connects to Figma via Chrome DevTools Protocol to capture reference screenshots for pixel-perfect comparison.

```sh
bun run figma:debug       # Launch Figma with debugging port
bun run test:figma        # Connect to Figma, capture references
```

Requires Figma desktop app running with `--remote-debugging-port=9222`.

## Unit Tests

Engine unit tests use bun:test and target < 50ms execution:

```sh
bun run test:unit
```

Tests cover:

- Scene graph CRUD operations, parent-child relationships, z-ordering, hit testing
- **Fig-import pipeline** — node type mapping, transforms, fills/strokes/effects, gradients, images, arcs, nested hierarchies (`tests/engine/io/fig/import/legacy/*.test.ts`)
- **Layout computation** — Yoga auto-layout: direction, gap, padding, justify, align, child sizing (fixed/fill/hug), cross-axis sizing, wrap, nested layouts (`tests/engine/layout/`)

### Writing Unit Tests

```typescript
import { describe, expect, it } from 'bun:test'
import { SceneGraph } from '@open-pencil/scene-graph'

describe('SceneGraph', () => {
  it('creates and retrieves a node', () => {
    const sg = new SceneGraph()
    const node = sg.createNode('RECTANGLE', sg.root, { name: 'Test' })
    expect(sg.getNode(node.guid)).toBeDefined()
  })
})
```

## E2E Test Coverage

| Test file                        | Scope                                                           |
| -------------------------------- | --------------------------------------------------------------- |
| `tests/e2e/layers-panel.spec.ts` | Layers panel tree structure, visibility toggles, selection sync |
| `tests/e2e/visual.spec.ts`       | Visual regression screenshots for shapes and rendering          |

## Test Helpers

| File                      | Purpose                                |
| ------------------------- | -------------------------------------- |
| `tests/helpers/canvas.ts` | Canvas setup and interaction utilities |
| `tests/helpers/figma.ts`  | Figma CDP connection helpers           |

## Environment Reproducibility

A clean checkout needs only:

```sh
bun install        # workspace dependencies
git lfs pull       # tests/fixtures/*.fig are Git LFS pointers
bun run check      # the full quality gate (18 chained commands)
```

The `check` script in the root `package.json` is the single source of truth for the gate
count; read it there rather than hard-coding a number. It runs build, lint (structure +
type-aware), type checks, i18n/docs/changelog/package checks, dependency/secret/arch
checks, and the type-shape/tool/duplication tests.

### Credentials

Tests never read saved credentials. `tests/e2e/chat/real-llm.spec.ts` needs
`OPENROUTER_API_KEY` in the environment to run; keep it in your shell profile or a local
env file that stays out of version control. Without the key, exclude that file **by path**
(Playwright collects files even with `--grep-invert`, so filtering alone still throws at
collection time).

### Host-specific notes

- **File-watcher limits**: hosts with a low `max_user_watches` inotify budget (large IDEs
  can consume it) make Vite/Storybook dev servers die with `ENOSPC`. Set
  `WATCHPACK_POLLING=true CHOKIDAR_USEPOLLING=1` in the environment for `bun run dev`,
  `bun run test`, and `bun run check` instead of raising the kernel limit or editing
  project config — it is a host workaround, not a repository setting.
- **Parallel-load timeouts**: a handful of `.fig` round-trip tests parse multi-megabyte
  fixtures and time out when the machine is loaded (other VMs, emulators). They pass in
  isolation; re-run the individual files before treating a timeout as a regression.

## Performance Targets

| Metric                | Target                        |
| --------------------- | ----------------------------- |
| E2E suite total       | < 3s                          |
| Unit test suite total | < 50ms                        |
| Screenshot comparison | toMatchSnapshot (pixel-level) |
