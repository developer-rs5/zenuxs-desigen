import { describe, expect, test } from 'bun:test'

import { exportFigFile, FigmaAPI, initCodec, parseFigFile, SceneGraph } from '@open-pencil/core'
import {
  readNodeAnimations,
  readNodeInteractions,
  readNodeStateModel,
  readPrototypeDocument
} from '@open-pencil/scene-graph'

import { createPrototypeRuntime } from '#core/prototype/runtime'

import { expectDefined } from '#tests/helpers/assert'
import { getTool, type ToolResult } from '#tests/helpers/tools'

function run(figma: FigmaAPI, name: string, args: Record<string, unknown>): ToolResult {
  return getTool(name).execute(figma, args) as ToolResult
}

function hasError(result: ToolResult): boolean {
  if (result.error) throw new Error(`${String(result.error)}`)
  return false
}

/** Import mints fresh node ids; resolve reloaded nodes by their stable names. */
function findByName(graph: SceneGraph, name: string) {
  for (const node of graph.nodes.values()) {
    if (node.name === name) return node
  }
  throw new Error(`node "${name}" missing after reload`)
}

/** Round-trip a graph through the .fig codec. */
async function roundTrip(graph: SceneGraph): Promise<SceneGraph> {
  const bytes = await exportFigFile(graph)
  return parseFigFile(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength))
}

/** Author the flow + interactions + state model the first test asserts on. */
function authorRoundTripFixture(
  figma: FigmaAPI,
  splash: { id: string },
  home: { id: string },
  button: { id: string }
): void {
  hasError(run(figma, 'create_prototype_flow', { node_id: splash.id }))
  hasError(
    run(figma, 'create_interaction', {
      node_id: splash.id,
      trigger: 'load',
      action: 'navigate',
      destination_id: home.id,
      transition: 'fade',
      duration_ms: 500,
      easing: 'easeOut'
    })
  )
  hasError(run(figma, 'create_state', { node_id: button.id, state_name: 'default' }))
  hasError(run(figma, 'create_state', { node_id: button.id, state_name: 'pressed' }))
  hasError(
    run(figma, 'set_state_visual', { node_id: button.id, state_name: 'pressed', scale: 0.96 })
  )
  hasError(
    run(figma, 'create_interaction', {
      node_id: button.id,
      trigger: 'press',
      action: 'setState',
      state: 'pressed',
      transition: 'spring'
    })
  )
}

/** Shared graph/frames the persistence tests author against. */
function createFixtureGraph(): {
  graph: SceneGraph
  figma: FigmaAPI
  splash: { id: string }
  home: { id: string }
  button: { id: string }
} {
  const graph = new SceneGraph()
  const figma = new FigmaAPI(graph)
  const splash = figma.createFrame()
  splash.name = 'Splash'
  const home = figma.createFrame()
  home.name = 'Home'
  const button = figma.createRectangle()
  button.name = 'Button'
  button.resize(80, 40)
  home.appendChild(button)
  return { graph, figma, splash, home, button }
}

/** Pre-reload motion/state assertions; returns the captured values for comparison. */
function expectAuthoredMotionState(graph: SceneGraph, buttonId: string) {
  const buttonRaw = expectDefined(graph.getNode(buttonId), 'button')
  const rootRaw = expectDefined(graph.getNode(graph.rootId), 'root')
  const animationsBefore = readNodeAnimations(buttonRaw)
  const modelBefore = readNodeStateModel(buttonRaw)
  const interactionsBefore = readNodeInteractions(buttonRaw)
  const docBefore = readPrototypeDocument(rootRaw)

  expect(animationsBefore?.animations?.[0]?.keyframes).toHaveLength(2)
  expect(animationsBefore?.groups?.[0]?.mode).toBe('sequence')
  expect(modelBefore?.vars).toEqual({ open: true })
  expect(modelBefore?.states[0]?.transition).toEqual({
    kind: 'spring',
    spring: { mode: 'time', bounce: 0.3 }
  })
  expect(interactionsBefore[0]?.guard?.all).toEqual([{ variable: 'open', op: 'eq', value: true }])
  expect(docBefore?.activeFlowId).toBe('flow-2')

  return { animationsBefore, modelBefore, interactionsBefore }
}

/** Startup playback: splash fades to home, then only home renders. */
function expectPlayback(
  reloaded: SceneGraph,
  startId: string,
  splashId: string,
  homeId: string
): void {
  const runtime = createPrototypeRuntime(reloaded)
  runtime.start(0, startId)
  expect(runtime.getRenderState()?.drawIds).toEqual([splashId, homeId])
  runtime.tick(700)
  expect(runtime.getRenderState()?.drawIds).toEqual([homeId])
}

describe('prototype persistence (save → reload → behavior)', () => {
  test('interactions, states, and flow entry survive a fig round-trip and still run', async () => {
    await initCodec()

    const { graph, figma, splash, home, button } = createFixtureGraph()

    // Author through the semantic AI tools — the same validated mutations
    // the inspector and AI chat both land on.
    authorRoundTripFixture(figma, splash, home, button)

    const splashRaw = expectDefined(graph.getNode(splash.id), 'splash')
    const buttonRaw = expectDefined(graph.getNode(button.id), 'button')
    const interactionsBefore = readNodeInteractions(splashRaw)
    const buttonInteractionsBefore = readNodeInteractions(buttonRaw)
    const modelBefore = readNodeStateModel(buttonRaw)
    const flowBefore = readPrototypeDocument(expectDefined(graph.getNode(graph.rootId), 'root'))

    expect(interactionsBefore).toHaveLength(1)
    expect(buttonInteractionsBefore).toHaveLength(1)
    expect(modelBefore?.states.map((s) => s.name)).toEqual(['default', 'pressed'])
    expect(flowBefore?.flows[0]?.startNodeId).toBe(splash.id)

    // Save → reload. SceneNode ids are minted from kiwi GUIDs on import, so
    // re-resolve nodes by name; the persisted references must point at them.
    const reloaded = await roundTrip(graph)

    const reloadedSplash = findByName(reloaded, 'Splash')
    const reloadedHome = findByName(reloaded, 'Home')
    const reloadedButton = findByName(reloaded, 'Button')

    const splashAfter = readNodeInteractions(reloadedSplash)
    expect(splashAfter).toHaveLength(1)
    expect(splashAfter[0]?.trigger).toBe('load')
    expect(splashAfter[0]?.transition).toEqual(interactionsBefore[0]?.transition)
    expect(splashAfter[0]?.action).toEqual({ type: 'navigate', destinationId: reloadedHome.id })

    expect(readNodeInteractions(reloadedButton)).toEqual(buttonInteractionsBefore)
    expect(readNodeStateModel(reloadedButton)).toEqual(modelBefore)

    const reloadedRoot = expectDefined(reloaded.getNode(reloaded.rootId), 'root after reload')
    const flowAfter = readPrototypeDocument(reloadedRoot)
    expect(flowAfter?.flows).toHaveLength(1)
    expect(flowAfter?.flows[0]?.startNodeId).toBe(reloadedSplash.id)
    expect(flowBefore?.flows[0]?.id).toBe(flowAfter?.flows[0]?.id)

    // Behavior survives: OnLoad fade splash → home still executes on the
    // reloaded graph, and the flow entry resolves to the persisted start.
    const startId = expectDefined(flowAfter?.flows[0]?.startNodeId, 'flow start')
    expectPlayback(reloaded, startId, reloadedSplash.id, reloadedHome.id)

    // Re-edit loop: authoring still works against the reloaded document.
    const reloadedAPI = new FigmaAPI(reloaded)
    const edit = run(reloadedAPI, 'set_state_visual', {
      node_id: reloadedButton.id,
      state_name: 'pressed',
      scale: 0.9
    })
    expect(edit.error).toBeUndefined()
    expect(
      readNodeStateModel(
        expectDefined(reloaded.getNode(reloadedButton.id), 'button after edit')
      )?.states.find((s) => s.name === 'pressed')?.visual.scale
    ).toBe(0.9)
  })

  test('validate_prototype passes on a freshly reloaded document', async () => {
    await initCodec()

    const graph = new SceneGraph()
    const figma = new FigmaAPI(graph)
    const a = figma.createFrame()
    a.name = 'A'
    const b = figma.createFrame()
    b.name = 'B'
    hasError(run(figma, 'connect_screens', { from_id: a.id, to_id: b.id }))

    const reloaded = await roundTrip(graph)
    const reloadedAPI = new FigmaAPI(reloaded)
    const result = run(reloadedAPI, 'validate_prototype', {})
    expect(result.error).toBeUndefined()
    expect(result.ok).toBe(true)
    expect(result.interactions).toBe(1)
  })

  test('animations, groups, guard, activeFlowId, and state vars/transition survive a fig round-trip', async () => {
    await initCodec()

    const { graph, figma, splash, home, button } = createFixtureGraph()

    // Motion authoring: animation + ordered keyframe + animation group.
    hasError(
      run(figma, 'create_animation', {
        node_id: button.id,
        animation_id: 'anim-1',
        name: 'Pop',
        duration_ms: 300
      })
    )
    hasError(
      run(figma, 'add_keyframe', {
        node_id: button.id,
        animation_id: 'anim-1',
        offset_ms: 300,
        scale: 0.9
      })
    )
    hasError(
      run(figma, 'create_animation_group', {
        node_id: button.id,
        group_id: 'grp-1',
        name: 'Chain',
        mode: 'sequence',
        items: JSON.stringify([{ animationId: 'anim-1' }])
      })
    )

    // State model carrying vars + a state fallback transition.
    hasError(
      run(figma, 'create_state', {
        node_id: button.id,
        state_name: 'default',
        vars: '{"open":true}',
        transition: 'spring',
        spring_bounce: 0.3
      })
    )
    hasError(run(figma, 'create_state', { node_id: button.id, state_name: 'pressed' }))

    // Two flows + explicit active flow + a guarded interaction.
    hasError(run(figma, 'create_prototype_flow', { node_id: splash.id, flow_id: 'flow-1' }))
    hasError(
      run(figma, 'create_prototype_flow', {
        node_id: home.id,
        flow_id: 'flow-2',
        flow_name: 'Checkout'
      })
    )
    hasError(run(figma, 'set_active_flow', { flow_id: 'flow-2' }))
    hasError(
      run(figma, 'create_interaction', {
        node_id: button.id,
        trigger: 'click',
        action: 'navigate',
        destination_id: home.id,
        guard: '{"all":[{"variable":"open","op":"eq","value":true}]}'
      })
    )

    const { animationsBefore, modelBefore, interactionsBefore } = expectAuthoredMotionState(
      graph,
      button.id
    )

    // Save → reload; import mints fresh node ids, so resolve by name.
    const reloaded = await roundTrip(graph)
    const reloadedSplash = findByName(reloaded, 'Splash')
    const reloadedHome = findByName(reloaded, 'Home')
    const reloadedButton = findByName(reloaded, 'Button')
    const reloadedRoot = expectDefined(reloaded.getNode(reloaded.rootId), 'root after reload')

    expect(readNodeAnimations(reloadedButton)).toEqual(animationsBefore)
    expect(readNodeStateModel(reloadedButton)).toEqual(modelBefore)

    const docAfter = readPrototypeDocument(reloadedRoot)
    expect(docAfter?.activeFlowId).toBe('flow-2')
    expect(docAfter?.flows).toHaveLength(2)
    expect(docAfter?.flows[0]?.startNodeId).toBe(reloadedSplash.id)
    expect(docAfter?.flows[1]).toEqual({
      id: 'flow-2',
      name: 'Checkout',
      startNodeId: reloadedHome.id
    })

    const interactionsAfter = readNodeInteractions(reloadedButton)
    expect(interactionsAfter).toHaveLength(1)
    expect(interactionsAfter[0]?.guard).toEqual(interactionsBefore[0]?.guard)
    expect(interactionsAfter[0]?.action).toEqual({
      type: 'navigate',
      destinationId: reloadedHome.id
    })

    // Validation still passes: the guard variable is declared in reloaded vars.
    const reloadedAPI = new FigmaAPI(reloaded)
    const validated = run(reloadedAPI, 'validate_prototype', {})
    expect(validated.error).toBeUndefined()
    expect(validated.ok).toBe(true)

    // Behavior survives: the guarded click navigates on the reloaded graph.
    const runtime = createPrototypeRuntime(reloaded)
    runtime.start(0, reloadedSplash.id)
    runtime.click(reloadedButton.id, 10)
    expect(runtime.getScreenId()).toBe(reloadedHome.id)
  })
})
