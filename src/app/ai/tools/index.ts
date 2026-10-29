import { valibotSchema } from '@ai-sdk/valibot'
import { tool } from 'ai'
import * as v from 'valibot'

import {
  CORE_TOOLS,
  EXTENDED_TOOLS,
  generateImage,
  registerComponentCatalog,
  registerGeneratedImageProvider,
  setActiveGeneratedImageProvider,
  sourceImage,
  toolsToAI
} from '@open-pencil/core/tools'
import type { StepBudget, ToolLogEntry } from '@open-pencil/core/tools'
import type { SceneNode } from '@open-pencil/scene-graph'

import { clearAIPendingWork, setAIPendingWork } from '@/app/ai/chat/build-state'
import {
  collectPageLayoutErrors,
  createLayoutCritic,
  type LayoutCritic,
  type LayoutCriticReport
} from '@/app/ai/chat/layout-critic'
import { resolveAIWorkRect } from '@/app/ai/chat/live-build'
import {
  createMediaCritic,
  type MediaCritic,
  type MediaCriticReport
} from '@/app/ai/chat/media-critic'
import {
  createPrototypeCritic,
  isPrototypeMutation,
  runPrototypeValidation,
  runZenuxsPrototypeValidation,
  type PrototypeCritic,
  type PrototypeCriticReport
} from '@/app/ai/chat/prototype-critic'
import { registerImageSourcingServicesForSession } from '@/app/ai/image-sourcing'
import { resolveImageGeneration, type ImageGenerationReason } from '@/app/ai/models/image'
import { createAIGeneratedImageProvider } from '@/app/ai/tools/image-gen-provider'
import { createZenuxsDesignTools } from '@/app/ai/tools/zenuxs-design'
import { makeFigmaFromStore } from '@/app/automation/bridge/figma-factory'
import { getActiveEditorStore } from '@/app/editor/active-store'
import type { EditorStore } from '@/app/editor/active-store'
import { ensureGraphFonts } from '@/app/editor/fonts'
import { useLibraryService } from '@/app/libraries'

export const MAX_AGENT_STEPS = 50

class RunState {
  toolLog: ToolLogEntry[] = []
  currentSteps = 0
  /** Post-generation prototype validation for this run (audit §4.6). */
  critic: PrototypeCritic = createPrototypeCritic()
  /** Post-generation overflow containment check for this run. */
  layout: LayoutCritic = createLayoutCritic()
  /** Post-generation image-slot check for this run. */
  media: MediaCritic = createMediaCritic()

  resetSteps(): void {
    this.currentSteps = 0
    this.critic.reset()
    this.layout.reset()
    this.media.reset()
  }

  hitLimit(): boolean {
    return this.currentSteps >= MAX_AGENT_STEPS
  }

  clear(): void {
    this.toolLog = []
    this.currentSteps = 0
    this.critic.reset()
    this.layout.reset()
    this.media.reset()
  }
}

const runStates = new WeakMap<EditorStore, RunState>()

function getRunState(store?: EditorStore): RunState {
  const target = store ?? getActiveEditorStore()
  const existing = runStates.get(target)
  if (existing) return existing
  const created = new RunState()
  runStates.set(target, created)
  return created
}

export function getToolLogEntries(store?: EditorStore): ToolLogEntry[] {
  return getRunState(store).toolLog
}

export function recordStep(store?: EditorStore): void {
  getRunState(store).currentSteps++
}

export function resetRunSteps(store?: EditorStore): void {
  getRunState(store).resetSteps()
}

export function didHitStepLimit(store?: EditorStore): boolean {
  return getRunState(store).hitLimit()
}

export function clearToolLogEntries(store?: EditorStore): void {
  getRunState(store).clear()
}

/**
 * Consumes the run's one automatic prototype repair round (audit §4.6): the
 * transport appends the returned instruction to the next model step. Null when
 * nothing validated false or the round is already spent.
 */
export function takePrototypeRepair(store: EditorStore): string | null {
  return getRunState(store).critic.takeRepair()
}

/** Critic verdicts for the debug log; safe to read at any time. */
export function getPrototypeCriticReport(store?: EditorStore): PrototypeCriticReport {
  return getRunState(store).critic.report()
}

/**
 * Consumes the run's one automatic overflow repair round: runs the real
 * containment check over the current page and, when anything escaped its area,
 * returns the instruction the transport appends to the next model step. Null
 * when nothing overflows or the round is already spent.
 */
export function takeLayoutRepair(store: EditorStore): string | null {
  const runState = getRunState(store)
  return runState.layout.takeRepair(collectPageLayoutErrors(makeFigmaFromStore(store)))
}

/** Layout critic verdicts for the debug log; safe to read at any time. */
export function getLayoutCriticReport(store?: EditorStore): LayoutCriticReport {
  return getRunState(store).layout.report()
}

/**
 * Consumes the run's one automatic image repair round: image placeholders the
 * run created but never filled are reported back to the model, so "add the
 * images" is not something the user has to ask for. Null when every slot was
 * filled, when no slot was created, or when the round is already spent.
 */
export function takeMediaRepair(store: EditorStore): string | null {
  // Without the verified sourcing tool the model cannot fill a slot, so the
  // repair would be an instruction it is unable to follow.
  if (!imageSourcingReady) return null
  return getRunState(store).media.takeRepair(store.snapshotPage().values())
}

/** Image critic verdicts for the debug log; safe to read at any time. */
export function getMediaCriticReport(store?: EditorStore): MediaCriticReport {
  return getRunState(store).media.report()
}

/**
 * Why `generate_image` is absent from the current session, or null when it is
 * available. Diagnostics and settings read this so a silently missing tool is
 * explainable instead of looking like the AI ignored the request.
 */
let imageGenerationReason: ImageGenerationReason | null = null

export function imageGenerationUnavailableReason(): ImageGenerationReason | null {
  return imageGenerationReason
}

/**
 * Whether the verified sourcing pipeline is active in this session.
 *
 * The system prompt advertises `source_image` only when it is, so the model is
 * never told about a tool that is not in its schema.
 */
let imageSourcingReady = false

export function isImageSourcingAvailable(): boolean {
  return imageSourcingReady
}

/**
 * Tools that place an image on the canvas without verifying it.
 *
 * They are removed from an AI session once the sourcing pipeline is active,
 * because every image the AI imports has to pass the vision verification.
 */
const UNVERIFIED_IMAGE_TOOLS: ReadonlySet<string> = new Set(['stock_photo', 'generate_image'])

export async function createAITools(store: EditorStore) {
  let beforeSnapshot: Map<string, SceneNode> | null = null
  const runState = getRunState(store)
  const libraryService = useLibraryService()
  libraryService.bindEditor(store)
  registerComponentCatalog(store.graph, libraryService)

  // The sourcing pipeline needs a Vision model: without one no image can be
  // verified, so it stays out of the session instead of importing unchecked
  // images.
  const sourcing = await registerImageSourcingServicesForSession()
  imageSourcingReady = sourcing.available

  // The image tool exists only when the active Design provider can actually
  // generate images. Hiding it beats exposing a tool that can only fail — the
  // model would spend a step and the user money discovering that.
  const imageGeneration = await resolveImageGeneration()
  const imageModel = imageGeneration.available ? imageGeneration.model : null
  imageGenerationReason =
    imageGeneration.available || sourcing.available ? null : imageGeneration.reason
  if (imageModel && !sourcing.available) {
    registerGeneratedImageProvider(createAIGeneratedImageProvider(imageModel))
    setActiveGeneratedImageProvider('ai-image-model')
  }

  const toolList = [
    ...CORE_TOOLS.filter((def) => !(sourcing.available && UNVERIFIED_IMAGE_TOOLS.has(def.name))),
    ...EXTENDED_TOOLS.filter((def) =>
      [
        'get_components',
        'list_libraries',
        'insert_library_component',
        'create_component',
        'create_instance',
        'combine_as_variants',
        'create_variable',
        'bind_variable',
        'create_collection',
        'list_variables',
        'list_collections',
        'export_image',
        'boolean_union',
        'boolean_subtract',
        'design_to_tokens'
      ].includes(def.name)
    ),
    ...(imageModel && !sourcing.available ? [generateImage] : []),
    ...(sourcing.available ? [sourceImage] : [])
  ]

  const coreTools = toolsToAI(
    toolList,
    {
      getFigma: () => makeFigmaFromStore(store),
      onBeforeExecute: (def, args) => {
        if (!def.mutates) return
        const nodeId = typeof args.id === 'string' ? args.id : null
        const targetBounds =
          nodeId && store.graph.getNode(nodeId) ? store.graph.getAbsoluteBounds(nodeId) : null
        const parentId = typeof args.parent_id === 'string' ? args.parent_id : null
        const parentAbs =
          parentId && store.graph.getNode(parentId)
            ? store.graph.getAbsolutePosition(parentId)
            : null
        const rect = resolveAIWorkRect(args, targetBounds, parentAbs)
        if (rect) setAIPendingWork({ rect, nodeId })
        if (targetBounds && nodeId) store.aiMarkActive([nodeId])
      },
      executeTool: async (def, figma, args) => {
        if (def.mutates) beforeSnapshot = store.snapshotPage()
        return def.mutates
          ? store.runMutationWithLayout(
              () => def.execute(figma, args),
              figma.currentPageId,
              async () => {
                const pageNode = store.graph.getNode(figma.currentPageId)
                if (pageNode) await ensureGraphFonts(store.graph, pageNode.childIds, store.renderer)
              }
            )
          : def.execute(figma, args)
      },
      onAfterExecute: async (def) => {
        store.renderer?.aiClearActive()
        clearAIPendingWork()
        if (def.mutates) {
          store.requestRender()
          if (beforeSnapshot) {
            const before = beforeSnapshot
            const after = store.snapshotPage()
            runState.media.noteCreated([...after.keys()].filter((nodeId) => !before.has(nodeId)))
            store.pushUndoEntry({
              label: `AI: ${def.name}`,
              forward: () => store.restorePageFromSnapshot(after),
              inverse: () => store.restorePageFromSnapshot(before)
            })
            beforeSnapshot = null
          }
          // Code-enforced MUTATE → VALIDATE (audit §4.6): after a prototype
          // write, run the real validator now — the transport feeds a failed
          // verdict back into the next model step as a bounded repair round.
          if (isPrototypeMutation(def.name)) {
            runState.critic.noteMutation()
            runState.critic.recordValidation(runPrototypeValidation(makeFigmaFromStore(store)))
          }
          // Any write can push a sibling past its container, so containment is
          // checked for every mutation before the model gets to reply.
          runState.layout.noteMutation()
        }
      },
      onFlashNodes: (nodeIds) => {
        if (nodeIds.length > 0) {
          store.aiFlashDone(nodeIds)
        }
      },
      onToolLog: (entry) => {
        runState.toolLog.push(entry)
      },
      getStepBudget: (): StepBudget => ({
        current: runState.currentSteps,
        max: MAX_AGENT_STEPS
      })
    },
    { v, valibotSchema, tool }
  )

  return {
    ...coreTools,
    ...createZenuxsDesignTools(store, {
      onBeforeExecute: (name, args) => {
        const nodeId = typeof args.id === 'string' ? args.id : null
        const targetBounds =
          nodeId && store.graph.getNode(nodeId) ? store.graph.getAbsoluteBounds(nodeId) : null
        const parentId =
          typeof args.parentId === 'string'
            ? args.parentId
            : typeof args.destinationFrameId === 'string'
              ? args.destinationFrameId
              : null
        const parentAbs =
          parentId && store.graph.getNode(parentId)
            ? store.graph.getAbsolutePosition(parentId)
            : null
        const rect = resolveAIWorkRect(args, targetBounds, parentAbs)
        if (rect) setAIPendingWork({ rect, nodeId })
        if (targetBounds && nodeId) store.aiMarkActive([nodeId])
        void name
      },
      onAfterExecute: () => {
        store.renderer?.aiClearActive()
        clearAIPendingWork()
        store.requestRender()
      },
      onError: () => {
        store.renderer?.aiClearActive()
        clearAIPendingWork()
        store.requestRender()
      },
      onPrototypeMutation: () => {
        runState.critic.noteMutation()
        runState.critic.recordValidation(runZenuxsPrototypeValidation())
      },
      onLayoutMutation: () => {
        runState.layout.noteMutation()
      },
      onFlashNodes: (nodeIds) => {
        if (nodeIds.length > 0) store.aiFlashDone(nodeIds)
      },
      onToolLog: (entry) => {
        runState.toolLog.push(entry)
      },
      getStepBudget: (): StepBudget => ({
        current: runState.currentSteps,
        max: MAX_AGENT_STEPS
      })
    })
  }
}
export type AITools = ReturnType<typeof createAITools>
