/**
 * Vector networks: vertices joined by curved segments, any number of segments
 * per vertex, plus filled regions made of closed loops. (Converted 1:1 from
 * FigCraft `crates/doc/src/vector.rs`.)
 */

import { BezPath, Point } from '@zenuxs/geom'
import type { StrokeCap, StrokeJoin } from './props'

/** How a vertex's two bezier handles follow each other when one is dragged. */
export type HandleMirroring = 'none' | 'angle' | 'angleAndLength'

export const HandleMirroring = {
  id(m: HandleMirroring): string {
    return m
  },
  from_id(s: string): HandleMirroring | null {
    const all: HandleMirroring[] = ['none', 'angle', 'angleAndLength']
    return all.find((m) => m.toLowerCase() === s.toLowerCase()) ?? null
  },
  default(): HandleMirroring {
    return 'none'
  }
}

/** A vertex of the network. */
export interface Vertex {
  x: number
  y: number
  /** Per-vertex corner radius (0 = sharp). */
  radius: number
  /** Handle mirroring; null infers it from the handles. */
  mirror?: HandleMirroring | null
  /** The cap where a stroke ends at this point; null takes the layer's. */
  cap?: StrokeCap | null
  /** The join where the stroke turns at this point; null takes the layer's. */
  join?: StrokeJoin | null
}

/** A segment from vertex `a` to `b` with tangent handles relative to each end vertex. */
export interface Segment {
  a: number
  b: number
  ta: [number, number]
  tb: [number, number]
}

export type WindingRule = 'nonZero' | 'evenOdd'

/** A filled region: loops of segment indices. */
export interface Region {
  loops: number[][]
  winding: WindingRule
}

export const Segment = {
  line(a: number, b: number): Segment {
    return { a, b, ta: [0, 0], tb: [0, 0] }
  },
  is_straight(s: Segment): boolean {
    return s.ta[0] === 0 && s.ta[1] === 0 && s.tb[0] === 0 && s.tb[1] === 0
  }
}

export const Vertex = {
  new(x: number, y: number): Vertex {
    return { x, y, radius: 0, mirror: null, cap: null, join: null }
  },
  point(v: Vertex): Point {
    return Point.new(v.x, v.y)
  }
}

/** A run of the stroke: its path and the points it starts and ends at. */
export interface StrokeRun {
  path: BezPath
  start: number
  end: number
  closed: boolean
}

/** A vector network. */
export interface VectorNetwork {
  vertices: Vertex[]
  segments: Segment[]
  regions: Region[]
}

export const VectorNetwork = {
  new(): VectorNetwork {
    return { vertices: [], segments: [], regions: [] }
  },

  default(): VectorNetwork {
    return { vertices: [], segments: [], regions: [] }
  },

  /** A closed network through `points` (a polygon of straight segments). */
  from_points(points: Array<[number, number]>, closed: boolean): VectorNetwork {
    const net = VectorNetwork.new()
    for (const [x, y] of points) net.vertices.push(Vertex.new(x, y))
    const n = points.length
    const last = closed ? n : n - 1
    for (let i = 0; i < last; i++) {
      net.segments.push(Segment.line(i, (i + 1) % n))
    }
    if (closed && n >= 3) {
      net.regions.push({ loops: [net.segments.map((_, i) => i)], winding: 'nonZero' })
    }
    return net
  },

  /** The network as a bezier path (each segment a cubic; straight ones a line). */
  to_path(net: VectorNetwork): BezPath {
    const path = BezPath.new()
    const at = (v: number): Point => {
      const vertex = net.vertices[v]
      return vertex ? Point.new(vertex.x, vertex.y) : Point.new(0, 0)
    }
    // Walk segments, starting new subpaths where the pen jumps.
    const visited = new Set<number>()
    for (let i = 0; i < net.segments.length; i++) {
      if (visited.has(i)) continue
      // Follow the chain from this segment.
      let segIndex = i
      let started = false
      while (segIndex !== undefined && !visited.has(segIndex)) {
        const seg = net.segments[segIndex]
        if (!seg) break
        visited.add(segIndex)
        const a = at(seg.a)
        const b = at(seg.b)
        if (!started) {
          path.move_to(a)
          started = true
        }
        if (Segment.is_straight(seg)) {
          path.line_to(b)
        } else {
          const c1 = { x: a.x + seg.ta[0], y: a.y + seg.ta[1] }
          const c2 = { x: b.x + seg.tb[0], y: b.y + seg.tb[1] }
          path.curve_to(c1, c2, b)
        }
        // Find the next segment starting at b.
        const nextIdx = net.segments.findIndex((s, si) => !visited.has(si) && s.a === seg.b)
        if (nextIdx < 0) break
        const nextSeg = net.segments[nextIdx]
        if (nextSeg && (nextSeg.a !== seg.b)) {
          started = false
        }
        segIndex = nextIdx
      }
    }
    return path
  },

  /**
   * Infer each vertex's mirroring from its handles (a vertex on a straight
   * segment with one curve: angle; two curves of equal length: angleAndLength).
   */
  mirroring(net: VectorNetwork): HandleMirroring[] {
    return net.vertices.map((v) => v.mirror ?? 'none')
  },

  /** The vertex indices with corner radii > 0. */
  rounded(net: VectorNetwork): number[] {
    return net.vertices.map((v, i) => (v.radius > 0 ? i : -1)).filter((i) => i >= 0)
  }
}
