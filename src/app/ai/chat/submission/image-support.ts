import type { ImageSupport } from '@/app/ai/chat/submission/types'
import { resolveAIModelRole } from '@/app/ai/models/store'

/**
 * Attached images reach the model as file parts on the direct transport, but
 * ACP/Harness transports only forward the last message's text, and a Design
 * model without the `vision` capability cannot read them at all.
 */
export function resolveImageSupport(
  providerID: string,
  capabilities: readonly string[]
): ImageSupport {
  if (providerID.startsWith('acp:') || providerID === 'harness:pi') {
    return { kind: 'unsupported', reason: 'agent-transport' }
  }
  if (!capabilities.includes('vision'))
    return { kind: 'unsupported', reason: 'no-vision-capability' }
  return { kind: 'direct' }
}

/** Capabilities of the Design model that a submission would actually use. */
export function designModelCapabilities(): readonly string[] {
  return resolveAIModelRole('design')?.profile.capabilities ?? []
}
