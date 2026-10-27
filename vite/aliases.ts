import { resolve } from 'node:path'

export function createOpenPencilAliases(rootDir: string) {
  const emptyNodeModule = resolve(rootDir, 'vite/empty-node-module.ts')

  return [
    { find: /^fs$/, replacement: emptyNodeModule },
    { find: /^path$/, replacement: emptyNodeModule },
    { find: '@', replacement: resolve(rootDir, 'src') },
    { find: '#vue', replacement: resolve(rootDir, 'packages/vue/src') },
    { find: '#core', replacement: resolve(rootDir, 'packages/core/src') },
    { find: '#dom-css', replacement: resolve(rootDir, 'packages/dom-css/src') },
    {
      find: /^@open-pencil\/dom-css\/browser$/,
      replacement: resolve(rootDir, 'packages/dom-css/src/browser.ts')
    },
    {
      find: /^@open-pencil\/dom-css\/jsx-runtime$/,
      replacement: resolve(rootDir, 'packages/dom-css/src/jsx/runtime.ts')
    },
    {
      find: /^@open-pencil\/dom-css\/jsx-dev-runtime$/,
      replacement: resolve(rootDir, 'packages/dom-css/src/jsx/dev-runtime.ts')
    },
    {
      find: /^@open-pencil\/dom-css$/,
      replacement: resolve(rootDir, 'packages/dom-css/src/index.ts')
    },
    {
      find: /^@open-pencil\/scene-graph$/,
      replacement: resolve(rootDir, 'packages/scene-graph/src/index.ts')
    },
    { find: '@open-pencil/scene-graph', replacement: resolve(rootDir, 'packages/scene-graph/src') },
    { find: /^@open-pencil\/pen$/, replacement: resolve(rootDir, 'packages/pen/src/index.ts') },
    { find: '@open-pencil/pen', replacement: resolve(rootDir, 'packages/pen/src') },
    { find: /^@open-pencil\/kiwi$/, replacement: resolve(rootDir, 'packages/kiwi/src/index.ts') },
    { find: '@open-pencil/kiwi', replacement: resolve(rootDir, 'packages/kiwi/src') },
    { find: /^@open-pencil\/fig$/, replacement: resolve(rootDir, 'packages/fig/src/index.ts') },
    { find: '@open-pencil/fig', replacement: resolve(rootDir, 'packages/fig/src') },
    {
      find: /^@open-pencil\/mcp\/discovery$/,
      replacement: resolve(rootDir, 'packages/mcp/src/transport/discovery.ts')
    },
    {
      find: /^@open-pencil\/mcp\/transport$/,
      replacement: resolve(rootDir, 'packages/mcp/src/transport/paths.ts')
    },
    { find: /^@open-pencil\/vue$/, replacement: resolve(rootDir, 'packages/vue/src/index.ts') },
    { find: '@open-pencil/vue', replacement: resolve(rootDir, 'packages/vue/src') },
    { find: /^@open-pencil\/core$/, replacement: resolve(rootDir, 'packages/core/src/index.ts') },
    { find: '@open-pencil/core', replacement: resolve(rootDir, 'packages/core/src') },
    { find: /^@zenuxs\/color$/, replacement: resolve(rootDir, 'packages/color/src/index.ts') },
    { find: '@zenuxs/color', replacement: resolve(rootDir, 'packages/color/src') },
    { find: /^@zenuxs\/geom$/, replacement: resolve(rootDir, 'packages/geom/src/index.ts') },
    { find: '@zenuxs/geom', replacement: resolve(rootDir, 'packages/geom/src') },
    { find: /^@zenuxs\/doc$/, replacement: resolve(rootDir, 'packages/doc/src/index.ts') },
    { find: '@zenuxs/doc', replacement: resolve(rootDir, 'packages/doc/src') },
    { find: /^@zenuxs\/layout$/, replacement: resolve(rootDir, 'packages/layout/src/index.ts') },
    { find: '@zenuxs/layout', replacement: resolve(rootDir, 'packages/layout/src') },
    { find: /^@zenuxs\/engine$/, replacement: resolve(rootDir, 'packages/engine/src/index.ts') },
    { find: '@zenuxs/engine', replacement: resolve(rootDir, 'packages/engine/src') },
    { find: /^@zenuxs\/format$/, replacement: resolve(rootDir, 'packages/format/src/index.ts') },
    { find: '@zenuxs/format', replacement: resolve(rootDir, 'packages/format/src') },
    { find: /^@zenuxs\/render$/, replacement: resolve(rootDir, 'packages/render/src/index.ts') },
    { find: '@zenuxs/render', replacement: resolve(rootDir, 'packages/render/src') },
    { find: /^@zenuxs\/pathops$/, replacement: resolve(rootDir, 'packages/pathops/src/index.ts') },
    { find: '@zenuxs/pathops', replacement: resolve(rootDir, 'packages/pathops/src') },
    { find: /^@zenuxs\/plugin$/, replacement: resolve(rootDir, 'packages/plugin/src/index.ts') },
    { find: '@zenuxs/plugin', replacement: resolve(rootDir, 'packages/plugin/src') },
    {
      find: 'opentype.js',
      replacement: resolve(rootDir, 'node_modules/opentype.js/dist/opentype.mjs')
    }
  ]
}
