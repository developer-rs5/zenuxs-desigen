import { parse } from 'culori'

import type { SceneGraph, SceneNode, PrototypeStateVisual } from '@open-pencil/scene-graph'

import { colorToHex, colorToHex8, parseColor } from '#core/color'

import { lerpNumber } from './motion'

/**
 * Render-time visual math for the prototype runtime: delta interpolation,
 * identity/merge rules, and color mixing. Pure functions — no graph mutation,
 * no timers — so every evaluation is deterministic and unit-testable.
 *
 * Delta fields (scale/opacity/translate/rotation/blur) default to identity.
 * Absolute fields (width/height/cornerRadius/fill) fall back to the authored
 * node through an explicit `base`, supplied by the runtime.
 */

/** Render-time visual for one node (screen, overlay, or state animation). */
export interface PrototypeNodeVisual {
  opacity?: number
  translateX?: number
  translateY?: number
  scale?: number
  rotation?: number
  width?: number
  height?: number
  cornerRadius?: number
  fill?: string
  blur?: number
}

export function mergeVisual(
  base: PrototypeNodeVisual,
  add: PrototypeNodeVisual
): PrototypeNodeVisual {
  return {
    opacity: (base.opacity ?? 1) * (add.opacity ?? 1),
    translateX: (base.translateX ?? 0) + (add.translateX ?? 0),
    translateY: (base.translateY ?? 0) + (add.translateY ?? 0),
    scale: add.scale ?? base.scale,
    rotation: (base.rotation ?? 0) + (add.rotation ?? 0),
    blur: (base.blur ?? 0) + (add.blur ?? 0),
    width: add.width ?? base.width,
    height: add.height ?? base.height,
    cornerRadius: add.cornerRadius ?? base.cornerRadius,
    fill: add.fill ?? base.fill
  }
}

export function isIdentityVisual(visual: PrototypeNodeVisual): boolean {
  return (
    (visual.opacity ?? 1) === 1 &&
    (visual.translateX ?? 0) === 0 &&
    (visual.translateY ?? 0) === 0 &&
    (visual.scale ?? 1) === 1 &&
    (visual.rotation ?? 0) === 0 &&
    (visual.blur ?? 0) === 0 &&
    visual.width === undefined &&
    visual.height === undefined &&
    visual.cornerRadius === undefined &&
    visual.fill === undefined
  )
}

/** Node's authored values that absolute visual targets interpolate against. */
export function visualBase(graph: SceneGraph, nodeId: string): PrototypeStateVisual {
  const node = graph.getNode(nodeId)
  if (!node) return {}
  const base: PrototypeStateVisual = {
    width: node.width,
    height: node.height,
    cornerRadius: node.cornerRadius
  }
  const fill = nodeFillColor(node)
  if (fill !== undefined) base.fill = fill
  return base
}

/** First solid authored fill as a CSS color string, if any. */
export function nodeFillColor(node: SceneNode): string | undefined {
  const fill = node.fills.find((entry) => entry.visible && entry.type === 'SOLID')
  if (!fill) return undefined
  return fill.color.a < 1 ? colorToHex8(fill.color) : colorToHex(fill.color)
}

/**
 * Mix two CSS colors through culori-backed parse/format helpers; unparseable
 * or partially specified colors step at the halfway point instead.
 */
export function lerpFill(
  from: string | undefined,
  to: string | undefined,
  t: number
): string | undefined {
  if (from === undefined && to === undefined) return undefined
  if (from === undefined || to === undefined) return t < 0.5 ? (from ?? to) : (to ?? from)
  if (!parse(from) || !parse(to)) return t < 0.5 ? from : to
  const a = parseColor(from)
  const b = parseColor(to)
  const mixed = {
    r: lerpNumber(a.r, b.r, t),
    g: lerpNumber(a.g, b.g, t),
    b: lerpNumber(a.b, b.b, t),
    a: lerpNumber(a.a, b.a, t)
  }
  return mixed.a < 1 ? colorToHex8(mixed) : colorToHex(mixed)
}

function lerpAbsolute(
  fromV: number | undefined,
  toV: number | undefined,
  baseV: number | undefined,
  t: number
): number | undefined {
  if (fromV === undefined && toV === undefined) return undefined
  const a = fromV ?? baseV
  const b = toV ?? baseV
  if (a === undefined || b === undefined) {
    // No authored anchor for the missing side: hold the known value.
    return a ?? b
  }
  return lerpNumber(a, b, t)
}

/** One delta field: absent on both sides stays off, otherwise lerped from its identity. */
function lerpDelta(
  fromV: number | undefined,
  toV: number | undefined,
  identity: number,
  t: number
): number | undefined {
  const a = fromV ?? identity
  const b = toV ?? identity
  if (a === identity && b === identity) return undefined
  return lerpNumber(a, b, t)
}

/** Interpolate one absolute field and write it only when a side (or base) resolved. */
function setLerpAbsolute(
  result: PrototypeStateVisual,
  key: 'width' | 'height' | 'cornerRadius',
  fromV: number | undefined,
  toV: number | undefined,
  baseV: number | undefined,
  t: number
): void {
  const value = lerpAbsolute(fromV, toV, baseV, t)
  if (value !== undefined) result[key] = value
}

function setLerpFill(
  result: PrototypeStateVisual,
  from: PrototypeStateVisual,
  to: PrototypeStateVisual,
  base: PrototypeStateVisual | undefined,
  t: number
): void {
  const fill = lerpFill(from.fill ?? base?.fill, to.fill ?? base?.fill, t)
  if (fill !== undefined) result.fill = fill
}

export function lerpVisual(
  from: PrototypeStateVisual,
  to: PrototypeStateVisual,
  t: number,
  base?: PrototypeStateVisual
): PrototypeStateVisual {
  const result: PrototypeStateVisual = {}
  const scale = lerpDelta(from.scale, to.scale, 1, t)
  if (scale !== undefined) result.scale = scale
  const opacity = lerpDelta(from.opacity, to.opacity, 1, t)
  if (opacity !== undefined) result.opacity = opacity
  const tx = lerpDelta(from.translateX, to.translateX, 0, t)
  if (tx !== undefined) result.translateX = tx
  const ty = lerpDelta(from.translateY, to.translateY, 0, t)
  if (ty !== undefined) result.translateY = ty
  const rotation = lerpDelta(from.rotation, to.rotation, 0, t)
  if (rotation !== undefined) result.rotation = rotation
  const blur = lerpDelta(from.blur, to.blur, 0, t)
  if (blur !== undefined) result.blur = blur

  setLerpAbsolute(result, 'width', from.width, to.width, base?.width, t)
  setLerpAbsolute(result, 'height', from.height, to.height, base?.height, t)
  setLerpAbsolute(result, 'cornerRadius', from.cornerRadius, to.cornerRadius, base?.cornerRadius, t)
  setLerpFill(result, from, to, base, t)
  return result
}
