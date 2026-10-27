/**
 * Plugin runtime tests (ported from the core cases of FigCraft
 * `crates/plugin/src/` tests). The modules are assembled here so the ABI is
 * exercised end to end without shipping a binary fixture.
 */

import { describe, expect, test } from 'bun:test'

import { runPlugin, parseManifest, PluginError } from './index'

function leb(value: number): number[] {
  const out: number[] = []
  let n = value >>> 0
  do {
    let byte = n & 0x7f
    n >>>= 7
    if (n !== 0) byte |= 0x80
    out.push(byte)
  } while (n !== 0)
  return out
}

function str(value: string): number[] {
  const bytes = [...new TextEncoder().encode(value)]
  return [...leb(bytes.length), ...bytes]
}

function vec(items: number[][]): number[] {
  return [...leb(items.length), ...items.flat()]
}

function section(id: number, bytes: number[]): number[] {
  return [id, ...leb(bytes.length), ...bytes]
}

function moduleBytes(
  body: number[],
  data: Array<{ offset: number; text: string }>,
  imports: Array<{ name: string; type: number }>,
  types: number[][]
): Uint8Array {
  const header = [0x00, 0x61, 0x73, 0x6d, 0x01, 0x00, 0x00, 0x00]
  const typeSection = section(1, vec(types))
  const importSection = section(
    2,
    vec(imports.map((item) => [...str('figcraft'), ...str(item.name), 0x00, ...leb(item.type)]))
  )
  const functionSection = section(3, vec([[0x01]]))
  const memorySection = section(5, vec([[0x00, 0x01]]))
  const exportSection = section(
    7,
    vec([
      [...str('memory'), 0x02, ...leb(0)],
      // Imported functions come first in the function index space.
      [...str('figcraft_run'), 0x00, ...leb(imports.length)]
    ])
  )
  // One function: count, then the body size (a body is self-delimiting, so
  // `vec` cannot be reused here).
  const codeSection = section(10, [...leb(1), ...leb(body.length), ...body])
  const dataSection = section(
    11,
    vec(data.map((item) => [0x00, 0x41, ...leb(item.offset), 0x0b, ...str(item.text)]))
  )
  return new Uint8Array([
    ...header,
    ...typeSection,
    ...importSection,
    ...functionSection,
    ...memorySection,
    ...exportSection,
    ...codeSection,
    ...dataSection
  ])
}

/** Logs "hello" and sets the output to `{"ok":true}`. */
function demoModule(): Uint8Array {
  const types = [
    [0x60, 0x02, 0x7f, 0x7f, 0x00],
    [0x60, 0x01, 0x7f, 0x01, 0x7f]
  ]
  const body = [
    0x00, 0x41, 0x00, 0x41, 0x05, 0x10, 0x00, 0x41, 0x10, 0x41, 0x0b, 0x10, 0x01, 0x41, 0x00, 0x0b
  ]
  return moduleBytes(
    body,
    [
      { offset: 0, text: 'hello' },
      { offset: 16, text: '{"ok":true}' }
    ],
    [
      { name: 'log', type: 0 },
      { name: 'set_output', type: 0 }
    ],
    types
  )
}

/** Calls the host with `node.get` and `{}`, then returns 0. */
function hostCallModule(): Uint8Array {
  const types = [
    [0x60, 0x04, 0x7f, 0x7f, 0x7f, 0x7f, 0x01, 0x7f],
    [0x60, 0x01, 0x7f, 0x01, 0x7f]
  ]
  const body = [
    0x00, 0x41, 0x00, 0x41, 0x08, 0x41, 0x10, 0x41, 0x02, 0x10, 0x00, 0x1a, 0x41, 0x00, 0x0b
  ]
  return moduleBytes(
    body,
    [
      { offset: 0, text: 'node.get' },
      { offset: 16, text: '{}' }
    ],
    [{ name: 'call', type: 0 }],
    types
  )
}

describe('plugin runtime', () => {
  test('manifest_parses', () => {
    const m = parseManifest({
      id: 'com.example.plugin',
      name: 'Example',
      version: '1.0.0',
      permissions: ['read']
    })
    expect(m).toEqual({
      id: 'com.example.plugin',
      name: 'Example',
      version: '1.0.0',
      permissions: ['read']
    })
  })

  test('manifest_rejects_missing_fields', () => {
    expect(parseManifest({})).toBeInstanceOf(Error)
    expect(parseManifest({ id: 'x' })).toBeInstanceOf(Error)
    expect(parseManifest(null)).toBeInstanceOf(Error)
  })

  test('permissions_default_to_empty', () => {
    const m = parseManifest({ id: 'a', name: 'b', version: '1' })
    expect(m).toEqual({ id: 'a', name: 'b', version: '1', permissions: [] })
  })

  test('runs_a_module_and_collects_its_output_and_logs', async () => {
    const result = await runPlugin(demoModule(), { call: () => '{}' }, { input: '{"command":"x"}' })
    expect(result.logs).toEqual(['hello'])
    expect(result.output).toBe('{"ok":true}')
    expect(result.calls).toBe(0)
    expect(result.outOfFuel).toBe(false)
    // The reply starts as the run's input; `set_output` does not replace it.
    expect(result.reply).toEqual(new TextEncoder().encode('{"command":"x"}'))
  })

  test('wires_host_call_with_command_and_params', async () => {
    const seen: Array<[string, string]> = []
    const result = await runPlugin(hostCallModule(), {
      call: (command, params) => {
        seen.push([command, params])
        return '{"id":1}'
      }
    })
    expect(seen).toEqual([['node.get', '{}']])
    expect(result.calls).toBe(1)
  })

  test('rejects_invalid_modules', async () => {
    await expect(runPlugin(new Uint8Array(), { call: () => '{}' })).rejects.toBeInstanceOf(
      PluginError
    )
    await expect(runPlugin(new Uint8Array([1, 2, 3]), { call: () => '{}' })).rejects.toBeInstanceOf(
      PluginError
    )
  })

  test('stops_a_module_that_overruns_its_budget', async () => {
    await expect(
      runPlugin(demoModule(), { call: () => '{}' }, { fuelLimit: 1 })
    ).rejects.toBeInstanceOf(PluginError)
  })
})
