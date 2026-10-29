import type {
  StrokeCap as ZenuxsStrokeCap,
  StrokeJoin as ZenuxsStrokeJoin,
  VectorNetwork as ZenuxsVectorNetwork
} from '@zenuxs/doc'

import type { VectorNetwork as SceneGraphVectorNetwork } from '@open-pencil/scene-graph'

const zenuxsCapsToSceneGraph: Record<ZenuxsStrokeCap, string> = {
  none: 'NONE',
  round: 'ROUND',
  square: 'SQUARE',
  arrowLines: 'ARROW_LINES',
  arrowTriangle: 'ARROW_EQUILATERAL',
  arrowStick: 'ARROW_STICK',
  lineArrow: 'LINE_ARROW',
  ring: 'RING'
}

const sceneGraphCapsToZenuxs: Record<string, ZenuxsStrokeCap> = {
  NONE: 'none',
  ROUND: 'round',
  SQUARE: 'square',
  ARROW_LINES: 'arrowLines',
  ARROW_EQUILATERAL: 'arrowTriangle',
  ARROW_STICK: 'arrowStick',
  LINE_ARROW: 'lineArrow',
  RING: 'ring'
}

const zenuxsJoinsToSceneGraph: Record<ZenuxsStrokeJoin, string> = {
  miter: 'MITER',
  bevel: 'BEVEL',
  round: 'ROUND'
}

const sceneGraphJoinsToZenuxs: Record<string, ZenuxsStrokeJoin> = {
  MITER: 'miter',
  BEVEL: 'bevel',
  ROUND: 'round'
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value)
}

function isPair(value: unknown): value is [number, number] {
  return Array.isArray(value) && value.length === 2 && value.every(isFiniteNumber)
}

function isZenuxsVectorNetwork(value: unknown): value is ZenuxsVectorNetwork {
  if (!isRecord(value) || !Array.isArray(value.vertices) || !Array.isArray(value.segments)) {
    return false
  }
  if (!Array.isArray(value.regions)) return false

  const validVertices = value.vertices.every((vertex) => {
    if (!isRecord(vertex) || !isFiniteNumber(vertex.x) || !isFiniteNumber(vertex.y)) return false
    if (!isFiniteNumber(vertex.radius)) return false
    if (
      vertex.mirror !== undefined &&
      vertex.mirror !== null &&
      !['none', 'angle', 'angleAndLength'].includes(String(vertex.mirror))
    ) {
      return false
    }
    if (
      vertex.cap !== undefined &&
      vertex.cap !== null &&
      !Object.hasOwn(zenuxsCapsToSceneGraph, String(vertex.cap))
    ) {
      return false
    }
    return (
      vertex.join === undefined ||
      vertex.join === null ||
      Object.hasOwn(zenuxsJoinsToSceneGraph, String(vertex.join))
    )
  })
  const validSegments = value.segments.every(
    (segment) =>
      isRecord(segment) &&
      Number.isInteger(segment.a) &&
      Number.isInteger(segment.b) &&
      isPair(segment.ta) &&
      isPair(segment.tb)
  )
  const validRegions = value.regions.every(
    (region) =>
      isRecord(region) &&
      Array.isArray(region.loops) &&
      region.loops.every(
        (loop) =>
          Array.isArray(loop) && loop.every((segmentIndex) => Number.isInteger(segmentIndex))
      ) &&
      (region.winding === 'nonZero' || region.winding === 'evenOdd')
  )
  return validVertices && validSegments && validRegions
}

function sceneMirrorToZenuxs(
  mirror: SceneGraphVectorNetwork['vertices'][number]['handleMirroring']
): ZenuxsVectorNetwork['vertices'][number]['mirror'] {
  switch (mirror) {
    case 'ANGLE':
      return 'angle'
    case 'ANGLE_AND_LENGTH':
      return 'angleAndLength'
    case 'NONE':
      return 'none'
    default:
      return undefined
  }
}

function zenuxsMirrorToScene(
  mirror: ZenuxsVectorNetwork['vertices'][number]['mirror']
): SceneGraphVectorNetwork['vertices'][number]['handleMirroring'] {
  switch (mirror) {
    case 'angle':
      return 'ANGLE'
    case 'angleAndLength':
      return 'ANGLE_AND_LENGTH'
    case 'none':
      return 'NONE'
    default:
      return undefined
  }
}

export function vectorNetworkToZenuxs(
  network: SceneGraphVectorNetwork | null
): ZenuxsVectorNetwork | null {
  if (!network) return null
  return {
    vertices: network.vertices.map((vertex) => {
      const cap = vertex.strokeCap ? sceneGraphCapsToZenuxs[vertex.strokeCap] : undefined
      if (vertex.strokeCap && !cap) {
        throw new Error(`unsupported vector vertex cap "${vertex.strokeCap}"`)
      }
      const join = vertex.strokeJoin ? sceneGraphJoinsToZenuxs[vertex.strokeJoin] : undefined
      if (vertex.strokeJoin && !join) {
        throw new Error(`unsupported vector vertex join "${vertex.strokeJoin}"`)
      }
      const mappedVertex: ZenuxsVectorNetwork['vertices'][number] = {
        x: vertex.x,
        y: vertex.y,
        radius: vertex.cornerRadius ?? 0
      }
      const mirror = sceneMirrorToZenuxs(vertex.handleMirroring)
      if (mirror !== undefined) mappedVertex.mirror = mirror
      if (cap !== undefined) mappedVertex.cap = cap
      if (join !== undefined) mappedVertex.join = join
      return mappedVertex
    }),
    segments: network.segments.map((segment) => ({
      a: segment.start,
      b: segment.end,
      ta: [segment.tangentStart.x, segment.tangentStart.y],
      tb: [segment.tangentEnd.x, segment.tangentEnd.y]
    })),
    regions: network.regions.map((region) => ({
      loops: region.loops.map((loop) => [...loop]),
      winding: region.windingRule === 'EVENODD' ? 'evenOdd' : 'nonZero'
    }))
  }
}

export function vectorNetworkFromZenuxs(network: unknown): SceneGraphVectorNetwork | null {
  if (network === null || network === undefined) return null
  if (!isZenuxsVectorNetwork(network)) {
    throw new Error('invalid Zenuxs vector network')
  }
  return {
    vertices: network.vertices.map((vertex) => {
      const mappedVertex: SceneGraphVectorNetwork['vertices'][number] = {
        x: vertex.x,
        y: vertex.y,
        cornerRadius: vertex.radius
      }
      const mirror = zenuxsMirrorToScene(vertex.mirror)
      if (mirror !== undefined) mappedVertex.handleMirroring = mirror
      if (vertex.cap !== undefined && vertex.cap !== null) {
        mappedVertex.strokeCap = zenuxsCapsToSceneGraph[vertex.cap]
      }
      if (vertex.join !== undefined && vertex.join !== null) {
        mappedVertex.strokeJoin = zenuxsJoinsToSceneGraph[vertex.join]
      }
      return mappedVertex
    }),
    segments: network.segments.map((segment) => ({
      start: segment.a,
      end: segment.b,
      tangentStart: { x: segment.ta[0], y: segment.ta[1] },
      tangentEnd: { x: segment.tb[0], y: segment.tb[1] }
    })),
    regions: network.regions.map((region) => ({
      loops: region.loops.map((loop) => [...loop]),
      windingRule: region.winding === 'evenOdd' ? 'EVENODD' : 'NONZERO'
    }))
  }
}
