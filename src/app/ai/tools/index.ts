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
  toolsToAI
} from '@open-pencil/core/tools'
import type { StepBudget, ToolLogEntry } from '@open-pencil/core/tools'
import type { SceneNode } from '@open-pencil/scene-graph'

import { clearAIPendingWork, setAIPendingWork } from '@/app/ai/chat/build-state'
import { resolveAIWorkRect } from '@/app/ai/chat/live-build'
import {
  createPrototypeCritic,
  isPrototypeMutation,
  runPrototypeValidation,
  type PrototypeCritic,
  type PrototypeCriticReport
} from '@/app/ai/chat/prototype-critic'
import { resolveImageModel } from '@/app/ai/models/image'
import { createAIGeneratedImageProvider } from '@/app/ai/tools/image-gen-provider'
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

  resetSteps(): void {
    this.currentSteps = 0
    this.critic.reset()
  }

  hitLimit(): boolean {
    return this.currentSteps >= MAX_AGENT_STEPS
  }

  clear(): void {
    this.toolLog = []
    this.currentSteps = 0
    this.critic.reset()
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

export async function createAITools(store: EditorStore) {
  let beforeSnapshot: Map<string, SceneNode> | null = null
  const runState = getRunState(store)
  const libraryService = useLibraryService()
  libraryService.bindEditor(store)
  registerComponentCatalog(store.graph, libraryService)

  // The image tool exists only when the active Design provider can actually
  // generate images. Hiding it beats exposing a tool that can only fail — the
  // model would spend a step and the user money discovering that.
  const imageModel = await resolveImageModel()
  if (imageModel) {
    registerGeneratedImageProvider(createAIGeneratedImageProvider(imageModel))
    setActiveGeneratedImageProvider('ai-image-model')
  }

  return toolsToAI(
    [
      ...CORE_TOOLS,
      ...EXTENDED_TOOLS.filter((def) =>
        ['get_components', 'list_libraries', 'insert_library_component'].includes(def.name)
      ),
      ...(imageModel ? [generateImage] : [])
    ],
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
}

export type AITools = ReturnType<typeof createAITools>
