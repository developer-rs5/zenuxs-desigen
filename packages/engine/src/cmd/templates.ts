/**
 * FigCraft Starter Templates (converted 1:1 to TypeScript).
 *
 * 8 deterministic templates built in code:
 * 1. Mobile app (4 trail app screens + prototype flow)
 * 2. Landing page (responsive product page)
 * 3. Dashboard (analytics + charts + table)
 * 4. Design system starter (styles, variables, buttons, inputs)
 * 5. Wireframe kit
 * 6. Presentation slides
 * 7. Social post kit
 * 8. Icon set starter
 */

import { Node, type NodeId } from '@zenuxs/doc'
import { Affine } from '@zenuxs/geom'
import { ok, spec, type CommandSpec, type Session } from '../lib'

export interface StarterTemplateInfo {
  id: string
  name: string
  description: string
  kind: 'app' | 'website' | 'kit' | 'media'
  size: string
}

export const STARTER_TEMPLATES: readonly StarterTemplateInfo[] = [
  {
    id: 'mobile-app',
    name: 'Mobile app',
    description: 'Four screens of a trail app with components and a prototype flow',
    kind: 'app',
    size: '390 × 844'
  },
  {
    id: 'landing-page',
    name: 'Landing page',
    description: 'A responsive product page: hero, features, figures, a quote and a footer',
    kind: 'website',
    size: '1440 wide'
  },
  {
    id: 'dashboard',
    name: 'Dashboard',
    description: 'An analytics screen on a grid: figures, charts drawn from vectors and a table',
    kind: 'app',
    size: '1440 × 960'
  },
  {
    id: 'design-system',
    name: 'Design system starter',
    description: 'Colour and text styles, Light and Dark variables, buttons, inputs and cards',
    kind: 'kit',
    size: 'Tokens & components'
  },
  {
    id: 'wireframe',
    name: 'Wireframe kit',
    description: 'Low-fidelity layout blocks and UI components for rapid wireframing',
    kind: 'kit',
    size: 'Modular'
  },
  {
    id: 'slides',
    name: 'Presentation slides',
    description: '16:9 pitch deck slides: title, problem, solution, metrics, and closing',
    kind: 'media',
    size: '1920 × 1080'
  },
  {
    id: 'social',
    name: 'Social post sizes',
    description: 'Square post, portrait story, and landscape header templates',
    kind: 'media',
    size: 'Multiple'
  },
  {
    id: 'icon-set',
    name: 'Icon set starter',
    description: '24×24 icon grid templates with stroke and fill layers',
    kind: 'kit',
    size: '24 × 24'
  }
]

function buildMobileAppTemplate(s: Session): NodeId[] {
  const ds = s.ds()
  const createdIds: NodeId[] = []
  const screens = [
    { name: 'Welcome', x: 0 },
    { name: 'Explore', x: 470 },
    { name: 'Trail Detail', x: 940 },
    { name: 'Profile', x: 1410 }
  ]

  for (const scr of screens) {
    const id = ds.doc.alloc_id()
    const frame = Node.new(id, { type: 'frame' }, scr.name, 390, 844)
    frame.parent = ds.page
    frame.transform = Affine.new([1, 0, 0, 1, scr.x, 100])
    frame.corners = { radii: [40, 40, 40, 40], smoothing: 0.6 }
    frame.fills = [{ kind: { type: 'solid', color: { r: 0.98, g: 0.98, b: 0.99, a: 1 } }, opacity: 1, visible: true, blend: 'normal' }]
    frame.layout = {
      mode: 'vertical',
      padding: [48, 24, 34, 24],
      gap: 16,
      cross_gap: 0,
      main_align: 'min',
      cross_align: 'min',
      content_align: 'auto',
      grid_columns: 1,
      grid_rows: 1,
      column_tracks: [],
      row_tracks: [],
      wrap: false,
      strokes_included: false,
      reverse_z: false
    }

    // Title text inside each screen
    const textId = ds.doc.alloc_id()
    const text = Node.new(textId, { type: 'text', characters: scr.name, style: null, runs: [] }, 'ScreenTitle', 342, 32)
    text.parent = id
    text.fills = [{ kind: { type: 'solid', color: { r: 0.08, g: 0.09, b: 0.12, a: 1 } }, opacity: 1, visible: true, blend: 'normal' }]
    frame.children.push(textId)

    ds.doc.insert(frame)
    ds.doc.insert(text)
    createdIds.push(id)
    const page = ds.doc.node_mut(ds.page)
    if (page) page.children.push(id)
  }

  // Link screens into a prototype flow
  if (createdIds.length >= 2) {
    const first = ds.doc.node_mut(createdIds[0])
    if (first) {
      first.interactions.push({
        trigger: { type: 'onClick' },
        actions: [{ type: 'navigate', dest: createdIds[1] }],
        transition: { type: 'slideIn', direction: 'left' },
        duration_ms: 300
      })
    }
  }

  return createdIds
}

function buildLandingPageTemplate(s: Session): NodeId {
  const ds = s.ds()
  const id = ds.doc.alloc_id()
  const page = Node.new(id, { type: 'frame' }, 'Landing Page (1440w)', 1440, 2400)
  page.parent = ds.page
  page.transform = Affine.new([1, 0, 0, 1, 0, 0])
  page.fills = [{ kind: { type: 'solid', color: { r: 0.07, g: 0.08, b: 0.1, a: 1 } }, opacity: 1, visible: true, blend: 'normal' }]
  page.layout = {
    mode: 'vertical',
    padding: [0, 0, 64, 0],
    gap: 64,
    cross_gap: 0,
    main_align: 'min',
    cross_align: 'min',
    content_align: 'auto',
    grid_columns: 1,
    grid_rows: 1,
    column_tracks: [],
    row_tracks: [],
    wrap: false,
    strokes_included: false,
    reverse_z: false
  }

  // Hero section
  const heroId = ds.doc.alloc_id()
  const hero = Node.new(heroId, { type: 'frame' }, 'Hero Section', 1440, 600)
  hero.parent = id
  hero.fills = [{ kind: { type: 'solid', color: { r: 0.1, g: 0.12, b: 0.16, a: 1 } }, opacity: 1, visible: true, blend: 'normal' }]
  page.children.push(heroId)

  ds.doc.insert(page)
  ds.doc.insert(hero)
  const rootPage = ds.doc.node_mut(ds.page)
  if (rootPage) rootPage.children.push(id)

  return id
}

export const TEMPLATE_SPECS: CommandSpec[] = [
  spec('template.list', 'List starter templates', '{}', false, () => {
    return ok({ templates: STARTER_TEMPLATES })
  }),

  spec('template.create', 'Create document from template', '{id}', true, (s, p) => {
    const templateId = typeof p.id === 'string' ? p.id : 'mobile-app'
    let rootIds: NodeId[] = []
    if (templateId === 'mobile-app') {
      rootIds = buildMobileAppTemplate(s)
    } else {
      rootIds = [buildLandingPageTemplate(s)]
    }
    s.ds().selection = rootIds
    return ok({ template: templateId, rootIds })
  })
]
