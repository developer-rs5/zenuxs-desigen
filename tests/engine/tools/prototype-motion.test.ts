import { describe, expect, test } from 'bun:test'

import {
  readNodeAnimations,
  readNodeInteractions,
  readNodeStateModel,
  readPrototypeDocument
} from '@open-pencil/scene-graph'

import { expectDefined } from '#tests/helpers/assert'
import { getTool, setupToolTest, type ToolResult } from '#tests/helpers/tools'

function executeWith(
  figma: ReturnType<typeof setupToolTest>['figma'],
  name: string,
  args: Record<string, unknown>
): ToolResult {
  const tool = getTool(name)
  return tool.execute(figma, args) as ToolResult
}

function setupScreens() {
  const { figma, graph } = setupToolTest()
  const splash = figma.createFrame()
  splash.name = 'Splash'
  const home = figma.createFrame()
  home.name = 'Home'
  const button = figma.createRectangle()
  button.name = 'Button'
  button.resize(80, 40)
  home.appendChild(button)
  return { figma, graph, splash, home, button }
}

function buttonNode(graph: ReturnType<typeof setupToolTest>['graph'], buttonId: string) {
  return expectDefined(graph.getNode(buttonId), 'button')
}

describe('animation tools', () => {
  test('create_animation writes a seeded keyframe animation to node pluginData', () => {
    const { figma, graph, button } = setupScreens()
    const result = executeWith(figma, 'create_animation', {
      node_id: button.id,
      name: 'Pop',
      animation_id: 'anim-1',
      duration_ms: 400,
      play_mode: 'loop',
      easing: 'easeOut'
    })
    expect(result.error).toBeUndefined()
    expect(result.animation_id).toBe('anim-1')
    expect(result.keyframes).toBe(1)
    expect(result.created).toBe(true)

    const container = readNodeAnimations(buttonNode(graph, button.id))
    const animation = expectDefined(container?.animations?.[0], 'animation')
    expect(animation.id).toBe('anim-1')
    expect(animation.name).toBe('Pop')
    expect(animation.durationMs).toBe(400)
    expect(animation.playMode).toBe('loop')
    expect(animation.easing).toBe('easeOut')
    expect(animation.keyframes).toEqual([{ offsetMs: 0, visual: {} }])
  })

  test('create_animation rejects a missing node and invalid params without writing', () => {
    const { figma, graph, button } = setupScreens()
    expect(
      executeWith(figma, 'create_animation', { node_id: 'ghost', name: 'Pop' }).error
    ).toContain('not found')
    expect(
      executeWith(figma, 'create_animation', { node_id: button.id, play_mode: 'bounce' }).error
    ).toContain('play_mode')
    expect(
      executeWith(figma, 'create_animation', { node_id: button.id, easing: 'nope' }).error
    ).toContain('easing')
    expect(
      executeWith(figma, 'create_animation', { node_id: button.id, duration_ms: -5 }).error
    ).toContain('duration_ms')
    expect(readNodeAnimations(buttonNode(graph, button.id))).toBeNull()
  })

  test('add_keyframe appends ordered keyframes and rejects duplicates, bad visuals, unknown ids', () => {
    const { figma, graph, button } = setupScreens()
    executeWith(figma, 'create_animation', { node_id: button.id, animation_id: 'anim-1' })

    const appended = executeWith(figma, 'add_keyframe', {
      node_id: button.id,
      animation_id: 'anim-1',
      offset_ms: 300,
      scale: 0.9,
      opacity: 0.5
    })
    expect(appended.error).toBeUndefined()
    expect(appended.keyframes).toBe(2)

    // Inserting before an existing offset keeps keyframes strictly ordered.
    executeWith(figma, 'add_keyframe', {
      node_id: button.id,
      animation_id: 'anim-1',
      offset_ms: 100,
      translate_x: 20
    })
    const container = readNodeAnimations(buttonNode(graph, button.id))
    const animation = expectDefined(container?.animations?.[0], 'animation')
    expect(animation.keyframes.map((keyframe) => keyframe.offsetMs)).toEqual([0, 100, 300])
    expect(animation.keyframes[1]?.visual).toEqual({ translateX: 20 })

    expect(
      executeWith(figma, 'add_keyframe', {
        node_id: button.id,
        animation_id: 'anim-1',
        offset_ms: 100,
        scale: 1.1
      }).error
    ).toContain('already exists')
    expect(
      executeWith(figma, 'add_keyframe', {
        node_id: button.id,
        animation_id: 'anim-1',
        offset_ms: -10,
        scale: 1.1
      }).error
    ).toContain('offset_ms')
    expect(
      executeWith(figma, 'add_keyframe', {
        node_id: button.id,
        animation_id: 'anim-1',
        offset_ms: 500,
        scale: 42
      }).error
    ).toContain('scale')
    expect(
      executeWith(figma, 'add_keyframe', {
        node_id: button.id,
        animation_id: 'anim-1',
        offset_ms: 500,
        fill: 'not-a-color'
      }).error
    ).toContain('valid CSS color')
    expect(
      executeWith(figma, 'add_keyframe', {
        node_id: button.id,
        animation_id: 'ghost',
        offset_ms: 500,
        scale: 1.2
      }).error
    ).toContain('not found')

    // Atomicity: no failed write changed the stored keyframes.
    const after = readNodeAnimations(buttonNode(graph, button.id))
    expect(after?.animations?.[0]?.keyframes.map((keyframe) => keyframe.offsetMs)).toEqual([
      0, 100, 300
    ])
  })

  test('add_keyframe caps an animation at 64 keyframes', () => {
    const { figma, graph, button } = setupScreens()
    executeWith(figma, 'create_animation', { node_id: button.id, animation_id: 'anim-1' })
    for (let offset = 1; offset <= 63; offset += 1) {
      const added = executeWith(figma, 'add_keyframe', {
        node_id: button.id,
        animation_id: 'anim-1',
        offset_ms: offset,
        scale: 1
      })
      expect(added.error).toBeUndefined()
    }
    const over = executeWith(figma, 'add_keyframe', {
      node_id: button.id,
      animation_id: 'anim-1',
      offset_ms: 200,
      scale: 1
    })
    expect(over.error).toContain('at most 64 keyframes')
    expect(
      readNodeAnimations(buttonNode(graph, button.id))?.animations?.[0]?.keyframes
    ).toHaveLength(64)
  })

  test('create_animation_group stores sequence and parallel groups; rejects unknown ids and bad JSON', () => {
    const { figma, graph, button } = setupScreens()
    executeWith(figma, 'create_animation', { node_id: button.id, animation_id: 'anim-1' })
    executeWith(figma, 'create_animation', { node_id: button.id, animation_id: 'anim-2' })

    const sequence = executeWith(figma, 'create_animation_group', {
      node_id: button.id,
      group_id: 'grp-seq',
      name: 'Chain',
      mode: 'sequence',
      items: JSON.stringify([{ animationId: 'anim-1' }, { animationId: 'anim-2', delayMs: 100 }])
    })
    expect(sequence.error).toBeUndefined()
    expect(sequence.mode).toBe('sequence')
    expect(sequence.items).toBe(2)
    expect(sequence.created).toBe(true)

    const parallel = executeWith(figma, 'create_animation_group', {
      node_id: button.id,
      group_id: 'grp-par',
      mode: 'parallel',
      items: JSON.stringify([{ animationId: 'anim-1' }, { animationId: 'anim-2' }])
    })
    expect(parallel.error).toBeUndefined()
    expect(parallel.mode).toBe('parallel')

    const container = readNodeAnimations(buttonNode(graph, button.id))
    expect(container?.groups?.map((group) => group.id)).toEqual(['grp-seq', 'grp-par'])
    expect(container?.groups?.[0]?.items).toEqual([
      { animationId: 'anim-1' },
      { animationId: 'anim-2', delayMs: 100 }
    ])

    expect(
      executeWith(figma, 'create_animation_group', {
        node_id: button.id,
        group_id: 'grp-bad',
        items: JSON.stringify([{ animationId: 'ghost' }])
      }).error
    ).toContain('Unknown animation id')
    expect(
      executeWith(figma, 'create_animation_group', {
        node_id: button.id,
        group_id: 'grp-bad',
        items: '{not json'
      }).error
    ).toContain('items must be JSON')
    // Atomicity: rejected groups never land on the node.
    expect(
      readNodeAnimations(buttonNode(graph, button.id))?.groups?.some(
        (group) => group.id === 'grp-bad'
      )
    ).toBe(false)
  })

  test('create_animation_group caps a node at 32 groups', () => {
    const { figma, button } = setupScreens()
    executeWith(figma, 'create_animation', { node_id: button.id, animation_id: 'anim-1' })
    for (let index = 0; index < 32; index += 1) {
      const created = executeWith(figma, 'create_animation_group', {
        node_id: button.id,
        group_id: `g-${index}`,
        items: JSON.stringify([{ animationId: 'anim-1' }])
      })
      expect(created.error).toBeUndefined()
    }
    const over = executeWith(figma, 'create_animation_group', {
      node_id: button.id,
      group_id: 'g-overflow',
      items: JSON.stringify([{ animationId: 'anim-1' }])
    })
    expect(over.error).toContain('at most 32 animation groups')
  })

  test('create_animation caps a node at 64 animations', () => {
    const { figma, graph, button } = setupScreens()
    for (let index = 0; index < 64; index += 1) {
      const created = executeWith(figma, 'create_animation', {
        node_id: button.id,
        animation_id: `a-${index}`
      })
      expect(created.error).toBeUndefined()
    }
    const over = executeWith(figma, 'create_animation', {
      node_id: button.id,
      animation_id: 'a-64'
    })
    expect(over.error).toContain('at most 64 animations')
    expect(readNodeAnimations(buttonNode(graph, button.id))?.animations).toHaveLength(64)
  })
})

describe('flow management', () => {
  test('list_flows reports flows and the active flow id', () => {
    const { figma, splash, home } = setupScreens()
    executeWith(figma, 'create_prototype_flow', { node_id: splash.id })
    const listed = executeWith(figma, 'list_flows', {})
    expect(listed.error).toBeUndefined()
    expect(listed.active_flow_id).toBe('flow-1')
    const flows = listed.flows as Array<{
      id: string
      name: string
      start_node_id: string
      start_exists: boolean
    }>
    expect(flows).toHaveLength(1)
    expect(flows[0]).toEqual({
      id: 'flow-1',
      name: 'Flow 1',
      start_node_id: splash.id,
      start_exists: true
    })

    // A named second flow becomes active; both flows list afterward.
    const second = executeWith(figma, 'create_prototype_flow', {
      node_id: home.id,
      flow_id: 'flow-2',
      flow_name: 'Checkout'
    })
    expect(second.error).toBeUndefined()
    expect(second.created).toBe(true)
    expect(second.flows).toBe(2)
    expect(second.active_flow_id).toBe('flow-2')

    const after = executeWith(figma, 'list_flows', {})
    expect(after.active_flow_id).toBe('flow-2')
    expect((after.flows as Array<{ id: string; name: string }>).map((flow) => flow.id)).toEqual([
      'flow-1',
      'flow-2'
    ])
    expect((after.flows as Array<{ name: string }>)[1]?.name).toBe('Checkout')
  })

  test('set_active_flow switches activeFlowId and rejects unknown flow ids', () => {
    const { figma, graph, splash, home } = setupScreens()
    executeWith(figma, 'create_prototype_flow', { node_id: splash.id })
    executeWith(figma, 'create_prototype_flow', {
      node_id: home.id,
      flow_id: 'flow-2',
      flow_name: 'Checkout'
    })

    const switched = executeWith(figma, 'set_active_flow', { flow_id: 'flow-1' })
    expect(switched.error).toBeUndefined()
    expect(switched.active_flow_id).toBe('flow-1')
    const root = expectDefined(graph.getNode(graph.rootId), 'root')
    expect(readPrototypeDocument(root)?.activeFlowId).toBe('flow-1')

    const unknown = executeWith(figma, 'set_active_flow', { flow_id: 'ghost' })
    expect(unknown.error).toContain('not found')
    expect(
      readPrototypeDocument(expectDefined(graph.getNode(graph.rootId), 'root'))?.activeFlowId
    ).toBe('flow-1')
  })
})

describe('apply_state', () => {
  test('sets the model initial state and rejects unknown states or a missing model', () => {
    const { figma, graph, button } = setupScreens()
    expect(
      executeWith(figma, 'apply_state', { node_id: button.id, state_name: 'default' }).error
    ).toContain('create_state')

    executeWith(figma, 'create_state', { node_id: button.id, state_name: 'default' })
    executeWith(figma, 'create_state', { node_id: button.id, state_name: 'pressed' })

    const applied = executeWith(figma, 'apply_state', {
      node_id: button.id,
      state_name: 'pressed'
    })
    expect(applied.error).toBeUndefined()
    expect(applied.initial).toBe('pressed')
    expect(readNodeStateModel(buttonNode(graph, button.id))?.initial).toBe('pressed')

    const unknown = executeWith(figma, 'apply_state', {
      node_id: button.id,
      state_name: 'ghost'
    })
    expect(unknown.error).toContain('Available')
    // Failed apply never rewrites the model.
    expect(readNodeStateModel(buttonNode(graph, button.id))?.initial).toBe('pressed')
  })
})

describe('create_overlay', () => {
  test('wires opener, dismiss, and optional backdrop dismissal', () => {
    const { figma, graph, home, button } = setupScreens()
    const overlay = figma.createFrame()
    overlay.name = 'Overlay'

    const result = executeWith(figma, 'create_overlay', {
      overlay_id: overlay.id,
      trigger_node_id: button.id,
      backdrop_opacity: 0.5,
      transition_kind: 'fade',
      duration_ms: 200,
      dismiss_on_backdrop: true
    })
    expect(result.error).toBeUndefined()
    expect(result.overlay).toBe(overlay.id)
    expect(result.opened_by).toBeString()
    expect(result.close).toBeString()
    expect(result.outside_close).toBe('added')
    expect(result.transition).toBe('fade')

    const opener = readNodeInteractions(expectDefined(graph.getNode(button.id), 'button'))
    expect(opener[0]).toMatchObject({
      trigger: 'click',
      action: { type: 'openOverlay', overlayId: overlay.id, backdropOpacity: 0.5 },
      transition: { kind: 'fade', durationMs: 200, easing: 'easeOut' }
    })
    const dismiss = readNodeInteractions(expectDefined(graph.getNode(overlay.id), 'overlay'))
    expect(dismiss[0]?.action).toEqual({ type: 'closeOverlay' })
    const screen = readNodeInteractions(expectDefined(graph.getNode(home.id), 'home'))
    expect(screen[0]?.action).toEqual({ type: 'closeOverlay' })

    const validated = executeWith(figma, 'validate_prototype', {})
    expect(validated.error).toBeUndefined()
    expect(validated.ok).toBe(true)
  })

  test('rejects invalid targets and params without mutating interactions', () => {
    const { figma, graph, button } = setupScreens()
    const overlay = figma.createFrame()
    overlay.name = 'Overlay'

    expect(
      executeWith(figma, 'create_overlay', {
        overlay_id: overlay.id,
        trigger_node_id: overlay.id
      }).error
    ).toContain('cannot be the overlay itself')
    expect(
      executeWith(figma, 'create_overlay', {
        overlay_id: overlay.id,
        trigger_node_id: button.id,
        transition_kind: 'bounce'
      }).error
    ).toContain('transition_kind')
    expect(
      executeWith(figma, 'create_overlay', {
        overlay_id: overlay.id,
        trigger_node_id: button.id,
        direction: 'sideways'
      }).error
    ).toContain('direction')
    expect(executeWith(figma, 'create_overlay', { overlay_id: 'ghost' }).error).toContain(
      'not found'
    )

    expect(readNodeInteractions(expectDefined(graph.getNode(button.id), 'button'))).toEqual([])
    expect(readNodeInteractions(expectDefined(graph.getNode(overlay.id), 'overlay'))).toEqual([])
  })
})

describe('preview_prototype', () => {
  test('reports the active flow, screens, interactions, and triggers', () => {
    const { figma, splash, home, button } = setupScreens()
    executeWith(figma, 'create_prototype_flow', { node_id: splash.id })
    executeWith(figma, 'connect_screens', { from_id: splash.id, to_id: home.id })
    executeWith(figma, 'create_state', { node_id: button.id, state_name: 'pressed' })
    executeWith(figma, 'create_interaction', {
      node_id: button.id,
      trigger: 'press',
      action: 'setState',
      state: 'pressed'
    })

    const result = executeWith(figma, 'preview_prototype', {})
    expect(result.error).toBeUndefined()
    expect(result.executable).toBe(true)
    expect(result.active_flow_id).toBe('flow-1')
    expect(result.flow_start_id).toBe(splash.id)
    expect(result.flow_start_name).toBe('Splash')
    expect(result.flow_start_exists).toBe(true)
    expect(result.interactions).toBe(2)
    const triggers = result.triggers as Record<string, number>
    expect(triggers.click).toBe(1)
    expect(triggers.press).toBe(1)
    const screens = result.screens as Array<{ id: string; interactions: number }>
    expect(screens).toEqual([{ id: splash.id, name: 'Splash', interactions: 1 }])
    expect(result.warnings).toEqual([])
  })

  test('executable=false when the page has no frame and no flow start', () => {
    const { figma } = setupToolTest()
    const result = executeWith(figma, 'preview_prototype', {})
    expect(result.error).toBeUndefined()
    expect(result.executable).toBe(false)
    const warnings = result.warnings as string[]
    expect(warnings.some((warning) => warning.includes('No flow authored'))).toBe(true)
    expect(warnings.some((warning) => warning.includes('No interactions authored'))).toBe(true)
    expect(warnings.some((warning) => warning.includes('No screen frame'))).toBe(true)
  })

  test('reports a deleted flow start and loses executability with it', () => {
    const { figma, splash, home } = setupScreens()
    executeWith(figma, 'create_prototype_flow', { node_id: splash.id })
    splash.remove()
    home.remove()

    const result = executeWith(figma, 'preview_prototype', {})
    expect(result.error).toBeUndefined()
    expect(result.executable).toBe(false)
    expect(result.flow_start_exists).toBe(false)
    expect(result.flow_start_id).toBeNull()
    const warnings = result.warnings as string[]
    expect(warnings.some((warning) => warning.includes('does not exist'))).toBe(true)
  })
})

describe('guard params', () => {
  test('create_interaction accepts a guard whose variable is declared in state vars', () => {
    const { figma, graph, home, button } = setupScreens()
    executeWith(figma, 'create_state', { node_id: button.id, vars: '{"open":true,"count":2}' })

    const guard = '{"all":[{"variable":"open","op":"eq","value":true}]}'
    const result = executeWith(figma, 'create_interaction', {
      node_id: button.id,
      action: 'navigate',
      destination_id: home.id,
      guard
    })
    expect(result.error).toBeUndefined()
    const interaction = readNodeInteractions(buttonNode(graph, button.id))[0]
    expect(interaction?.guard).toEqual({
      all: [{ variable: 'open', op: 'eq', value: true }]
    })
  })

  test('create_interaction rejects guards on undeclared variables or model-less nodes', () => {
    const { figma, graph, home, button } = setupScreens()
    const modelLess = executeWith(figma, 'create_interaction', {
      node_id: home.id,
      action: 'navigate',
      destination_id: home.id,
      guard: '{"all":[{"variable":"open","op":"eq","value":true}]}'
    })
    expect(modelLess.error).toContain('no state model')

    executeWith(figma, 'create_state', { node_id: button.id })
    const noVars = executeWith(figma, 'create_interaction', {
      node_id: button.id,
      action: 'navigate',
      destination_id: home.id,
      guard: '{"all":[{"variable":"open","op":"eq","value":true}]}'
    })
    expect(noVars.error).toContain('Declared vars')

    executeWith(figma, 'create_state', { node_id: button.id, vars: '{"open":true}' })
    const unknownVar = executeWith(figma, 'create_interaction', {
      node_id: button.id,
      action: 'navigate',
      destination_id: home.id,
      guard: '{"all":[{"variable":"ghost","op":"eq","value":true}]}'
    })
    expect(unknownVar.error).toContain('unknown variable')

    // Atomicity: none of the rejected guards wrote an interaction.
    expect(readNodeInteractions(buttonNode(graph, button.id))).toEqual([])
  })
})
