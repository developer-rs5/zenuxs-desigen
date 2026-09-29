<script setup lang="ts">
import { onMounted, ref } from 'vue'

import { apiURL } from '@/app/auth/api'
import {
  currentUser,
  isAuthenticated,
  initAuth,
  loginWithZenuxs,
  logoutZenuxs
} from '@/app/auth/zenuxs'
import AppButton from '@/components/ui/button/AppButton.vue'

const isCheckingServer = ref(false)
const serverStatus = ref<'online' | 'offline' | 'unknown'>('unknown')

/** Resolved API origin; same-origin unless VITE_BACKEND_URL overrides it. */
const apiOrigin = apiURL('') || window.location.origin

async function checkServerHealth() {
  isCheckingServer.value = true
  try {
    const res = await fetch(apiURL('/health'), { credentials: 'include' })
    serverStatus.value = res.ok ? 'online' : 'offline'
  } catch {
    serverStatus.value = 'offline'
  } finally {
    isCheckingServer.value = false
  }
}

onMounted(() => {
  void initAuth()
  void checkServerHealth()
})
</script>

<template>
  <div class="space-y-6">
    <div class="rounded-lg border border-border p-4 space-y-3 bg-panel">
      <div class="flex items-center justify-between">
        <div>
          <h3 class="text-sm font-semibold text-surface">Zenuxs Account</h3>
          <p class="text-xs text-muted-foreground">
            Sign in with Zenuxs OAuth to sync designs to your central server.
          </p>
        </div>
        <div v-if="isAuthenticated && currentUser" class="flex items-center gap-3">
          <img
            v-if="currentUser.picture"
            :src="currentUser.picture"
            class="size-8 rounded-full border border-border"
            alt="Avatar"
          />
          <div class="text-right text-xs">
            <p class="font-medium text-surface">
              {{ currentUser.name || currentUser.email || 'Zenuxs User' }}
            </p>
            <p class="text-muted-foreground">{{ currentUser.email || currentUser.sub }}</p>
          </div>
          <AppButton color="neutral" variant="outline" size="sm" @click="logoutZenuxs">
            Sign out
          </AppButton>
        </div>
        <div v-else class="flex items-center gap-2">
          <AppButton color="primary" variant="solid" size="sm" @click="loginWithZenuxs('ui')">
            Sign in with Zenuxs
          </AppButton>
          <AppButton
            color="neutral"
            variant="outline"
            size="sm"
            @click="loginWithZenuxs('redirect')"
          >
            Redirect Login
          </AppButton>
        </div>
      </div>
    </div>

    <div class="rounded-lg border border-border p-4 space-y-3 bg-panel">
      <div class="flex items-center justify-between">
        <div>
          <h3 class="text-sm font-semibold text-surface">Central Backend Server</h3>
          <p class="text-xs text-muted-foreground">
            MongoDB &amp; Node.js server endpoint running on port 3000.
          </p>
        </div>
        <span
          class="inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-medium"
          :class="
            serverStatus === 'online'
              ? 'bg-emerald-500/10 text-emerald-500'
              : 'bg-rose-500/10 text-rose-500'
          "
        >
          <span
            class="size-1.5 rounded-full"
            :class="serverStatus === 'online' ? 'bg-emerald-500' : 'bg-rose-500'"
          />
          {{ serverStatus === 'online' ? 'Server Online' : 'Server Offline' }}
        </span>
      </div>

      <div class="flex items-center gap-2 pt-2">
        <span
          class="flex-1 truncate rounded-md border border-border bg-input px-3 py-1.5 text-xs text-muted-foreground"
          :title="apiOrigin"
        >
          {{ apiOrigin }}
        </span>
        <AppButton
          color="neutral"
          variant="outline"
          size="sm"
          :disabled="isCheckingServer"
          @click="checkServerHealth"
        >
          Test Connection
        </AppButton>
      </div>
    </div>
  </div>
</template>
