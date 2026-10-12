import svgpath from 'svgpath'

import type { VectorNetwork, VectorVertex, VectorSegment, VectorRegion, WindingRule } from './index'

interface SubPath {
  startVertexIndex: number
  segmentIndices: number[]
  closed: boolean
}

export type VectorPathWindingRule = WindingRule | 'NONE'
export type SVGPathParseResult = { ok: true; network: VectorNetwork } | { ok: false; error: string }

interface ParseOptions {
  includeOpenRegions: boolean
  strictCommands: boolean
}

/**
 * Parse an SVG path `d` attribute into a VectorNetwork.
 *
 * Uses `svgpath` to normalize all commands to absolute M/L/C/Z
 * (arcs → cubics via `.unarc()`, smooth curves → explicit via `.unshort()`).
 */
export function parseSVGPath(d: string, windingRule: WindingRule = 'NONZERO'): VectorNetwork {
  const parsed = parsePath(d, windingRule, {
    includeOpenRegions: false,
    strictCommands: false
  })
  return parsed.ok ? parsed.network : { vertices: [], segments: [], regions: [] }
}

/** Parse the strict absolute command subset accepted by Figma's VectorPath API. */
export function parsePluginVectorPath(
  d: string,
  windingRule: VectorPathWindingRule
): SVGPathParseResult {
  return parsePath(d, windingRule, {
    includeOpenRegions: windingRule !== 'NONE',
    strictCommands: true
  })
}

function parsePath(
  d: string,
  windingRule: VectorPathWindingRule,
  options: ParseOptions
): SVGPathParseResult {
  const vertices: VectorVertex[] = []
  const segments: VectorSegment[] = []
  const subPaths: SubPath[] = []

  let currentSubPath: SubPath | null = null
  let cx = 0
  let cy = 0

  const vertexMap = new Map<string, number>()

  function getOrCreateVertex(x: number, y: number): number {
    const key = `${x},${y}`
    const existing = vertexMap.get(key)
    if (existing !== undefined) return existing
    const idx = vertices.length
    vertices.push({ x, y })
    vertexMap.set(key, idx)
    return idx
  }

  function addSegment(
    x1: number,
    y1: number,
    x2: number,
    y2: number,
    tx1: number,
    ty1: number,
    tx2: number,
    ty2: number
  ): void {
    const startIdx = getOrCreateVertex(x1, y1)
    const endIdx = getOrCreateVertex(x2, y2)
    const segIdx = segments.length
    segments.push({
      start: startIdx,
      end: endIdx,
      tangentStart: { x: tx1 - x1, y: ty1 - y1 },
      tangentEnd: { x: tx2 - x2, y: ty2 - y2 }
    })
    if (currentSubPath) {
      currentSubPath.segmentIndices.push(segIdx)
    }
  }

  function addLine(x1: number, y1: number, x2: number, y2: number): void {
    addSegment(x1, y1, x2, y2, x1, y1, x2, y2)
  }

  function addCubic(
    x1: number,
    y1: number,
    cp1x: number,
    cp1y: number,
    cp2x: number,
    cp2y: number,
    x2: number,
    y2: number
  ): void {
    addSegment(x1, y1, x2, y2, cp1x, cp1y, cp2x, cp2y)
  }

  const parsed = svgpath(d)
  const parseError = 'err' in parsed && typeof parsed.err === 'string' ? parsed.err : null
  if (parseError) return { ok: false, error: parseError }
  if (options.strictCommands) {
    const unsupportedCommands = new Set<string>()
    parsed.iterate((segment) => {
      if (!['M', 'L', 'Q', 'C', 'Z'].includes(segment[0])) unsupportedCommands.add(segment[0])
    })
    const unsupportedCommand = unsupportedCommands.values().next().value
    if (unsupportedCommand !== undefined) {
      return { ok: false, error: `Unsupported path command ${unsupportedCommand}` }
    }
  }
  const normalized = parsed.abs().unshort().unarc()

  normalized.iterate((seg) => {
    const cmd = seg[0]

    if (cmd === 'M') {
      cx = seg[1]
      cy = seg[2]
      currentSubPath = {
        startVertexIndex: getOrCreateVertex(cx, cy),
        segmentIndices: [],
        closed: false
      }
      subPaths.push(currentSubPath)
    } else if (cmd === 'L') {
      addLine(cx, cy, seg[1], seg[2])
      cx = seg[1]
      cy = seg[2]
    } else if (cmd === 'H') {
      addLine(cx, cy, seg[1], cy)
      cx = seg[1]
    } else if (cmd === 'V') {
      addLine(cx, cy, cx, seg[1])
      cy = seg[1]
    } else if (cmd === 'C') {
      addCubic(cx, cy, seg[1], seg[2], seg[3], seg[4], seg[5], seg[6])
      cx = seg[5]
      cy = seg[6]
    } else if (cmd === 'Q') {
      const qx = seg[1]
      const qy = seg[2]
      const ex = seg[3]
      const ey = seg[4]
      const cp1x = cx + (2 / 3) * (qx - cx)
      const cp1y = cy + (2 / 3) * (qy - cy)
      const cp2x = ex + (2 / 3) * (qx - ex)
      const cp2y = ey + (2 / 3) * (qy - ey)
      addCubic(cx, cy, cp1x, cp1y, cp2x, cp2y, ex, ey)
      cx = ex
      cy = ey
    } else if (cmd === 'Z' || cmd === 'z') {
      if (currentSubPath) {
        const startVert = vertices[currentSubPath.startVertexIndex]
        if (Math.abs(cx - startVert.x) > 0.001 || Math.abs(cy - startVert.y) > 0.001) {
          addLine(cx, cy, startVert.x, startVert.y)
        }
        currentSubPath.closed = true
        cx = startVert.x
        cy = startVert.y
      }
    }
  })

  const regions: VectorRegion[] = []
  const regionPaths = subPaths.filter(
    (subPath) =>
      windingRule !== 'NONE' &&
      subPath.segmentIndices.length > 0 &&
      (subPath.closed || options.includeOpenRegions)
  )
  if (regionPaths.length > 0 && windingRule !== 'NONE') {
    regions.push({
      windingRule,
      loops: regionPaths.map((subPath) => subPath.segmentIndices)
    })
  }

  return { ok: true, network: { vertices, segments, regions } }
}

export function round(n: number, decimals = 2): number {
  const factor = 10 ** decimals
  return Math.round(n * factor) / factor
}

export function coordinate(value: number, decimals: number | null): number {
  return decimals === null ? value : round(value, decimals)
}

/**
 * Serialize a VectorNetwork back to SVG path data — the inverse of
 * `parseSVGPath`. Lives beside the parser so both directions of the path
 * codec share one home: `.pen` stores vector geometry as a `d` attribute and
 * cannot depend on Core for serialization.
 */
export function vectorNetworkToSVGPaths(
  network: VectorNetwork,
  decimals: number | null = 2
): string[] {
  const { vertices, segments, regions } = network

  if (regions.length > 0) {
    return regions.map((region) =>
      region.loops.map((loop) => traceOrderedSegments(loop, segments, vertices, decimals)).join('')
    )
  }

  const path = unfilledSegmentsToPath(network, decimals)
  return path ? [path] : []
}

function segmentToSVG(
  seg: VectorSegment,
  vertices: VectorVertex[],
  forward: boolean,
  decimals: number | null
): string {
  const start = forward ? vertices[seg.start] : vertices[seg.end]
  const end = forward ? vertices[seg.end] : vertices[seg.start]
  const ts = forward ? seg.tangentStart : { x: -seg.tangentEnd.x, y: -seg.tangentEnd.y }
  const te = forward ? seg.tangentEnd : { x: -seg.tangentStart.x, y: -seg.tangentStart.y }

  const isStraight =
    Math.abs(ts.x) < 0.001 &&
    Math.abs(ts.y) < 0.001 &&
    Math.abs(te.x) < 0.001 &&
    Math.abs(te.y) < 0.001

  if (isStraight) {
    return `L${coordinate(end.x, decimals)} ${coordinate(end.y, decimals)}`
  }

  const cp1x = coordinate(start.x + ts.x, decimals)
  const cp1y = coordinate(start.y + ts.y, decimals)
  const cp2x = coordinate(end.x + te.x, decimals)
  const cp2y = coordinate(end.y + te.y, decimals)
  return `C${cp1x} ${cp1y} ${cp2x} ${cp2y} ${coordinate(end.x, decimals)} ${coordinate(end.y, decimals)}`
}

function traceOrderedSegments(
  segmentIndices: readonly number[],
  segments: VectorSegment[],
  vertices: VectorVertex[],
  decimals: number | null
): string {
  if (segmentIndices.length === 0) return ''
  const first = segments[segmentIndices[0]]
  const second = segmentIndices.length > 1 ? segments[segmentIndices[1]] : null
  // Start at the first segment endpoint that does not connect to the second segment.
  const secondConnectsStart = second?.start === first.start || second?.end === first.start
  const secondConnectsEnd = second?.start === first.end || second?.end === first.end
  const firstForward = !second || secondConnectsEnd || !secondConnectsStart
  const startIndex = firstForward ? first.start : first.end
  let currentIndex = startIndex
  const parts = [
    `M${coordinate(vertices[startIndex].x, decimals)} ${coordinate(vertices[startIndex].y, decimals)}`
  ]

  for (const segmentIndex of segmentIndices) {
    const segment = segments[segmentIndex]
    const isConnected = segment.start === currentIndex || segment.end === currentIndex
    const forward = segment.start === currentIndex || !isConnected
    if (!isConnected) {
      const segmentStart = forward ? segment.start : segment.end
      parts.push(
        `M${coordinate(vertices[segmentStart].x, decimals)} ${coordinate(vertices[segmentStart].y, decimals)}`
      )
    }
    parts.push(segmentToSVG(segment, vertices, forward, decimals))
    currentIndex = forward ? segment.end : segment.start
  }
  if (parts.length === segmentIndices.length + 1 && currentIndex === startIndex) parts.push('Z')
  return parts.join('')
}

type SegmentAdjacency = ReadonlyMap<number, readonly number[]>

function buildSegmentAdjacency(segments: VectorSegment[]): SegmentAdjacency {
  const adjacency = new Map<number, number[]>()
  for (let index = 0; index < segments.length; index++) {
    const segment = segments[index]
    for (const vertexIndex of [segment.start, segment.end]) {
      const incidentSegments = adjacency.get(vertexIndex)
      if (incidentSegments) incidentSegments.push(index)
      else adjacency.set(vertexIndex, [index])
    }
  }
  return adjacency
}

function findConnectedSegment(
  remaining: ReadonlySet<number>,
  adjacency: SegmentAdjacency,
  vertexIndex: number
): number | undefined {
  return adjacency.get(vertexIndex)?.find((index) => remaining.has(index))
}

function extendSegmentChain(
  chain: number[],
  startVertex: number,
  remaining: Set<number>,
  segments: VectorSegment[],
  adjacency: SegmentAdjacency
): void {
  let currentIndex = startVertex
  let nextIndex = findConnectedSegment(remaining, adjacency, currentIndex)
  while (nextIndex !== undefined) {
    chain.push(nextIndex)
    remaining.delete(nextIndex)
    const segment = segments[nextIndex]
    currentIndex = segment.start === currentIndex ? segment.end : segment.start
    nextIndex = findConnectedSegment(remaining, adjacency, currentIndex)
  }
}

function unfilledSegmentsToPath(network: VectorNetwork, decimals: number | null): string {
  const { vertices, segments } = network
  const remaining = new Set(segments.map((_, index) => index))
  const adjacency = buildSegmentAdjacency(segments)
  const parts: string[] = []

  while (remaining.size > 0) {
    const firstIndex = remaining.values().next().value
    if (firstIndex === undefined) break
    remaining.delete(firstIndex)
    const first = segments[firstIndex]

    const backward: number[] = []
    extendSegmentChain(backward, first.start, remaining, segments, adjacency)
    backward.reverse()

    const forward: number[] = []
    extendSegmentChain(forward, first.end, remaining, segments, adjacency)

    parts.push(
      traceOrderedSegments([...backward, firstIndex, ...forward], segments, vertices, decimals)
    )
  }

  return parts.join('')
}
