import { createRouter, createWebHistory } from 'vue-router'

import { isAuthenticated } from '@/app/auth/zenuxs'
import LandingPage from './components/LandingPage.vue'
import WorkspaceView from './views/WorkspaceView.vue'

const router = createRouter({
  history: createWebHistory(),
  routes: [
    { path: '/', component: LandingPage },
    { path: '/editor', component: WorkspaceView, meta: { requiresAuth: true } },
    { path: '/storage', redirect: '/editor' },
    { path: '/demo', component: WorkspaceView, meta: { demo: true, requiresAuth: true } },
    { path: '/share/:roomId', component: WorkspaceView, meta: { requiresAuth: true } }
  ]
})

router.beforeEach((to) => {
  // Allow OAuth callback through
  if (to.query.code || to.query.access_token) return true

  // Protected routes require authentication
  if (to.meta.requiresAuth && !isAuthenticated.value) {
    return '/'
  }

  return true
})

export default router
