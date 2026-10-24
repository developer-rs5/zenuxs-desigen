export * from './lib'
export * from './cmd/core'
import { registerRegistry, allCoreSpecs, registryReady } from './lib'

// Initialise the command registry on first import (mirrors FigCraft's OnceLock).
if (!registryReady()) {
  registerRegistry(allCoreSpecs())
}
