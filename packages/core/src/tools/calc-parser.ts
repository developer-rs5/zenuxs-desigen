/**
 * Arithmetic expression parser for the `calc` tool.
 *
 * Replaces `expr-eval`, whose only advisory (GHSA-q9v2-7m5w-4693, critical)
 * is reachable exclusively through its `toJSFunction()` API — but the package
 * has no fixed release (all versions ≤ 2.0.2), so a vulnerable dependency
 * cannot leave the lockfile any other way. This interpreter covers exactly
 * the documented calc surface (no `new Function`, no eval, no dynamic code):
 *
 *   numbers (int/decimal/exponent), + - * / % ** ^, unary +/-, parentheses,
 *   min/max/floor/ceil/round/abs/sqrt/pow, constants PI and E.
 *
 * Precedence: additive < multiplicative < unary < power (< primary).
 * `**` and `^` are right-associative and bind tighter than unary minus
 * (`-2 ** 2 === -4`), matching the common math convention; the previous
 * implementation rejected `**` outright despite the tool advertising it.
 */

type BinaryOp = '+' | '-' | '*' | '/' | '%' | '**' | '^'
type Token =
  | { kind: 'number'; value: number }
  | { kind: 'ident'; value: string }
  | { kind: 'op'; value: BinaryOp | '(' | ')' | ',' }
  | { kind: 'eof' }

const FUNCTIONS: Record<string, { arity: number | 'variadic'; fn: (...args: number[]) => number }> =
  {
    min: { arity: 'variadic', fn: (...args) => Math.min(...args) },
    max: { arity: 'variadic', fn: (...args) => Math.max(...args) },
    pow: { arity: 2, fn: (x, y) => x ** y },
    floor: { arity: 1, fn: (x) => Math.floor(x) },
    ceil: { arity: 1, fn: (x) => Math.ceil(x) },
    round: { arity: 1, fn: (x) => Math.round(x) },
    abs: { arity: 1, fn: (x) => Math.abs(x) },
    sqrt: { arity: 1, fn: (x) => Math.sqrt(x) }
  }

const CONSTANTS: Record<string, number> = { PI: Math.PI, E: Math.E }

const OPERATORS: readonly BinaryOp[] = ['**', '+', '-', '*', '/', '%', '^']
const NUMBER_PATTERN = /^(?:\d+(?:\.\d+)?|\.\d+)(?:[eE][+-]?\d+)?/
const IDENT_PATTERN = /^[A-Za-z_][A-Za-z0-9_]*/

function describe(token: Token): string {
  if (token.kind === 'eof') return 'end of expression'
  if (token.kind === 'number') return String(token.value)
  if (token.kind === 'op') return `"${token.value}"`
  return `"${token.value}"`
}

class Tokenizer {
  private pos = 0

  constructor(private readonly src: string) {}

  private skipWhitespace(): void {
    while (this.pos < this.src.length && /\s/.test(this.src[this.pos])) this.pos += 1
  }

  next(): Token {
    this.skipWhitespace()
    if (this.pos >= this.src.length) return { kind: 'eof' }
    const rest = this.src.slice(this.pos)

    const numberMatch = NUMBER_PATTERN.exec(rest)
    if (numberMatch) {
      this.pos += numberMatch[0].length
      return { kind: 'number', value: Number(numberMatch[0]) }
    }

    const identMatch = IDENT_PATTERN.exec(rest)
    if (identMatch) {
      this.pos += identMatch[0].length
      return { kind: 'ident', value: identMatch[0] }
    }

    for (const op of OPERATORS) {
      if (rest.startsWith(op)) {
        this.pos += op.length
        return { kind: 'op', value: op }
      }
    }
    for (const bracket of ['(', ')', ','] as const) {
      if (rest.startsWith(bracket)) {
        this.pos += bracket.length
        return { kind: 'op', value: bracket }
      }
    }

    // Outside the calculator surface — report the exact offender and position.
    const offending = this.src[this.pos]
    this.pos += 1
    throw new Error(`Unexpected character "${offending}" at position ${this.pos - 1}`)
  }

  peek(): Token {
    const saved = this.pos
    const token = this.next()
    this.pos = saved
    return token
  }
}

function expectOp(token: Token, value: '(' | ')' | ',', context: string): void {
  if (!(token.kind === 'op' && token.value === value)) {
    throw new Error(`Expected "${value}" ${context} but found ${describe(token)}`)
  }
}

class Parser {
  constructor(private readonly tokenizer: Tokenizer) {}

  parse(): number {
    const result = this.parseAdditive()
    const trailing = this.tokenizer.next()
    if (trailing.kind !== 'eof') throw new Error(`Unexpected ${describe(trailing)}`)
    return result
  }

  private parseAdditive(): number {
    let left = this.parseMultiplicative()
    for (;;) {
      const token = this.tokenizer.peek()
      if (token.kind !== 'op' || (token.value !== '+' && token.value !== '-')) return left
      this.tokenizer.next()
      const right = this.parseMultiplicative()
      left = token.value === '+' ? left + right : left - right
    }
  }

  private parseMultiplicative(): number {
    let left = this.parseUnary()
    for (;;) {
      const token = this.tokenizer.peek()
      const isMultiply =
        token.kind === 'op' && (token.value === '*' || token.value === '/' || token.value === '%')
      if (!isMultiply) return left
      this.tokenizer.next()
      const right = this.parseUnary()
      if (token.value === '*') left = left * right
      else if (token.value === '/') left = left / right
      else left = left % right
    }
  }

  private parseUnary(): number {
    const token = this.tokenizer.peek()
    if (token.kind === 'op' && (token.value === '-' || token.value === '+')) {
      this.tokenizer.next()
      const value = this.parseUnary()
      return token.value === '-' ? -value : value
    }
    return this.parsePower()
  }

  /** Right-associative `**` / `^`, binding tighter than unary minus. */
  private parsePower(): number {
    const base = this.parsePrimary()
    const token = this.tokenizer.peek()
    if (token.kind === 'op' && (token.value === '**' || token.value === '^')) {
      this.tokenizer.next()
      return base ** this.parseUnary()
    }
    return base
  }

  private parsePrimary(): number {
    const token = this.tokenizer.next()
    if (token.kind === 'number') return token.value
    if (token.kind === 'op' && token.value === '(') {
      const value = this.parseAdditive()
      expectOp(this.tokenizer.next(), ')', 'after grouped expression')
      return value
    }
    if (token.kind === 'ident') return this.parseIdentifier(token.value)
    throw new Error(`Unexpected ${describe(token)}`)
  }

  private parseIdentifier(name: string): number {
    if (Object.hasOwn(CONSTANTS, name)) return CONSTANTS[name]
    if (!Object.hasOwn(FUNCTIONS, name)) throw new Error(`Unknown identifier "${name}"`)
    const fn = FUNCTIONS[name]
    expectOp(this.tokenizer.next(), '(', `after ${name}`)
    const args = this.parseArguments(name)
    if (fn.arity !== 'variadic' && args.length !== fn.arity) {
      throw new Error(
        `${name}() takes ${fn.arity} argument${fn.arity === 1 ? '' : 's'}, got ${args.length}`
      )
    }
    if (fn.arity === 'variadic' && args.length === 0) {
      throw new Error(`${name}() requires at least 1 argument`)
    }
    return fn.fn(...args)
  }

  private parseArguments(name: string): number[] {
    const args: number[] = []
    if (this.tokenizer.peek().kind === 'eof') {
      throw new Error(`Unterminated call to ${name}()`)
    }
    if (this.isCloseParen(this.tokenizer.peek())) {
      this.tokenizer.next()
      return args
    }
    args.push(this.parseAdditive())
    for (;;) {
      const token = this.tokenizer.next()
      if (token.kind === 'op' && token.value === ',') {
        args.push(this.parseAdditive())
        continue
      }
      expectOp(token, ')', `after ${name}() arguments`)
      return args
    }
  }

  private isCloseParen(token: Token): boolean {
    return token.kind === 'op' && token.value === ')'
  }
}

/** Evaluate one expression; throws `Error` with a user-readable message. */
export function evaluateExpression(src: string): number {
  const result = new Parser(new Tokenizer(src)).parse()
  if (!Number.isFinite(result)) {
    // Keep the tool's documented "Produced <value>" contract for 1/0 etc.
    throw new TypeError(`Produced ${String(result)}`)
  }
  return result
}
