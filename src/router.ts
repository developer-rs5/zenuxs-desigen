import { watch } from 'vue'
import { createRouter, createWebHistory, type RouteLocationRaw } from 'vue-router'

import { REDIRECT_QUERY_KEY, readRedirectTarget, signInRedirectFor } from '@/app/auth/redirect'
import { authReady, initAuth, isAuthenticated } from '@/app/auth/zenuxs'

const router = createRouter({
  history: createWebHistory(),
  routes: [
    { path: '/', component: () => import('./components/LandingPage.vue') },
    {
      path: '/editor',
      component: () => import('./views/WorkspaceView.vue'),
      meta: { requiresAuth: true }
    },
    { path: '/storage', redirect: '/editor' },
    {
      path: '/demo',
      component: () => import('./views/WorkspaceView.vue'),
      meta: { demo: true, requiresAuth: true }
    },
    {
      path: '/share/:roomId',
      component: () => import('./views/WorkspaceView.vue'),
      meta: { requiresAuth: true }
    },
    { path: '/:pathMatch(.*)*', redirect: '/' }
  ]
})

router.beforeEach(async (to): Promise<true | RouteLocationRaw> => {
  // An OAuth redirect returns with the authorization code on the current URL;
  // wait for callback handling to complete and establish the server session,
  // then navigate cleanly to the target destination without auth parameters.
  if (to.query.code || to.query.access_token) {
    await initAuth()
    if (isAuthenticated.value) {
      const target = readRedirectTarget(to.query[REDIRECT_QUERY_KEY])
      return { path: target, query: {}, replace: true }
    }
    return { path: '/', query: {}, replace: true }
  }

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
