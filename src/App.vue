<script setup lang="ts">
import { useHead } from '@unhead/vue'
import { useEventListener } from '@vueuse/core'
import { TooltipProvider } from 'reka-ui'
import { defineAsyncComponent, onMounted } from 'vue'

import { provideEditor, useI18n } from '@open-pencil/vue'

import { initAuth } from '@/app/auth/zenuxs'
import { useEditorStore } from '@/app/editor/active-store'
import { useAppTheme } from '@/app/shell/theme'
import { toast } from '@/app/shell/ui'
import { scheduleStartupUpdateCheck } from '@/app/shell/updater'
import AppShell from '@/components/Shell/AppShell.vue'
import AppToast from '@/components/Shell/AppToast.vue'

const SettingsDialog = defineAsyncComponent(
  () => import('@/components/settings/SettingsDialog.vue')
)
const ProjectsDialog = defineAsyncComponent(
  () => import('@/components/projects/ProjectsDialog.vue')
)
const PublishLibraryDialog = defineAsyncComponent(
  () => import('@/components/libraries/PublishLibraryDialog.vue')
)
const LibraryUpdateReviewDialog = defineAsyncComponent(
  () => import('@/components/libraries/review/LibraryUpdateReviewDialog.vue')
)

const store = useEditorStore()
const { updates, locale } = useI18n()

useHead({
  titleTemplate: (title) => (title ? `${title} — ZenuxsDesign` : 'ZenuxsDesign'),
  htmlAttrs: { lang: locale }
})

provideEditor(store)
useAppTheme()
useEventListener(window, 'pagehide', () => {
  void import('@/app/tabs').then(({ prepareForReload }) => prepareForReload())
})

onMounted(() => {
  toast.setupGlobalErrorHandler()
  scheduleStartupUpdateCheck(updates)
  void import('@/app/storage/sync').then(({ kickSyncEngine }) => kickSyncEngine())
  void initAuth()
})
</script>

<template>
  <TooltipProvider :delay-duration="400">
    <AppShell>
      <RouterView />
    </AppShell>
    <SettingsDialog />
    <ProjectsDialog />
    <PublishLibraryDialog />
    <LibraryUpdateReviewDialog />
    <AppToast />
  </TooltipProvider>
</template>
