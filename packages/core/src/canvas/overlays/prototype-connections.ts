import type { Canvas } from 'canvaskit-wasm'

import type { SceneGraph } from '@open-pencil/scene-graph'
import { readNodeInteractions } from '@open-pencil/scene-graph'
import type { Rect, Vector } from '@open-pencil/scene-graph/primitives'

import type { SkiaRenderer } from '../renderer'

export interface PrototypeNoodle {
  sourceId: string
  interactionIndex: number
  destinationId: string
  points: [Vector, Vector, Vector, Vector]
}

export interface PrototypeConnectionsOverlay {
  active: boolean
  selectedNodeId?: string | null
  activeDrag?: {
    sourceId: string
    currentPoint: Vector
  } | null
}

/**
 * Computes a smooth cubic bezier curve between source and destination rectangles.
 * Ported from FigCraft's `curve_between`.
 */
export function computeNoodleCurve(source: Rect, dest: Rect): [Vector, Vector, Vector, Vector] {
  const srcCenterX = source.x + source.width / 2
  const destCenterX = dest.x + dest.width / 2
  const right = destCenterX >= srcCenterX

  const p0: Vector = right
    ? { x: source.x + source.width, y: source.y + source.height / 2 }
    : { x: source.x, y: source.y + source.height / 2 }

  const p3: Vector = right
    ? { x: dest.x, y: dest.y + dest.height / 2 }
    : { x: dest.x + dest.width, y: dest.y + dest.height / 2 }

  const s = right ? 1.0 : -1.0
  const dx = Math.max(Math.abs(p3.x - p0.x) * 0.5, 40.0) * s

  const p1: Vector = { x: p0.x + dx, y: p0.y }
  const p2: Vector = { x: p3.x - dx, y: p3.y }

  return [p0, p1, p2, p3]
}

export function sampleCubicBezier(p: [Vector, Vector, Vector, Vector], t: number): Vector {
  const u = 1.0 - t
  const w0 = u * u * u
  const w1 = 3.0 * u * u * t
  const w2 = 3.0 * u * t * t
  const w3 = t * t * t
  return {
    x: w0 * p[0].x + w1 * p[1].x + w2 * p[2].x + w3 * p[3].x,
    y: w0 * p[0].y + w1 * p[1].y + w2 * p[2].y + w3 * p[3].y
  }
}

/**
 * Renders prototype connection noodles, arrows, and interactive drag handles
 * onto the canvas using CanvasKit Skia paths.
 */
export function drawPrototypeConnections(
  r: SkiaRenderer,
  canvas: Canvas,
  graph: SceneGraph,
  overlay: PrototypeConnectionsOverlay
): void {
  if (!overlay.active) return
  const ck = r.ck

  const noodlePaint = new ck.Paint()
  noodlePaint.setStyle(ck.PaintStyle.Stroke)
  noodlePaint.setStrokeWidth(2 / r.zoom)
  noodlePaint.setColor(ck.Color(0x3b, 0x82, 0xf6, 0.85)) // Vibrant Blue #3B82F6
  noodlePaint.setAntiAlias(true)

  const selectedNoodlePaint = new ck.Paint()
  selectedNoodlePaint.setStyle(ck.PaintStyle.Stroke)
  selectedNoodlePaint.setStrokeWidth(2.5 / r.zoom)
  selectedNoodlePaint.setColor(ck.Color(0x97, 0x47, 0xff, 1.0)) // Purple Accent #9747FF
  selectedNoodlePaint.setAntiAlias(true)

  const arrowPaint = new ck.Paint()
  arrowPaint.setStyle(ck.PaintStyle.Fill)
  arrowPaint.setColor(ck.Color(0x3b, 0x82, 0xf6, 0.95))
  arrowPaint.setAntiAlias(true)

  const handleFillPaint = new ck.Paint()
  handleFillPaint.setStyle(ck.PaintStyle.Fill)
  handleFillPaint.setColor(ck.Color(0xff, 0xff, 0xff, 1.0))
  handleFillPaint.setAntiAlias(true)

  const handleStrokePaint = new ck.Paint()
  handleStrokePaint.setStyle(ck.PaintStyle.Stroke)
  handleStrokePaint.setStrokeWidth(1.5 / r.zoom)
  handleStrokePaint.setColor(ck.Color(0x25, 0x63, 0xeb, 1.0))
  handleStrokePaint.setAntiAlias(true)

  try {
    // 1. Draw existing connection noodles on the page
    for (const node of graph.nodes.values()) {
      if (!node.visible) continue
      const interactions = readNodeInteractions(node)
      if (interactions.length === 0) continue

      const sourceRect: Rect = { x: node.x, y: node.y, width: node.width, height: node.height }

      for (let i = 0; i < interactions.length; i++) {
        const it = interactions[i]
        const destId =
          it.action.type === 'navigate'
            ? it.action.destinationId
            : it.action.type === 'openOverlay'
              ? it.action.overlayId
              : null
        if (!destId) continue

        const destNode = graph.getNode(destId)
        if (!destNode || !destNode.visible) continue

        const destRect: Rect = {
          x: destNode.x,
          y: destNode.y,
          width: destNode.width,
          height: destNode.height
        }
        const pts = computeNoodleCurve(sourceRect, destRect)

        const builder = new ck.PathBuilder()
        builder.moveTo(pts[0].x, pts[0].y)
        builder.cubicTo(pts[1].x, pts[1].y, pts[2].x, pts[2].y, pts[3].x, pts[3].y)
        const path = builder.detachAndDelete()

        const isSelected = overlay.selectedNodeId === node.id
        canvas.drawPath(path, isSelected ? selectedNoodlePaint : noodlePaint)
        path.delete()

        // Draw arrowhead at destination point
        const tip = pts[3]
        const near = sampleCubicBezier(pts, 0.9)
        const dx = tip.x - near.x
        const dy = tip.y - near.y
        const len = Math.hypot(dx, dy) || 1
        const ux = dx / len
        const uy = dy / len
        const nx = -uy
        const ny = ux

        const arrowLen = 8 / r.zoom
        const arrowSpread = 4.5 / r.zoom

        const arrowBuilder = new ck.PathBuilder()
        arrowBuilder.moveTo(tip.x, tip.y)
        arrowBuilder.lineTo(
          tip.x - arrowLen * ux + arrowSpread * nx,
          tip.y - arrowLen * uy + arrowSpread * ny
        )
        arrowBuilder.lineTo(
          tip.x - arrowLen * ux - arrowSpread * nx,
          tip.y - arrowLen * uy - arrowSpread * ny
        )
        arrowBuilder.close()
        const arrowPath = arrowBuilder.detachAndDelete()
        canvas.drawPath(arrowPath, arrowPaint)
        arrowPath.delete()
      }
    }

    // 2. Draw active connection drag if currently dragging a handle
    if (overlay.activeDrag) {
      const src = graph.getNode(overlay.activeDrag.sourceId)
      if (src) {
        const sourceRect: Rect = { x: src.x, y: src.y, width: src.width, height: src.height }
        const destRect: Rect = {
          x: overlay.activeDrag.currentPoint.x - 1,
          y: overlay.activeDrag.currentPoint.y - 1,
          width: 2,
          height: 2
        }
        const pts = computeNoodleCurve(sourceRect, destRect)
        const builder = new ck.PathBuilder()
        builder.moveTo(pts[0].x, pts[0].y)
        builder.cubicTo(pts[1].x, pts[1].y, pts[2].x, pts[2].y, pts[3].x, pts[3].y)
        const path = builder.detachAndDelete()
        canvas.drawPath(path, selectedNoodlePaint)
        path.delete()
      }
    }

    // 3. Draw connection '+' handle on the selected layer
    if (overlay.selectedNodeId) {
      const sel = graph.getNode(overlay.selectedNodeId)
      if (sel && sel.type !== 'CANVAS') {
        const handleX = sel.x + sel.width + 11 / r.zoom
        const handleY = sel.y + sel.height / 2
        const handleR = 7 / r.zoom

        canvas.drawCircle(handleX, handleY, handleR, handleFillPaint)
        canvas.drawCircle(handleX, handleY, handleR, handleStrokePaint)

        // Draw '+' symbol inside handle
        const arm = 3.5 / r.zoom
        canvas.drawLine(handleX - arm, handleY, handleX + arm, handleY, handleStrokePaint)
        canvas.drawLine(handleX, handleY - arm, handleX, handleY + arm, handleStrokePaint)
      }
    }
  } finally {
    noodlePaint.delete()
    selectedNoodlePaint.delete()
    arrowPaint.delete()
    handleFillPaint.delete()
    handleStrokePaint.delete()
  }
}
