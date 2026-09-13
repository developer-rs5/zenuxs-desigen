import { createRouter, createWebHistory } from 'vue-router'

import LandingPage from './components/LandingPage.vue'
import WorkspaceView from './views/WorkspaceView.vue'

const router = createRouter({
  history: createWebHistory(),
  routes: [
    { path: '/', component: LandingPage },
    { path: '/editor', component: WorkspaceView },
    { path: '/storage', redirect: '/editor' },
    { path: '/demo', component: WorkspaceView, meta: { demo: true } },
    { path: '/share/:roomId', component: WorkspaceView }
  ]
})

export default router
