import { OPEN_PENCIL_PLUGIN_ID } from '@open-pencil/fig/node-change'
import { remapPrototypePluginValue } from '@open-pencil/scene-graph'
import type { ComponentPropertyDefinition, SceneGraph } from '@open-pencil/scene-graph'

/**
 * Post-import ID remapping: exported GUIDs mint fresh node ids during import,
 * so cross-node references stored as GUIDs (components, instance-swap props,
 * prototype pluginData, variant prop specs) are rewritten once every node has
 * its id. Split from `import.ts` to keep the import pipeline readable.
 */

export function remapComponentIds(graph: SceneGraph, guidToNodeId: Map<string, string>): void {
  graph.preserveSourceMetadataDuring(() => {
    for (const node of graph.getAllNodes()) {
      if (node.type !== 'INSTANCE' || !node.componentId) continue
      const remapped = guidToNodeId.get(node.componentId)
      if (remapped) graph.updateNode(node.id, { componentId: remapped })
    }
  })
}

/**
 * INSTANCE_SWAP definitions/assignments store a target node's GUID (matching
 * how it was exported), not this import's freshly-assigned node ID — remap
 * them the same way remapComponentIds fixes up instance.componentId.
 */
export function remapInstanceSwapPropertyValues(
  graph: SceneGraph,
  guidToNodeId: Map<string, string>
): void {
  const defsById = new Map<string, ComponentPropertyDefinition>()
  for (const node of graph.getAllNodes()) {
    for (const def of node.componentPropertyDefinitions) {
      if (!defsById.has(def.id)) defsById.set(def.id, def)
    }
  }

  graph.preserveSourceMetadataDuring(() => {
    for (const node of graph.getAllNodes()) {
      if (node.componentPropertyDefinitions.length > 0) {
        const defs = node.componentPropertyDefinitions.map((def) => {
          if (def.type !== 'INSTANCE_SWAP') return def
          const remappedDefault = def.defaultValue ? guidToNodeId.get(def.defaultValue) : undefined
          if (!remappedDefault) return def
          return { ...def, defaultValue: remappedDefault }
        })
        const changed = defs.some((def, i) => def !== node.componentPropertyDefinitions[i])
        if (changed) graph.updateNode(node.id, { componentPropertyDefinitions: defs })
      }

      if (Object.keys(node.componentPropertyAssignments).length > 0) {
        let changed = false
        const assignments = { ...node.componentPropertyAssignments }
        for (const [propId, value] of Object.entries(assignments)) {
          if (defsById.get(propId)?.type !== 'INSTANCE_SWAP') continue
          const remapped = guidToNodeId.get(value)
          if (remapped) {
            assignments[propId] = remapped
            changed = true
          }
        }
        if (changed) graph.updateNode(node.id, { componentPropertyAssignments: assignments })
      }
    }
  })
}

/**
 * Prototype pluginData stores node references (flow starts, navigate/overlay
 * destinations) as exported GUID strings; convert them to this import's
 * freshly-assigned node ids. Unmapped references pass through unchanged.
 */
export function remapPrototypePluginDataIds(
  graph: SceneGraph,
  guidToNodeId: Map<string, string>
): void {
  const resolve = (ref: string): string => guidToNodeId.get(ref) ?? ref
  graph.preserveSourceMetadataDuring(() => {
    for (const node of graph.getAllNodes()) {
      if (node.pluginData.length === 0) continue
      const previous = node.pluginData
      const next = previous.map((entry) => {
        if (entry.pluginId !== OPEN_PENCIL_PLUGIN_ID) return entry
        const value = remapPrototypePluginValue(entry.key, entry.value, resolve)
        if (value === entry.value) return entry
        return { ...entry, value }
      })
      // Only write when a value actually changed (map keeps untouched entries identical).
      if (next.some((entry, i) => entry !== previous[i]))
        graph.updateNode(node.id, { pluginData: next })
    }
  })
}

export function applyVariantPropSpecs(graph: SceneGraph): void {
  for (const node of graph.getAllNodes()) {
    if (node.type !== 'COMPONENT' || node.variantPropSpecs.length === 0 || !node.parentId) continue
    const parent = graph.getNode(node.parentId)
    if (parent?.type !== 'COMPONENT_SET') continue
    const defs = new Map(parent.componentPropertyDefinitions.map((def) => [def.id, def.name]))
    const values: Record<string, string> = {}
    for (const spec of node.variantPropSpecs)
      values[defs.get(spec.propDefId) ?? spec.propDefId] = spec.value
    graph.updateNode(node.id, { componentPropertyValues: values })
  }
}
