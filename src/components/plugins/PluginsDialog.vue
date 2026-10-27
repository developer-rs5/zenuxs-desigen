<script setup lang="ts">
import { computed, ref } from 'vue'

import { usePluginStore, type DirectoryPlugin, type PluginRunSummary } from '@/app/plugins/store'
import { toast } from '@/app/shell/ui'
import AppButton from '@/components/ui/button/AppButton.vue'
import { AppDialogBody, AppDialogHeader, AppDialogRoot } from '@/components/ui/dialog'
import AppInput from '@/components/ui/input/AppInput.vue'
import AppTabsContent from '@/components/ui/tabs/AppTabsContent.vue'
import AppTabsList from '@/components/ui/tabs/AppTabsList.vue'
import AppTabsRoot from '@/components/ui/tabs/AppTabsRoot.vue'
import AppTabsTrigger from '@/components/ui/tabs/AppTabsTrigger.vue'

const open = defineModel<boolean>({ required: true })
const {
  installedPlugins,
  directoryPlugins,
  isInstalled,
  installPlugin,
  uninstallPlugin,
  runPluginById
} = usePluginStore()

const activeTab = ref<'installed' | 'browse'>('installed')
const searchQuery = ref('')
const runningPluginId = ref<string | null>(null)
const lastRun = ref<PluginRunSummary | null>(null)

const filteredBrowsePlugins = computed(() => {
  const q = searchQuery.value.trim().toLowerCase()
  if (!q) return directoryPlugins.value
  return directoryPlugins.value.filter(
    (plugin) =>
      plugin.name.toLowerCase().includes(q) ||
      plugin.description.toLowerCase().includes(q) ||
      plugin.author.toLowerCase().includes(q) ||
      plugin.category.toLowerCase().includes(q)
  )
})

function isRunnable(plugin: DirectoryPlugin): boolean {
  return plugin.runtime.kind === 'wasm'
}

function unavailableReason(plugin: DirectoryPlugin): string | null {
  return plugin.runtime.kind === 'unavailable' ? plugin.runtime.reason : null
}

async function handleRun(plugin: DirectoryPlugin) {
  if (runningPluginId.value) return
  runningPluginId.value = plugin.id
  try {
    lastRun.value = await runPluginById(plugin.id)
    toast.info(`"${plugin.name}" finished with ${lastRun.value.calls} host call(s)`)
  } catch (error) {
    lastRun.value = null
    toast.error(
      `"${plugin.name}" failed: ${error instanceof Error ? error.message : String(error)}`
    )
  } finally {
    runningPluginId.value = null
  }
}

function handleInstall(plugin: DirectoryPlugin) {
  try {
    installPlugin(plugin.id)
    toast.info(`Installed "${plugin.name}"`)
  } catch (error) {
    toast.error(error instanceof Error ? error.message : String(error))
  }
}

function handleUninstall(plugin: DirectoryPlugin) {
  uninstallPlugin(plugin.id)
  if (lastRun.value?.plugin === plugin.name) lastRun.value = null
  toast.info(`Uninstalled "${plugin.name}"`)
}
</script>

<template>
  <AppDialogRoot v-model:open="open" size="lg" height="tall">
    <AppDialogHeader
      heading="Plugins &amp; Extensions"
      description="WASM plugins run sandboxed with a metered host bridge"
    />

    <AppTabsRoot v-model="activeTab">
      <div class="shrink-0 border-b border-border px-4 py-1">
        <AppTabsList label="Plugins">
          <AppTabsTrigger value="installed">
            <template #leading><icon-lucide-box class="size-3.5" /></template>
            Installed ({{ installedPlugins.length }})
          </AppTabsTrigger>
          <AppTabsTrigger value="browse">
            <template #leading><icon-lucide-store class="size-3.5" /></template>
            Directory ({{ directoryPlugins.length }})
          </AppTabsTrigger>
        </AppTabsList>
      </div>

      <AppTabsContent value="installed" as-child>
        <AppDialogBody class="space-y-3">
          <div
            v-if="lastRun"
            data-test-id="plugin-run-result"
            class="rounded-lg border border-border bg-panel-field p-3"
          >
            <div class="flex items-center justify-between gap-3">
              <p class="text-xs font-medium text-surface">Last run — {{ lastRun.plugin }}</p>
              <AppButton size="xs" variant="ghost" @click="lastRun = null">Clear</AppButton>
            </div>
            <dl class="mt-2 grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-[11px]">
              <dt class="text-muted">Host calls</dt>
              <dd class="font-mono text-surface">{{ lastRun.calls }}</dd>
              <dt class="text-muted">Output</dt>
              <dd class="break-all font-mono text-surface">{{ lastRun.output ?? '(none)' }}</dd>
            </dl>
            <template v-if="lastRun.logs.length">
              <p class="mt-2 text-[11px] text-muted">Logs</p>
              <pre
                class="mt-1 max-h-32 overflow-auto whitespace-pre-wrap font-mono text-[10px] text-surface"
                >{{ lastRun.logs.join('\n') }}</pre>
            </template>
          </div>

          <div
            v-if="installedPlugins.length === 0"
            class="flex flex-col items-center justify-center gap-2 py-16 text-center"
          >
            <icon-lucide-box class="size-8 text-muted" />
            <p class="text-sm text-surface">No plugins installed</p>
            <p class="text-xs text-muted">Browse the directory to install WASM plugins.</p>
            <AppButton size="sm" color="primary" variant="outline" @click="activeTab = 'browse'">
              Browse plugins
            </AppButton>
          </div>

          <template v-else>
            <div
              v-for="plugin in installedPlugins"
              :key="plugin.id"
              :data-test-id="`plugin-installed-${plugin.id}`"
              class="flex items-start gap-4 rounded-lg border border-border bg-panel-secondary p-4"
            >
              <div class="min-w-0 flex-1 space-y-1.5">
                <div class="flex flex-wrap items-center gap-2">
                  <span class="text-[13px] font-semibold text-surface">{{ plugin.name }}</span>
                  <span class="rounded bg-accent/15 px-1.5 py-0.5 text-[10px] text-accent">
                    v{{ plugin.version }}
                  </span>
                  <span class="text-[11px] text-muted">{{ plugin.author }}</span>
                </div>
                <p class="text-xs leading-relaxed text-muted">{{ plugin.description }}</p>
                <div class="flex flex-wrap gap-1">
                  <code
                    v-for="permission in plugin.permissions"
                    :key="permission"
                    class="rounded bg-hover px-1.5 py-0.5 font-mono text-[9px] text-muted"
                  >
                    {{ permission }}
                  </code>
                </div>
                <p v-if="unavailableReason(plugin)" class="text-[11px] text-warning-text">
                  {{ unavailableReason(plugin) }}
                </p>
              </div>

              <div class="flex shrink-0 items-center gap-2">
                <AppButton
                  size="sm"
                  color="primary"
                  variant="solid"
                  :disabled="runningPluginId !== null || !isRunnable(plugin)"
                  :loading="runningPluginId === plugin.id"
                  @click="handleRun(plugin)"
                >
                  <icon-lucide-play class="size-3.5" />
                  Run
                </AppButton>
                <AppButton
                  size="sm"
                  color="neutral"
                  variant="ghost"
                  :disabled="runningPluginId !== null"
                  @click="handleUninstall(plugin)"
                >
                  Uninstall
                </AppButton>
              </div>
            </div>
          </template>
        </AppDialogBody>
      </AppTabsContent>

      <AppTabsContent value="browse" as-child>
        <AppDialogBody class="space-y-3">
          <AppInput
            v-model="searchQuery"
            type="search"
            placeholder="Search plugins by name, author, or category"
            aria-label="Search plugins"
          />

          <div class="grid grid-cols-1 gap-3 md:grid-cols-2">
            <div
              v-for="plugin in filteredBrowsePlugins"
              :key="plugin.id"
              :data-test-id="`plugin-browse-${plugin.id}`"
              class="flex flex-col justify-between rounded-lg border border-border bg-panel-secondary p-4"
            >
              <div class="space-y-2">
                <div class="flex items-start justify-between gap-3">
                  <div class="min-w-0">
                    <h3 class="truncate text-[13px] font-semibold text-surface">
                      {{ plugin.name }}
                    </h3>
                    <p class="text-[11px] text-muted">
                      {{ plugin.author }} · v{{ plugin.version }}
                    </p>
                  </div>
                  <span
                    class="shrink-0 rounded px-1.5 py-0.5 text-[10px]"
                    :class="
                      isRunnable(plugin) ? 'bg-success/15 text-success' : 'bg-hover text-muted'
                    "
                  >
                    {{ isRunnable(plugin) ? 'Runnable' : 'Catalog only' }}
                  </span>
                </div>

                <p class="line-clamp-2 text-xs leading-relaxed text-muted">
                  {{ plugin.description }}
                </p>

                <p v-if="unavailableReason(plugin)" class="text-[11px] text-warning-text">
                  {{ unavailableReason(plugin) }}
                </p>

                <div class="flex flex-wrap gap-1">
                  <code
                    v-for="permission in plugin.permissions"
                    :key="permission"
                    class="rounded bg-hover px-1.5 py-0.5 font-mono text-[9px] text-muted"
                  >
                    {{ permission }}
                  </code>
                </div>
              </div>

              <div class="mt-4 flex items-center justify-between gap-3 border-t border-border pt-3">
                <span class="text-[10px] font-semibold tracking-wider text-muted uppercase">
                  {{ plugin.category }}
                </span>
                <AppButton
                  v-if="!isInstalled(plugin.id)"
                  size="sm"
                  color="primary"
                  variant="outline"
                  @click="handleInstall(plugin)"
                >
                  <icon-lucide-download class="size-3.5" />
                  Install
                </AppButton>
                <span v-else class="inline-flex items-center gap-1 text-xs text-success">
                  <icon-lucide-check class="size-3.5" />
                  Installed
                </span>
              </div>
            </div>
          </div>

          <p v-if="filteredBrowsePlugins.length === 0" class="py-12 text-center text-xs text-muted">
            No plugins match "{{ searchQuery }}".
          </p>
        </AppDialogBody>
      </AppTabsContent>
    </AppTabsRoot>
  </AppDialogRoot>
</template>
