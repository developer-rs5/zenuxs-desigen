import type { FigCraftCommand, ZenuxsCommand } from './command-catalog'
import { parseCapabilityEvidence, type CapabilityEvidence } from './manifest'

export const figCraftRevision = '92b83521afc0fc4abbcfb0c7adb169d5674647b5'

export type InventoryCommand = {
  id: string
  source: string
}

export type ParityInventory = {
  figcraftRevision: string
  implemented: InventoryCommand[]
  missing: InventoryCommand[]
  collaborationExcluded: InventoryCommand[]
  unmatchedZenuxs: InventoryCommand[]
  duplicateZenuxs: Array<{ id: string; count: number }>
  capabilities: CapabilityEvidence[]
}

function compareText(left: string, right: string) {
  if (left < right) return -1
  if (left > right) return 1
  return 0
}

function sortedCommands(commands: InventoryCommand[]) {
  return commands.sort(
    (left, right) => compareText(left.id, right.id) || compareText(left.source, right.source)
  )
}

export function buildInventory(
  reference: FigCraftCommand[],
  zenuxs: ZenuxsCommand[],
  evidence: CapabilityEvidence[]
): ParityInventory {
  const referenceIds = new Set<string>()
  for (const command of reference) {
    if (!command.id.trim()) throw new Error('FigCraft command ID must not be empty')
    if (!command.source.trim()) throw new Error(`FigCraft command "${command.id}" has no source`)
    if (typeof command.collaboration !== 'boolean') {
      throw new TypeError(
        `FigCraft command "${command.id}" must have an explicit collaboration classification`
      )
    }
    if (referenceIds.has(command.id)) {
      throw new Error(`duplicate FigCraft command ID "${command.id}"`)
    }
    referenceIds.add(command.id)
  }

  const zenuxsCounts = new Map<string, number>()
  for (const command of zenuxs) {
    if (!command.id.trim()) throw new Error('Zenuxs command ID must not be empty')
    zenuxsCounts.set(command.id, (zenuxsCounts.get(command.id) ?? 0) + 1)
  }
  const zenuxsIds = new Set(zenuxsCounts.keys())
  const implemented: InventoryCommand[] = []
  const missing: InventoryCommand[] = []
  const collaborationExcluded: InventoryCommand[] = []

  for (const command of reference) {
    const row = { id: command.id, source: command.source }
    if (command.collaboration) {
      collaborationExcluded.push(row)
    } else if (zenuxsIds.has(command.id)) {
      implemented.push(row)
    } else {
      missing.push(row)
    }
  }

  const unmatchedZenuxs = [...zenuxsIds]
    .filter((id) => !referenceIds.has(id))
    .map((id) => ({ id, source: 'Session.all_commands()' }))
  const duplicateZenuxs = [...zenuxsCounts]
    .filter(([, count]) => count > 1)
    .map(([id, count]) => ({ id, count }))
    .sort((left, right) => compareText(left.id, right.id))

  return {
    figcraftRevision: figCraftRevision,
    implemented: sortedCommands(implemented),
    missing: sortedCommands(missing),
    collaborationExcluded: sortedCommands(collaborationExcluded),
    unmatchedZenuxs: sortedCommands(unmatchedZenuxs),
    duplicateZenuxs,
    capabilities: parseCapabilityEvidence(evidence)
  }
}
