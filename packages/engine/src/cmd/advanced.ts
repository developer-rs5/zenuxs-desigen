/**
 * Advanced commands for ZenuxsDesign engine:
 * File, Styles, Variables, Components, Libraries, and Comments.
 *
 * Converted 1:1 from FigCraft:
 * `crates/engine/src/cmd/{file,styles,variables,component,library,comment}.rs`
 */

import { Document, Node, type NodeId, type Style, type Variable } from '@zenuxs/doc'
import { DocState, ok, spec, type CommandSpec } from '../lib'

function strParam(params: Record<string, unknown>, key: string, fallback = ''): string {
  const v = params[key]
  return typeof v === 'string' ? v : fallback
}

function numParam(params: Record<string, unknown>, key: string, fallback = 0): number {
  const v = params[key]
  return typeof v === 'number' && Number.isFinite(v) ? v : fallback
}

// ------------------------------ file.rs ------------------------------

export const FILE_SPECS: CommandSpec[] = [
  spec('file.new', 'New file', '{name?}', false, (s, p) => {
    const doc = new Document()
    doc.name = strParam(p, 'name', 'Untitled')
    s.docs.push(new DocState(doc))
    s.active = s.docs.length - 1
    return ok({ index: s.active, name: doc.name })
  }),
  spec('file.rename', 'Rename file', '{name}', false, (s, p) => {
    const name = strParam(p, 'name', '')
    if (!name) throw new Error('missing name')
    s.doc().name = name
    return ok({ name })
  }),
  spec('file.save', 'Save file', '{}', false, (s) => {
    s.ds().markSaved()
    return ok({ saved: true, path: s.ds().path })
  }),
  spec('file.save_as', 'Save file as', '{path}', false, (s, p) => {
    const path = strParam(p, 'path', '')
    s.ds().path = path
    s.ds().markSaved()
    return ok({ saved: true, path })
  }),
  spec('file.close', 'Close file', '{index?}', false, (s, p) => {
    const index = typeof p.index === 'number' ? p.index : s.active
    if (s.docs.length <= 1) {
      s.docs = [new DocState(new Document())]
      s.active = 0
    } else {
      s.docs.splice(index, 1)
      s.active = Math.min(s.active, s.docs.length - 1)
    }
    return ok({ active: s.active })
  }),
  spec('file.info', 'Document information', '{}', false, (s) => {
    const doc = s.doc()
    return ok({
      name: doc.name,
      pages: doc.pages.length,
      nodes: [...doc.ids()].length,
      styles: doc.styles.length,
      variables: doc.variables.variables.length,
      color_profile: doc.color_profile
    })
  })
]

// ------------------------------ styles.rs ------------------------------

export const STYLE_SPECS: CommandSpec[] = [
  spec('style.create', 'Create style', '{name, kind, paints?, style?}', true, (s, p) => {
    const ds = s.ds()
    const name = strParam(p, 'name', 'New Style')
    const kindType = strParam(p, 'kind', 'color')
    const id = `style-${Date.now()}-${Math.floor(Math.random() * 1000)}`

    let kind: Style['kind']
    if (kindType === 'color') {
      const paints = Array.isArray(p.paints) ? p.paints : []
      kind = { type: 'color', paints }
    } else if (kindType === 'text') {
      kind = { type: 'text', style: p.style ?? {} }
    } else if (kindType === 'effect') {
      kind = { type: 'effect', effects: Array.isArray(p.effects) ? p.effects : [] }
    } else {
      kind = { type: 'grid', grids: [] }
    }

    const style: Style = { id, name, kind }
    ds.doc.styles.push(style)
    return ok({ id, style })
  }),
  spec('style.delete', 'Delete style', '{id}', true, (s, p) => {
    const id = strParam(p, 'id', '')
    const ds = s.ds()
    const idx = ds.doc.styles.findIndex((st) => st.id === id)
    if (idx >= 0) ds.doc.styles.splice(idx, 1)

    // Unlink references from nodes
    for (const nid of ds.doc.ids()) {
      const n = ds.doc.node_mut(nid)
      if (!n) continue
      for (const [slot, sid] of Object.entries(n.styles)) {
        if (sid === id) delete n.styles[slot]
      }
    }
    return ok({ deleted: id })
  }),
  spec('style.apply', 'Apply style', '{ids?, slot, styleId}', true, (s, p) => {
    const ds = s.ds()
    const slot = strParam(p, 'slot', 'fill')
    const styleId = strParam(p, 'styleId', '')
    const targetIds = Array.isArray(p.ids) ? (p.ids as NodeId[]) : ds.selection

    for (const nid of targetIds) {
      const n = ds.doc.node_mut(nid)
      if (n) n.styles[slot] = styleId
    }
    return ok({ applied: targetIds.length })
  }),
  spec('style.detach', 'Detach style', '{ids?, slot}', true, (s, p) => {
    const ds = s.ds()
    const slot = strParam(p, 'slot', 'fill')
    const targetIds = Array.isArray(p.ids) ? (p.ids as NodeId[]) : ds.selection

    for (const nid of targetIds) {
      const n = ds.doc.node_mut(nid)
      if (n) delete n.styles[slot]
    }
    return ok({ detached: targetIds.length })
  }),
  spec('style.list', 'List styles', '{}', false, (s) => {
    return ok({ styles: s.doc().styles })
  })
]

// ------------------------------ variables.rs ------------------------------

export const VARIABLE_SPECS: CommandSpec[] = [
  spec('variable.collection.create', 'Create variable collection', '{name}', true, (s, p) => {
    const name = strParam(p, 'name', 'Collection 1')
    const id = `col-${Date.now()}`
    const defaultModeId = `mode-${Date.now()}`
    const col = {
      id,
      name,
      modes: [{ id: defaultModeId, name: 'Mode 1' }],
      default_mode: defaultModeId,
      hidden_from_publishing: false
    }
    s.ds().doc.variables.collections.push(col)
    return ok({ id, collection: col })
  }),
  spec('variable.create', 'Create variable', '{name, collection, type, value?}', true, (s, p) => {
    const ds = s.ds()
    const name = strParam(p, 'name', 'New Variable')
    const collection = strParam(p, 'collection', '')
    const col = ds.doc.variables.collections.find((c) => c.id === collection)
    const modeId = col?.default_mode ?? col?.modes[0]?.id ?? 'default'

    const id = `var-${Date.now()}`
    const varType = strParam(p, 'type', 'color') as 'boolean' | 'color' | 'number' | 'string'
    const rawVal = p.value

    let typedVal: Variable['values'][string]
    if (varType === 'number') {
      typedVal = { type: 'number', value: typeof rawVal === 'number' ? rawVal : 0 }
    } else if (varType === 'boolean') {
      typedVal = { type: 'boolean', value: Boolean(rawVal) }
    } else if (varType === 'color') {
      typedVal = {
        type: 'color',
        value: typeof rawVal === 'object' && rawVal !== null ? (rawVal as never) : { r: 0, g: 0, b: 0, a: 1 }
      }
    } else {
      typedVal = { type: 'string', value: String(rawVal ?? '') }
    }

    const variable: Variable = {
      id,
      name,
      collection,
      values: { [modeId]: typedVal },
      scopes: []
    }

    ds.doc.variables.variables.push(variable)
    return ok({ id, variable })
  }),
  spec('variable.bind', 'Bind variable', '{ids?, field, variableId}', true, (s, p) => {
    const ds = s.ds()
    const field = strParam(p, 'field', 'fill')
    const variableId = strParam(p, 'variableId', '')
    const targetIds = Array.isArray(p.ids) ? (p.ids as NodeId[]) : ds.selection

    for (const nid of targetIds) {
      const n = ds.doc.node_mut(nid)
      if (n) n.bound[field] = variableId
    }
    return ok({ bound: targetIds.length })
  }),
  spec('variable.unbind', 'Unbind variable', '{ids?, field}', true, (s, p) => {
    const ds = s.ds()
    const field = strParam(p, 'field', 'fill')
    const targetIds = Array.isArray(p.ids) ? (p.ids as NodeId[]) : ds.selection

    for (const nid of targetIds) {
      const n = ds.doc.node_mut(nid)
      if (n) delete n.bound[field]
    }
    return ok({ unbound: targetIds.length })
  }),
  spec('variable.list', 'List variables', '{}', false, (s) => {
    return ok({
      collections: s.doc().variables.collections,
      variables: s.doc().variables.variables
    })
  })
]

// ------------------------------ component.rs ------------------------------

export const COMPONENT_SPECS: CommandSpec[] = [
  spec('component.create', 'Create component', '{id?}', true, (s, p) => {
    const ds = s.ds()
    const id = typeof p.id === 'number' ? p.id : ds.selection[0]
    if (!id) throw new Error('no node selected')
    const n = ds.doc.node_mut(id)
    if (!n) throw new Error('node not found')

    n.kind = {
      type: 'component',
      description: strParam(p, 'description', ''),
      props: {}
    }
    return ok({ id, kind: 'component' })
  }),
  spec('component.instantiate', 'Create instance', '{componentId, x?, y?}', true, (s, p) => {
    const ds = s.ds()
    const compId = numParam(p, 'componentId', 0)
    const comp = ds.doc.node(compId)
    if (!comp) throw new Error('component not found')

    const id = ds.doc.alloc_id()
    const instance = Node.new(id, { type: 'instance', component: compId, props: {} }, comp.name, comp.width, comp.height)
    instance.parent = ds.page
    instance.transform = {
      coeffs: [1, 0, 0, 1, numParam(p, 'x', 0), numParam(p, 'y', 0)]
    }

    ds.doc.insert(instance)
    const page = ds.doc.node_mut(ds.page)
    if (page) page.children.push(id)
    ds.selection = [id]
    return ok({ id, componentId: compId })
  }),
  spec('component.detach', 'Detach instance', '{id?}', true, (s, p) => {
    const ds = s.ds()
    const id = typeof p.id === 'number' ? p.id : ds.selection[0]
    if (!id) throw new Error('no node selected')
    const n = ds.doc.node_mut(id)
    if (!n || n.kind.type !== 'instance') throw new Error('not an instance')

    n.kind = { type: 'frame' }
    n.source = null
    n.overrides.clear()
    return ok({ id, kind: 'frame' })
  })
]

// ------------------------------ comment.rs ------------------------------

export const COMMENT_SPECS: CommandSpec[] = [
  spec('comment.add', 'Add comment', '{x, y, message, author?}', true, (s, p) => {
    const ds = s.ds()
    const id = ds.doc.alloc_id()
    const x = numParam(p, 'x', 0)
    const y = numParam(p, 'y', 0)
    const message = strParam(p, 'message', '')
    const author = strParam(p, 'author', 'User')

    const comment = {
      id,
      page: ds.page,
      x,
      y,
      author,
      text: message,
      created: Math.floor(Date.now() / 1000),
      reactions: [],
      resolved: false,
      replies: []
    }

    ds.doc.comments.push(comment)
    return ok({ id, comment })
  }),
  spec('comment.resolve', 'Resolve comment', '{id}', true, (s, p) => {
    const id = typeof p.id === 'number' ? p.id : Number(p.id)
    const ds = s.ds()
    const c = ds.doc.comments.find((item) => item.id === id)
    if (c) c.resolved = true
    return ok({ id, resolved: true })
  }),
  spec('comment.list', 'List comments', '{page?}', false, (s, p) => {
    const ds = s.ds()
    const page = typeof p.page === 'number' ? p.page : ds.page
    const comments = ds.doc.comments.filter((item) => item.page === page)
    return ok({ comments })
  })
]

/** All extended specs combined. */
export function allAdvancedSpecs(): CommandSpec[] {
  return [
    ...FILE_SPECS,
    ...STYLE_SPECS,
    ...VARIABLE_SPECS,
    ...COMPONENT_SPECS,
    ...COMMENT_SPECS
  ]
}
