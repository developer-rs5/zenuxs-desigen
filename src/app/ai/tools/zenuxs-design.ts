import { valibotSchema } from '@ai-sdk/valibot'
import { tool } from 'ai'
import * as v from 'valibot'

import type { StepBudget, ToolLogEntry } from '@open-pencil/core/tools'
import type { SceneNode } from '@open-pencil/scene-graph'

import type { EditorStore } from '@/app/editor/active-store'
import { reapplyEnginePatch, revertEnginePatch, zenuxsBridge } from '@/app/zenuxs-bridge'
import { getZenuxsEngine } from '@/app/zenuxs-engine'

const MAX_NAME_LENGTH = 200
const MAX_VECTOR_POINTS = 500
const MAX_TEXT_LENGTH = 10_000
const MAX_DIMENSION = 10_000
const MAX_POSITION = 100_000
const MAX_FILL_COUNT = 16

const coordinate = v.pipe(v.number(), v.minValue(-MAX_POSITION), v.maxValue(MAX_POSITION))
const dimension = v.pipe(v.number(), v.minValue(1), v.maxValue(MAX_DIMENSION))
const radius = v.pipe(v.number(), v.minValue(0), v.maxValue(MAX_DIMENSION))
const name = v.optional(v.pipe(v.string(), v.minLength(1), v.maxLength(MAX_NAME_LENGTH)))

const colorSchema = v.strictObject({
  r: v.pipe(v.number(), v.minValue(0), v.maxValue(1)),
  g: v.pipe(v.number(), v.minValue(0), v.maxValue(1)),
  b: v.pipe(v.number(), v.minValue(0), v.maxValue(1)),
  a: v.optional(v.pipe(v.number(), v.minValue(0), v.maxValue(1)))
})

const solidFillSchema = v.strictObject({
  type: v.literal('SOLID'),
  color: colorSchema,
  opacity: v.optional(v.pipe(v.number(), v.minValue(0), v.maxValue(1))),
  visible: v.optional(v.boolean())
})

const fillsSchema = v.pipe(v.array(solidFillSchema), v.maxLength(MAX_FILL_COUNT))

const placementSchema = {
  name,
  x: v.optional(coordinate),
  y: v.optional(coordinate),
  width: v.optional(dimension),
  height: v.optional(dimension),
  cornerRadius: v.optional(radius)
}

const screenSchema = v.strictObject(placementSchema)
const rectangleSchema = v.strictObject(placementSchema)
const textSchema = v.strictObject({
  name,
  x: v.optional(coordinate),
  y: v.optional(coordinate),
  characters: v.pipe(v.string(), v.maxLength(MAX_TEXT_LENGTH)),
  fontSize: v.optional(v.pipe(v.number(), v.minValue(1), v.maxValue(512)))
})
const vectorSchema = v.strictObject({
  name,
  points: v.pipe(
    v.array(v.tuple([coordinate, coordinate])),
    v.minLength(2),
    v.maxLength(MAX_VECTOR_POINTS)
  ),
  closed: v.optional(v.boolean())
})

const nodePropertiesSchema = v.strictObject({
  id: v.pipe(v.string(), v.minLength(1), v.maxLength(256)),
  name,
  x: v.optional(coordinate),
  y: v.optional(coordinate),
  width: v.optional(dimension),
  height: v.optional(dimension),
  cornerRadius: v.optional(radius),
  fills: v.optional(fillsSchema)
})

const componentSchema = v.strictObject({
  id: v.pipe(v.string(), v.minLength(1), v.maxLength(256)),
  description: v.optional(v.pipe(v.string(), v.maxLength(1000)))
})

const navigationSchema = v.strictObject({
  sourceId: v.pipe(v.string(), v.minLength(1), v.maxLength(256)),
  destinationFrameId: v.pipe(v.string(), v.minLength(1), v.maxLength(256))
})

export interface ZenuxsDesignToolLifecycle {
  onBeforeExecute?: (name: string, args: Record<string, unknown>) => void
  onAfterExecute?: (
    name: string,
    args: Record<string, unknown>,
    command: string
  ) => void | Promise<void>
  onFlashNodes?: (nodeIds: string[]) => void
  onToolLog?: (entry: ToolLogEntry) => void
  /** A prototype-writing tool ran; the caller records and validates it. */
  onPrototypeMutation?: () => void
  /** Any write can push siblings past a container, so layout is re-checked. */
  onLayoutMutation?: () => void
  onError?: () => void
  getStepBudget?: () => StepBudget
}

/** Tools whose result can invalidate authored prototype behavior. */
const PROTOTYPE_MUTATION_TOOLS: ReadonlySet<string> = new Set(['zenuxs_add_navigation'])

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

function requireNode(store: EditorStore, id: string, label: string): SceneNode {
  const node = store.graph.getNode(id)
  if (!node) throw new Error(`${label} "${id}" does not exist in the current document.`)
  return node
}

function settleLayout(
  store: EditorStore,
  patch: ReturnType<typeof zenuxsBridge.applyEngineChanges>
) {
  const touched = [
    ...patch.created.map(({ node }) => node.id),
    ...patch.fieldChanges.map(({ id }) => id),
    ...patch.parentMoves.map(({ id }) => id),
    ...patch.deleted.flatMap(({ nodes }) => nodes.map(({ id }) => id))
  ]
  for (const id of new Set(touched)) {
    if (store.graph.getNode(id)) store.runLayoutForNode(id)
  }
}

function appendStepWarning(result: unknown, budget: StepBudget): unknown {
  const remaining = budget.max - budget.current
  if (remaining > 5) return result
  const warning = `⚠ ${remaining} steps remaining out of ${budget.max}. Wrap up: finish critical fixes, skip polish. User can send "continue" for more steps.`
  return result && typeof result === 'object' && !Array.isArray(result)
    ? { ...result, _warning: warning }
    : { result, _warning: warning }
}

function runDesignCommand(
  store: EditorStore,
  lifecycle: ZenuxsDesignToolLifecycle,
  toolName: string,
  args: Record<string, unknown>,
  command: string,
  getParams: () => Record<string, unknown>,
  resultFor: (nodeIds: string[]) => Record<string, unknown>
): Promise<Record<string, unknown>> {
  const engine = getZenuxsEngine()
  const engineState = engine.ds()
  const previousDocument = engineState.doc
  const previousSavedDocument = engineState.saved_doc
  const previousPage = engineState.page
  const previousSelection = [...engineState.selection]
  const previousRevision = engineState.revision
  const previousUid = engineState.uid
  const previousUndo = [...engineState.history.undo]
  const previousRedo = [...engineState.history.redo]
  const previousJournal = [...engine.journal]
  const previousMessage = engine.message
  const previousUIRequests = [...engine.ui_requests]
  const before = store.snapshotPage()
  const activePageId = store.state.currentPageId
  const selectedIds = [...store.state.selectedIds]
  let graphWasSynced = false
  const startedAt = Date.now()

  const restoreEngine = (): void => {
    engineState.doc = previousDocument
    engineState.saved_doc = previousSavedDocument
    engineState.page = previousPage
    engineState.selection = previousSelection
    engineState.revision = previousRevision
    engineState.uid = previousUid
    engineState.history.undo = previousUndo
    engineState.history.redo = previousRedo
    engine.journal = previousJournal
    engine.message = previousMessage
    engine.ui_requests = previousUIRequests
  }

  const undoSafeSync = (): void => {
    const state = getZenuxsEngine().ds()
    const priorDocument = state.doc
    const priorPage = state.page
    const priorSelection = [...state.selection]
    const priorUndo = [...state.history.undo]
    const priorRedo = [...state.history.redo]
    try {
      zenuxsBridge.syncToZenuxs(store.graph, store.state.currentPageId)
      state.page = zenuxsBridge.toEngineId(store.state.currentPageId)
      state.selection = [...store.state.selectedIds].map((id) => zenuxsBridge.toEngineId(id))
      state.history.undo = []
      state.history.redo = []
    } catch (error) {
      state.doc = priorDocument
      state.page = priorPage
      state.selection = priorSelection
      state.history.undo = priorUndo
      state.history.redo = priorRedo
      throw error
    }
  }

  return (async () => {
    try {
      lifecycle.onBeforeExecute?.(toolName, args)
      zenuxsBridge.syncToZenuxs(store.graph, activePageId)
      graphWasSynced = true
      const activePage = zenuxsBridge.toEngineId(activePageId)
      const selection = selectedIds.map((id) => zenuxsBridge.toEngineId(id))
      engineState.page = activePage
      engineState.selection = selection
      engineState.history.undo = []
      engineState.history.redo = []

      const commandResult = engine.execute(command, getParams())
      if ('ok' in commandResult && commandResult.ok === false) {
        throw new Error(`Engine command "${command}" did not complete successfully.`)
      }

      const patch = zenuxsBridge.applyEngineChanges(store.graph)
      if (!patch.changed) throw new Error(`Engine command "${command}" did not change the document.`)
      settleLayout(store, patch)
      const nodeIds = [
        ...patch.created.map(({ node }) => node.id),
        ...patch.fieldChanges.map(({ id }) => id)
      ]
      const result = resultFor(nodeIds)

      engineState.page = activePage
      engineState.selection = selection
      engineState.history.undo = []
      engineState.history.redo = []
      store.requestRender()
      if (PROTOTYPE_MUTATION_TOOLS.has(toolName)) lifecycle.onPrototypeMutation?.()
      lifecycle.onLayoutMutation?.()
      lifecycle.onFlashNodes?.(nodeIds)
      lifecycle.onToolLog?.({
        tool: toolName,
        args,
        result,
        timestamp: startedAt,
        durationMs: Date.now() - startedAt,
        mutates: true
      })
      await lifecycle.onAfterExecute?.(toolName, args, command)
      const budget = lifecycle.getStepBudget?.()
      const output = budget ? appendStepWarning(result, budget) : result

      store.pushUndoEntry({
        label: `AI: ${toolName}`,
        forward: () => {
          const graphBefore = store.snapshotPage()
          try {
            reapplyEnginePatch(store.graph, patch)
            settleLayout(store, patch)
            undoSafeSync()
            store.requestRender()
          } catch (error) {
            store.restorePageFromSnapshot(graphBefore)
            throw error
          }
        },
        inverse: () => {
          const graphBefore = store.snapshotPage()
          try {
            revertEnginePatch(store.graph, patch)
            settleLayout(store, patch)
            undoSafeSync()
            store.requestRender()
          } catch (error) {
            store.restorePageFromSnapshot(graphBefore)
            throw error
          }
        }
      })
      return output as Record<string, unknown>
    } catch (error) {
      if (graphWasSynced) store.restorePageFromSnapshot(before)
      restoreEngine()
      const message = `Zenuxs design command "${command}" failed: ${errorMessage(error)}`
      try {
        lifecycle.onToolLog?.({
          tool: toolName,
          args,
          result: null,
          error: message,
          timestamp: startedAt,
          durationMs: Date.now() - startedAt,
          mutates: true
        })
      } finally {
        lifecycle.onError?.()
      }
      throw new Error(message)
    }
  })()
}

export function createZenuxsDesignTools(
  store: EditorStore,
  lifecycle: ZenuxsDesignToolLifecycle = {}
) {
  return {
    zenuxs_create_screen: tool({
      description: 'Create a screen frame on the current page.',
      inputSchema: valibotSchema(screenSchema),
      execute: async (input) => {
        const request = v.parse(screenSchema, input)
        return runDesignCommand(store, lifecycle, 'zenuxs_create_screen', { ...request }, 'shape.frame', () => request, (ids) => ({
          createdNodeIds: ids
        }))
      }
    }),
    zenuxs_create_rectangle: tool({
      description: 'Create a rectangle on the current page.',
      inputSchema: valibotSchema(rectangleSchema),
      execute: async (input) => {
        const request = v.parse(rectangleSchema, input)
        return runDesignCommand(
          store,
          lifecycle,
          'zenuxs_create_rectangle',
          { ...request },
          'shape.rectangle',
          () => request,
          (ids) => ({ createdNodeIds: ids })
        )
      }
    }),
    zenuxs_create_text: tool({
      description: 'Create a text node on the current page.',
      inputSchema: valibotSchema(textSchema),
      execute: async (input) => {
        const request = v.parse(textSchema, input)
        return runDesignCommand(
          store,
          lifecycle,
          'zenuxs_create_text',
          { ...request },
          'text.create',
          () => request,
          (ids) => ({ createdNodeIds: ids })
        )
      }
    }),
    zenuxs_create_vector: tool({
      description: 'Create an open or closed vector path on the current page.',
      inputSchema: valibotSchema(vectorSchema),
      execute: async (input) => {
        const request = v.parse(vectorSchema, input)
        return runDesignCommand(
          store,
          lifecycle,
          'zenuxs_create_vector',
          { ...request },
          'shape.vector',
          () => request,
          (ids) => ({ createdNodeIds: ids })
        )
      }
    }),
    zenuxs_set_node_properties: tool({
      description: 'Set a node name, position, dimensions, solid fills, or uniform corner radius.',
      inputSchema: valibotSchema(nodePropertiesSchema),
      execute: async (input) => {
        const request = v.parse(nodePropertiesSchema, input)
        requireNode(store, request.id, 'Node')
        if (
          request.name === undefined &&
          request.x === undefined &&
          request.y === undefined &&
          request.width === undefined &&
          request.height === undefined &&
          request.cornerRadius === undefined &&
          request.fills === undefined
        ) {
          throw new Error('At least one supported visual property is required.')
        }
        return runDesignCommand(store, lifecycle, 'zenuxs_set_node_properties', { ...request }, 'node.set', () => {
          const { id, fills, ...properties } = request
          return {
            id: zenuxsBridge.toEngineId(id),
            props: {
              ...properties,
              ...(fills === undefined ? {} : { fills })
            }
          }
        }, (ids) => ({ updatedNodeIds: ids }))
      }
    }),
    zenuxs_make_component: tool({
      description: 'Mark an existing node as a reusable component.',
      inputSchema: valibotSchema(componentSchema),
      execute: async (input) => {
        const request = v.parse(componentSchema, input)
        requireNode(store, request.id, 'Node')
        return runDesignCommand(store, lifecycle, 'zenuxs_make_component', { ...request }, 'component.create', () => ({
          id: zenuxsBridge.toEngineId(request.id),
          description: request.description ?? ''
        }), (ids) => ({ componentNodeIds: ids }))
      }
    }),
    zenuxs_add_navigation: tool({
      description: 'Add a click-to-navigate interaction to an existing frame.',
      inputSchema: valibotSchema(navigationSchema),
      execute: async (input) => {
        const request = v.parse(navigationSchema, input)
        requireNode(store, request.sourceId, 'Navigation source')
        const destination = requireNode(store, request.destinationFrameId, 'Destination frame')
        if (destination.type !== 'FRAME') {
          throw new Error(
            `Navigation destination "${request.destinationFrameId}" must be an existing frame.`
          )
        }

        return runDesignCommand(store, lifecycle, 'zenuxs_add_navigation', { ...request }, 'proto.interaction.add', () => ({
          id: zenuxsBridge.toEngineId(request.sourceId),
          dest: zenuxsBridge.toEngineId(request.destinationFrameId),
          trigger: 'onClick',
          transition: 'instant',
          durationMs: 300
        }), (ids) => ({ updatedNodeIds: ids }))
      }
    })
  }
}
