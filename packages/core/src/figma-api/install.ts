import type { NodeProxyInternals } from './accessor-utils'
import { installBasicNodeProxyAccessors } from './accessors/basic'
import { installLayoutNodeProxyAccessors } from './accessors/layout'
import { installVariableModeNodeProxyAccessors } from './accessors/variables'
import { installVisualNodeProxyAccessors } from './accessors/visual'
import { installComponentPropertyAccessors } from './components'

/**
 * Wire every generated accessor family onto `FigmaNodeProxy.prototype`.
 * Kept beside the accessor implementations (not inside `proxy.ts`) so the
 * class file stays focused on its methods and their imports.
 */
export function installProxyAccessors(
  prototype: object,
  internals: NodeProxyInternals,
  mixed: symbol
): void {
  installBasicNodeProxyAccessors(prototype, internals)
  installVisualNodeProxyAccessors(prototype, internals, mixed)
  installLayoutNodeProxyAccessors(prototype, internals)
  installVariableModeNodeProxyAccessors(prototype, internals)
  installComponentPropertyAccessors(prototype, internals)
}
