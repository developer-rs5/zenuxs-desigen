import { ref } from 'vue'

export const projectsDialogOpen = ref(false)

export function openProjectsDialog(): void {
  projectsDialogOpen.value = true
}

export function closeProjectsDialog(): void {
  projectsDialogOpen.value = false
}
