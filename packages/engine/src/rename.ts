/**
 * Renaming several layers at once (`object.batchRename`, the Rename layers
 * dialog): a match (plain text, or a regular expression) whose occurrences are
 * replaced, and/or a pattern for the whole name. Both understand the codes:
 * `$&` the current name (the matched text when matching), `` $` `` / `$'` the
 * text before / after the match, `$1`…`$9` a regular expression's groups,
 * `$n` a number counting up and `$N` one counting down (`$nnn` pads it to
 * three digits), `$$` a dollar sign. (Converted 1:1 from FigCraft
 * `crates/engine/src/rename.rs`.)
 */

import type { Document, NodeId } from '@zenuxs/doc'

/** Longest match pattern accepted (characters). */
const MAX_FIND = 1000
/** Longest name a rename produces (characters). */
const MAX_NAME = 10_000
/** Widest zero padding of a number code. */
const MAX_PAD = 12

type Find = { kind: 'text'; text: string } | { kind: 'regex'; re: RegExp }

/** What the codes of one replacement stand for. */
interface Ctx {
  matched: string
  before: string
  after: string
  groups: string[] | null
  up: number
  down: number
}

/** One batch rename's settings. */
export class BatchRename {
  private find: Find | null
  private replace: string
  private pattern: string | null
  /** Where `$n` starts and `$N` stops. */
  private start: number

  private constructor(find: Find | null, replace: string, pattern: string | null, start: number) {
    this.find = find
    this.replace = replace
    this.pattern = pattern
    this.start = start
  }

  /**
   * `find` (empty: none) as text or, with `regex`, a regular expression,
   * replaced by `replace`; then `pattern` for the whole name; numbers from
   * `start` (default 1).
   */
  static create(
    find: string | null,
    regex: boolean,
    replace: string,
    pattern: string | null,
    start: number | null
  ): BatchRename {
    let parsed: Find | null = null
    if (find !== null && find.length > 0) {
      if ([...find].length > MAX_FIND)
        throw new Error(`the match is longer than ${MAX_FIND} characters`)
      if (regex) {
        try {
          parsed = { kind: 'regex', re: new RegExp(find, 'gu') }
        } catch (e) {
          throw new Error(
            `invalid regular expression: ${e instanceof Error ? e.message : String(e)}`
          )
        }
      } else {
        parsed = { kind: 'text', text: find }
      }
    }
    const s =
      start === null || !Number.isFinite(start) ? 1 : Math.round(Math.min(1e12, Math.max(0, start)))
    return new BatchRename(parsed, replace, pattern, s)
  }

  /** The new name of layer `k` of `n` (stacking order, bottom first), now `name`. */
  apply(name: string, k: number, n: number): string {
    const up = this.start + k
    const down = this.start + Math.max(0, n - (k + 1))
    let out = name
    const f = this.find
    if (f !== null && f.kind === 'text') {
      const parts: string[] = []
      let last = 0
      const hay = name
      let at = hay.indexOf(f.text)
      while (at >= 0) {
        const end = at + f.text.length
        parts.push(hay.slice(last, at))
        parts.push(
          expand(this.replace, {
            matched: f.text,
            before: hay.slice(0, at),
            after: hay.slice(end),
            groups: null,
            up,
            down
          })
        )
        last = end
        at = hay.indexOf(f.text, end)
      }
      parts.push(hay.slice(last))
      out = parts.join('')
    } else if (f !== null) {
      const parts: string[] = []
      let last = 0
      f.re.lastIndex = 0
      for (const m of name.matchAll(f.re)) {
        const at = m.index ?? 0
        const whole = m[0]
        const end = at + whole.length
        parts.push(name.slice(last, at))
        parts.push(
          expand(this.replace, {
            matched: whole,
            before: name.slice(0, at),
            after: name.slice(end),
            groups: m.slice(1).map((g) => g ?? ''),
            up,
            down
          })
        )
        last = end
      }
      parts.push(name.slice(last))
      out = parts.join('')
    }
    if (this.pattern !== null) {
      out = expand(this.pattern, { matched: out, before: '', after: '', groups: null, up, down })
    }
    const chars = [...out]
    return chars.length > MAX_NAME ? chars.slice(0, MAX_NAME).join('') : out
  }

  /** The new names of `ids` (taken in stacking order, bottom first). */
  plan(
    doc: Document,
    ids: NodeId[],
    zSorted: (d: Document, ids: NodeId[]) => NodeId[]
  ): Array<[NodeId, string]> {
    const sorted = zSorted(doc, ids)
    const n = sorted.length
    const out: Array<[NodeId, string]> = []
    sorted.forEach((i, k) => {
      const node = doc.node(i)
      if (node) out.push([i, this.apply(node.name, k, n)])
    })
    return out
  }
}

/** Append `template` with its codes filled in from `c`. */
function expand(template: string, c: Ctx): string {
  let out = ''
  const chars = [...template]
  let i = 0
  while (i < chars.length) {
    const ch = chars[i] as string
    i += 1
    if (ch !== '$') {
      out += ch
      continue
    }
    const next = chars[i]
    if (next === '&') {
      out += c.matched
    } else if (next === '`') {
      out += c.before
    } else if (next === "'") {
      out += c.after
    } else if (next === '$') {
      out += '$'
    } else if (next === 'n' || next === 'N') {
      let width = 0
      while (chars[i] === next) {
        i += 1
        width += 1
      }
      const v = next === 'n' ? c.up : c.down
      out += String(v).padStart(Math.min(width, MAX_PAD), '0')
      continue
    } else if (next !== undefined && next >= '1' && next <= '9') {
      const k = Number(next)
      const g = c.groups
      if (g !== null && k < g.length + 1) out += g[k - 1] ?? ''
      // Not a group of this match: the code stays as typed.
      else out += `$${next}`
    } else {
      out += '$'
      continue
    }
    i += 1
  }
  return out
}
