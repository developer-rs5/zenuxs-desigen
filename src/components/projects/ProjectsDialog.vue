<script setup lang="ts">
import { computed, ref, watch } from 'vue'

import { projectsDialogOpen } from '@/app/projects/dialog'
import { toast } from '@/app/shell/ui'
import {
  deleteRemoteDocument,
  listRemoteDocuments,
  type RemoteServerDocumentHeader
} from '@/app/storage/remote-server'
import { activeTab, createDocumentInCurrentTab, openStorageDocumentInNewTab } from '@/app/tabs'
import AppButton from '@/components/ui/button/AppButton.vue'
import {
  AppDialogBody,
  AppDialogFooter,
  AppDialogHeader,
  AppDialogRoot
} from '@/components/ui/dialog'
import AppConfirmationDialog from '@/components/ui/dialog/AppConfirmationDialog.vue'
import AppInput from '@/components/ui/input/AppInput.vue'

const projects = ref<RemoteServerDocumentHeader[]>([])
const loading = ref(false)
const error = ref<string | null>(null)
const searchQuery = ref('')
const projectToDelete = ref<RemoteServerDocumentHeader | null>(null)
const deleteConfirmOpen = ref(false)
const deleting = ref(false)

const activeDocumentId = computed(() => {
  return activeTab.value?.store.getStorageBinding()?.documentId ?? null
})

function formatRelativeTime(dateString: string): string {
  try {
    const date = new Date(dateString)
    const diff = Date.now() - date.getTime()
    if (isNaN(diff)) return 'Recently'
    const seconds = Math.floor(diff / 1000)
    if (seconds < 60) return 'Just now'
    const minutes = Math.floor(seconds / 60)
    if (minutes < 60) return `${minutes}m ago`
    const hours = Math.floor(minutes / 60)
    if (hours < 24) return `${hours}h ago`
    const days = Math.floor(hours / 24)
    if (days < 30) return `${days}d ago`
    return date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
  } catch {
    return 'Recently'
  }
}

async function loadProjects() {
  loading.value = true
  error.value = null
  try {
    projects.value = await listRemoteDocuments()
  } catch (err) {
    error.value = err instanceof Error ? err.message : 'Failed to load projects from database'
  } finally {
    loading.value = false
  }
}

watch(projectsDialogOpen, (open) => {
  if (open) {
    searchQuery.value = ''
    void loadProjects()
  }
})

const filteredProjects = computed(() => {
  const query = searchQuery.value.trim().toLowerCase()
  if (!query) return projects.value
  return projects.value.filter((p) => p.title.toLowerCase().includes(query))
})

async function handleOpenProject(doc: RemoteServerDocumentHeader) {
  try {
    await openStorageDocumentInNewTab({
      id: doc.documentId,
      name: doc.title,
      updatedAt: doc.updatedAt,
      thumbnailURL: doc.previewDataURL
    })
    projectsDialogOpen.value = false
    toast.info(`Opened "${doc.title}"`)
  } catch (err) {
    toast.error(err instanceof Error ? err.message : 'Could not open project')
  }
}

async function handleNewProject() {
  try {
    const tab = createDocumentInCurrentTab()
    tab.store.state.documentName = 'Untitled Project'
    tab.store.state.sceneVersion++
    void tab.store.saveFigFile?.()
    projectsDialogOpen.value = false
    toast.info('Created new project')
  } catch (err) {
    toast.error(err instanceof Error ? err.message : 'Could not create project')
  }
}

function confirmDelete(doc: RemoteServerDocumentHeader, event: Event) {
  event.stopPropagation()
  projectToDelete.value = doc
  deleteConfirmOpen.value = true
}

async function handleDeleteConfirmed() {
  if (!projectToDelete.value) return
  deleting.value = true
  try {
    await deleteRemoteDocument(projectToDelete.value.documentId)
    toast.info(`Deleted "${projectToDelete.value.title}"`)
    deleteConfirmOpen.value = false
    projectToDelete.value = null
    await loadProjects()
  } catch (err) {
    toast.error(err instanceof Error ? err.message : 'Failed to delete project')
  } finally {
    deleting.value = false
  }
}
</script>

<template>
  <AppDialogRoot v-model:open="projectsDialogOpen" size="lg" height="tall">
    <AppDialogHeader
      heading="Projects"
      description="Manage and switch between your projects saved in the database."
      close-label="Close"
    >
      <template #header-actions>
        <AppButton
          color="primary"
          variant="solid"
          size="sm"
          data-test-id="projects-dialog-new"
          @click="handleNewProject"
        >
          <template #leading><icon-lucide-plus class="size-4" /></template>
          New Project
        </AppButton>
      </template>
    </AppDialogHeader>

    <AppDialogBody class="flex flex-col gap-4 overflow-hidden p-5">
      <!-- Search & Controls -->
      <div class="flex items-center gap-3">
        <AppInput
          v-model="searchQuery"
          type="search"
          placeholder="Search projects..."
          class="flex-1"
          autocomplete="off"
        >
          <template #leading><icon-lucide-search class="size-4 text-muted" /></template>
        </AppInput>
        <AppButton
          variant="outline"
          size="md"
          :disabled="loading"
          title="Refresh projects list"
          @click="loadProjects"
        >
          <icon-lucide-refresh-cw class="size-4" :class="{ 'animate-spin': loading }" />
        </AppButton>
      </div>

      <!-- Error banner -->
      <div
        v-if="error"
        class="flex items-center justify-between rounded-lg border border-red-500/20 bg-red-500/10 p-3 text-xs text-red-400"
      >
        <span>{{ error }}</span>
        <AppButton size="xs" variant="outline" color="error" @click="loadProjects">Retry</AppButton>
      </div>

      <!-- Projects Grid / List -->
      <div class="flex-1 overflow-y-auto pr-1">
        <!-- Loading -->
        <div
          v-if="loading && projects.length === 0"
          class="flex flex-col items-center justify-center py-16 text-muted"
        >
          <icon-lucide-loader class="size-7 animate-spin text-[#3B82F6]" />
          <p class="mt-3 text-xs">Loading projects from database...</p>
        </div>

        <!-- Empty state -->
        <div
          v-else-if="filteredProjects.length === 0"
          class="flex flex-col items-center justify-center rounded-xl border border-dashed border-border py-16 text-center"
        >
          <div class="flex size-12 items-center justify-center rounded-2xl bg-[#1E2126] text-muted">
            <icon-lucide-folder class="size-6 text-[#3B82F6]" />
          </div>
          <p class="mt-4 text-sm font-medium text-surface">
            {{ searchQuery ? 'No matching projects found' : 'No projects yet' }}
          </p>
          <p class="mt-1 max-w-sm text-xs text-muted">
            {{
              searchQuery
                ? `No project titles match "${searchQuery}".`
                : 'Create your first design project and it will be stored safely in MongoDB.'
            }}
          </p>
          <AppButton
            color="primary"
            variant="solid"
            size="md"
            class="mt-5"
            @click="handleNewProject"
          >
            <template #leading><icon-lucide-plus class="size-4" /></template>
            Create New Project
          </AppButton>
        </div>

        <!-- Project Cards Grid -->
        <div v-else class="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          <div
            v-for="project in filteredProjects"
            :key="project.documentId"
            class="group relative flex cursor-pointer flex-col justify-between overflow-hidden rounded-xl border border-border bg-[#17191C] p-3 transition-all duration-200 hover:border-[#3B82F6]/60 hover:bg-[#1E2126] hover:shadow-lg"
            :class="{
              'ring-1 ring-[#3B82F6] border-[#3B82F6]/80': project.documentId === activeDocumentId
            }"
            @click="handleOpenProject(project)"
          >
            <!-- Preview / Banner -->
            <div
              class="relative mb-3 flex h-28 w-full items-center justify-center overflow-hidden rounded-lg bg-[#111315]"
            >
              <img
                v-if="project.previewDataURL"
                :src="project.previewDataURL"
                :alt="project.title"
                class="size-full object-contain"
              />
              <div v-else class="flex flex-col items-center justify-center text-muted/40">
                <icon-lucide-layout-grid class="size-8" />
                <span class="mt-1 text-[10px] uppercase tracking-wider">Canvas</span>
              </div>

              <!-- Active badge -->
              <span
                v-if="project.documentId === activeDocumentId"
                class="absolute top-2 left-2 flex items-center gap-1 rounded-full bg-[#3B82F6] px-2 py-0.5 text-[10px] font-semibold text-white shadow-sm"
              >
                <span class="size-1.5 rounded-full bg-white animate-pulse" />
                Active
              </span>

              <!-- Hover delete button -->
              <button
                type="button"
                title="Delete project"
                class="absolute top-2 right-2 flex size-7 items-center justify-center rounded-lg bg-black/60 text-muted opacity-0 backdrop-blur-sm transition-all hover:bg-red-500 hover:text-white group-hover:opacity-100"
                @click="confirmDelete(project, $event)"
              >
                <icon-lucide-trash-2 class="size-3.5" />
              </button>
            </div>

            <!-- Title & metadata -->
            <div class="flex items-center justify-between gap-2">
              <div class="min-w-0 flex-1">
                <h3
                  class="truncate text-xs font-semibold text-surface group-hover:text-[#3B82F6]"
                  :title="project.title"
                >
                  {{ project.title }}
                </h3>
                <p class="text-[11px] text-muted">
                  {{ formatRelativeTime(project.updatedAt) }}
                </p>
              </div>

              <AppButton
                size="xs"
                variant="ghost"
                class="shrink-0 text-muted group-hover:text-surface"
                @click.stop="handleOpenProject(project)"
              >
                Open
              </AppButton>
            </div>
          </div>
        </div>
      </div>
    </AppDialogBody>

    <AppDialogFooter class="border-t border-border px-5 py-3">
      <div class="flex w-full items-center justify-between text-xs text-muted">
        <span
          >{{ filteredProjects.length }}
          {{ filteredProjects.length === 1 ? 'project' : 'projects' }}</span
        >
        <AppButton variant="ghost" size="sm" @click="projectsDialogOpen = false">Close</AppButton>
      </div>
    </AppDialogFooter>
  </AppDialogRoot>

  <!-- Delete Confirmation -->
  <AppConfirmationDialog
    v-model:open="deleteConfirmOpen"
    heading="Delete project?"
    :description="`Are you sure you want to permanently delete '${projectToDelete?.title}' from the database? This action cannot be undone.`"
    cancel-label="Cancel"
    confirm-label="Delete"
    tone="danger"
    :confirm-loading="deleting"
    @confirm="handleDeleteConfirmed"
  />
</template>
