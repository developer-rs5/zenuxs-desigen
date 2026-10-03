import type { Router } from 'vue-router'

export function openStorageWorkspace(router: Router): void {
  void router
    .push('/editor')
    .then(() => import('@/app/tabs'))
    .then(({ showNewTab }) => showNewTab())
}
