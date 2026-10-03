import { ref } from 'vue'

import { IS_BROWSER } from '@open-pencil/core/constants'

import { createConversationHistory } from '@/app/ai/chat/history/controller'
import {
  apiKeyStatus,
  browserCredentialsRemembered,
  credentialsReady,
  customAPIType,
  customBaseURL,
  customModelID,
  isACPProvider,
  isHarnessProvider,
  isConfigured,
  maxOutputTokens,
  modelID,
  providerDef,
  providerID,
  registerAIChatEffects,
  resolveAPIKey,
  setAPIKey
} from '@/app/ai/chat/storage'
import { createChatSessionManager } from '@/app/ai/chat/transports'
import { designModelProfile } from '@/app/ai/models'
import { exposeChatTransportOverride } from '@/app/browser-bridge'
import { getActiveEditorStore } from '@/app/editor/active-store'
import {
  pexelsKeyStatus,
  unsplashKeyStatus,
  setPexelsKey,
  setUnsplashKey,
  setRememberCredentials
} from '@/app/settings/credentials/media'

const activeTab = ref<'design' | 'code' | 'ai'>('design')
const chatInputDraft = ref('')

export function sendNodesToAIChat(
  store: {
    graph: { getNode: (id: string) => { name?: string; type?: string } | undefined }
    state: { activeRibbonTab?: string; mobileDrawerSnap?: string }
  },
  nodeIds: string[],
  xpathGetter?: (nodeId: string) => string | null
) {
  activeTab.value = 'ai'
  if (store.state.activeRibbonTab !== undefined) {
    store.state.activeRibbonTab = 'ai'
    if (store.state.mobileDrawerSnap === 'closed') {
      store.state.mobileDrawerSnap = 'half'
    }
  }

  const firstId = nodeIds[0]
  if (firstId) {
    const node = store.graph.getNode(firstId)
    const xpath = xpathGetter ? xpathGetter(firstId) : null
    const name = node?.name ? `"${node.name}"` : 'selected element'
    const xpathDesc = xpath ? ` (path: ${xpath})` : ''
    chatInputDraft.value = `Redesign ${name}${xpathDesc}: `
  }
}

const chatSession = createChatSessionManager({
  isConfigured,
  isACPProvider,
  isHarnessProvider,
  providerID,
  credentialsReady,
  getActiveEditorStore
})

const history = createConversationHistory({
  profileId: () => designModelProfile.value?.id ?? null,
  getEditor: getActiveEditorStore,
  ensureChat: chatSession.ensureChat,
  resetChat: chatSession.resetChat,
  backend: () => {
    if (isACPProvider.value) return 'acp'
    return isHarnessProvider.value ? 'harness' : 'direct'
  }
})

registerAIChatEffects(chatSession.markTransportDirty)

if (IS_BROWSER) {
  exposeChatTransportOverride((factory) => {
    chatSession.setOverrideTransport(factory)
  })
}

export function useAIChat() {
  return {
    providerID,
    providerDef,
    apiKeyStatus,
    browserCredentialsRemembered,
    setAPIKey,
    resolveAPIKey,
    modelID,
    customBaseURL,
    customModelID,
    customAPIType,
    maxOutputTokens,
    pexelsKeyStatus,
    setPexelsKey,
    setRememberCredentials,
    unsplashKeyStatus,
    setUnsplashKey,
    activeTab,
    isConfigured,
    history,
    ensureChat: history.ensureChat,
    resetChat: history.newChat,
    chatFailure: chatSession.failure,
    clearChatFailure: chatSession.clearFailure,
    chatInputDraft,
    sendNodesToAIChat
  }
}
