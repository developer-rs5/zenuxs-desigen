import { describe, expect, test } from 'bun:test'

import { removeVertices } from '@open-pencil/core/vector'
import type { VectorNetwork, VectorSegment } from '@open-pencil/scene-graph'

function line(start: number, end: number): VectorSegment {
  return { start, end, tangentStart: { x: 0, y: 0 }, tangentEnd: { x: 0, y: 0 } }
}

function squareWithMidpoint(): VectorNetwork {
  return {
    vertices: [
      { x: 0, y: 0 },
      { x: 50, y: 0 },
      { x: 100, y: 0 },
      { x: 100, y: 100 },
      { x: 0, y: 100 }
    ],
    segments: [line(0, 1), line(1, 2), line(2, 3), line(3, 4), line(4, 0)],
    regions: [{ windingRule: 'NONZERO', loops: [[0, 1, 2, 3, 4]] }]
  }
}

describe('removeVertices heals the path', () => {
  test('removing a point merges its two segments and keeps the region', () => {
    const result = removeVertices(squareWithMidpoint(), [1])
    expect(result.vertices.length).toBe(4)
    expect(result.segments.length).toBe(4)
    expect(result.regions[0]?.loops[0]?.length).toBe(4)
    expect(result.segments.some((segment) => segment.start === 0 && segment.end === 1)).toBe(true)
  })

  test('removing several points at once heals every join', () => {
    const network = squareWithMidpoint()
    // Two midpoints on neighbouring edges.
    network.vertices.push({ x: 100, y: 50 })
    network.segments = [line(0, 1), line(1, 2), line(2, 5), line(5, 3), line(3, 4), line(4, 0)]
    network.regions = [{ windingRule: 'NONZERO', loops: [[0, 1, 2, 3, 4, 5]] }]

    const result = removeVertices(network, [1, 5])
    expect(result.vertices.length).toBe(4)
    expect(result.segments.length).toBe(4)
    expect(result.regions[0]?.loops[0]?.length).toBe(4)
  })

  test('the healed curve still passes through the removed point', () => {
    const network: VectorNetwork = {
      vertices: [
        { x: 0, y: 0 },
        { x: 50, y: 50 },
        { x: 100, y: 0 }
      ],
      segments: [
        {
          start: 0,
          end: 1,
          tangentStart: { x: 10, y: 10 },
          tangentEnd: { x: 0, y: 0 }
        },
        {
          start: 1,
          end: 2,
          tangentStart: { x: 0, y: 0 },
          tangentEnd: { x: -10, y: 10 }
        }
      ],
      regions: []
    }

    const result = removeVertices(network, [1])
    expect(result.vertices.length).toBe(2)
    const segment = result.segments[0]
    const a = result.vertices[0]
    const b = result.vertices[1]
    if (!segment || !a || !b) throw new Error('missing healed segment')

    const t = 0.5
    const u = 1 - t
    const x =
      u * u * u * a.x +
      3 * u * u * t * (a.x + segment.tangentStart.x) +
      3 * u * t * t * (b.x + segment.tangentEnd.x) +
      t * t * t * b.x
    const y =
      u * u * u * a.y +
      3 * u * u * t * (a.y + segment.tangentStart.y) +
      3 * u * t * t * (b.y + segment.tangentEnd.y) +
      t * t * t * b.y
    expect(x).toBeCloseTo(50, 4)
    expect(y).toBeCloseTo(50, 4)
  })

  test('ignores out-of-range and duplicate indices', () => {
    const result = removeVertices(squareWithMidpoint(), [1, 1, 99, -2])
    expect(result.vertices.length).toBe(4)
  })
})
