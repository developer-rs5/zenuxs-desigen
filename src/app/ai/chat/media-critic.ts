import type { SceneNode } from '@open-pencil/scene-graph'

/**
 * Automatic image-slot enforcement for AI-built designs.
 *
 * The prompt makes imagery part of the build ("every image slot must be filled
 * before you reply"), but a long run can still end with the placeholders it
 * created still gray — the model plans the page, fills the text, and stops.
 * This is the code path that catches it: nodes created during the run whose
 * names promise an image but which carry no IMAGE fill are reported back as a
 * bounded repair round, the same shape as the prototype and layout critics.
 *
 * Detection is deliberately narrow so a run is never interrupted for a design
 * decision:
 *
 * - only nodes created in this run are considered, never the user's own work;
 * - the name has to announce an image (the prompt asks the model to name slots
 *   `HeroImg`, `StoryMainImg`, …), so a decorative rectangle is not a slot;
 * - the node must be a leaf shape/frame at least 64px on both edges, so icons,
 *   rules, and small chips are excluded;
 * - a visible or hidden IMAGE fill counts as filled.
 */

/** One automatic repair round per run: check → repair → check again, then stop. */
export const MAX_MEDIA_REPAIR_ROUNDS = 1

const IMAGE_SLOT_NAME_PATTERN =
  /(img|image|photo|picture|thumbnail|thumb|avatar|artwork|banner|cover|hero-?visual|media)/i

const IMAGE_SLOT_TYPES: ReadonlySet<SceneNode['type']> = new Set(['RECTANGLE', 'ELLIPSE', 'FRAME'])

const MIN_SLOT_EDGE = 64

export interface MediaSlot {
  id: string
  name: string
  /** Scene type of the placeholder (RECTANGLE, ELLIPSE, or FRAME). */
  type: SceneNode['type']
  width: number
  height: number
}

function hasImageFill(node: SceneNode): boolean {
  return node.fills.some((fill) => fill.type === 'IMAGE')
}

/**
 * Image placeholders among `createdIds` that still have no image.
 *
 * `nodes` is the page snapshot after the run, so a slot that was filled by
 * `source_image` no longer appears.
 */
export function findUnfilledImageSlots(
  nodes: Iterable<SceneNode>,
  createdIds: ReadonlySet<string>
): MediaSlot[] {
  const slots: MediaSlot[] = []
  for (const node of nodes) {
    if (!createdIds.has(node.id)) continue
    if (!IMAGE_SLOT_TYPES.has(node.type)) continue
    if (node.childIds.length > 0) continue
    if (node.width < MIN_SLOT_EDGE || node.height < MIN_SLOT_EDGE) continue
    if (!IMAGE_SLOT_NAME_PATTERN.test(node.name)) continue
    if (hasImageFill(node)) continue
    slots.push({
      id: node.id,
      name: node.name,
      type: node.type,
      width: Math.round(node.width),
      height: Math.round(node.height)
    })
  }
  return slots
}

export function buildMediaRepairInstruction(slots: readonly MediaSlot[]): string {
  const listed = slots
    .slice(0, 12)
    .map((slot) => `- ${slot.name} (${slot.id}) — ${slot.width}×${slot.height}`)
  if (slots.length > 12) listed.push(`- …and ${slots.length - 12} more`)

  return [
    'Automatic image check: this run created image placeholders that are still empty.',
    ...listed,
    'Every image slot you create is part of the build, not an optional extra. Fill them now with one `source_image` call: pass each id with a plain-English subject and the style the design uses. Do not leave a gray block you created yourself, and do not replace it with a hand-drawn shape. Keep the placeholder only if sourcing reports the slot as unverified, and say so in your reply.'
  ].join('\n')
}

export interface MediaCriticReport {
  /** Nodes created during this run, across all mutating tools. */
  createdCount: number
  /** Unfilled slots seen at the last check. */
  slots: MediaSlot[]
  repairRoundsUsed: number
  lastRepair: string | null
}

/** Per-run media state; the tool loop owns exactly one and resets it per message. */
export interface MediaCritic {
  noteCreated(nodeIds: readonly string[]): void
  /** Consumes the one allowed repair round; null when nothing is empty or it is spent. */
  takeRepair(nodes: Iterable<SceneNode>): string | null
  report(): MediaCriticReport
  reset(): void
}

export function createMediaCritic(): MediaCritic {
  const createdIds = new Set<string>()
  let slots: MediaSlot[] = []
  let repairRoundsUsed = 0
  let lastRepair: string | null = null

  return {
    noteCreated: (nodeIds) => {
      for (const id of nodeIds) createdIds.add(id)
    },
    takeRepair: (nodes) => {
      if (createdIds.size === 0) return null
      slots = findUnfilledImageSlots(nodes, createdIds)
      if (slots.length === 0) return null
      if (repairRoundsUsed >= MAX_MEDIA_REPAIR_ROUNDS) return null
      repairRoundsUsed += 1
      lastRepair = buildMediaRepairInstruction(slots)
      return lastRepair
    },
    report: () => ({ createdCount: createdIds.size, slots, repairRoundsUsed, lastRepair }),
    reset: () => {
      createdIds.clear()
      slots = []
      repairRoundsUsed = 0
      lastRepair = null
    }
  }
}
