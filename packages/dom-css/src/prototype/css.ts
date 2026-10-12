import type { PrototypeStateVisual, SceneNode } from '@open-pencil/scene-graph'

import { fillToCSS } from '../css-values'

/**
 * Pure CSS text builders for prototype export. Every template here mirrors a
 * preview-renderer behavior (see `packages/core/src/canvas/scene.ts` state
 * visuals and `packages/core/src/prototype/keyframes.ts` timing), so the
 * emitted declarations stay semantically equivalent to what preview draws.
 */

export type PrototypeCSSProperty =
  | 'opacity'
  | 'transform'
  | 'background-color'
  | 'border-radius'
  | 'filter'

/** Ready-to-join `property: value` declaration string for one visual. */
export function joinDeclarations(vcss: VisualCSS): string {
  return vcss.declarations.join(';')
}

export function formatNumber(value: number): string {
  if (!Number.isFinite(value)) return '0'
  return String(Math.round(value * 1e4) / 1e4)
}

/** Escape a value for use inside a double-quoted CSS string literal. */
export function cssString(value: string): string {
  return value.replace(/\\/g, '\\\\').replace(/"/g, '\\"').replace(/\n/g, '\\a ')
}

export function nodeSelector(nodeId: string): string {
  return `[data-open-pencil-node-id="${cssString(nodeId)}"]`
}

export function stateSelector(nodeId: string, state: string): string {
  return `${nodeSelector(nodeId)}[data-op-state="${cssString(state)}"]`
}

export function screenSelector(screenId: string): string {
  return `[data-op-screen="${cssString(screenId)}"]`
}

const HEX_COLOR = /^#([0-9a-fA-F]{3}|[0-9a-fA-F]{4}|[0-9a-fA-F]{6}|[0-9a-fA-F]{8})$/
const NAMED_COLOR = /^[a-zA-Z]+$/
const COLOR_FUNCTION =
  /^(rgb|rgba|hsl|hsla|hwb|lab|lch|oklab|oklch|color|color-mix|currentcolor)\(.*\)$/

/**
 * Whether a fill string can be emitted as `background-color`. Gradients,
 * images, and other non-color targets are reported instead (preview's
 * `lerpFill` also refuses them).
 */
export function expressibleColor(value: string): boolean {
  const trimmed = value.trim()
  return HEX_COLOR.test(trimmed) || NAMED_COLOR.test(trimmed) || COLOR_FUNCTION.test(trimmed)
}

/** First visible solid authored fill as a CSS color, mirroring preview's base. */
function authoredFill(node: SceneNode): string | undefined {
  const fill = node.fills.find((entry) => entry.visible && entry.type === 'SOLID')
  return fill ? (fillToCSS(fill) ?? undefined) : undefined
}

/**
 * Visual with delta fields defaulted and absolute fields anchored to the
 * authored node — the value both CSS emission and revert comparisons see.
 */
export function resolvedVisual(
  node: SceneNode,
  visual: PrototypeStateVisual
): PrototypeStateVisual {
  return {
    scale: visual.scale ?? 1,
    opacity: visual.opacity ?? 1,
    translateX: visual.translateX ?? 0,
    translateY: visual.translateY ?? 0,
    rotation: visual.rotation ?? 0,
    blur: visual.blur ?? 0,
    width: visual.width ?? node.width,
    height: visual.height ?? node.height,
    cornerRadius: visual.cornerRadius ?? node.cornerRadius,
    fill: visual.fill ?? authoredFill(node)
  }
}

function hasTransformPart(node: SceneNode, visual: PrototypeStateVisual): boolean {
  return (
    (visual.translateX ?? 0) !== 0 ||
    (visual.translateY ?? 0) !== 0 ||
    (visual.scale ?? 1) !== 1 ||
    (visual.rotation ?? 0) !== 0 ||
    visual.width !== undefined ||
    visual.height !== undefined
  )
}

/**
 * Transform template in preview's draw order: translate first (screen/state
 * offset), then top-left-anchored proportional size scale (children scale
 * with the node — a CSS width/height change would reflow and diverge), then
 * center-anchored uniform scale, then center-anchored rotation. Every slot is
 * always emitted so interpolating between two state rules keeps one fixed
 * structure (clean component-wise lerp, like `lerpVisual`).
 *
 * `transform-origin: 0 0` (emitted with the template) makes the leading
 * size scale top-left anchored; center anchoring is explicit via the
 * translate(50%,50%) pairs.
 */
export function transformTemplate(node: SceneNode, visual: PrototypeStateVisual): string {
  const translateX = formatNumber(visual.translateX ?? 0)
  const translateY = formatNumber(visual.translateY ?? 0)
  const scaleX = visual.width !== undefined && node.width > 0 ? visual.width / node.width : 1
  const scaleY = visual.height !== undefined && node.height > 0 ? visual.height / node.height : 1
  const scale = formatNumber(visual.scale ?? 1)
  const rotation = formatNumber(visual.rotation ?? 0)
  return [
    `translate(${translateX}px, ${translateY}px)`,
    `scale(${formatNumber(scaleX)}, ${formatNumber(scaleY)})`,
    `translate(50%, 50%) scale(${scale}) translate(-50%, -50%)`,
    `translate(50%, 50%) rotate(${rotation}deg) translate(-50%, -50%)`
  ].join(' ')
}

export interface VisualCSS {
  /** Ready-to-join `property: value` declarations. */
  declarations: string[]
  /** CSS properties this visual animates (transition claim candidates). */
  properties: PrototypeCSSProperty[]
  /** True when a piece (fill) could not be expressed and was withheld. */
  unsupported: boolean
}

/**
 * Declarations reproducing preview's state visual for one node:
 * opacity product, transform template, absolute corner radius, absolute
 * solid fill, and blur where sigma = radius / 2 (preview passes radius/2 to
 * Skia's blur). `only` restricts emission to a property union (keyframes use
 * it so every anchor frame declares the same channel).
 */
export function visualCSS(
  node: SceneNode,
  visual: PrototypeStateVisual,
  only?: ReadonlySet<PrototypeCSSProperty>
): VisualCSS {
  const declarations: string[] = []
  const properties: PrototypeCSSProperty[] = []
  let unsupported = false
  const wanted = (property: PrototypeCSSProperty): boolean => !only || only.has(property)

  if (visual.opacity !== undefined && wanted('opacity')) {
    declarations.push(`opacity: ${formatNumber(node.opacity * visual.opacity)}`)
    properties.push('opacity')
  }
  if (hasTransformPart(node, visual) && wanted('transform')) {
    declarations.push(`transform: ${transformTemplate(node, visual)}`)
    declarations.push('transform-origin: 0 0')
    properties.push('transform')
  }
  if (visual.cornerRadius !== undefined && wanted('border-radius')) {
    declarations.push(`border-radius: ${formatNumber(visual.cornerRadius)}px`)
    properties.push('border-radius')
  }
  if (visual.fill !== undefined && wanted('background-color')) {
    if (expressibleColor(visual.fill)) {
      declarations.push(`background-color: ${visual.fill}`)
      properties.push('background-color')
    } else {
      unsupported = true
    }
  }
  if (visual.blur !== undefined && wanted('filter')) {
    declarations.push(`filter: blur(${formatNumber(visual.blur / 2)}px)`)
    properties.push('filter')
  }
  return { declarations, properties, unsupported }
}

/** `transition: <property> <timing>, …`; empty when no motion is claimed. */
export function transitionDeclaration(
  claims: readonly { property: PrototypeCSSProperty; timing: string }[]
): string {
  const seen = new Set<PrototypeCSSProperty>()
  const parts: string[] = []
  for (const claim of claims) {
    if (seen.has(claim.property)) continue
    seen.add(claim.property)
    parts.push(`${claim.property} ${claim.timing}`)
  }
  return parts.length > 0 ? `transition: ${parts.join(', ')}` : ''
}

/**
 * One `@keyframes` block. `timingFunction` on a frame governs the interval
 * starting at that frame — the same semantics as `keyframeVisual` picking
 * `frame.easing ?? animation.easing ?? 'linear'`.
 */
export function keyframeBlock(
  percent: number,
  declarations: readonly string[],
  timingFunction?: string
): string {
  const body = [...declarations]
  if (timingFunction) body.push(`animation-timing-function: ${timingFunction}`)
  return `${formatNumber(percent)}% { ${body.join('; ')} }`
}

export function keyframesRule(name: string, blocks: readonly string[]): string {
  return `@keyframes ${name} { ${blocks.filter((block) => block.length > 0).join(' ')} }`
}

export interface AnimationTiming {
  name: string
  durationMs: number
  timing: string
  delayMs: number
  loop: boolean
}

/** `animation:` shorthand; two time values read as duration then delay. */
export function animationShorthand(entries: readonly AnimationTiming[]): string {
  const parts = entries.map(
    (entry) =>
      `${entry.name} ${formatNumber(entry.durationMs)}ms ${entry.timing} ${formatNumber(entry.delayMs)}ms ${entry.loop ? 'infinite' : '1'} forwards`
  )
  return `animation: ${parts.join(', ')}`
}

/** Screen section state: stacked at the stage origin, one active at a time. */
export function prototypeScreenCSS(): string {
  return [
    '.op-screen{position:absolute;left:0;top:0;visibility:hidden;z-index:0}',
    '.op-screen.is-active{visibility:visible;z-index:2}',
    '.op-screen.is-leaving{visibility:visible;z-index:1}'
  ].join('')
}
