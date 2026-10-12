import { describe, expect, test } from 'bun:test'

import {
  PROTOTYPE_DOC_PLUGIN_KEY,
  PROTOTYPE_PLUGIN_ID,
  readPrototypeDocument,
  serializePluginValue
} from '@open-pencil/scene-graph'

import { expectDefined } from '#tests/helpers/assert'
import { setupEditorPage } from '#tests/helpers/editor-history'

/** Mirrors the AI-tool undo pairing in src/app/ai/tools/index.ts. */
function pushAIStyleUndo(
  editor: ReturnType<typeof setupEditorPage>['editor'],
  label: string,
  mutate: () => void
): void {
  const before = editor.snapshotPage()
  mutate()
  const after = editor.snapshotPage()
  editor.pushUndoEntry({
    label,
    forward: () => editor.restorePageFromSnapshot(after),
    inverse: () => editor.restorePageFromSnapshot(before)
  })
}

function writeRootFlow(
  editor: ReturnType<typeof setupEditorPage>['editor'],
  startNodeId: string
): void {
  const root = expectDefined(editor.graph.getNode(editor.graph.rootId), 'root')
  editor.graph.updateNode(root.id, {
    pluginData: [
      ...root.pluginData.filter((entry) => entry.key !== PROTOTYPE_DOC_PLUGIN_KEY),
      {
        pluginId: PROTOTYPE_PLUGIN_ID,
        key: PROTOTYPE_DOC_PLUGIN_KEY,
        value: serializePluginValue({
          version: 1,
          flows: [{ id: 'flow-1', name: 'Flow 1', startNodeId }]
        })
      }
    ]
  })
}

function readRootFlowStart(
  editor: ReturnType<typeof setupEditorPage>['editor']
): string | undefined {
  const root = expectDefined(editor.graph.getNode(editor.graph.rootId), 'root')
  return readPrototypeDocument(root)?.flows[0]?.startNodeId
}

describe('undo snapshots include root prototype document data', () => {
  test('AI flow creation reverts on undo and reapplies on redo', () => {
    const { editor, pageId } = setupEditorPage()
    const frame = editor.graph.createNode('FRAME', pageId, {
      name: 'Splash',
      x: 0,
      y: 0,
      width: 800,
      height: 600
    })

    expect(readRootFlowStart(editor)).toBeUndefined()

    pushAIStyleUndo(editor, 'AI: create_prototype_flow', () => writeRootFlow(editor, frame.id))
    expect(readRootFlowStart(editor)).toBe(frame.id)

    editor.undo.undo()
    expect(readRootFlowStart(editor)).toBeUndefined()

    editor.undo.redo()
    expect(readRootFlowStart(editor)).toBe(frame.id)
  })

  test('sequential AI mutations undo one at a time without losing the page', () => {
    const { editor, pageId } = setupEditorPage()
    const splash = editor.graph.createNode('FRAME', pageId, {
      name: 'Splash',
      x: 0,
      y: 0,
      width: 800,
      height: 600
    })
    const home = editor.graph.createNode('FRAME', pageId, {
      name: 'Home',
      x: 0,
      y: 0,
      width: 800,
      height: 600
    })

    pushAIStyleUndo(editor, 'AI: create_prototype_flow', () => writeRootFlow(editor, splash.id))
    pushAIStyleUndo(editor, 'AI: create_prototype_flow', () => writeRootFlow(editor, home.id))
    expect(readRootFlowStart(editor)).toBe(home.id)

    editor.undo.undo()
    expect(readRootFlowStart(editor)).toBe(splash.id)
    expect(editor.graph.getNode(splash.id)).toBeDefined()
    expect(editor.graph.getNode(home.id)).toBeDefined()

    editor.undo.undo()
    expect(readRootFlowStart(editor)).toBeUndefined()

    editor.undo.redo()
    expect(readRootFlowStart(editor)).toBe(splash.id)
  })

  test('root restore never deletes live pages', () => {
    const { editor, pageId } = setupEditorPage()
    const beforePages = editor.graph.getPages().length

    pushAIStyleUndo(editor, 'AI: create_prototype_flow', () => writeRootFlow(editor, pageId))
    editor.undo.undo()
    editor.undo.redo()

    expect(editor.graph.getPages()).toHaveLength(beforePages)
    expect(editor.state.currentPageId).toBe(pageId)
  })
})
