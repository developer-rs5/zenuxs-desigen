import { execFile as execFileCallback } from 'node:child_process'
import { access, readFile, writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { promisify } from 'node:util'

import { extractFigCraftCommands, extractZenuxsCommands } from './command-catalog'
import { buildInventory, figCraftRevision } from './inventory'
import { parseCapabilityEvidence } from './manifest'

const execFile = promisify(execFileCallback)
const defaultFigCraftRoot = '/home/azaz/reference-outside-workspace/figcraft'
const repoRoot = resolve(fileURLToPath(new URL('../../../', import.meta.url)))
const evidencePath = resolve(repoRoot, 'docs/figcraft-parity/capability-evidence.json')
const inventoryPath = resolve(repoRoot, 'docs/figcraft-parity/command-inventory.json')

type InventoryOptions = {
  figcraftRoot: string
  check: boolean
}

function parseArguments(args: string[]): InventoryOptions {
  if (args.shift() !== 'inventory') {
    throw new Error(
      'Usage: bun tools/figcraft-parity/src/cli.ts inventory [--figcraft-root <path>] [--check]'
    )
  }
  let figcraftRoot = defaultFigCraftRoot
  let check = false
  while (args.length > 0) {
    const arg = args.shift()
    if (arg === '--check') {
      check = true
    } else if (arg === '--figcraft-root') {
      const path = args.shift()
      if (!path) throw new Error('--figcraft-root requires a path')
      figcraftRoot = resolve(path)
    } else {
      throw new Error(`Unknown inventory option: ${arg}`)
    }
  }
  return { figcraftRoot: resolve(figcraftRoot), check }
}

async function referenceRevision(root: string) {
  try {
    await access(root)
  } catch {
    throw new Error(`FigCraft reference checkout not found at ${root}`)
  }
  try {
    const { stdout } = await execFile('git', ['-C', root, 'rev-parse', 'HEAD'])
    return stdout.trim()
  } catch {
    throw new Error(
      `FigCraft reference at ${root} is not a Git checkout; expected ${figCraftRevision}`
    )
  }
}

function serialize(value: unknown) {
  return `${JSON.stringify(value, null, 2)}\n`
}

async function generate(root: string) {
  const revision = await referenceRevision(root)
  if (revision !== figCraftRevision) {
    throw new Error(
      `FigCraft reference at ${root} is at ${revision}; expected pinned revision ${figCraftRevision}`
    )
  }

  const rawEvidence = await readFile(evidencePath, 'utf8')
  let manifest: unknown
  try {
    manifest = JSON.parse(rawEvidence)
  } catch {
    throw new Error(`Invalid JSON in capability evidence manifest: ${evidencePath}`)
  }
  const evidence = parseCapabilityEvidence(manifest)
  const reference = await extractFigCraftCommands(root)
  const zenuxs = extractZenuxsCommands()
  return serialize(buildInventory(reference, zenuxs, evidence))
}

export async function runInventory(args: string[]) {
  const options = parseArguments(args)
  const generated = await generate(options.figcraftRoot)
  if (options.check) {
    let existing: string
    try {
      existing = await readFile(inventoryPath, 'utf8')
    } catch {
      throw new Error(
        `Generated inventory is missing: ${inventoryPath}; run the inventory command to create it`
      )
    }
    if (existing !== generated) {
      throw new Error(
        `Generated inventory is out of date: ${inventoryPath}; run the inventory command to update it`
      )
    }
    console.log(`FigCraft parity inventory is current (${inventoryPath})`)
    return
  }
  await writeFile(inventoryPath, generated, 'utf8')
  console.log(`Wrote FigCraft parity inventory to ${inventoryPath}`)
}

if (import.meta.main) {
  try {
    await runInventory(process.argv.slice(2))
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error))
    process.exitCode = 1
  }
}
