import type { CredentialRef } from '@/app/settings/credentials/types'
import { CredentialStoreError } from '@/app/settings/credentials/types'

const CREDENTIAL_SEGMENT_PATTERN = /^[a-z0-9._-]{1,64}$/
const MAX_CREDENTIAL_LENGTH = 16 * 1024

export function credentialKey(reference: CredentialRef): string {
  const segments = [reference.integrationId, reference.profileId, reference.field]
  if (!segments.every((segment) => CREDENTIAL_SEGMENT_PATTERN.test(segment))) {
    throw new CredentialStoreError('invalid-reference', 'Credential reference is invalid')
  }
  return `v1:${segments.join(':')}`
}

export function validateCredentialValue(value: string): void {
  if (!value || new TextEncoder().encode(value).byteLength > MAX_CREDENTIAL_LENGTH) {
    throw new CredentialStoreError('invalid-value', 'Credential value is invalid')
  }
}

export function credentialRef(
  integrationId: string,
  field: string,
  profileId = 'default'
): CredentialRef {
  const reference = { integrationId, profileId, field }
  credentialKey(reference)
  return reference
}

export interface ParsedCredentialKey {
  integrationId: string
  profileId: string
  field: string
}

/**
 * Parses a key produced by `credentialKey()` back into its reference.
 *
 * Returns `null` for anything that is not a well-formed current-format key, so
 * callers can ignore unknown or hostile values instead of guessing.
 */
export function parseCredentialKey(key: string): ParsedCredentialKey | null {
  const segments = key.split(':')
  // Current format is `v1:<integration>:<profile>:<field>`.
  if (segments.length !== 4) return null
  const [version, integrationId, profileId, field] = segments as [string, string, string, string]
  if (version !== 'v1') return null
  if (
    ![integrationId, profileId, field].every((segment) => CREDENTIAL_SEGMENT_PATTERN.test(segment))
  ) {
    return null
  }
  return { integrationId, profileId, field }
}
