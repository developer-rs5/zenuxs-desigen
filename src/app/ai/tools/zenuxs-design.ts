import { valibotSchema } from '@ai-sdk/valibot'
import { tool } from 'ai'
import * as v from 'valibot'

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

function runDesignCommand(
  store: EditorStore,
  command: string,
  getParams: () => Record<string, unknown>
): { nodeIds: string[] } {
  const engine = getZenuxsEngine()
  const engineState = engine.ds()
  const previousDocument = engineState.doc
  const previousPage = engineState.page
  const previousSelection = [...engineState.selection]
  const before = store.snapshotPage()
  const activePageId = store.state.currentPageId
  const selectedIds = [...store.state.selectedIds]
  let graphWasSynced = false

  try {
    zenuxsBridge.syncToZenuxs(store.graph, activePageId)
    graphWasSynced = true
    const activePage = zenuxsBridge.toEngineId(activePageId)
    const selection = selectedIds.map((id) => zenuxsBridge.toEngineId(id))
    engine.ds().page = activePage
    engine.ds().selection = selection

    const result = engine.execute(command, getParams())
    if ('ok' in result && result.ok === false) {
      throw new Error(`Engine command "${command}" did not complete successfully.`)
    }

    const patch = zenuxsBridge.applyEngineChanges(store.graph)
    if (!patch.changed) throw new Error(`Engine command "${command}" did not change the document.`)
    settleLayout(store, patch)

    store.pushUndoEntry({
      label: `AI: ${command}`,
      forward: () => {
        reapplyEnginePatch(store.graph, patch)
        settleLayout(store, patch)
        store.requestRender()
      },
      inverse: () => {
        revertEnginePatch(store.graph, patch)
        settleLayout(store, patch)
        store.requestRender()
      }
    })
    store.requestRender()

    engine.ds().page = activePage
    engine.ds().selection = selection
    return {
      nodeIds: [
        ...patch.created.map(({ node }) => node.id),
        ...patch.fieldChanges.map(({ id }) => id)
      ]
    }
  } catch (error) {
    if (graphWasSynced) store.restorePageFromSnapshot(before)
    engine.ds().doc = previousDocument
    engine.ds().page = previousPage
    engine.ds().selection = previousSelection
    throw new Error(`Zenuxs design command "${command}" failed: ${errorMessage(error)}`)
  }
}

export function createZenuxsDesignTools(store: EditorStore) {
  return {
    zenuxs_create_screen: tool({
      description: 'Create a screen frame on the current page.',
      inputSchema: valibotSchema(screenSchema),
      execute: async (input) => {
        const request = v.parse(screenSchema, input)
        const { nodeIds } = runDesignCommand(store, 'shape.frame', () => request)
        return { createdNodeIds: nodeIds }
      }
    }),
    zenuxs_create_rectangle: tool({
      description: 'Create a rectangle on the current page.',
      inputSchema: valibotSchema(rectangleSchema),
      execute: async (input) => {
        const request = v.parse(rectangleSchema, input)
        const { nodeIds } = runDesignCommand(store, 'shape.rectangle', () => request)
        return { createdNodeIds: nodeIds }
      }
    }),
    zenuxs_create_text: tool({
      description: 'Create a text node on the current page.',
      inputSchema: valibotSchema(textSchema),
      execute: async (input) => {
        const request = v.parse(textSchema, input)
        const { nodeIds } = runDesignCommand(store, 'text.create', () => request)
        return { createdNodeIds: nodeIds }
      }
    }),
    zenuxs_create_vector: tool({
      description: 'Create an open or closed vector path on the current page.',
      inputSchema: valibotSchema(vectorSchema),
      execute: async (input) => {
        const request = v.parse(vectorSchema, input)
        const { nodeIds } = runDesignCommand(store, 'shape.vector', () => request)
        return { createdNodeIds: nodeIds }
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
        const { nodeIds } = runDesignCommand(store, 'node.set', () => {
          const { id, fills, ...properties } = request
          return {
            id: zenuxsBridge.toEngineId(id),
            props: {
              ...properties,
              ...(fills === undefined ? {} : { fills })
            }
          }
        })
        return { updatedNodeIds: nodeIds }
      }
    }),
    zenuxs_make_component: tool({
      description: 'Mark an existing node as a reusable component.',
      inputSchema: valibotSchema(componentSchema),
      execute: async (input) => {
        const request = v.parse(componentSchema, input)
        requireNode(store, request.id, 'Node')
        const { nodeIds } = runDesignCommand(store, 'component.create', () => ({
          id: zenuxsBridge.toEngineId(request.id),
          description: request.description ?? ''
        }))
        return { componentNodeIds: nodeIds }
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

        const { nodeIds } = runDesignCommand(store, 'proto.interaction.add', () => ({
          id: zenuxsBridge.toEngineId(request.sourceId),
          dest: zenuxsBridge.toEngineId(request.destinationFrameId),
          trigger: 'onClick',
          transition: 'instant',
          durationMs: 300
        }))
        return { updatedNodeIds: nodeIds }
      }
    })
  }
}
