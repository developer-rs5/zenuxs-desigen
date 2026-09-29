import { watch } from 'vue'
import { createRouter, createWebHistory, type RouteLocationRaw } from 'vue-router'

import { REDIRECT_QUERY_KEY, readRedirectTarget, signInRedirectFor } from '@/app/auth/redirect'
import { authReady, isAuthenticated } from '@/app/auth/zenuxs'

import LandingPage from './components/LandingPage.vue'
import WorkspaceView from './views/WorkspaceView.vue'

const router = createRouter({
  history: createWebHistory(),
  routes: [
    { path: '/', component: LandingPage },
    { path: '/editor', component: WorkspaceView, meta: { requiresAuth: true } },
    { path: '/storage', redirect: '/editor' },
    { path: '/demo', component: WorkspaceView, meta: { demo: true, requiresAuth: true } },
    { path: '/share/:roomId', component: WorkspaceView, meta: { requiresAuth: true } },
    { path: '/:pathMatch(.*)*', redirect: '/' }
  ]
})

router.beforeEach(async (to): Promise<true | RouteLocationRaw> => {
  // An OAuth redirect returns with the authorization code on the current URL;
  // the callback must be allowed to run before any auth decision is made.
  if (to.query.code || to.query.access_token) return true

  // Wait for auth initialisation rather than bailing out early, otherwise a
  // protected route redirects to sign-in before the session has been restored
  // from its cookie.
  if (!authReady.value) {
    await new Promise<void>((resolve) => {
      const stop = watch(authReady, (ready) => {
        if (ready) {
          stop()
          resolve()
        }
      })
    })
  }

  if (to.meta.requiresAuth && !isAuthenticated.value) {
    return signInRedirectFor(to.fullPath)
  }

  // Once signed in, send the user to the route they originally asked for and
  // drop the query so a later refresh does not bounce them back here.
  if (isAuthenticated.value && to.query[REDIRECT_QUERY_KEY]) {
    const target = readRedirectTarget(to.query[REDIRECT_QUERY_KEY])
    return { path: target, query: {}, replace: true }
  }

  return true
})

export default router
