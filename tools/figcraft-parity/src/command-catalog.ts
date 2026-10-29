import { access, readFile } from 'node:fs/promises'
import { basename, dirname, join, relative, resolve, sep } from 'node:path'

import { Session } from '@zenuxs/engine'

export type FigCraftCommand = {
  id: string
  source: string
  collaboration: boolean
}

export type ZenuxsCommand = {
  id: string
}

const collaborationPrefixes = ['collab.']
const engineSourcePath = join('crates', 'engine', 'src')

function blank(source: string, start: number, end: number) {
  return source.slice(start, end).replace(/[^\n]/g, ' ')
}

function skipQuotedLiteral(source: string, start: number): number | undefined {
  let quote = start
  let raw = false
  let rawHashes = 0

  if (source.startsWith('br', start) || source.startsWith('r', start)) {
    quote = source.startsWith('br', start) ? start + 2 : start + 1
    while (source[quote] === '#') {
      rawHashes += 1
      quote += 1
    }
    if (source[quote] === '"') raw = true
    else return undefined
  } else if (source.startsWith('b"', start)) {
    quote = start + 1
  } else if (source[start] !== '"' && source[start] !== "'") {
    return undefined
  }

  const delimiter = source[quote]
  if (raw) {
    const closing = `"${'#'.repeat(rawHashes)}`
    const end = source.indexOf(closing, quote + 1)
    return end < 0 ? source.length : end + closing.length
  }

  if (delimiter === "'") {
    let closing = quote + 2
    if (source[quote + 1] === '\\') {
      if (source[quote + 2] === 'u' && source[quote + 3] === '{') {
        const brace = source.indexOf('}', quote + 4)
        if (brace < 0) return undefined
        closing = brace + 1
      } else {
        closing = quote + 3
      }
    } else {
      const codePoint = source.codePointAt(quote + 1)
      if (codePoint !== undefined && codePoint > 0xffff) closing += 1
    }
    return source[closing] === "'" ? closing + 1 : undefined
  }

  for (let index = quote + 1; index < source.length; index += 1) {
    if (source[index] === '\\') {
      index += 1
      continue
    }
    if (source[index] === delimiter) return index + 1
  }
  return source.length
}

function skipComment(source: string, start: number): number | undefined {
  if (source.startsWith('//', start)) {
    const newline = source.indexOf('\n', start + 2)
    return newline < 0 ? source.length : newline
  }
  if (!source.startsWith('/*', start)) return undefined

  let depth = 1
  let index = start + 2
  while (index < source.length && depth > 0) {
    if (source.startsWith('/*', index)) {
      depth += 1
      index += 2
    } else if (source.startsWith('*/', index)) {
      depth -= 1
      index += 2
    } else {
      index += 1
    }
  }
  return index
}

function skipRustLexeme(source: string, index: number): number | undefined {
  return skipComment(source, index) ?? skipQuotedLiteral(source, index)
}

function maskRust(source: string) {
  let result = ''
  let index = 0
  while (index < source.length) {
    const end = skipRustLexeme(source, index)
    if (end !== undefined) {
      result += blank(source, index, end)
      index = end
    } else {
      result += source[index]
      index += 1
    }
  }
  return result
}

function balancedBlockEnd(masked: string, openIndex: number) {
  let depth = 0
  for (let index = openIndex; index < masked.length; index += 1) {
    if (masked[index] === '{') depth += 1
    if (masked[index] === '}') {
      depth -= 1
      if (depth === 0) return index + 1
    }
  }
  return undefined
}

function registryBody(source: string, path: string) {
  const masked = maskRust(source)
  const declaration = /\bfn\s+registry\s*\([^)]*\)[^{]*\{/g.exec(masked)
  if (!declaration) {
    throw new Error(`${path}: unable to find registry() body`)
  }
  const openIndex = declaration.index + declaration[0].lastIndexOf('{')
  const end = balancedBlockEnd(masked, openIndex)
  if (end === undefined) {
    throw new Error(`${path}:${openIndex}: unclosed registry() body`)
  }
  return masked.slice(openIndex + 1, end - 1)
}

function registeredModulePaths(source: string, path: string) {
  const body = registryBody(source, path)
  const calls = body.matchAll(
    /\.extend\s*\(\s*((?:crate::)?[A-Za-z_]\w*(?:::[A-Za-z_]\w*)*)\s*::\s*specs\s*\(\s*\)/g
  )
  return [...new Set([...calls].map((match) => match[1]))]
}

function declaredModules(source: string) {
  const masked = maskRust(source)
  const modules = new Map<string, string>()
  const declaration = /(?:^|[;{}]\s*)(?:pub(?:\([^)]*\))?\s+)?mod\s+([A-Za-z_]\w*)\s*;/gm
  for (const match of masked.matchAll(declaration)) {
    modules.set(match[1], '')
  }
  return modules
}

async function findModuleFile(basePath: string) {
  for (const candidate of [`${basePath}.rs`, join(basePath, 'mod.rs')]) {
    try {
      await access(candidate)
      return candidate
    } catch {
      // Try the directory-module form before reporting a missing module.
    }
  }
  return undefined
}

async function sourceForRegisteredModule(
  root: string,
  modulePath: string,
  commandModules: Map<string, string>,
  rootModules: Map<string, string>
) {
  const isRootModule = modulePath.startsWith('crate::')
  const names = modulePath.replace(/^crate::/, '').split('::')
  let base = join(root, engineSourcePath, ...(isRootModule ? [] : ['cmd']))
  let modules = isRootModule ? rootModules : commandModules
  let moduleFile = ''

  for (const name of names) {
    if (!modules.has(name)) {
      throw new Error(`Unknown registered FigCraft module: ${modulePath}`)
    }
    const resolvedFile = await findModuleFile(join(base, name))
    if (!resolvedFile) {
      throw new Error(`Missing source for registered FigCraft module: ${modulePath}`)
    }
    moduleFile = resolvedFile
    base = moduleDirectory(moduleFile)
    modules = declaredModules(await readFile(moduleFile, 'utf8'))
  }
  return moduleFile
}

function specsBody(source: string) {
  const masked = maskRust(source)
  const declaration = /\bfn\s+specs\s*\([^)]*\)[^{]*\{/g.exec(masked)
  if (!declaration) return ''
  const openIndex = declaration.index + declaration[0].lastIndexOf('{')
  const end = balancedBlockEnd(masked, openIndex)
  return end === undefined ? '' : masked.slice(openIndex + 1, end - 1)
}

function nestedSpecModules(source: string) {
  const body = specsBody(source)
  const calls = body.matchAll(
    /((?:crate::)?[A-Za-z_]\w*(?:::[A-Za-z_]\w*)*)\s*::\s*specs\s*\(\s*\)/g
  )
  return [...new Set([...calls].map((match) => match[1]))]
}

function moduleDirectory(moduleFile: string) {
  if (basename(moduleFile) === 'mod.rs') return dirname(moduleFile)
  return join(dirname(moduleFile), basename(moduleFile, '.rs'))
}

async function sourceForNestedModule(parentFile: string, modulePath: string) {
  const names = modulePath.split('::')
  let base = moduleDirectory(parentFile)
  let source = await readFile(parentFile, 'utf8')
  let modules = declaredModules(source)
  let moduleFile = ''

  for (const name of names) {
    if (!modules.has(name)) {
      throw new Error(`Unknown registered nested FigCraft module: ${modulePath}`)
    }
    const resolvedFile = await findModuleFile(join(base, name))
    if (!resolvedFile) {
      throw new Error(`Missing source for registered nested FigCraft module: ${modulePath}`)
    }
    moduleFile = resolvedFile
    source = await readFile(moduleFile, 'utf8')
    modules = declaredModules(source)
    base = moduleDirectory(moduleFile)
  }
  return moduleFile
}

async function registeredSourceFiles(
  root: string,
  modulePath: string,
  commandModules: Map<string, string>,
  rootModules: Map<string, string>
) {
  const files: string[] = []
  const visited = new Set<string>()
  const visit = async (file: string): Promise<void> => {
    if (visited.has(file)) return
    visited.add(file)
    files.push(file)
    const source = await readFile(file, 'utf8')
    for (const nestedPath of nestedSpecModules(source)) {
      const nestedFile = nestedPath.startsWith('crate::')
        ? await sourceForRegisteredModule(root, nestedPath, commandModules, rootModules)
        : await sourceForNestedModule(file, nestedPath)
      await visit(nestedFile)
    }
  }

  await visit(await sourceForRegisteredModule(root, modulePath, commandModules, rootModules))
  return files
}

function testOnlyRanges(source: string, masked: string) {
  const ranges: Array<[number, number]> = []
  const attribute =
    /#\s*\[\s*cfg\s*\(\s*test\s*\)\s*\]\s*(?:pub(?:\([^)]*\))?\s+)?mod\s+[A-Za-z_]\w*\s*\{/g
  for (const match of masked.matchAll(attribute)) {
    const openIndex = match.index + match[0].lastIndexOf('{')
    const end = balancedBlockEnd(masked, openIndex)
    if (end === undefined) {
      ranges.push([match.index, source.length])
    } else {
      ranges.push([match.index, end])
    }
  }
  return ranges
}

function maskTestOnlyModules(source: string) {
  const masked = maskRust(source)
  const ranges = testOnlyRanges(source, masked)
  let result = ''
  let index = 0
  for (const [start, end] of ranges) {
    result += masked.slice(index, start)
    result += blank(masked, start, end)
    index = end
  }
  return result + masked.slice(index)
}

function decodeRustString(literal: string) {
  const rawStart = literal.match(/^r(#+)?"/)
  if (rawStart) {
    const hashes = rawStart[1] ?? ''
    const prefixLength = rawStart[0].length
    return literal.slice(prefixLength, -(hashes.length + 1))
  }
  if (!literal.startsWith('"') || !literal.endsWith('"')) return undefined

  const body = literal.slice(1, -1)
  let value = ''
  for (let index = 0; index < body.length; index += 1) {
    const char = body[index]
    if (char !== '\\') {
      value += char
      continue
    }
    index += 1
    const escaped = body[index]
    if (escaped === undefined) return undefined
    const simpleEscapes: Record<string, string> = {
      '0': '\0',
      '"': '"',
      '\\': '\\',
      n: '\n',
      r: '\r',
      t: '\t'
    }
    if (Object.hasOwn(simpleEscapes, escaped)) {
      value += simpleEscapes[escaped]
    } else if (escaped === 'x') {
      const hex = body.slice(index + 1, index + 3)
      if (!/^[\da-fA-F]{2}$/.test(hex)) return undefined
      value += String.fromCodePoint(Number.parseInt(hex, 16))
      index += 2
    } else if (escaped === 'u' && body[index + 1] === '{') {
      const close = body.indexOf('}', index + 2)
      const hex = close < 0 ? '' : body.slice(index + 2, close).replaceAll('_', '')
      if (!/^[\da-fA-F]{1,6}$/.test(hex)) return undefined
      const codePoint = Number.parseInt(hex, 16)
      if (codePoint > 0x10ffff || (codePoint >= 0xd800 && codePoint <= 0xdfff)) return undefined
      value += String.fromCodePoint(codePoint)
      index = close
    } else if (escaped === '\n') {
      while (/\s/.test(body[index + 1] ?? '')) index += 1
    } else {
      return undefined
    }
  }
  return value
}

function firstStringArgument(source: string, openIndex: number, path: string, offset: number) {
  const stack = [')']
  let argumentEnd = -1
  let index = openIndex + 1

  for (; index < source.length; index += 1) {
    const lexemeEnd = skipRustLexeme(source, index)
    if (lexemeEnd !== undefined) {
      index = lexemeEnd - 1
      continue
    }
    const char = source[index]
    if (char === '(') stack.push(')')
    else if (char === '[') stack.push(']')
    else if (char === '{') stack.push('}')
    else if (char === stack.at(-1)) {
      stack.pop()
      if (stack.length === 0) {
        if (argumentEnd === -1) argumentEnd = index
        break
      }
    } else if (char === ',' && stack.length === 1 && argumentEnd === -1) {
      argumentEnd = index
    }
  }

  if (stack.length > 0) {
    throw new Error(`${path}:${offset}: malformed spec! declaration (unclosed macro invocation)`)
  }
  const literal = source.slice(openIndex + 1, argumentEnd < 0 ? index : argumentEnd).trim()
  const id = decodeRustString(literal)
  if (!id) {
    throw new Error(
      `${path}:${offset}: malformed spec! declaration (expected a non-empty string ID)`
    )
  }
  return id
}

function extractSpecs(source: string, sourcePath: string): string[] {
  const masked = maskTestOnlyModules(source)
  const ids: string[] = []
  const macro = /\bspec\s*!\s*\(/g
  for (const match of masked.matchAll(macro)) {
    const openIndex = match.index + match[0].lastIndexOf('(')
    ids.push(firstStringArgument(source, openIndex, sourcePath, match.index))
  }
  return ids
}

export async function extractFigCraftCommands(root: string): Promise<FigCraftCommand[]> {
  const absoluteRoot = resolve(root)
  const commandAggregator = join(absoluteRoot, engineSourcePath, 'cmd', 'mod.rs')
  const rootAggregator = join(absoluteRoot, engineSourcePath, 'lib.rs')
  const [commandSource, rootSource] = await Promise.all([
    readFile(commandAggregator, 'utf8'),
    readFile(rootAggregator, 'utf8')
  ])
  const modules = registeredModulePaths(commandSource, 'crates/engine/src/cmd/mod.rs')
  const commandModules = declaredModules(commandSource)
  const rootModules = declaredModules(rootSource)
  const commands: FigCraftCommand[] = []

  for (const module of modules) {
    const files = await registeredSourceFiles(absoluteRoot, module, commandModules, rootModules)
    for (const file of files) {
      const sourcePath = relative(absoluteRoot, file).split(sep).join('/')
      const source = await readFile(file, 'utf8')
      for (const id of extractSpecs(source, sourcePath)) {
        commands.push({
          id,
          source: sourcePath,
          collaboration: collaborationPrefixes.some((prefix) => id.startsWith(prefix))
        })
      }
    }
  }
  return commands
}

export function extractZenuxsCommands(): ZenuxsCommand[] {
  return new Session().all_commands().map(({ id }) => ({ id }))
}
