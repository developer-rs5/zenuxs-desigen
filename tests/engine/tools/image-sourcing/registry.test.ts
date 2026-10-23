import { describe, expect, test } from 'bun:test'

import { searchImageAssetProviders } from '@open-pencil/core/tools'

import { createAsset, createFakeProvider } from '#tests/helpers/image-sourcing'

const OPTIONS = { limit: 5, allowNonCommercial: false, requireModification: true }

describe('searchImageAssetProviders', () => {
  test('does not wait for a hanging provider once another returned results', async () => {
    const fast = createFakeProvider('fast', [createAsset({ id: 'fast-1' })])
    const hanging = {
      name: 'hanging',
      isConfigured: () => true,
      search: () =>
        new Promise<never>(() => {
          // Deliberately never settles: this provider represents a hung request.
        })
    }

    const started = Date.now()
    const outcomes = await searchImageAssetProviders('coffee', OPTIONS, [fast, hanging], 2_000, 10)

    expect(Date.now() - started).toBeLessThan(1_000)
    expect(outcomes.map((outcome) => outcome.provider)).toEqual(['fast'])
    expect(outcomes[0]?.assets).toHaveLength(1)
  })

  test('waits for every provider when they all answer promptly', async () => {
    const one = createFakeProvider('one', [createAsset({ provider: 'one' })])
    const two = createFakeProvider('two', [createAsset({ provider: 'two' })])

    const outcomes = await searchImageAssetProviders('coffee', OPTIONS, [one, two], 2_000, 10)

    expect(outcomes.map((outcome) => outcome.provider).sort()).toEqual(['one', 'two'])
  })

  test('reports a failing provider without dropping the successful results', async () => {
    const failing = createFakeProvider('failing', [], { fail: true })
    const working = createFakeProvider('working', [createAsset()])

    const outcomes = await searchImageAssetProviders(
      'coffee',
      OPTIONS,
      [failing, working],
      2_000,
      10
    )

    expect(outcomes.find((outcome) => outcome.provider === 'failing')?.error).toContain(
      'unavailable'
    )
    expect(outcomes.find((outcome) => outcome.provider === 'working')?.assets).toHaveLength(1)
  })
})
