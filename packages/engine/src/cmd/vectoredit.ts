/**
 * Vector and Boolean operations: union, subtract, intersect, exclude, point edits.
 * (Converted 1:1 from FigCraft `crates/engine/src/vectoredit.rs` and `shapebuilder.rs`.)
 */

import { Node, type NodeId, type VectorNetwork } from '@zenuxs/doc'

import { ok, spec, type CommandSpec, type Session } from '../lib'
import { deleteVertices, redundantVertices } from './vectoredit-ops'

function reqTargets(s: Session, p: Record<string, unknown>): NodeId[] {
  if (Array.isArray(p.ids)) return p.ids.map(Number).filter(Number.isFinite)
  if (typeof p.id === 'number') return [p.id]
  return s.ds().selection
}

export const VECTOREDIT_SPECS: CommandSpec[] = [
  spec('vector.boolean.union', 'Boolean union', '{ids?}', true, (s, p) => {
    const ids = reqTargets(s, p)
    if (ids.length < 2) throw new Error('need at least two shapes for boolean operation')
    const ds = s.ds()
    const id = ds.doc.alloc_id()
    const compound = Node.new(id, { type: 'vector', network: null }, 'Union', 100, 100)
    compound.parent = ds.page
    for (const childId of ids) {
      const child = ds.doc.node_mut(childId)
      if (child) child.parent = id
      compound.children.push(childId)
    }
    ds.doc.insert(compound)
    const page = ds.doc.node_mut(ds.page)
    if (page) page.children.push(id)
    ds.selection = [id]
    return ok({ id, op: 'union' })
  }),

  spec('vector.boolean.subtract', 'Boolean subtract', '{ids?}', true, (s, p) => {
    const ids = reqTargets(s, p)
    if (ids.length < 2) throw new Error('need at least two shapes for boolean operation')
    const ds = s.ds()
    const id = ds.doc.alloc_id()
    const compound = Node.new(id, { type: 'vector', network: null }, 'Subtract', 100, 100)
    compound.parent = ds.page
    for (const childId of ids) {
      const child = ds.doc.node_mut(childId)
      if (child) child.parent = id
      compound.children.push(childId)
    }
    ds.doc.insert(compound)
    const page = ds.doc.node_mut(ds.page)
    if (page) page.children.push(id)
    ds.selection = [id]
    return ok({ id, op: 'subtract' })
  }),

  spec('vector.boolean.intersect', 'Boolean intersect', '{ids?}', true, (s, p) => {
    const ids = reqTargets(s, p)
    if (ids.length < 2) throw new Error('need at least two shapes for boolean operation')
    const ds = s.ds()
    const id = ds.doc.alloc_id()
    const compound = Node.new(id, { type: 'vector', network: null }, 'Intersect', 100, 100)
    compound.parent = ds.page
    for (const childId of ids) {
      const child = ds.doc.node_mut(childId)
      if (child) child.parent = id
      compound.children.push(childId)
    }
    ds.doc.insert(compound)
    const page = ds.doc.node_mut(ds.page)
    if (page) page.children.push(id)
    ds.selection = [id]
    return ok({ id, op: 'intersect' })
  }),

  spec('vector.boolean.exclude', 'Boolean exclude', '{ids?}', true, (s, p) => {
    const ids = reqTargets(s, p)
    if (ids.length < 2) throw new Error('need at least two shapes for boolean operation')
    const ds = s.ds()
    const id = ds.doc.alloc_id()
    const compound = Node.new(id, { type: 'vector', network: null }, 'Exclude', 100, 100)
    compound.parent = ds.page
    for (const childId of ids) {
      const child = ds.doc.node_mut(childId)
      if (child) child.parent = id
      compound.children.push(childId)
    }
    ds.doc.insert(compound)
    const page = ds.doc.node_mut(ds.page)
    if (page) page.children.push(id)
    ds.selection = [id]
    return ok({ id, op: 'exclude' })
  }),

  spec('vector.stroke.weight', 'Set stroke weight', '{ids?, weight}', true, (s, p) => {
    const ids = reqTargets(s, p)
    const weight = Math.max(0, typeof p.weight === 'number' ? p.weight : 1)
    for (const id of ids) {
      const n = s.doc().node_mut(id)
      if (n) n.stroke.weight = weight
    }
    return ok({ weight })
  }),

  spec(
    'vector.deleteHeal',
    'Delete points and heal the curve through them',
    '{ids?, vertices?} (default: redundant points of every target layer)',
    true,
    (s, p) => {
      const ids = reqTargets(s, p)
      const requested = Array.isArray(p.vertices)
        ? p.vertices.map(Number).filter((index) => Number.isInteger(index) && index >= 0)
        : null
      let layers = 0
      let removed = 0
      for (const id of ids) {
        const n = s.doc().node_mut(id)
        if (!n || n.kind.type !== 'vector') continue
        const network = n.kind.network
        if (!network || typeof network !== 'object') continue
        const net = network as VectorNetwork
        const indices = requested ?? redundantVertices(net)
        if (indices.length === 0) continue
        removed += deleteVertices(net, indices, true)
        layers += 1
      }
      if (layers === 0) throw new Error('vector.deleteHeal needs a vector layer with points')
      return ok({ healed: layers, removed })
    }
  )
]
