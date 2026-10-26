/**
 * Structure commands: groups, frames, sections, masks, flattening, and outlining.
 * (Converted 1:1 from FigCraft `crates/engine/src/cmd/structure.rs`.)
 */

import { Node, type NodeId } from '@zenuxs/doc'
import { ok, spec, type CommandSpec, type Session } from '../lib'

function reqTargets(s: Session, p: Record<string, unknown>): NodeId[] {
  if (Array.isArray(p.ids)) return p.ids.map(Number).filter(Number.isFinite)
  if (typeof p.id === 'number') return [p.id]
  return s.ds().selection
}

export const STRUCTURE_EXTENDED_SPECS: CommandSpec[] = [
  spec('object.convertToGroup', 'Convert to group', '{ids?}', true, (s, p) => {
    const ids = reqTargets(s, p)
    const doc = s.doc()
    for (const id of ids) {
      const node = doc.node_mut(id)
      if (node && node.kind.type === 'frame') {
        node.kind = { type: 'group' }
        node.fills = []
        node.strokes = []
        node.layout = null
      }
    }
    return ok()
  }),

  spec('object.convertToFrame', 'Convert to frame', '{ids?}', true, (s, p) => {
    const ids = reqTargets(s, p)
    const doc = s.doc()
    for (const id of ids) {
      const node = doc.node_mut(id)
      if (node && (node.kind.type === 'group' || node.kind.type === 'section')) {
        node.kind = { type: 'frame' }
      }
    }
    return ok()
  }),

  spec('object.convertToSection', 'Convert to section', '{ids?}', true, (s, p) => {
    const ids = reqTargets(s, p)
    const doc = s.doc()
    for (const id of ids) {
      const node = doc.node_mut(id)
      if (node && node.kind.type === 'frame') {
        node.kind = { type: 'section', contents_hidden: false }
        node.layout = null
      }
    }
    return ok()
  }),

  spec('object.wrapInSection', 'Wrap in new section', '{ids?, name?}', true, (s, p) => {
    const ids = reqTargets(s, p)
    const ds = s.ds()
    if (ids.length === 0) return ok()
    const sectionId = ds.doc.alloc_id()
    const name = typeof p.name === 'string' ? p.name : 'Section'
    const section = Node.new(sectionId, { type: 'section', contents_hidden: false }, name, 400, 400)
    section.parent = ds.page
    ds.doc.insert(section)
    for (const id of ids) {
      const n = ds.doc.node_mut(id)
      if (n) {
        n.parent = sectionId
        section.children.push(id)
      }
    }
    ds.selection = [sectionId]
    return ok({ id: sectionId })
  }),

  spec('object.resizeToFit', 'Resize to fit contents', '{ids?}', true, (s, p) => {
    const ids = reqTargets(s, p)
    const doc = s.doc()
    for (const id of ids) {
      const node = doc.node_mut(id)
      if (!node || node.children.length === 0) continue
      let maxX = 0
      let maxY = 0
      for (const childId of node.children) {
        const child = doc.node(childId)
        if (child) {
          maxX = Math.max(maxX, child.transform.coeffs[4] + child.width)
          maxY = Math.max(maxY, child.transform.coeffs[5] + child.height)
        }
      }
      if (maxX > 0) node.width = maxX
      if (maxY > 0) node.height = maxY
    }
    return ok()
  }),

  spec('object.mask', 'Use as mask', '{ids?}', true, (s, p) => {
    const ids = reqTargets(s, p)
    for (const id of ids) {
      const n = s.doc().node_mut(id)
      if (n) n.is_mask = true
    }
    return ok()
  }),

  spec('object.releaseMask', 'Release mask', '{ids?}', true, (s, p) => {
    const ids = reqTargets(s, p)
    for (const id of ids) {
      const n = s.doc().node_mut(id)
      if (n) n.is_mask = false
    }
    return ok()
  }),

  spec('object.flatten', 'Flatten selection', '{ids?}', true, (s, p) => {
    const ids = reqTargets(s, p)
    for (const id of ids) {
      const n = s.doc().node_mut(id)
      if (n) n.kind = { type: 'vector', network: null }
    }
    return ok()
  }),

  spec('object.outlineStroke', 'Outline stroke', '{ids?}', true, (s, p) => {
    const ids = reqTargets(s, p)
    for (const id of ids) {
      const n = s.doc().node_mut(id)
      if (n && n.strokes.length > 0) {
        n.fills = [...n.strokes]
        n.strokes = []
      }
    }
    return ok()
  })
]
