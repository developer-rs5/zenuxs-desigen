/**
 * Plugin directory and installed-plugin state.
 *
 * A directory entry is only runnable when it ships a real artifact: the
 * sandbox self-test runs through the `@zenuxs/plugin` WASM runtime, and the
 * rest say why they cannot run instead of pretending to. Installation state is
 * persisted locally; manifests are validated with the package parser.
 */

import { useLocalStorage } from '@vueuse/core'
import { parseManifest, runPlugin, type PluginManifest } from '@zenuxs/plugin'
import { computed, ref } from 'vue'

import { getActiveEditorStoreOrNull, type EditorStore } from '@/app/editor/active-store'
import { reapplyEnginePatch, revertEnginePatch, zenuxsBridge } from '@/app/zenuxs-bridge'
import { getZenuxsEngine } from '@/app/zenuxs-engine'

export type PluginCategory = 'accessibility' | 'design-system' | 'layout' | 'assets' | 'utility'

/**
 * What "Run" does for an entry. `wasm` entries carry a real module; everything
 * else is catalog-only until a build is published.
 */
export type PluginRuntime =
  | { kind: 'wasm'; module: string }
  | { kind: 'unavailable'; reason: string }

export interface DirectoryPlugin {
  id: string
  name: string
  version: string
  author: string
  description: string
  category: PluginCategory
  permissions: string[]
  downloads: string
  rating: number
  runtime: PluginRuntime
}

export interface PluginRunSummary {
  plugin: string
  output: string | null
  logs: string[]
  calls: number
}

/**
 * A tiny module (log "hello", set the output to `{"ok":true}`) that proves the
 * sandbox, the host bridge, and the fuel meter work on this machine.
 */
const SANDBOX_SELF_TEST_MODULE =
  'AGFzbQEAAAABCwJgAn9/AGABfwF/AiYCCGZpZ2NyYWZ0A2xvZwAACGZpZ2NyYWZ0CnNldF9vdXRwdXQAAAMCAQEFAwEAAQcZAgZtZW1vcnkCAAxmaWdjcmFmdF9ydW4AAgoSARAAQQBBBRAAQRBBCxABQQALCxsCAEEACwVoZWxsbwBBEAsLeyJvayI6dHJ1ZX0='

const CATALOG: DirectoryPlugin[] = [
  {
    id: 'sandbox-self-test',
    name: 'WASM Sandbox Self-Test',
    version: '1.0.0',
    author: 'Zenuxs Core',
    description:
      'Runs a bundled WASM module through the plugin sandbox and reports its logs, output, and host calls.',
    category: 'utility',
    permissions: ['plugin:run'],
    downloads: 'Bundled',
    rating: 5,
    runtime: { kind: 'wasm', module: SANDBOX_SELF_TEST_MODULE }
  },
  {
    id: 'wcag-contrast-checker',
    name: 'Color Contrast & A11y',
    version: '1.2.0',
    author: 'Zenuxs Core',
    description:
      'Calculates WCAG 2.1 AA/AAA contrast ratios for text and background layers with instant suggestions.',
    category: 'accessibility',
    permissions: ['selection:read', 'color:read'],
    downloads: '14.2k',
    rating: 4.9,
    runtime: {
      kind: 'unavailable',
      reason: 'No signed build is published yet. The catalog entry describes the planned plugin.'
    }
  },
  {
    id: 'layout-padding-linter',
    name: 'Layout & Padding Linter',
    version: '2.0.1',
    author: 'Zenuxs Core',
    description:
      'Scans all frames for broken auto-layout, negative margins, and unaligned 8px grid spacing.',
    category: 'layout',
    permissions: ['document:read'],
    downloads: '9.8k',
    rating: 4.8,
    runtime: {
      kind: 'unavailable',
      reason:
        'No signed build is published yet. The editor runs its own layout critic while you design.'
    }
  },
  {
    id: 'figma-token-exporter',
    name: 'Design Tokens to Tailwind',
    version: '1.0.4',
    author: 'Community',
    description:
      'Exports local variables and color styles into tailwind.config.js theme extension objects.',
    category: 'design-system',
    permissions: ['variables:read', 'export:write'],
    downloads: '22.5k',
    rating: 4.9,
    runtime: {
      kind: 'unavailable',
      reason:
        'No signed build is published yet. Use the AI "design_to_tokens" tool in the meantime.'
    }
  },
  {
    id: 'vector-path-healer',
    name: 'Vector Path Healer',
    version: '1.1.0',
    author: 'Zenuxs Core',
    description:
      'Deletes redundant anchor points and heals Bézier handles while preserving the curve trajectory.',
    category: 'utility',
    permissions: ['vector:edit'],
    downloads: '6.3k',
    rating: 4.7,
    runtime: {
      kind: 'unavailable',
      reason:
        'Built into the editor: in vector edit mode select points and press Delete to heal them.'
    }
  },
  {
    id: 'product-copy-generator',
    name: 'Realistic UI Content',
    version: '1.3.0',
    author: 'Zenuxs AI',
    description:
      'Populates selected cards and lists with believable user names, avatars, dates, and amounts.',
    category: 'assets',
    permissions: ['selection:write'],
    downloads: '18.1k',
    rating: 4.8,
    runtime: {
      kind: 'unavailable',
      reason: 'Needs a configured text provider; no standalone build is published.'
    }
  },
  {
    id: 'isometric-mockup-3d',
    name: 'Isometric 3D Mockup',
    version: '2.1.0',
    author: 'Community',
    description:
      'Transforms selected mobile and desktop frames into 3D isometric perspectives with ambient shadows.',
    category: 'utility',
    permissions: ['selection:read', 'canvas:create'],
    downloads: '11.4k',
    rating: 4.6,
    runtime: { kind: 'unavailable', reason: 'No signed build is published yet.' }
  }
]

const DEFAULT_INSTALLED = ['sandbox-self-test']

/** Validate every catalog manifest at load, so a bad entry fails loudly. */
for (const plugin of CATALOG) {
  const manifest = parseManifest({
    id: plugin.id,
    name: plugin.name,
    version: plugin.version,
    permissions: plugin.permissions
  })
  if (manifest instanceof Error) {
    throw new Error(`Invalid plugin manifest for "${plugin.id}": ${manifest.message}`)
  }
}

const directoryPlugins = ref<DirectoryPlugin[]>(CATALOG)
const installedIds = useLocalStorage<string[]>('zenuxs.plugins.installed', DEFAULT_INSTALLED)

function manifestOf(plugin: DirectoryPlugin): PluginManifest {
  const manifest = parseManifest({
    id: plugin.id,
    name: plugin.name,
    version: plugin.version,
    permissions: plugin.permissions
  })
  if (manifest instanceof Error) {
    throw new Error(`Invalid plugin manifest for "${plugin.id}": ${manifest.message}`)
  }
  return manifest
}

function decodeBase64(value: string): Uint8Array<ArrayBuffer> {
  const binary = atob(value)
  const bytes = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i)
  return bytes
}

function parseParams(params: string): Record<string, unknown> {
  const parsed: unknown = JSON.parse(params || '{}')
  return parsed && typeof parsed === 'object' && !Array.isArray(parsed)
    ? (parsed as Record<string, unknown>)
    : {}
}

/**
 * Writes engine-side mutations from a finished plugin run back onto the live
 * canvas. The whole run lands as one undo step so a plugin cannot leave a
 * half-applied document behind.
 */
function commitEnginePatch(store: EditorStore, pluginName: string): void {
  const patch = zenuxsBridge.applyEngineChanges(store.graph)
  if (!patch.changed) return

  const settleLayout = (): void => {
    const touched = [
      ...patch.created.map((created) => created.node.id),
      ...patch.fieldChanges.map((change) => change.id)
    ]
    for (const id of new Set(touched)) store.runLayoutForNode(id)
  }
  settleLayout()

  store.pushUndoEntry({
    label: `Run "${pluginName}"`,
    forward: () => {
      reapplyEnginePatch(store.graph, patch)
      settleLayout()
      store.requestRender()
    },
    inverse: () => {
      revertEnginePatch(store.graph, patch)
      settleLayout()
      store.requestRender()
    }
  })
  store.requestRender()
}

export function usePluginStore() {
  const installedPlugins = computed(() =>
    directoryPlugins.value.filter((plugin) => installedIds.value.includes(plugin.id))
  )

  function isInstalled(id: string): boolean {
    return installedIds.value.includes(id)
  }

  function installPlugin(id: string): void {
    const plugin = directoryPlugins.value.find((entry) => entry.id === id)
    if (!plugin) throw new Error(`Unknown plugin "${id}"`)
    manifestOf(plugin)
    if (!installedIds.value.includes(id)) installedIds.value = [...installedIds.value, id]
  }

  function uninstallPlugin(id: string): void {
    installedIds.value = installedIds.value.filter((installed) => installed !== id)
  }

  async function runPluginById(id: string): Promise<PluginRunSummary> {
    const plugin = directoryPlugins.value.find((entry) => entry.id === id)
    if (!plugin) throw new Error(`Unknown plugin "${id}"`)
    if (!isInstalled(id)) throw new Error(`Install "${plugin.name}" before running it`)
    if (plugin.runtime.kind === 'unavailable') throw new Error(plugin.runtime.reason)

    const manifest = manifestOf(plugin)
    const engine = getZenuxsEngine()

    // Give the plugin the document that is on screen: the engine session is
    // rebuilt from the live graph (and the canvas selection mirrored), so host
    // reads see the same nodes the user does.
    const store = getActiveEditorStoreOrNull()
    if (store) {
      zenuxsBridge.syncToZenuxs(store.graph, store.state.currentPageId)
      engine.ds().selection = [...store.state.selectedIds].map((id) => zenuxsBridge.toEngineId(id))
    }

    const notifications: string[] = []
    const result = await runPlugin(
      decodeBase64(plugin.runtime.module),
      {
        call: (command, params) =>
          JSON.stringify(engine.execute(command, parseParams(params)) ?? null),
        selection: () => JSON.stringify(engine.ds().selection),
        notify: (text) => notifications.push(text)
      },
      { input: JSON.stringify({ api: 3, command: `plugin.${manifest.id}` }) }
    )

    // The plugin talks to the engine, not the canvas: replay whatever it
    // changed back onto the live graph as a single undoable step.
    if (store) commitEnginePatch(store, plugin.name)

    return {
      plugin: plugin.name,
      output: result.output || null,
      logs: [...result.logs, ...notifications],
      calls: result.calls
    }
  }

  return {
    installedPlugins,
    directoryPlugins,
    isInstalled,
    installPlugin,
    uninstallPlugin,
    runPluginById
  }
}
