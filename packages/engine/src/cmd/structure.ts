/**
 * Structure commands: groups, frames, sections, masks, flattening, and outlining.
 * (Converted 1:1 from FigCraft `crates/engine/src/cmd/structure.rs`.)
 */

import { Corners, Node, type NodeId } from '@zenuxs/doc'
import { coherentSizing } from '@zenuxs/layout'
import { owningInstance } from '../components'
import { EngineError, ok, spec, type CommandSpec, type Session } from '../lib'
import { bad, reqTargets } from './params'

/** Auto layout bindings go with the auto layout, or re-applying them revives it. */
const LAYOUT_KEYS = new Set([
  'gap',
  'itemSpacing',
  'columnGap',
  'crossGap',
  'counterAxisSpacing',
  'rowGap',
  'padding',
  'paddingTop',
  'paddingRight',
  'paddingBottom',
  'paddingLeft',
  'paddingHorizontal',
  'paddingVertical',
  'mainAlign',
  'primaryAxisAlignItems',
  'crossAlign',
  'counterAxisAlignItems',
  'contentAlign',
  'counterAxisAlignContent',
  'wrap',
  'gridColumns',
  'gridRows',
  'strokesIncluded',
  'reverseZ',
  'columnTracks',
  'gridColumnTracks',
  'rowTracks',
  'gridRowTracks'
])

/**
 * Turn frames into groups or groups into frames in place: same id, name,
 * layers, effects, opacity, exports and interactions, the layers inside
 * staying where they are on the page. Nothing changes unless every layer can
 * convert.
 */
function convert(
  s: Session,
  p: Record<string, unknown>,
  cmd: string,
  toFrame: boolean
): Record<string, unknown> {
  const ids = reqTargets(cmd, s, p)
  const doc = s.doc()
  const todo: NodeId[] = []
  for (const i of ids) {
    const n = doc.node(i)
    if (!n) throw new EngineError(`no such node ${i}`)
    const name = n.name
    const refuse = (why: string): never => {
      throw bad(cmd, `"${name}" ${why}`)
    }
    const type = n.kind.type
    // A frame can't hold sections.
    if (
      type === 'section' &&
      toFrame &&
      n.children.some((c) => doc.node(c)?.kind.type === 'section')
    ) {
      refuse("holds sections, which can't go inside a frame: convert those first")
    }
    if (type === 'instance') refuse('is an instance: its layers come from its main component (detach it first)')
    if (type === 'component') refuse('is a main component, which stays a frame')
    if ((type === 'frame' || type === 'group') && owningInstance(doc, i) !== null) {
      refuse('is inside an instance: edit its main component, or detach the instance')
    }
    if (type === 'frame' && !toFrame && n.children.length === 0) {
      refuse('is empty: a group needs layers')
    }
    if ((type === 'frame' && !toFrame) || (type === 'group' && toFrame) || (type === 'section' && toFrame)) {
      todo.push(i)
      continue
    }
    if (type === 'frame' || type === 'group') continue
    refuse('is neither a frame nor a group')
  }
  for (const i of todo) {
    const n = doc.node_mut(i)
    if (!n) continue
    if (toFrame) {
      // The box as it is and nothing clipped, so the look stays: a group has
      // nothing painted, a section keeps its fill.
      if (n.kind.type === 'group') {
        n.fills = []
        n.strokes = []
      }
      n.kind = { type: 'frame' }
      n.clip = false
      continue
    }
    n.kind = { type: 'group' }
    n.layout = null
    n.clip = false
    n.overflow = 'none'
    n.fills = []
    n.strokes = []
    n.grids = []
    n.guides = []
    n.corners = Corners.default()
    delete n.styles.fill
    delete n.styles.stroke
    delete n.styles.grid
    // Variables bound to what went would bring it back.
    for (const k of Object.keys(n.bound)) {
      if (k !== 'opacity' && k !== 'visible') delete n.bound[k]
    }
    for (const k of n.children) {
      // Out of the flow there is nothing to fill or to be absolute against.
      const kn = doc.node_mut(k)
      if (kn) kn.child_layout.absolute = false
    }
    coherentSizing(doc, i)
    doc.fit_to_children(i)
  }
  return ok({ ids: todo })
}

/**
 * Frames on the page or in a section become sections in place (sections only
 * sit there).
 */
function convertToSection(
  s: Session,
  p: Record<string, unknown>
): Record<string, unknown> {
  const cmd = 'object.convertToSection'
  const ids = reqTargets(cmd, s, p)
  const doc = s.doc()
  const todo: NodeId[] = []
  for (const i of ids) {
    const n = doc.node(i)
    if (!n) throw new EngineError(`no such node ${i}`)
    const name = n.name
    const refuse = (why: string): never => {
      throw bad(cmd, `"${name}" ${why}`)
    }
    const parent = n.parent === null || n.parent === undefined ? null : doc.node(n.parent)
    const onBoard =
      parent !== null && (parent.kind.type === 'page' || parent.kind.type === 'section')
    const type = n.kind.type
    if (type === 'section') continue
    if (type === 'instance') refuse('is an instance: its layers come from its main component (detach it first)')
    if (type === 'component' || type === 'componentSet') {
      refuse('is a main component, which stays a frame')
    }
    if (type === 'frame' && !onBoard) {
      refuse('is inside a frame or group: only frames on the page or in a section become sections')
    }
    if (type !== 'frame') refuse('is not a frame')
    todo.push(i)
  }
  for (const i of todo) {
    const n = doc.node_mut(i)
    if (!n) continue
    n.kind = { type: 'section', contents_hidden: false }
    n.layout = null
    n.clip = false
    n.overflow = 'none'
    n.grids = []
    n.guides = []
    delete n.styles.grid
    for (const k of Object.keys(n.bound)) {
      if (LAYOUT_KEYS.has(k)) delete n.bound[k]
    }
    for (const k of n.children) {
      // Out of the flow there is nothing to fill or to be absolute against.
      const kn = doc.node_mut(k)
      if (kn) kn.child_layout.absolute = false
    }
    coherentSizing(doc, i)
  }
  return ok({ ids: todo })
}

export const STRUCTURE_EXTENDED_SPECS: CommandSpec[] = [
  spec(
    'object.convertToGroup',
    'Convert to group',
    '{ids?} (frames become groups in place, their layers staying where they are; what only a frame has goes: auto layout, fills, strokes, corner radius, clipping, layout grids, guides and scrolling. Groups are left alone; instances, main components, layers inside instances and empty frames are refused)',
    true,
    (s, p) => convert(s, p, 'object.convertToGroup', false)
  ),

  spec(
    'object.convertToFrame',
    'Convert to frame',
    '{ids?} (groups become frames of the same box in place, their layers staying where they are: no fill, not clipping; sections become frames that keep their fill and don\'t clip. Frames are left alone; instances, main components, layers inside instances and sections holding sections are refused)',
    true,
    (s, p) => convert(s, p, 'object.convertToFrame', true)
  ),

  spec(
    'object.convertToSection',
    'Convert to section',
    "{ids?} (frames on the page or in a section become sections in place, keeping their fill; auto layout, clipping, scrolling, layout grids and guides go. Frames inside a frame or group are refused: only frames on the page or in a section become sections, and so are instances and main components)",
    true,
    (s, p) => convertToSection(s, p)
  ),

  spec('object.wrapInSection', 'Wrap in new section', '{ids?, name?}', true, (s, p) => {
    const ids = reqTargets('object.wrapInSection', s, p)
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
    const ids = reqTargets('object.resizeToFit', s, p)
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
    const ids = reqTargets('object.mask', s, p)
    for (const id of ids) {
      const n = s.doc().node_mut(id)
      if (n) n.is_mask = true
    }
    return ok()
  }),

  spec('object.releaseMask', 'Release mask', '{ids?}', true, (s, p) => {
    const ids = reqTargets('object.releaseMask', s, p)
    for (const id of ids) {
      const n = s.doc().node_mut(id)
      if (n) n.is_mask = false
    }
    return ok()
  }),

  spec('object.flatten', 'Flatten selection', '{ids?}', true, (s, p) => {
    const ids = reqTargets('object.flatten', s, p)
    for (const id of ids) {
      const n = s.doc().node_mut(id)
      if (n) n.kind = { type: 'vector', network: null }
    }
    return ok()
  }),

  spec('object.outlineStroke', 'Outline stroke', '{ids?}', true, (s, p) => {
    const ids = reqTargets('object.outlineStroke', s, p)
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
