import { describe, expect, test } from 'bun:test'

import { calc } from '#core/tools/calc'
import { evaluateExpression } from '#core/tools/calc-parser'

import { getTool, setupToolTest, type ToolResult } from '#tests/helpers/tools'

function evalOk(expr: string): number {
  return evaluateExpression(expr)
}

function evalErr(expr: string): string {
  try {
    evaluateExpression(expr)
    return ''
  } catch (error) {
    return error instanceof Error ? error.message : String(error)
  }
}

describe('calc expression parser (replaces expr-eval)', () => {
  test('documented examples evaluate to the historic values', () => {
    expect(evalOk('844 - 56 - 96 - 82')).toBe(610)
    expect(evalOk('1440 * 8 / 12')).toBe(960)
    expect(evalOk('(952 - 16) / 2')).toBe(468)
    expect(evalOk('floor(390 * 0.6)')).toBe(234)
    expect(evalOk('1 + 2 * 3 - 4 / 2')).toBe(5)
    expect(evalOk('(1+2)*(3+4)')).toBe(21)
    expect(evalOk('7 % 3')).toBe(1)
    expect(evalOk('-7 % 3')).toBe(-1)
    expect(evalOk('10 / 4')).toBe(2.5)
  })

  test('powers: ** now works (was rejected before), ^ stays, both right-assoc', () => {
    expect(evalOk('2 ** 3')).toBe(8)
    expect(evalOk('2 ** 3 ** 2')).toBe(512)
    expect(evalOk('2 ^ 3 ^ 2')).toBe(512)
    expect(evalOk('2 ** -1')).toBe(0.5)
    // Power binds tighter than unary minus (Python convention); the old
    // implementation was an outright syntax error here.
    expect(evalOk('-2 ** 2')).toBe(-4)
  })

  test('unary minus, number formats, constants', () => {
    expect(evalOk('-5 + 3')).toBe(-2)
    expect(evalOk('--5')).toBe(5)
    expect(evalOk('1e3 + 1')).toBe(1001)
    expect(evalOk('.5 * 2')).toBe(1)
    expect(evalOk('0.1+0.2')).toBeCloseTo(0.3, 10)
    expect(evalOk('PI * 2')).toBeCloseTo(6.283185307179586, 12)
    expect(evalOk('E')).toBe(Math.E)
  })

  test('functions match Math semantics and arity is enforced', () => {
    expect(evalOk('min(3,1,2)')).toBe(1)
    expect(evalOk('max(3,1)')).toBe(3)
    expect(evalOk('round(2.5)')).toBe(3)
    expect(evalOk('round(-2.5)')).toBe(-2) // Math.round, historic expr-eval parity
    expect(evalOk('sqrt(16)')).toBe(4)
    expect(evalOk('pow(2,10)')).toBe(1024)
    expect(evalOk('abs(-5)')).toBe(5)
    expect(evalOk('ceil(1.1)')).toBe(2)
    expect(evalOk('floor(-1.1)')).toBe(-2)
    expect(evalErr('sqrt(16, 2)')).toContain('takes 1 argument')
    expect(evalErr('pow(2)')).toContain('takes 2 arguments')
    expect(evalErr('min()')).toContain('at least 1 argument')
  })

  test('rejects everything outside the calculator surface', () => {
    expect(evalErr('x = 5')).toContain('Unknown identifier')
    expect(evalErr('random()')).toContain('Unknown identifier')
    expect(evalErr('[1,2][0]')).toContain('Unexpected character')
    expect(evalErr('1 < 2')).toContain('Unexpected character')
    expect(evalErr('true ? 1 : 2')).toContain('Unknown identifier')
    expect(evalErr('1; 2')).toContain('Unexpected character')
    expect(evalErr('(1 + 2')).toContain('Expected ")"')
    expect(evalErr('1 +')).toContain('end of expression')
    expect(evalErr('')).toContain('end of expression')
  })

  test('non-finite results throw the documented "Produced" error', () => {
    expect(evalErr('1/0')).toBe('Produced Infinity')
    expect(evalErr('0/0')).toBe('Produced NaN')
  })
})

describe('calc tool', () => {
  test('single expression returns a result', () => {
    const { figma } = setupToolTest()
    const tool = getTool('calc')
    const result = tool.execute(figma, { expr: '844 - 56 - 96 - 82' }) as ToolResult
    expect(result).toMatchObject({ expr: '844 - 56 - 96 - 82', result: 610 })
  })

  test('JSON array evaluates every expression independently', () => {
    const { figma } = setupToolTest()
    const tool = getTool('calc')
    const result = tool.execute(figma, {
      expr: '["1440 * 8 / 12", "(952 - 16) / 2", "floor(390 * 0.6)"]'
    }) as { results: Array<{ expr: string; result?: number; error?: string }> }
    expect(result.results.map((entry) => entry.result)).toEqual([960, 468, 234])
  })

  test('invalid input returns a structured error, never throws', () => {
    const { figma } = setupToolTest()
    const tool = getTool('calc')
    const broken = tool.execute(figma, { expr: '2 +' }) as { error?: string }
    expect(broken.error).toBeTruthy()
    const nonJSON = tool.execute(figma, { expr: 'not json and not math' }) as {
      error?: string
    }
    expect(nonJSON.error).toContain('Unknown identifier')
    expect(calc.name).toBe('calc')
  })
})
