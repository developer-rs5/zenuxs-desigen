import { describe, expect, it } from 'bun:test'

import {
  createPrototypeCritic,
  isPrototypeMutation,
  MAX_PROTOTYPE_REPAIR_ROUNDS,
  repairMessage,
  runPrototypeValidation
} from '@/app/ai/chat/prototype-critic'

import { getTool, setupToolTest } from '#tests/helpers/tools'

function execute(
  figma: ReturnType<typeof setupToolTest>['figma'],
  name: string,
  args: Record<string, unknown>
): unknown {
  return getTool(name).execute(figma, args)
}

describe('prototype mutation detection (audit §4.6)', () => {
  it('recognizes the prototype tools that write document content', () => {
    for (const name of [
      'create_interaction',
      'set_interaction_action',
      'set_interaction_transition',
      'connect_screens',
      'create_prototype_flow',
      'create_state',
      'apply_state',
      'add_keyframe',
      'create_bottom_sheet'
    ]) {
      expect(isPrototypeMutation(name)).toBe(true)
    }
  })

  it('ignores reads, non-prototype tools, and the validator itself', () => {
    for (const name of [
      'describe',
      'render',
      'batch_update',
      'validate_prototype',
      'list_flows',
      'preview_prototype',
      'create_component'
    ]) {
      expect(isPrototypeMutation(name)).toBe(false)
    }
  })
})

describe('automatic validation runs the real validator', () => {
  it('reports ok for a clean authored flow', () => {
    const { figma } = setupToolTest()
    const splash = figma.createFrame()
    splash.name = 'Splash'
    const home = figma.createFrame()
    home.name = 'Home'
    execute(figma, 'create_prototype_flow', { node_id: splash.id })
    execute(figma, 'connect_screens', { from_id: splash.id, to_id: home.id })

    const verdict = runPrototypeValidation(figma)
    expect(verdict).toEqual({ ok: true, errors: [] })

    const critic = createPrototypeCritic()
    critic.noteMutation()
    critic.recordValidation(verdict)
    expect(critic.takeRepair()).toBeNull()
  })

  it('surfaces a broken document written between tools', () => {
    const { figma } = setupToolTest()
    const splash = figma.createFrame()
    splash.name = 'Splash'
    const home = figma.createFrame()
    home.name = 'Home'
    // Valid at write time…
    execute(figma, 'create_interaction', {
      node_id: splash.id,
      action: 'navigate',
      destination_id: home.id
    })
    // …then the destination disappears (raw write between tools).
    home.remove()

    const verdict = runPrototypeValidation(figma)
    expect(verdict?.ok).toBe(false)

    const critic = createPrototypeCritic()
    critic.noteMutation()
    critic.recordValidation(verdict)

    const repair = critic.takeRepair()
    expect(repair).toContain('missing destination')
    expect(repair).toContain('validate_prototype')
    expect(repairMessage(repair ?? '')).toEqual({ role: 'user', content: repair })
    // One automatic round per run: a still-broken document cannot loop.
    expect(critic.takeRepair()).toBeNull()
    expect(critic.report()).toMatchObject({
      mutated: true,
      repairRoundsUsed: MAX_PROTOTYPE_REPAIR_ROUNDS,
      validation: { ok: false }
    })
  })

  it('never repairs on a validator failure or without a mutation', () => {
    const critic = createPrototypeCritic()
    critic.recordValidation({ ok: false, errors: ['x'] })
    expect(critic.takeRepair()).toBeNull()

    const other = createPrototypeCritic()
    other.noteMutation()
    other.recordValidation(null)
    expect(other.takeRepair()).toBeNull()
  })

  it('starts each run clean', () => {
    const critic = createPrototypeCritic()
    critic.noteMutation()
    critic.recordValidation({ ok: false, errors: ['boom'] })
    expect(critic.takeRepair()).not.toBeNull()

    critic.reset()
    expect(critic.report()).toEqual({
      mutated: false,
      validation: null,
      repairRoundsUsed: 0,
      lastRepair: null
    })
    expect(critic.takeRepair()).toBeNull()
  })
})
