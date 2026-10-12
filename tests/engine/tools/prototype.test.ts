import { describe, expect, test } from 'bun:test'

import {
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

describe('create_prototype_flow', () => {
  test('writes and updates the root flow document', () => {
    const { figma, splash, home } = setupScreens()

    let result = executeWith(figma, 'create_prototype_flow', { node_id: splash.id })
    expect(result.error).toBeUndefined()
    expect(result.start_node_id).toBe(splash.id)
    const root = expectDefined(figma.graph.getNode(figma.graph.rootId), 'root')
    expect(readPrototypeDocument(root)?.flows[0]?.startNodeId).toBe(splash.id)

    result = executeWith(figma, 'create_prototype_flow', { node_id: home.id })
    expect(result.error).toBeUndefined()
    expect(
      readPrototypeDocument(expectDefined(figma.graph.getNode(figma.graph.rootId), 'root'))
        ?.flows[0]?.startNodeId
    ).toBe(home.id)
  })

  test('rejects a missing node', () => {
    const { figma } = setupToolTest()
    const result = executeWith(figma, 'create_prototype_flow', { node_id: 'nope' })
    expect(result.error).toContain('not found')
  })
})

describe('create_interaction', () => {
  test('authors a navigate interaction with defaults', () => {
    const { figma, splash, home } = setupScreens()
    const result = executeWith(figma, 'create_interaction', {
      node_id: splash.id,
      action: 'navigate',
      destination_id: home.id
    })
    expect(result.error).toBeUndefined()
    expect(result.count).toBe(1)

    const raw = expectDefined(figma.graph.getNode(splash.id), 'splash')
    const interactions = readNodeInteractions(raw)
    expect(interactions).toHaveLength(1)
    expect(interactions[0]?.trigger).toBe('click')
    expect(interactions[0]?.action).toEqual({ type: 'navigate', destinationId: home.id })
    expect(interactions[0]?.transition).toEqual({
      kind: 'fade',
      durationMs: 300,
      easing: 'easeOut'
    })
    expect(interactions[0]?.id).toBe(result.id)
  })

  test('validates targets, delay, duration, and state before writing', () => {
    const { figma, splash } = setupScreens()

    expect(
      executeWith(figma, 'create_interaction', {
        node_id: splash.id,
        action: 'navigate',
        destination_id: 'missing'
      }).error
    ).toContain('not found')

    expect(
      executeWith(figma, 'create_interaction', {
        node_id: splash.id,
        trigger: 'afterDelay',
        action: 'closeOverlay'
      }).error
    ).toContain('delay_ms')

    expect(
      executeWith(figma, 'create_interaction', {
        node_id: splash.id,
        action: 'closeOverlay',
        transition: 'fade',
        duration_ms: 999_999
      }).error
    ).toContain('duration_ms')

    expect(
      executeWith(figma, 'create_interaction', {
        node_id: splash.id,
        action: 'setState',
        state: 'hover'
      }).error
    ).toContain('create_state')

    // Nothing was written on any failure.
    expect(readNodeInteractions(expectDefined(figma.graph.getNode(splash.id), 'splash'))).toEqual(
      []
    )
  })

  test('afterDelay stores the delay and slide stores direction', () => {
    const { figma, splash, home } = setupScreens()
    const result = executeWith(figma, 'create_interaction', {
      node_id: splash.id,
      trigger: 'afterDelay',
      delay_ms: 800,
      action: 'navigate',
      destination_id: home.id,
      transition: 'slide',
      direction: 'left',
      duration_ms: 450,
      easing: 'linear'
    })
    expect(result.error).toBeUndefined()
    const interaction = readNodeInteractions(
      expectDefined(figma.graph.getNode(splash.id), 'splash')
    )[0]
    expect(interaction?.delayMs).toBe(800)
    expect(interaction?.transition).toEqual({
      kind: 'slide',
      direction: 'left',
      durationMs: 450,
      easing: 'linear'
    })
  })
})

describe('interaction edit tools', () => {
  function withOneInteraction() {
    const ctx = setupScreens()
    const created = executeWith(ctx.figma, 'create_interaction', {
      node_id: ctx.splash.id,
      action: 'navigate',
      destination_id: ctx.home.id
    })
    return { ...ctx, interactionId: expectDefined(created.id as string, 'interaction id') }
  }

  test('set_interaction_trigger updates trigger and delay', () => {
    const { figma, splash, interactionId } = withOneInteraction()
    const result = executeWith(figma, 'set_interaction_trigger', {
      node_id: splash.id,
      interaction_id: interactionId,
      trigger: 'afterDelay',
      delay_ms: 1200
    })
    expect(result.error).toBeUndefined()
    const interaction = readNodeInteractions(
      expectDefined(figma.graph.getNode(splash.id), 'splash')
    )[0]
    expect(interaction?.trigger).toBe('afterDelay')
    expect(interaction?.delayMs).toBe(1200)

    // Switching away from afterDelay drops the delay.
    executeWith(figma, 'set_interaction_trigger', {
      node_id: splash.id,
      interaction_id: interactionId,
      trigger: 'hoverEnter'
    })
    expect(
      readNodeInteractions(expectDefined(figma.graph.getNode(splash.id), 'splash'))[0]?.delayMs
    ).toBeUndefined()
  })

  test('set_interaction_trigger rejects unknown interaction ids', () => {
    const { figma, splash } = withOneInteraction()
    const result = executeWith(figma, 'set_interaction_trigger', {
      node_id: splash.id,
      interaction_id: 'ghost',
      trigger: 'click'
    })
    expect(result.error).toContain('ghost')
  })

  test('set_interaction_action switches to closeOverlay', () => {
    const { figma, splash, interactionId } = withOneInteraction()
    const result = executeWith(figma, 'set_interaction_action', {
      node_id: splash.id,
      interaction_id: interactionId,
      action: 'closeOverlay'
    })
    expect(result.error).toBeUndefined()
    expect(
      readNodeInteractions(expectDefined(figma.graph.getNode(splash.id), 'splash'))[0]?.action
    ).toEqual({ type: 'closeOverlay' })
  })

  test('set_interaction_transition applies spring config', () => {
    const { figma, splash, interactionId } = withOneInteraction()
    const result = executeWith(figma, 'set_interaction_transition', {
      node_id: splash.id,
      interaction_id: interactionId,
      transition: 'spring',
      spring_bounce: 0.5
    })
    expect(result.error).toBeUndefined()
    expect(
      readNodeInteractions(expectDefined(figma.graph.getNode(splash.id), 'splash'))[0]?.transition
    ).toEqual({ kind: 'spring', spring: { mode: 'time', bounce: 0.5 } })

    const bad = executeWith(figma, 'set_interaction_transition', {
      node_id: splash.id,
      interaction_id: interactionId,
      transition: 'spring',
      spring_bounce: 2
    })
    expect(bad.error).toContain('spring_bounce')
  })
})

describe('state tools', () => {
  test('create_state bootstraps the model and appends named states', () => {
    const { figma, button } = setupScreens()
    const first = executeWith(figma, 'create_state', { node_id: button.id })
    expect(first.error).toBeUndefined()
    expect(first.initial).toBe('default')

    const again = executeWith(figma, 'create_state', { node_id: button.id })
    expect(again.already_exists).toBe(true)

    const added = executeWith(figma, 'create_state', { node_id: button.id, state_name: 'pressed' })
    expect(added.error).toBeUndefined()
    const model = readNodeStateModel(expectDefined(figma.graph.getNode(button.id), 'button'))
    expect(model?.states.map((s) => s.name)).toEqual(['default', 'pressed'])
    expect(model?.initial).toBe('default')
  })

  test('create_state treats empty vars input as unset, not a parse error', () => {
    const { figma, button } = setupScreens()
    // Models send `""` or `"{}"` when they mean "no variables"; these must not
    // become a tool error the model then reports back as "vars invalid".
    for (const vars of ['', '   ', '{}']) {
      const result = executeWith(figma, 'create_state', { node_id: button.id, vars })
      expect(result.error).toBeUndefined()
    }
    const empty = readNodeStateModel(expectDefined(figma.graph.getNode(button.id), 'button'))
    expect(empty?.vars).toBeUndefined()

    // Real variables still parse, and genuinely malformed input still errors.
    const seeded = executeWith(figma, 'create_state', {
      node_id: button.id,
      state_name: 'hover',
      vars: '{"open":false,"count":2}'
    })
    expect(seeded.error).toBeUndefined()
    const withVars = readNodeStateModel(expectDefined(figma.graph.getNode(button.id), 'button'))
    expect(withVars?.vars).toEqual({ open: false, count: 2 })

    const malformed = executeWith(figma, 'create_state', {
      node_id: button.id,
      state_name: 'press',
      vars: 'open=false'
    })
    expect(malformed.error).toContain('vars must be JSON')
  })

  test('set_state_visual merges values and validates inputs', () => {
    const { figma, button } = setupScreens()
    const noModel = executeWith(figma, 'set_state_visual', {
      node_id: button.id,
      state_name: 'default',
      scale: 0.9
    })
    expect(noModel.error).toContain('create_state')

    executeWith(figma, 'create_state', { node_id: button.id })
    const missingState = executeWith(figma, 'set_state_visual', {
      node_id: button.id,
      state_name: 'hover',
      scale: 1
    })
    expect(missingState.error).toContain('Available')

    const badOpacity = executeWith(figma, 'set_state_visual', {
      node_id: button.id,
      state_name: 'default',
      opacity: 4
    })
    expect(badOpacity.error).toContain('opacity')

    const ok = executeWith(figma, 'set_state_visual', {
      node_id: button.id,
      state_name: 'default',
      scale: 0.96,
      opacity: 0.8
    })
    expect(ok.error).toBeUndefined()
    const model = readNodeStateModel(expectDefined(figma.graph.getNode(button.id), 'button'))
    expect(model?.states[0]?.visual).toEqual({ scale: 0.96, opacity: 0.8 })
  })

  test('setState interactions require the state to exist', () => {
    const { figma, button } = setupScreens()
    executeWith(figma, 'create_state', { node_id: button.id, state_name: 'hover' })
    const result = executeWith(figma, 'create_interaction', {
      node_id: button.id,
      trigger: 'hoverEnter',
      action: 'setState',
      state: 'pressed'
    })
    expect(result.error).toContain('pressed')

    const ok = executeWith(figma, 'create_interaction', {
      node_id: button.id,
      trigger: 'hoverEnter',
      action: 'setState',
      state: 'hover'
    })
    expect(ok.error).toBeUndefined()
  })
})

describe('connect_screens', () => {
  test('appends a navigate interaction between screens', () => {
    const { figma, splash, home } = setupScreens()
    const result = executeWith(figma, 'connect_screens', {
      from_id: splash.id,
      to_id: home.id
    })
    expect(result.error).toBeUndefined()
    expect(result.from).toBe(splash.id)
    expect(result.to).toBe(home.id)
    const interaction = readNodeInteractions(
      expectDefined(figma.graph.getNode(splash.id), 'splash')
    )[0]
    expect(interaction?.action).toEqual({ type: 'navigate', destinationId: home.id })

    const missing = executeWith(figma, 'connect_screens', {
      from_id: splash.id,
      to_id: 'ghost'
    })
    expect(missing.error).toContain('not found')
  })
})

describe('validate_prototype', () => {
  test('passes a clean authored flow and reports counts', () => {
    const { figma, splash, home } = setupScreens()
    executeWith(figma, 'create_prototype_flow', { node_id: splash.id })
    executeWith(figma, 'connect_screens', { from_id: splash.id, to_id: home.id })

    const result = executeWith(figma, 'validate_prototype', {})
    expect(result.error).toBeUndefined()
    expect(result.ok).toBe(true)
    expect(result.interactions).toBe(1)
    expect(result.errors).toEqual([])
  })

  test('flags missing destinations and reports empty-page warning', () => {
    const { figma, splash, home } = setupScreens()
    executeWith(figma, 'create_interaction', {
      node_id: splash.id,
      action: 'navigate',
      destination_id: home.id
    })
    home.remove()

    const result = executeWith(figma, 'validate_prototype', {})
    expect(result.ok).toBe(false)
    const errors = result.errors as string[]
    expect(errors.some((e) => e.includes('missing destination'))).toBe(true)

    const empty = setupToolTest()
    const clean = executeWith(empty.figma, 'validate_prototype', {})
    expect(clean.ok).toBe(true)
    expect((clean.warnings as string[]).some((w) => w.includes('No interactions'))).toBe(true)
  })

  test('scope=node_id validates only that subtree', () => {
    const { figma, splash, home } = setupScreens()
    executeWith(figma, 'create_interaction', {
      node_id: splash.id,
      action: 'navigate',
      destination_id: home.id
    })
    home.remove()
    const scoped = executeWith(figma, 'validate_prototype', { node_id: splash.id })
    // Splash's own interaction is broken even in scope… its subtree holds it.
    expect(scoped.ok).toBe(false)
  })
})

describe('create_bottom_sheet', () => {
  test('wires opener, dismiss, and outside-tap with bottom-sheet defaults', () => {
    const { figma, home, button } = setupScreens()
    const sheet = figma.createFrame()
    sheet.name = 'Sheet'

    const result = executeWith(figma, 'create_bottom_sheet', {
      sheet_id: sheet.id,
      trigger_node_id: button.id
    })
    expect(result.error).toBeUndefined()
    expect(result.sheet).toBe(sheet.id)
    expect(result.outside_close).toBe('added')

    const opener = readNodeInteractions(expectDefined(figma.graph.getNode(button.id), 'button'))
    expect(opener).toHaveLength(1)
    expect(opener[0]).toMatchObject({
      trigger: 'click',
      action: { type: 'openOverlay', overlayId: sheet.id, backdropOpacity: 0.3 },
      transition: { kind: 'slide', direction: 'up', durationMs: 300 }
    })

    const dismiss = readNodeInteractions(expectDefined(figma.graph.getNode(sheet.id), 'sheet'))
    expect(dismiss).toHaveLength(1)
    expect(dismiss[0]).toMatchObject({
      trigger: 'click',
      action: { type: 'closeOverlay' },
      transition: { kind: 'slide', direction: 'down' }
    })

    const screen = readNodeInteractions(expectDefined(figma.graph.getNode(home.id), 'home'))
    expect(screen).toHaveLength(1)
    expect(screen[0]?.action).toEqual({ type: 'closeOverlay' })

    const validated = executeWith(figma, 'validate_prototype', {})
    expect(validated.ok).toBe(true)
  })

  test('is idempotent: a second run adds nothing', () => {
    const { figma, button } = setupScreens()
    const sheet = figma.createFrame()
    const args = { sheet_id: sheet.id, trigger_node_id: button.id }

    executeWith(figma, 'create_bottom_sheet', args)
    const second = executeWith(figma, 'create_bottom_sheet', args)
    expect(second.added).toBe(0)
    expect(second.opened_by).toBe('existing')
    expect(second.close).toBe('existing')
    expect(
      readNodeInteractions(expectDefined(figma.graph.getNode(button.id), 'button'))
    ).toHaveLength(1)
    expect(
      readNodeInteractions(expectDefined(figma.graph.getNode(sheet.id), 'sheet'))
    ).toHaveLength(1)
  })

  test('skips outside-tap when the screen already uses click', () => {
    const { figma, home, button } = setupScreens()
    const sheet = figma.createFrame()
    executeWith(figma, 'create_interaction', {
      node_id: home.id,
      action: 'navigate',
      destination_id: home.id,
      trigger: 'click'
    })

    const result = executeWith(figma, 'create_bottom_sheet', {
      sheet_id: sheet.id,
      trigger_node_id: button.id
    })
    expect(result.outside_close).toBe('skipped')
    expect(readNodeInteractions(expectDefined(figma.graph.getNode(home.id), 'home'))).toHaveLength(
      1
    )
  })

  test('rejects invalid targets without mutating the document', () => {
    const { figma, button } = setupScreens()
    const sheet = figma.createFrame()

    expect(
      executeWith(figma, 'create_bottom_sheet', { sheet_id: 'nope', trigger_node_id: button.id })
        .error
    ).toContain('not found')
    expect(
      executeWith(figma, 'create_bottom_sheet', { sheet_id: sheet.id, trigger_node_id: 'nope' })
        .error
    ).toContain('not found')
    expect(
      executeWith(figma, 'create_bottom_sheet', {
        sheet_id: sheet.id,
        trigger_node_id: sheet.id
      }).error
    ).toContain('cannot be the sheet itself')
    expect(
      executeWith(figma, 'create_bottom_sheet', { sheet_id: sheet.id, backdrop_opacity: 2 }).error
    ).toContain('backdrop_opacity')

    expect(
      readNodeInteractions(expectDefined(figma.graph.getNode(sheet.id), 'sheet'))
    ).toHaveLength(0)
    expect(
      readNodeInteractions(expectDefined(figma.graph.getNode(button.id), 'button'))
    ).toHaveLength(0)
  })

  test('works without a trigger: dismiss only', () => {
    const { figma } = setupScreens()
    const sheet = figma.createFrame()
    const result = executeWith(figma, 'create_bottom_sheet', { sheet_id: sheet.id })
    expect(result.error).toBeUndefined()
    expect(result.outside_close).toBe('none')
    expect(result.opened_by).toBeNull()
    expect(
      readNodeInteractions(expectDefined(figma.graph.getNode(sheet.id), 'sheet'))
    ).toHaveLength(1)
  })
})

describe('registry exposure', () => {
  test('every prototype tool is registered and schema-shaped', () => {
    for (const name of [
      'create_prototype_flow',
      'create_interaction',
      'set_interaction_trigger',
      'set_interaction_action',
      'set_interaction_transition',
      'create_state',
      'set_state_visual',
      'connect_screens',
      'create_bottom_sheet',
      'validate_prototype'
    ]) {
      const tool = getTool(name)
      expect(tool.description.length).toBeGreaterThan(10)
      expect(typeof tool.execute).toBe('function')
    }
    expect(getTool('validate_prototype').mutates).toBe(false)
    expect(getTool('create_interaction').mutates).toBe(true)
  })
})
