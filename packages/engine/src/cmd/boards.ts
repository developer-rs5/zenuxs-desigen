/**
 * Boards Mode (Miro/FigJam-style Whiteboard):
 * Sticky notes, connectors, voting, stamps, and shared timer.
 */

import { Node, type NodeId } from '@zenuxs/doc'
import { Affine } from '@zenuxs/geom'
import { ok, spec, type CommandSpec } from '../lib'

export interface BoardTimerState {
  running: boolean
  endsAt: number | null
  totalSeconds: number
}

const timerState: BoardTimerState = {
  running: false,
  endsAt: null,
  totalSeconds: 0
}

const votesByNode = new Map<NodeId, number>()

const STICKY_COLORS: Record<string, { r: number; g: number; b: number; a: number }> = {
  yellow: { r: 1.0, g: 0.976, b: 0.694, a: 1.0 },
  pink: { r: 1.0, g: 0.82, b: 0.855, a: 1.0 },
  blue: { r: 0.816, g: 0.91, b: 1.0, a: 1.0 },
  green: { r: 0.831, g: 0.957, b: 0.867, a: 1.0 },
  orange: { r: 1.0, g: 0.886, b: 0.702, a: 1.0 },
  purple: { r: 0.918, g: 0.843, b: 1.0, a: 1.0 }
}

export const BOARD_SPECS: CommandSpec[] = [
  spec('board.sticky.create', 'Create sticky note', '{x?, y?, text?, color?}', true, (s, p) => {
    const ds = s.ds()
    const id = ds.doc.alloc_id()
    const colorKey = typeof p.color === 'string' ? p.color.toLowerCase() : 'yellow'
    const color = STICKY_COLORS[colorKey] ?? STICKY_COLORS.yellow
    const text = typeof p.text === 'string' ? p.text : 'Sticky Note'

    const sticky = Node.new(id, { type: 'frame' }, `Sticky: ${text.slice(0, 15)}`, 200, 200)
    sticky.parent = ds.page
    const x = typeof p.x === 'number' ? p.x : 0
    const y = typeof p.y === 'number' ? p.y : 0
    sticky.transform = Affine.new([1, 0, 0, 1, x, y])
    sticky.corners = { radii: [4, 4, 4, 4], smoothing: 0 }
    sticky.fills = [{ kind: { type: 'solid', color }, opacity: 1, visible: true, blend: 'normal' }]
    sticky.effects = [{
      type: 'dropShadow',
      color: { r: 0, g: 0, b: 0, a: 0.15 },
      offset: [0, 4],
      radius: 12,
      spread: 0,
      visible: true
    }]
    sticky.layout = {
      mode: 'vertical',
      padding: [16, 16, 16, 16],
      gap: 8,
      cross_gap: 0,
      main_align: 'center',
      cross_align: 'center',
      content_align: 'auto',
      grid_columns: 1,
      grid_rows: 1,
      column_tracks: [],
      row_tracks: [],
      wrap: false,
      strokes_included: false,
      reverse_z: false
    }

    // Add text child inside sticky note
    const textId = ds.doc.alloc_id()
    const textNode = Node.new(textId, { type: 'text', characters: text, style: null, runs: [] }, 'NoteText', 168, 168)
    textNode.parent = id
    textNode.fills = [{ kind: { type: 'solid', color: { r: 0.1, g: 0.1, b: 0.14, a: 1 } }, opacity: 1, visible: true, blend: 'normal' }]
    sticky.children.push(textId)

    ds.doc.insert(sticky)
    ds.doc.insert(textNode)

    const page = ds.doc.node_mut(ds.page)
    if (page) page.children.push(id)
    ds.selection = [id]

    return ok({ id, textId })
  }),

  spec('board.connector.create', 'Create connector line', '{from, to, style?}', true, (s, p) => {
    const ds = s.ds()
    const fromId = Number(p.from)
    const toId = Number(p.to)
    const fromNode = ds.doc.node(fromId)
    const toNode = ds.doc.node(toId)
    if (!fromNode || !toNode) throw new Error('invalid connector endpoints')

    const id = ds.doc.alloc_id()
    const connector = Node.new(id, { type: 'line' }, 'Connector', 100, 2)
    connector.parent = ds.page
    const startX = fromNode.transform.coeffs[4] + fromNode.width
    const startY = fromNode.transform.coeffs[5] + fromNode.height / 2
    connector.transform = Affine.new([1, 0, 0, 1, startX, startY])
    connector.strokes = [{ kind: { type: 'solid', color: { r: 0.2, g: 0.2, b: 0.25, a: 1 } }, opacity: 1, visible: true, blend: 'normal' }]
    connector.stroke.weight = 2

    ds.doc.insert(connector)
    const page = ds.doc.node_mut(ds.page)
    if (page) page.children.push(id)
    ds.selection = [id]

    return ok({ id, from: fromId, to: toId })
  }),

  spec('board.timer.start', 'Start board timer', '{seconds}', false, (_s, p) => {
    const seconds = Math.max(10, typeof p.seconds === 'number' ? p.seconds : 300)
    timerState.running = true
    timerState.totalSeconds = seconds
    timerState.endsAt = Date.now() + seconds * 1000
    return ok({ running: true, totalSeconds: seconds, remainingSeconds: seconds })
  }),

  spec('board.timer.stop', 'Stop board timer', '{}', false, () => {
    timerState.running = false
    timerState.endsAt = null
    return ok({ running: false })
  }),

  spec('board.timer.get', 'Get timer status', '{}', false, () => {
    const now = Date.now()
    const remaining = timerState.endsAt ? Math.max(0, Math.ceil((timerState.endsAt - now) / 1000)) : 0
    return ok({
      running: timerState.running && remaining > 0,
      totalSeconds: timerState.totalSeconds,
      remainingSeconds: remaining
    })
  }),

  spec('board.vote.cast', 'Cast vote on card', '{node_id}', false, (_s, p) => {
    const nodeId = Number(p.node_id)
    const count = (votesByNode.get(nodeId) ?? 0) + 1
    votesByNode.set(nodeId, count)
    return ok({ node_id: nodeId, votes: count })
  }),

  spec('board.vote.tally', 'Tally votes', '{}', false, () => {
    const results = Object.fromEntries(votesByNode.entries())
    return ok({ votes: results })
  })
]
