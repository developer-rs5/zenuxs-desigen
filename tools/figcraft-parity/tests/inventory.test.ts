import { describe, expect, test } from 'bun:test'
import { readFile } from 'node:fs/promises'

import type { FigCraftCommand, ZenuxsCommand } from '../src/command-catalog'
import { buildInventory } from '../src/inventory'
import { parseCapabilityEvidence } from '../src/manifest'

const reference: FigCraftCommand[] = [
  { id: 'shape.create', source: 'crates/engine/src/cmd/shapes.rs', collaboration: false },
  { id: 'collab.join', source: 'crates/engine/src/cmd/collab.rs', collaboration: true },
  { id: 'shape.delete', source: 'crates/engine/src/cmd/shapes.rs', collaboration: false }
]

const zenuxs: ZenuxsCommand[] = [
  { id: 'shape.create' },
  { id: 'shape.create' },
  { id: 'layout.apply' }
]

describe('buildInventory', () => {
  test('covers_all_approved_parity_domains', async () => {
    const manifest = JSON.parse(
      await readFile(
        new URL('../../../docs/figcraft-parity/capability-evidence.json', import.meta.url),
        'utf8'
      )
    ) as unknown
    const capabilities = parseCapabilityEvidence(manifest)
    const requiredDomains = [
      'canvas/selection',
      'shapes/paint/effects',
      'layout/text',
      'components/variables',
      'prototyping',
      'formats/import-export',
      'plugins',
      'boards/templates/handoff',
      'engine command surface',
      'CLI/MCP/SDK/AI'
    ]

    expect(capabilities.map(({ feature }) => feature)).toEqual(
      expect.arrayContaining(requiredDomains)
    )

    const collaboration = capabilities.filter(({ feature }) =>
      feature.toLowerCase().includes('collaboration')
    )
    expect(collaboration).toHaveLength(1)
    for (const capability of collaboration) {
      expect(capability.feature.toLowerCase()).toContain('excluded')
      expect(capability.status).not.toBe('missing')
      expect(capability.note.toLowerCase()).toContain('excluded')
    }
    const gaps = capabilities.filter(
      ({ status, note }) =>
        (status === 'missing' || status === 'blocked') &&
        !note.toLowerCase().includes('excluded from the approved figcraft parity scope')
    )
    expect(gaps.map(({ feature }) => feature)).not.toContain(collaboration[0]?.feature)
  })

  test('matches_commands_by_exact_id', () => {
    const inventory = buildInventory(reference, zenuxs, [])

    expect(inventory.implemented).toEqual([
      { id: 'shape.create', source: 'crates/engine/src/cmd/shapes.rs' }
    ])
    expect(inventory.missing).toContainEqual({
      id: 'shape.delete',
      source: 'crates/engine/src/cmd/shapes.rs'
    })
    expect(buildInventory(reference, [{ id: 'shape.create.extra' }], []).missing).toContainEqual({
      id: 'shape.create',
      source: 'crates/engine/src/cmd/shapes.rs'
    })
  })

  test('excludes_only_collaboration_commands', () => {
    const inventory = buildInventory(reference, zenuxs, [])

    expect(inventory.collaborationExcluded).toEqual([
      { id: 'collab.join', source: 'crates/engine/src/cmd/collab.rs' }
    ])
    expect(inventory.missing.map(({ id }) => id)).not.toContain('collab.join')
  })

  test('reports_unmatched_zenuxs_commands', () => {
    const inventory = buildInventory(reference, zenuxs, [])

    expect(inventory.unmatchedZenuxs).toEqual([
      { id: 'layout.apply', source: 'Session.all_commands()' }
    ])
  })

  test('reports_duplicate_zenuxs_command_ids', () => {
    const inventory = buildInventory(reference, zenuxs, [])

    expect(inventory.implemented).toHaveLength(1)
    expect(inventory.duplicateZenuxs).toEqual([{ id: 'shape.create', count: 2 }])
  })

  test('sorts_every_inventory_section', () => {
    const inventory = buildInventory(
      [
        { id: 'z.command', source: 'z.rs', collaboration: false },
        { id: 'a.command', source: 'z.rs', collaboration: false },
        { id: 'collab.z', source: 'z.rs', collaboration: true },
        { id: 'collab.a', source: 'a.rs', collaboration: true }
      ],
      [{ id: 'y.command' }, { id: 'x.command' }, { id: 'y.command' }, { id: 'x.command' }],
      [
        {
          feature: 'z feature',
          referencePaths: ['z.rs', 'a.rs'],
          zenuxsSurfaces: {
            packages: ['z', 'a'],
            app: ['z-app', 'a-app'],
            ui: ['z-ui', 'a-ui']
          },
          testEvidence: ['z test', 'a test'],
          status: 'package-only',
          note: 'z note'
        },
        {
          feature: 'a feature',
          referencePaths: ['z.rs', 'a.rs'],
          zenuxsSurfaces: {
            packages: ['z', 'a'],
            app: ['z-app', 'a-app'],
            ui: ['z-ui', 'a-ui']
          },
          testEvidence: ['z test', 'a test'],
          status: 'ui-wired',
          note: 'a note'
        }
      ]
    )

    expect(inventory.implemented.map(({ id }) => id)).toEqual([])
    expect(inventory.missing.map(({ id }) => id)).toEqual(['a.command', 'z.command'])
    expect(inventory.collaborationExcluded.map(({ id }) => id)).toEqual(['collab.a', 'collab.z'])
    expect(inventory.unmatchedZenuxs.map(({ id }) => id)).toEqual(['x.command', 'y.command'])
    expect(inventory.duplicateZenuxs).toEqual([
      { id: 'x.command', count: 2 },
      { id: 'y.command', count: 2 }
    ])
    expect(inventory.capabilities.map(({ feature }) => feature)).toEqual(['a feature', 'z feature'])
    expect(inventory.capabilities[0]?.referencePaths).toEqual(['a.rs', 'z.rs'])
    expect(inventory.capabilities[0]?.zenuxsSurfaces.packages).toEqual(['a', 'z'])
    expect(inventory.capabilities[0]?.testEvidence).toEqual(['a test', 'z test'])
  })

  test('rejects_duplicate_reference_ids', () => {
    expect(() =>
      buildInventory(
        [
          { id: 'shape.create', source: 'one.rs', collaboration: false },
          { id: 'shape.create', source: 'two.rs', collaboration: false }
        ],
        [],
        []
      )
    ).toThrow(/duplicate FigCraft command ID "shape\.create"/)
  })

  test('requires_evidence_for_verified_capabilities', () => {
    expect(() =>
      parseCapabilityEvidence([
        {
          feature: 'Text editing',
          referencePaths: [],
          zenuxsSurfaces: { packages: [], app: [], ui: [] },
          testEvidence: [],
          status: 'verified',
          note: 'Verified'
        }
      ])
    ).toThrow(/verified capability "Text editing" requires evidence/)
  })

  test('rejects_duplicate_features_and_unknown_statuses', () => {
    const entry = {
      feature: 'Text editing',
      referencePaths: ['crates/engine/src/cmd/text.rs'],
      zenuxsSurfaces: { packages: ['packages/text'], app: [], ui: [] },
      testEvidence: ['tests/text.test.ts'],
      status: 'verified',
      note: 'Verified by source and tests'
    }

    expect(() => parseCapabilityEvidence([entry, entry])).toThrow(
      /duplicate capability evidence feature "Text editing"/
    )
    expect(() => parseCapabilityEvidence([{ ...entry, status: 'unknown' }])).toThrow(
      /unknown capability evidence status "unknown"/
    )
  })

  test('requires_explicit_reference_classification', () => {
    expect(() =>
      buildInventory([{ id: 'shape.create', source: 'shape.rs' } as FigCraftCommand], [], [])
    ).toThrow(/explicit collaboration classification/)
  })
})
