/**
 * Arrange commands: align, distribute, tidy, z-order, flips, rotations, and transforms.
 * (Converted 1:1 from FigCraft `crates/engine/src/cmd/arrange.rs`.)
 */

import { Affine } from '@zenuxs/geom'
import { ok, spec, type CommandSpec, type Session } from '../lib'

function reqTargets(s: Session, p: Record<string, unknown>): number[] {
  if (Array.isArray(p.ids)) return p.ids.map(Number).filter(Number.isFinite)
  if (typeof p.id === 'number') return [p.id]
  return s.ds().selection
}

export const ARRANGE_EXTENDED_SPECS: CommandSpec[] = [
  spec('align.distributeH', 'Distribute horizontal spacing', '{ids?, spacing?}', true, (s, p) => {
    const ids = reqTargets(s, p)
    const doc = s.doc()
    if (ids.length < 3) return ok()
    const nodes = ids.map((id) => doc.node(id)).filter((n): n is NonNullable<typeof n> => Boolean(n))
    nodes.sort((a, b) => a.transform.coeffs[4] - b.transform.coeffs[4])
    const first = nodes[0]!
    const last = nodes[nodes.length - 1]!
    const firstX = first.transform.coeffs[4]
    const lastX = last.transform.coeffs[4]
    const totalW = nodes.reduce((sum, n) => sum + n.width, 0)
    const span = lastX + last.width - firstX
    const gap = typeof p.spacing === 'number' ? p.spacing : Math.max(0, (span - totalW) / (nodes.length - 1))
    let curX = firstX
    for (const n of nodes) {
      const mut = s.doc().node_mut(n.id)
      if (mut) {
        const c = mut.transform.coeffs
        mut.transform = Affine.new([c[0], c[1], c[2], c[3], curX, c[5]])
        curX += mut.width + gap
      }
    }
    return ok()
  }),

  spec('align.distributeV', 'Distribute vertical spacing', '{ids?, spacing?}', true, (s, p) => {
    const ids = reqTargets(s, p)
    const doc = s.doc()
    if (ids.length < 3) return ok()
    const nodes = ids.map((id) => doc.node(id)).filter((n): n is NonNullable<typeof n> => Boolean(n))
    nodes.sort((a, b) => a.transform.coeffs[5] - b.transform.coeffs[5])
    const first = nodes[0]!
    const last = nodes[nodes.length - 1]!
    const firstY = first.transform.coeffs[5]
    const lastY = last.transform.coeffs[5]
    const totalH = nodes.reduce((sum, n) => sum + n.height, 0)
    const span = lastY + last.height - firstY
    const gap = typeof p.spacing === 'number' ? p.spacing : Math.max(0, (span - totalH) / (nodes.length - 1))
    let curY = firstY
    for (const n of nodes) {
      const mut = s.doc().node_mut(n.id)
      if (mut) {
        const c = mut.transform.coeffs
        mut.transform = Affine.new([c[0], c[1], c[2], c[3], c[4], curY])
        curY += mut.height + gap
      }
    }
    return ok()
  }),

  spec('arrange.forward', 'Bring forward', '{ids?}', true, (s, p) => {
    const ids = reqTargets(s, p)
    const ds = s.ds()
    const page = ds.doc.node_mut(ds.page)
    if (!page) return ok()
    for (const id of ids) {
      const idx = page.children.indexOf(id)
      if (idx !== -1 && idx < page.children.length - 1) {
        page.children.splice(idx, 1)
        page.children.splice(idx + 1, 0, id)
      }
    }
    return ok()
  }),

  spec('arrange.backward', 'Send backward', '{ids?}', true, (s, p) => {
    const ids = reqTargets(s, p)
    const ds = s.ds()
    const page = ds.doc.node_mut(ds.page)
    if (!page) return ok()
    for (const id of ids) {
      const idx = page.children.indexOf(id)
      if (idx > 0) {
        page.children.splice(idx, 1)
        page.children.splice(idx - 1, 0, id)
      }
    }
    return ok()
  }),

  spec('arrange.tidy', 'Tidy up', '{ids?, spacing?}', true, (s, p) => {
    const ids = reqTargets(s, p)
    const spacing = typeof p.spacing === 'number' ? p.spacing : 16
    const doc = s.doc()
    let curX = 0
    let curY = 0
    for (const id of ids) {
      const n = doc.node_mut(id)
      if (!n) continue
      const c = n.transform.coeffs
      n.transform = Affine.new([c[0], c[1], c[2], c[3], curX, curY])
      curX += n.width + spacing
    }
    return ok()
  }),

  spec('object.flipH', 'Flip horizontal', '{ids?}', true, (s, p) => {
    const ids = reqTargets(s, p)
    for (const id of ids) {
      const n = s.doc().node_mut(id)
      if (!n) continue
      const c = n.transform.coeffs
      n.transform = Affine.new([-c[0], c[1], -c[2], c[3], c[4], c[5]])
    }
    return ok()
  }),

  spec('object.flipV', 'Flip vertical', '{ids?}', true, (s, p) => {
    const ids = reqTargets(s, p)
    for (const id of ids) {
      const n = s.doc().node_mut(id)
      if (!n) continue
      const c = n.transform.coeffs
      n.transform = Affine.new([c[0], -c[1], c[2], -c[3], c[4], c[5]])
    }
    return ok()
  }),

  spec('object.rotate180', 'Rotate 180°', '{ids?}', true, (s, p) => {
    const ids = reqTargets(s, p)
    for (const id of ids) {
      const n = s.doc().node_mut(id)
      if (!n) continue
      const c = n.transform.coeffs
      n.transform = Affine.new([-c[0], -c[1], -c[2], -c[3], c[4], c[5]])
    }
    return ok()
  })
]
