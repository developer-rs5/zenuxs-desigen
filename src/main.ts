import { createHead } from '@unhead/vue/client'
import { createApp } from 'vue'

import './app.css'
import { IS_TAURI } from '@/constants'

import App from './App.vue'
import router from './router'

const head = createHead()
createApp(App).use(router).use(head).mount('#app')

void import('@/app/editor/fonts').then(({ preloadFonts }) => {
  preloadFonts()
})

if (!IS_TAURI) {
  if (import.meta.env.PROD) {
    void import('virtual:pwa-register').then(({ registerSW }) => {
      registerSW({ immediate: true })
      return undefined
    })
  } else if ('serviceWorker' in navigator) {
    void navigator.serviceWorker.getRegistrations().then((registrations) => {
      for (const registration of registrations) {
        void registration.unregister()
      }
    })
  }
}
