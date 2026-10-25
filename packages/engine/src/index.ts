export * from './lib'
export * from './cmd/core'
export * from './cmd/advanced'
export * from './mcp'
import { registerRegistry, registryReady } from './lib'
import { allCoreSpecs } from './cmd/core'
import { allAdvancedSpecs } from './cmd/advanced'

// Initialise the command registry on first import (mirrors FigCraft's OnceLock).
if (!registryReady()) {
  registerRegistry([...allCoreSpecs(), ...allAdvancedSpecs()])
}
