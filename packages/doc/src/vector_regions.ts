/**
 * Vector-region helpers: winding-number point tests and region enumeration
 * over a vector network's segments. (Converted 1:1 from FigCraft
 * `crates/doc/src/vector_regions.rs`; the heavy boolean algebra lives in
 * `@zenuxs/pathops`.)
 */

import type { Region, VectorNetwork, WindingRule } from './vector'

/** Whether a closed loop of points contains `pt` by the winding rule. */
export function loopContains(points: Array<[number, number]>, pt: [number, number], rule: WindingRule): boolean {
  let winding = 0
  for (let i = 0; i < points.length; i++) {
    const a = points[i]
    const b = points[(i + 1) % points.length]
    if (a[1] <= pt[1]) {
      if (b[1] > pt[1] && cross(a, b, pt) > 0) winding += 1
    } else if (b[1] <= pt[1] && cross(a, b, pt) < 0) winding -= 1
  }
  return rule === 'nonZero' ? winding !== 0 : (winding & 1) === 1
}

function cross(a: [number, number], b: [number, number], p: [number, number]): number {
  return (b[0] - a[0]) * (p[1] - a[1]) - (b[1] - a[1]) * (p[0] - a[0])
}

/** The vertex positions each loop of `region` passes through (for hit tests). */
export function regionLoops(net: VectorNetwork, region: Region): Array<Array<[number, number]>> {
  return region.loops.map((loop) =>
    loop
      .map((segIndex) => net.segments[segIndex])
      .filter((s) => s !== undefined)
      .map((s) => {
        const a = net.vertices[s.a]
        return a ? ([a.x, a.y] as [number, number]) : ([0, 0] as [number, number])
      })
  )
}

/** Whether `pt` is inside any of the network's regions. */
export function hitsRegion(net: VectorNetwork, pt: [number, number]): boolean {
  for (const region of net.regions) {
    for (const loop of regionLoops(net, region)) {
      if (loop.length >= 3 && loopContains(loop, pt, region.winding)) return true
    }
  }
  return false
}
