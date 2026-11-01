export * from './lib'
export * from './cmd/core'
export * from './cmd/advanced'
export * from './mcp'
import { allCoreSpecs } from './cmd/core'
import { registerRegistry, registryReady } from './lib'

// Initialise the command registry on first import (mirrors FigCraft's OnceLock).
// `allCoreSpecs()` already ends with the advanced specs, so they are not added twice.
if (!registryReady()) registerRegistry(allCoreSpecs())
