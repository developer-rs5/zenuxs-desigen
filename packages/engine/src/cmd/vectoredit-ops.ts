/**
 * Vector network point editing: vertex deletion, segment/region repair, and
 * curve healing. (Converted 1:1 from FigCraft `crates/engine/src/vectoredit/ops.rs`.)
 *
 * Deleting a point is a structural edit: every segment that touched it goes,
 * its region loops are re-indexed around the gap, and — when the point had
 * exactly two segments — the two neighbours are joined by one segment whose
 * handles are solved so the new curve still passes through the deleted point.
 */

import type { Segment, VectorNetwork } from '@zenuxs/doc'
import { healBezierHandles } from '@zenuxs/pathops'

/** Segment indices that touch vertex `vi`. */
export function incident(net: VectorNetwork, vi: number): number[] {
  const out: number[] = []
  for (let i = 0; i < net.segments.length; i++) {
    const segment = net.segments[i]
    if (segment && (segment.a === vi || segment.b === vi)) out.push(i)
  }
  return out
}

function isStraight(segment: Segment): boolean {
  return segment.ta[0] === 0 && segment.ta[1] === 0 && segment.tb[0] === 0 && segment.tb[1] === 0
}

/** Drop the vertex and shift every higher segment endpoint down by one. */
function removeVertexIndex(net: VectorNetwork, vi: number): void {
  if (vi >= net.vertices.length) return
  net.vertices.splice(vi, 1)
  for (const segment of net.segments) {
    if (segment.a > vi) segment.a -= 1
    if (segment.b > vi) segment.b -= 1
  }
}

/** Drop segments and region indices that point past the network. */
function sanitize(net: VectorNetwork): void {
  const vertexCount = net.vertices.length
  const keep = net.segments.map((segment) => segment.a < vertexCount && segment.b < vertexCount)
  if (keep.every(Boolean)) {
    const segmentCount = net.segments.length
    for (const region of net.regions) {
      region.loops = region.loops.filter((loop) => loop.every((index) => index < segmentCount))
    }
    return
  }
  const remap: number[] = Array.from({ length: net.segments.length }, () => -1)
  const kept: Segment[] = []
  for (let i = 0; i < net.segments.length; i++) {
    const segment = net.segments[i]
    if (!segment || !keep[i]) continue
    remap[i] = kept.length
    kept.push(segment)
  }
  net.segments = kept
  for (const region of net.regions) {
    region.loops = region.loops.filter((loop) => loop.every((index) => (remap[index] ?? -1) >= 0))
    for (const loop of region.loops) {
      for (let i = 0; i < loop.length; i++) loop[i] = remap[loop[i] ?? -1] ?? 0
    }
  }
}

function sharesVertex(net: VectorNetwork, x: number, y: number): boolean {
  const a = net.segments[x]
  const b = net.segments[y]
  if (!a || !b) return false
  return a.a === b.a || a.a === b.b || a.b === b.a || a.b === b.b
}

/** Start a broken loop where the break is, so the fill closes it with one line. */
function reopenLoops(net: VectorNetwork): void {
  for (const region of net.regions) {
    for (const loop of region.loops) {
      const n = loop.length
      if (n < 2) continue
      let brk = -1
      for (let k = 0; k < n; k++) {
        const prev = loop[(k + n - 1) % n]
        const cur = loop[k]
        if (prev === undefined || cur === undefined) continue
        if (!sharesVertex(net, prev, cur)) {
          brk = k
          break
        }
      }
      if (brk > 0) {
        const head = loop.splice(0, brk)
        loop.push(...head)
      }
    }
  }
}

/**
 * Delete vertices, joining their neighbours where a vertex had exactly two
 * segments. Returns how many vertices actually left the network.
 */
export function deleteVertices(net: VectorNetwork, indices: number[], heal: boolean): number {
  const sorted = [...new Set(indices)]
    .filter((index) => Number.isInteger(index) && index >= 0)
    .sort((a, b) => a - b)

  let removed = 0
  for (const vi of [...sorted].reverse()) {
    if (vi >= net.vertices.length) continue
    const vertex = net.vertices[vi]
    if (!vertex) continue
    const touching = incident(net, vi)

    let healed: Segment | null = null
    if (heal && touching.length === 2) {
      const [first, second] = touching
      const x = first === undefined ? undefined : net.segments[first]
      const y = second === undefined ? undefined : net.segments[second]
      if (x && y) {
        const o1 = x.a === vi ? { vertex: x.b, handle: x.tb } : { vertex: x.a, handle: x.ta }
        const o2 = y.a === vi ? { vertex: y.b, handle: y.tb } : { vertex: y.a, handle: y.ta }
        if (o1.vertex !== o2.vertex) {
          const curved = !(isStraight(x) && isStraight(y))
          let ta = o1.handle
          let tb = o2.handle
          if (curved) {
            const a = net.vertices[o1.vertex]
            const b = net.vertices[o2.vertex]
            if (a && b) {
              const solved = healBezierHandles(
                { x: vertex.x, y: vertex.y },
                { x: a.x, y: a.y },
                { x: b.x, y: b.y },
                o1.handle,
                o2.handle
              )
              // Both ends must solve, or the curve no longer passes through the
              // deleted point; then the neighbours keep their own handles.
              const solvedBoth =
                (solved.ta[0] !== 0 || solved.ta[1] !== 0) &&
                (solved.tb[0] !== 0 || solved.tb[1] !== 0)
              if (solvedBoth) {
                ta = solved.ta
                tb = solved.tb
              }
            }
          }
          healed = { a: o1.vertex, b: o2.vertex, ta, tb }
        }
      }
    }

    // Remove the touching segments (descending) and remember where the rest move to.
    const remap: number[] = net.segments.map((_, index) => index)
    for (const si of [...touching].reverse()) {
      net.segments.splice(si, 1)
      remap[si] = -1
    }
    let next = 0
    for (let i = 0; i < remap.length; i++) {
      if ((remap[i] ?? -1) >= 0) remap[i] = next++
    }

    let healedIndex = -1
    if (healed) {
      net.segments.push(healed)
      healedIndex = net.segments.length - 1
    }

    for (const region of net.regions) {
      for (let li = 0; li < region.loops.length; li++) {
        const loop = region.loops[li]
        if (!loop) continue
        const out: number[] = []
        let inserted = false
        for (const si of loop) {
          const mapped = remap[si] ?? -1
          if (mapped >= 0) {
            out.push(mapped)
          } else if (healedIndex >= 0 && !inserted) {
            out.push(healedIndex)
            inserted = true
          }
        }
        region.loops[li] = out
      }
      region.loops = region.loops.filter((loop) => loop.length >= 2)
    }
    net.regions = net.regions.filter((region) => region.loops.length > 0)

    removeVertexIndex(net, vi)
    removed += 1
  }

  sanitize(net)
  reopenLoops(net)
  return removed
}

/**
 * Points that can be deleted without changing the outline: a point on straight
 * segments that sits on the line between its two neighbours.
 */
export function redundantVertices(net: VectorNetwork, tolerance = 1e-6): number[] {
  const out: number[] = []
  for (let vi = 0; vi < net.vertices.length; vi++) {
    const vertex = net.vertices[vi]
    const touching = incident(net, vi)
    if (!vertex || touching.length !== 2) continue
    const segments = touching.map((index) => net.segments[index])
    if (segments.some((segment) => !segment || !isStraight(segment))) continue
    const [first, second] = segments
    if (!first || !second) continue
    const endA = first.a === vi ? first.b : first.a
    const endB = second.a === vi ? second.b : second.a
    if (endA === endB) continue
    const a = net.vertices[endA]
    const b = net.vertices[endB]
    if (!a || !b) continue
    const abx = b.x - a.x
    const aby = b.y - a.y
    const length = Math.hypot(abx, aby)
    if (length <= 1e-9) continue
    const apx = vertex.x - a.x
    const apy = vertex.y - a.y
    const distance = Math.abs(abx * apy - aby * apx) / length
    const projection = apx * abx + apy * aby
    if (
      distance <= tolerance * Math.max(1, length) &&
      projection >= 0 &&
      projection <= length * length
    ) {
      out.push(vi)
    }
  }
  return out
}
