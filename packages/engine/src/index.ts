export * from './lib'
export * from './cmd/core'
import { registerRegistry, registryReady } from './lib'
import { allCoreSpecs } from './cmd/core'

// Initialise the command registry on first import (mirrors FigCraft's OnceLock).
if (!registryReady()) {
  registerRegistry(allCoreSpecs())
}
