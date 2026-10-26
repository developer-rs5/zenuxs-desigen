/**
 * Developer mode, code generation, and annotations commands.
 * (Converted 1:1 from FigCraft `crates/engine/src/codegen.rs` and `devinspect.rs`.)
 */

import { ok, spec, type CommandSpec, type Session } from '../lib'

function reqTarget(s: Session, p: Record<string, unknown>): number {
  if (typeof p.id === 'number') return p.id
  if (Array.isArray(p.ids) && typeof p.ids[0] === 'number') return p.ids[0]
  const sel = s.ds().selection[0]
  if (typeof sel === 'number') return sel
  throw new Error('no node selected for dev inspection')
}

export const CODEGEN_SPECS: CommandSpec[] = [
  spec('dev.inspect', 'Inspect node properties for dev', '{id?}', false, (s, p) => {
    const id = reqTarget(s, p)
    const node = s.doc().node(id)
    if (!node) throw new Error(`node ${id} not found`)
    return ok({
      id: node.id,
      name: node.name,
      width: node.width,
      height: node.height,
      x: node.transform.coeffs[4],
      y: node.transform.coeffs[5],
      fills: node.fills,
      strokes: node.strokes,
      strokeWeight: node.stroke.weight,
      corners: node.corners,
      layout: node.layout
    })
  }),

  spec('dev.code.css', 'Generate CSS code', '{id?}', false, (s, p) => {
    const id = reqTarget(s, p)
    const node = s.doc().node(id)
    if (!node) throw new Error(`node ${id} not found`)
    const lines: string[] = [
      `/* ${node.name} */`,
      `width: ${node.width}px;`,
      `height: ${node.height}px;`
    ]
    if (node.fills[0]?.kind.type === 'solid') {
      const c = node.fills[0].kind.color
      lines.push(`background-color: rgba(${Math.round(c.r * 255)}, ${Math.round(c.g * 255)}, ${Math.round(c.b * 255)}, ${c.a});`)
    }
    if (node.corners?.radii[0]) {
      lines.push(`border-radius: ${node.corners.radii[0]}px;`)
    }
    return ok({ code: lines.join('\n'), format: 'css' })
  }),

  spec('dev.code.tailwind', 'Generate Tailwind CSS classes', '{id?}', false, (s, p) => {
    const id = reqTarget(s, p)
    const node = s.doc().node(id)
    if (!node) throw new Error(`node ${id} not found`)
    const classes: string[] = [`w-[${node.width}px]`, `h-[${node.height}px]`]
    if (node.layout?.mode === 'vertical') classes.push('flex', 'flex-col')
    else if (node.layout?.mode === 'horizontal') classes.push('flex', 'flex-row')
    if (node.layout?.gap) classes.push(`gap-[${node.layout.gap}px]`)
    if (node.corners?.radii[0]) classes.push(`rounded-[${node.corners.radii[0]}px]`)
    return ok({ classes: classes.join(' '), format: 'tailwind' })
  }),

  spec('dev.code.react', 'Generate React JSX snippet', '{id?}', false, (s, p) => {
    const id = reqTarget(s, p)
    const node = s.doc().node(id)
    if (!node) throw new Error(`node ${id} not found`)
    const jsx = `<div className="w-[${node.width}px] h-[${node.height}px]">\n  {/* ${node.name} */}\n</div>`
    return ok({ code: jsx, format: 'react' })
  }),

  spec('dev.code.swiftui', 'Generate SwiftUI view', '{id?}', false, (s, p) => {
    const id = reqTarget(s, p)
    const node = s.doc().node(id)
    if (!node) throw new Error(`node ${id} not found`)
    const swift = `// ${node.name}\nRectangle()\n    .frame(width: ${node.width}, height: ${node.height})`
    return ok({ code: swift, format: 'swiftui' })
  }),

  spec('dev.annotations.add', 'Add dev annotation', '{id?, category?, text}', true, (s, p) => {
    const id = reqTarget(s, p)
    const text = typeof p.text === 'string' ? p.text : ''
    const category = typeof p.category === 'string' ? p.category : 'development'
    const node = s.doc().node_mut(id)
    if (!node) throw new Error(`node ${id} not found`)
    node.exports ??= []
    return ok({ id, text, category })
  })
]
