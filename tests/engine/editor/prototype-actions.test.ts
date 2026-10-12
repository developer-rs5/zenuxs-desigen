import { describe, expect, test } from 'bun:test'

import { createEditor } from '@open-pencil/core/editor'
import {
  INTERACTIONS_PLUGIN_KEY,
  PROTOTYPE_DOC_PLUGIN_KEY,
  PROTOTYPE_PLUGIN_ID,
  readNodeInteractions,
  readPrototypeDocument,
  readNodeStateModel,
  serializePluginValue,
  type PrototypeDocument,
  type PrototypeInteraction
} from '@open-pencil/scene-graph'

import { expectDefined, getNodeOrThrow } from '#tests/helpers/assert'

function writePlugin(
  editor: ReturnType<typeof createEditor>,
  nodeId: string,
  key: string,
  value: unknown
): void {
  const node = editor.graph.getNode(nodeId)
  if (!node) throw new Error(`missing node ${nodeId}`)
  editor.graph.updateNode(nodeId, {
    pluginData: [
      ...node.pluginData.filter(
        (entry) => !(entry.pluginId === PROTOTYPE_PLUGIN_ID && entry.key === key)
      ),
      { pluginId: PROTOTYPE_PLUGIN_ID, key, value: serializePluginValue(value) }
    ]
  })
}

function writeInteractions(
  editor: ReturnType<typeof createEditor>,
  nodeId: string,
  interactions: PrototypeInteraction[]
): void {
  writePlugin(editor, nodeId, INTERACTIONS_PLUGIN_KEY, interactions)
}

function setup(options?: Parameters<typeof createEditor>[0]) {
  const editor = createEditor(options)
  const pageId = editor.graph.getPages()[0].id
  const splash = editor.graph.createNode('FRAME', pageId, {
    name: 'Splash',
    x: 0,
    y: 0,
    width: 400,
    height: 300
  })
  const home = editor.graph.createNode('FRAME', pageId, {
    name: 'Home',
    x: 500,
    y: 0,
    width: 400,
    height: 300
  })
  const button = editor.graph.createNode('RECTANGLE', home.id, {
    name: 'Btn',
    x: 100,
    y: 100,
    width: 80,
    height: 40
  })
  return { editor, pageId, splash, home, button }
}

describe('editor prototype preview actions', () => {
  test('start resolves the flow entry, clears selection, fits viewport', () => {
    const { editor, splash } = setup()
    const doc: PrototypeDocument = {
      version: 1,
      flows: [{ id: 'flow-1', name: 'Main', startNodeId: splash.id }]
    }
    writePlugin(editor, editor.graph.rootId, PROTOTYPE_DOC_PLUGIN_KEY, doc)
    editor.select([splash.id])

    expect(editor.startPrototypePreview(undefined, 0)).toBe(true)
    expect(editor.isPrototypePreviewActive()).toBe(true)
    expect(editor.state.selectedIds.size).toBe(0)
    const preview = editor.state.prototypePreview
    expect(preview?.drawIds).toContain(splash.id)
    expect(preview?.screenRect).toEqual({ x: 0, y: 0, width: 400, height: 300 })
  })

  test('start prefers an explicit node over the flow entry', () => {
    const { editor, splash, home } = setup()
    const doc: PrototypeDocument = {
      version: 1,
      flows: [{ id: 'flow-1', name: 'Main', startNodeId: splash.id }]
    }
    writePlugin(editor, editor.graph.rootId, PROTOTYPE_DOC_PLUGIN_KEY, doc)

    expect(editor.startPrototypePreview(home.id, 0)).toBe(true)
    expect(editor.state.prototypePreview?.drawIds).toEqual([home.id])
  })

  test('start falls back to the first frame and fails with none', () => {
    const { editor, splash } = setup()
    expect(editor.startPrototypePreview(undefined, 0)).toBe(true)
    expect(editor.state.prototypePreview?.drawIds).toEqual([splash.id])
    editor.stopPrototypePreview()

    const root = getNodeOrThrow(editor.graph, editor.graph.rootId)
    for (const id of root.childIds.slice()) {
      editor.graph.deleteNode(id)
    }
    expect(editor.startPrototypePreview(undefined, 0)).toBe(false)
    expect(editor.isPrototypePreviewActive()).toBe(false)
    expect(editor.state.prototypePreview).toBeNull()
  })

  test('OnLoad fade navigation advances through ticks', () => {
    const { editor, splash, home } = setup()
    writeInteractions(editor, splash.id, [
      {
        id: 'load-nav',
        trigger: 'load',
        action: { type: 'navigate', destinationId: home.id },
        transition: { kind: 'fade', durationMs: 500, easing: 'easeOut' }
      }
    ])

    expect(editor.startPrototypePreview(splash.id, 1000)).toBe(true)
    // Mid-fade: both screens draw, incoming partially transparent.
    editor.tickPrototypePreview(1250)
    let preview = editor.state.prototypePreview
    expect(preview?.drawIds).toEqual([splash.id, home.id])
    expect(preview?.nodeVisuals.get(home.id)?.opacity).toBeGreaterThan(0)
    expect(preview?.nodeVisuals.get(home.id)?.opacity).toBeLessThan(1)
    // Settled: only the destination remains.
    editor.tickPrototypePreview(1600)
    preview = editor.state.prototypePreview
    expect(preview?.drawIds).toEqual([home.id])
  })

  test('navigation re-frames the camera onto the destination screen', () => {
    const { editor, splash, home } = setup()
    writeInteractions(editor, splash.id, [
      {
        id: 'load-nav',
        trigger: 'load',
        action: { type: 'navigate', destinationId: home.id },
        transition: { kind: 'instant' }
      }
    ])

    const before = { panX: editor.state.panX, panY: editor.state.panY, zoom: editor.state.zoom }
    expect(editor.startPrototypePreview(splash.id, 0)).toBe(true)
    editor.tickPrototypePreview(10)
    expect(editor.state.prototypePreview?.drawIds).toEqual([home.id])

    // Home sits at world x=500..900; without re-framing the stale camera keeps
    // it off-screen (state flips while the canvas shows nothing).
    const { panX, zoom } = editor.state
    // zoomToBounds centers Home, so its left edge lands right of screen origin.
    const homeLeftOnScreen = 500 * zoom + panX
    expect(homeLeftOnScreen).toBeGreaterThan(0)
    expect({ panX, zoom }).not.toEqual({ panX: before.panX, zoom: before.zoom })
    editor.stopPrototypePreview()
  })

  test('prefersReducedMotion collapses authored motion while the preview still runs', () => {
    const { editor, splash, home } = setup({ prefersReducedMotion: () => true })
    writeInteractions(editor, splash.id, [
      {
        id: 'load-nav',
        trigger: 'load',
        action: { type: 'navigate', destinationId: home.id },
        transition: { kind: 'fade', durationMs: 500, easing: 'easeOut' }
      }
    ])

    expect(editor.startPrototypePreview(splash.id, 1000)).toBe(true)
    const preview = editor.state.prototypePreview
    // Functionality intact: the preview navigated and stays active, with no tween.
    expect(editor.isPrototypePreviewActive()).toBe(true)
    expect(preview?.drawIds).toEqual([home.id])
    expect(preview?.nodeVisuals.has(splash.id)).toBe(false)
    editor.tickPrototypePreview(1250)
    expect(editor.state.prototypePreview?.drawIds).toEqual([home.id])
  })

  test('pointer down/up/click drives hit-node interactions', () => {
    const { editor, splash, home, button } = setup()
    writeInteractions(editor, button.id, [
      {
        id: 'click-back',
        trigger: 'click',
        action: { type: 'navigate', destinationId: splash.id },
        transition: { kind: 'instant' }
      }
    ])

    // Start directly on home so splash's OnLoad does not re-fire after the click.
    expect(editor.startPrototypePreview(home.id, 0)).toBe(true)
    expect(editor.state.prototypePreview?.drawIds).toEqual([home.id])

    const abs = editor.graph.getAbsolutePosition(button.id)
    const cx = abs.x + button.width / 2
    const cy = abs.y + button.height / 2
    editor.previewPointerDown(cx, cy, 10)
    editor.previewPointerUp(cx, cy, 20)
    expect(editor.state.prototypePreview?.drawIds).toEqual([splash.id])
  })

  test('stop clears preview state; replaceGraph stops it', () => {
    const { editor, splash } = setup()
    expect(editor.startPrototypePreview(splash.id, 0)).toBe(true)
    editor.stopPrototypePreview()
    expect(editor.isPrototypePreviewActive()).toBe(false)
    expect(editor.state.prototypePreview).toBeNull()

    expect(editor.startPrototypePreview(splash.id, 0)).toBe(true)
    editor.replaceGraph(editor.graph)
    expect(editor.isPrototypePreviewActive()).toBe(false)
    expect(editor.state.prototypePreview).toBeNull()
  })

  test('hover enter/leave dispatches through the chain; leave clears it', () => {
    const { editor, splash, home, button } = setup()
    writeInteractions(editor, splash.id, [
      {
        id: 'load-nav',
        trigger: 'load',
        action: { type: 'navigate', destinationId: home.id },
        transition: { kind: 'instant' }
      }
    ])
    // Visual proof that hoverEnter/hoverLeave reached the button.
    writeInteractions(editor, button.id, [
      {
        id: 'hover-dim',
        trigger: 'hoverEnter',
        action: { type: 'setState', state: 'dimmed' },
        transition: { kind: 'instant' }
      },
      {
        id: 'hover-undim',
        trigger: 'hoverLeave',
        action: { type: 'setState', state: 'default' },
        transition: { kind: 'instant' }
      }
    ])
    editor.graph.updateNode(button.id, {
      pluginData: [
        ...getNodeOrThrow(editor.graph, button.id).pluginData,
        {
          pluginId: PROTOTYPE_PLUGIN_ID,
          key: 'prototypeState',
          value: serializePluginValue({
            version: 1,
            initial: 'default',
            states: [
              { name: 'default', visual: {} },
              { name: 'dimmed', visual: { opacity: 0.5 } }
            ]
          })
        }
      ]
    })

    expect(editor.startPrototypePreview(splash.id, 0)).toBe(true)
    const abs = editor.graph.getAbsolutePosition(button.id)
    editor.previewHover(abs.x + 40, abs.y + 20, 10)
    expect(editor.state.prototypePreview?.nodeVisuals.get(button.id)?.opacity).toBe(0.5)

    editor.previewPointerLeave(20)
    expect(editor.state.prototypePreview?.nodeVisuals.get(button.id)).toBeUndefined()
  })

  test('release fires on the pressed node even when the pointer lifts elsewhere', () => {
    const { editor, home, button } = setup()
    writeInteractions(editor, button.id, [
      {
        id: 'press-shrink',
        trigger: 'press',
        action: { type: 'setState', state: 'pressed' },
        transition: { kind: 'instant' }
      },
      {
        id: 'release-restore',
        trigger: 'release',
        action: { type: 'setState', state: 'default' },
        transition: { kind: 'instant' }
      }
    ])
    writePlugin(editor, button.id, 'prototypeState', {
      version: 1,
      initial: 'default',
      states: [
        { name: 'default', visual: {} },
        { name: 'pressed', visual: { scale: 0.96 } }
      ]
    })

    // Start on home so the button (its child) is in the drawn scope.
    expect(editor.startPrototypePreview(home.id, 0)).toBe(true)
    const abs = editor.graph.getAbsolutePosition(button.id)
    editor.previewPointerDown(abs.x + 40, abs.y + 20, 10)
    expect(editor.state.prototypePreview?.nodeVisuals.get(button.id)?.scale).toBe(0.96)

    // Lift far from every node: the pressed state must still restore.
    editor.previewPointerUp(9999, 9999, 20)
    expect(editor.state.prototypePreview?.nodeVisuals.get(button.id)).toBeUndefined()
  })
})

describe('editor prototype authoring actions', () => {
  test('setPrototypeInteractions writes, is undoable, empty clears', () => {
    const { editor, splash, home } = setup()
    const interactions: PrototypeInteraction[] = [
      {
        id: 'nav',
        trigger: 'click',
        action: { type: 'navigate', destinationId: home.id },
        transition: { kind: 'fade', durationMs: 500, easing: 'easeOut' }
      }
    ]
    expect(editor.setPrototypeInteractions(splash.id, interactions)).toBe(true)
    expect(readNodeInteractions(getNodeOrThrow(editor.graph, splash.id))).toEqual(interactions)

    editor.undo.undo()
    expect(readNodeInteractions(getNodeOrThrow(editor.graph, splash.id))).toEqual([])

    editor.undo.redo()
    expect(readNodeInteractions(getNodeOrThrow(editor.graph, splash.id))).toEqual(interactions)

    expect(editor.setPrototypeInteractions(splash.id, [])).toBe(true)
    expect(readNodeInteractions(getNodeOrThrow(editor.graph, splash.id))).toEqual([])
  })

  test('setPrototypeStateModel writes and removes', () => {
    const { editor, button } = setup()
    const model = {
      version: 1,
      initial: 'default',
      states: [
        { name: 'default', visual: {} },
        { name: 'hover', visual: { opacity: 0.8 } }
      ]
    }
    expect(editor.setPrototypeStateModel(button.id, model)).toBe(true)
    expect(readNodeStateModel(getNodeOrThrow(editor.graph, button.id))).toEqual(model)

    editor.undo.undo()
    expect(readNodeStateModel(getNodeOrThrow(editor.graph, button.id))).toBeNull()

    editor.setPrototypeStateModel(button.id, model)
    expect(editor.setPrototypeStateModel(button.id, null)).toBe(true)
    expect(readNodeStateModel(getNodeOrThrow(editor.graph, button.id))).toBeNull()
  })

  test('setPrototypeStartNode creates the flow doc and updates it', () => {
    const { editor, splash, home } = setup()
    expect(editor.setPrototypeStartNode(splash.id)).toBe(true)
    const root = getNodeOrThrow(editor.graph, editor.graph.rootId)
    expect(readPrototypeDocument(root)?.flows[0]?.startNodeId).toBe(splash.id)

    expect(editor.setPrototypeStartNode(home.id)).toBe(true)
    expect(
      readPrototypeDocument(getNodeOrThrow(editor.graph, editor.graph.rootId))?.flows[0]
        ?.startNodeId
    ).toBe(home.id)

    editor.undo.undo()
    expect(
      readPrototypeDocument(getNodeOrThrow(editor.graph, editor.graph.rootId))?.flows[0]
        ?.startNodeId
    ).toBe(splash.id)

    expect(editor.setPrototypeStartNode('missing-node')).toBe(false)
  })

  test('setActivePrototypeFlow writes activeFlowId, is undoable, rejects unknown ids', () => {
    const { editor, splash } = setup()
    expect(editor.setPrototypeStartNode(splash.id)).toBe(true)
    const secondId = expectDefined(editor.addPrototypeFlow('Checkout'), 'second flow id')

    expect(editor.setActivePrototypeFlow('flow-1')).toBe(true)
    const root = getNodeOrThrow(editor.graph, editor.graph.rootId)
    expect(readPrototypeDocument(root)?.activeFlowId).toBe('flow-1')

    editor.undo.undo()
    expect(
      readPrototypeDocument(getNodeOrThrow(editor.graph, editor.graph.rootId))?.activeFlowId
    ).toBe(secondId)

    expect(editor.setActivePrototypeFlow('ghost')).toBe(false)
  })
})

describe('editor prototype flow selection in preview', () => {
  test('preview start honors activeFlowId over flows[0]', () => {
    const { editor, splash, home } = setup()
    const doc: PrototypeDocument = {
      version: 1,
      flows: [
        { id: 'flow-1', name: 'Main', startNodeId: splash.id },
        { id: 'flow-2', name: 'Checkout', startNodeId: home.id }
      ],
      activeFlowId: 'flow-2'
    }
    writePlugin(editor, editor.graph.rootId, PROTOTYPE_DOC_PLUGIN_KEY, doc)

    expect(editor.startPrototypePreview(undefined, 0)).toBe(true)
    expect(editor.state.prototypePreview?.drawIds).toEqual([home.id])
    editor.stopPrototypePreview()

    // Without a valid activeFlowId the preview falls back to flows[0].
    writePlugin(editor, editor.graph.rootId, PROTOTYPE_DOC_PLUGIN_KEY, {
      version: 1,
      flows: doc.flows,
      activeFlowId: 'ghost'
    })
    expect(editor.startPrototypePreview(undefined, 0)).toBe(true)
    expect(editor.state.prototypePreview?.drawIds).toEqual([splash.id])
  })
})

describe('editor prototype pointer gestures', () => {
  function setupGesture() {
    const ctx = setup()
    writePlugin(ctx.editor, ctx.button.id, 'prototypeState', {
      version: 1,
      initial: 'default',
      states: [
        { name: 'default', visual: {} },
        { name: 'dragging', visual: { scale: 0.98 } },
        { name: 'clicked', visual: { opacity: 0.3 } }
      ]
    })
    writeInteractions(ctx.editor, ctx.button.id, [
      {
        id: 'drag-start',
        trigger: 'drag',
        action: { type: 'setState', state: 'dragging' },
        transition: { kind: 'instant' }
      },
      {
        id: 'click-toggle',
        trigger: 'click',
        action: { type: 'setState', state: 'clicked' },
        transition: { kind: 'instant' }
      }
    ])
    const abs = ctx.editor.graph.getAbsolutePosition(ctx.button.id)
    return { ...ctx, cx: abs.x + ctx.button.width / 2, cy: abs.y + ctx.button.height / 2 }
  }

  test('drag gestures follow the pointer and suppress the click action', () => {
    const { editor, button, cx, cy } = setupGesture()
    // Button lives inside home; without a flow the preview would fall back to
    // the first frame (splash) and the hit test would never see it.
    expect(editor.startPrototypePreview(button.parentId ?? undefined, 0)).toBe(true)

    editor.previewPointerDown(cx, cy, 10)
    expect(editor.state.prototypePreview?.nodeVisuals.get(button.id)?.scale).toBe(0.98)

    editor.previewPointerMove(cx + 40, cy + 20, 20)
    const midDrag = editor.state.prototypePreview?.nodeVisuals.get(button.id)
    expect(midDrag?.translateX).toBe(40)
    expect(midDrag?.translateY).toBe(20)
    expect(midDrag?.opacity).not.toBe(0.3)

    editor.previewPointerUp(cx + 40, cy + 20, 30)
    const settled = editor.state.prototypePreview?.nodeVisuals.get(button.id)
    expect(settled?.scale).toBe(0.98)
    expect(settled?.translateX).toBe(40)
    expect(settled?.translateY).toBe(20)
    // The drag consumed the gesture: the click interaction never fired.
    expect(settled?.opacity).toBeUndefined()

    // A tap without movement still clicks.
    editor.previewPointerDown(cx, cy, 40)
    editor.previewPointerUp(cx, cy, 50)
    const clicked = editor.state.prototypePreview?.nodeVisuals.get(button.id)
    expect(clicked?.opacity).toBe(0.3)
    expect(clicked?.scale).toBeUndefined()
  })

  test('holding the pointer past the threshold fires longPress', async () => {
    const { editor, button } = setup()
    const abs = editor.graph.getAbsolutePosition(button.id)
    const cx = abs.x + button.width / 2
    const cy = abs.y + button.height / 2
    writePlugin(editor, button.id, 'prototypeState', {
      version: 1,
      initial: 'default',
      states: [
        { name: 'default', visual: {} },
        { name: 'held', visual: { rotation: 15 } }
      ]
    })
    writeInteractions(editor, button.id, [
      {
        id: 'hold-rotate',
        trigger: 'longPress',
        action: { type: 'setState', state: 'held' },
        transition: { kind: 'instant' }
      }
    ])

    expect(editor.startPrototypePreview(button.parentId ?? undefined, 0)).toBe(true)
    editor.previewPointerDown(cx, cy, 10)
    // Editor threshold is LONG_PRESS_THRESHOLD_MS (500 ms) on a real timer.
    await new Promise((resolve) => {
      setTimeout(resolve, 650)
    })
    expect(editor.state.prototypePreview?.nodeVisuals.get(button.id)?.rotation).toBe(15)
    editor.previewPointerUp(cx, cy, 700)
  })
})
