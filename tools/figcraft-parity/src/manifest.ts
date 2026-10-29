export const capabilityStatuses = [
  'package-only',
  'ui-wired',
  'automation-wired',
  'verified',
  'missing',
  'blocked'
] as const

export type CapabilityStatus = (typeof capabilityStatuses)[number]

export type CapabilityEvidence = {
  feature: string
  referencePaths: string[]
  zenuxsSurfaces: {
    packages: string[]
    app: string[]
    ui: string[]
  }
  testEvidence: string[]
  status: CapabilityStatus
  note: string
}

function compareText(left: string, right: string) {
  if (left < right) return -1
  if (left > right) return 1
  return 0
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function requiredText(value: unknown, label: string) {
  if (typeof value !== 'string' || value.trim() === '') {
    throw new Error(`${label} must be a non-empty string`)
  }
  return value.trim()
}

function textList(value: unknown, label: string) {
  if (!Array.isArray(value)) {
    throw new TypeError(`${label} must be an array of non-empty strings`)
  }
  const entries = value.map((entry, index) => requiredText(entry, `${label}[${index}]`))
  return [...new Set(entries)].sort(compareText)
}

export function parseCapabilityEvidence(input: unknown): CapabilityEvidence[] {
  if (!Array.isArray(input)) {
    throw new TypeError('Capability evidence manifest must be an array')
  }

  const features = new Set<string>()
  const evidence = input.map((item, index): CapabilityEvidence => {
    const label = `Capability evidence[${index}]`
    if (!isRecord(item)) throw new Error(`${label} must be an object`)

    const feature = requiredText(item.feature, `${label}.feature`)
    if (features.has(feature)) {
      throw new Error(`duplicate capability evidence feature "${feature}"`)
    }
    features.add(feature)

    if (!isRecord(item.zenuxsSurfaces)) {
      throw new Error(`${label}.zenuxsSurfaces must be an object`)
    }
    const zenuxsSurfaces = {
      packages: textList(item.zenuxsSurfaces.packages, `${label}.zenuxsSurfaces.packages`),
      app: textList(item.zenuxsSurfaces.app, `${label}.zenuxsSurfaces.app`),
      ui: textList(item.zenuxsSurfaces.ui, `${label}.zenuxsSurfaces.ui`)
    }

    if (
      typeof item.status !== 'string' ||
      !capabilityStatuses.includes(item.status as CapabilityStatus)
    ) {
      throw new Error(`unknown capability evidence status "${String(item.status)}"`)
    }
    const status = item.status as CapabilityStatus
    const referencePaths = textList(item.referencePaths, `${label}.referencePaths`)
    const testEvidence = textList(item.testEvidence, `${label}.testEvidence`)
    const note = requiredText(item.note, `${label}.note`)

    if (
      status === 'verified' &&
      referencePaths.length === 0 &&
      testEvidence.length === 0 &&
      Object.values(zenuxsSurfaces).every((surfaces) => surfaces.length === 0)
    ) {
      throw new Error(`verified capability "${feature}" requires evidence`)
    }

    return {
      feature,
      referencePaths,
      zenuxsSurfaces,
      testEvidence,
      status,
      note
    }
  })

  return evidence.sort((left, right) => compareText(left.feature, right.feature))
}
