import { describe, expect, test } from 'bun:test'

import type { Color, Fill, Stroke } from '@open-pencil/scene-graph'

import { expectDefined } from '#tests/helpers/assert'
import { getTool, setupToolTest, type ToolResult } from '#tests/helpers/tools'

const NAVY: Color = { r: 2 / 255, g: 26 / 255, b: 59 / 255, a: 1 }

const HIDDEN_STROKE: Stroke = {
  color: { r: 1, g: 0, b: 0, a: 1 },
  weight: 4,
  opacity: 1,
  visible: false,
  align: 'CENTER',
  cap: 'NONE',
  join: 'MITER'
}

const VISIBLE_STROKE: Stroke = {
  color: NAVY,
  weight: 10.126,
  opacity: 1,
  visible: true,
  align: 'CENTER',
  cap: 'NONE',
  join: 'MITER'
}

interface ChildSummary {
  summary: string
}

function setupStrokedChild() {
  const { figma, graph } = setupToolTest()
  const frame = figma.createFrame()
  frame.name = 'Outline'
  frame.resize(200, 200)

  const outline = figma.createRectangle()
  outline.resize(100, 4)
  frame.appendChild(outline)
  graph.updateNode(outline.id, {
    fills: [],
    strokes: [HIDDEN_STROKE, VISIBLE_STROKE]
  })

  return { figma, frameId: frame.id, outlineId: outline.id }
}

describe('describe stroke summaries', () => {
  test('reports the first visible stroke in a child summary', () => {
    const { figma, frameId } = setupStrokedChild()
    const result = getTool('describe').execute(figma, { id: frameId }) as ToolResult
    const children = result.children as ChildSummary[]
    const summary = expectDefined(children[0], 'stroked child summary').summary

    expect(summary).toContain('#021A3B 10.13px stroke')
  })

  test('reports the first visible stroke in the node visual summary', () => {
    const { figma, outlineId } = setupStrokedChild()
    const result = getTool('describe').execute(figma, { id: outlineId }) as ToolResult

    expect(result.visual).toContain('#021A3B 10.13px stroke')
  })
})

interface IssueSummary {
  severity?: string
  message: string
  suggestion?: string
}

type ToolContext = ReturnType<typeof setupToolTest>

function issuesOf(figma: ToolContext['figma'], nodeId: string): IssueSummary[] {
  const result = getTool('describe').execute(figma, { id: nodeId }) as ToolResult
  return (result.issues ?? []) as IssueSummary[]
}

function matching(issues: IssueSummary[], needle: string): IssueSummary | undefined {
  return issues.find((issue) => issue.message.includes(needle))
}

/** Authors a default click → closeOverlay interaction (no target needed). */
function makeInteractive(figma: ToolContext['figma'], nodeId: string): void {
  const created = getTool('create_interaction').execute(figma, {
    node_id: nodeId,
    action: 'closeOverlay'
  }) as ToolResult
  expect(created.error).toBeUndefined()
}

function solidFills(color: Color, opacity = 1): Fill[] {
  return [{ type: 'SOLID', color, opacity, visible: true }]
}

const BLACK: Color = { r: 0, g: 0, b: 0, a: 1 }
const WHITE: Color = { r: 1, g: 1, b: 1, a: 1 }
/** #999 — passes the distance heuristic, fails WCAG AA on white. */
const SMOKE: Color = { r: 0.6, g: 0.6, b: 0.6, a: 1 }
const CHARCOAL: Color = { r: 0.33, g: 0.33, b: 0.33, a: 1 }

describe('describe accessibility issues (spec §55, audit §4.20)', () => {
  test('flags an interactive target below 44×44 as a warning', () => {
    const { figma } = setupToolTest()
    const home = figma.createFrame()
    home.name = 'Home'
    const tiny = figma.createRectangle()
    tiny.name = 'Icon Button'
    tiny.resize(40, 20)
    home.appendChild(tiny)
    makeInteractive(figma, tiny.id)

    const issue = matching(issuesOf(figma, tiny.id), 'touch target minimum')
    expect(issue).toBeDefined()
    expect(issue?.message).toContain('Icon Button')
    expect(issue?.message).toContain('40×20')
    expect(issue?.message).toContain('44×44')
    expect(issue?.severity).toBe('warning')
  })

  test('leaves an interactive 44×44 target alone', () => {
    const { figma } = setupToolTest()
    const button = figma.createRectangle()
    button.name = 'Save'
    button.resize(44, 44)
    makeInteractive(figma, button.id)

    expect(matching(issuesOf(figma, button.id), 'touch target minimum')).toBeUndefined()
  })

  test('flags an interaction-bearing text node with no visible text', () => {
    const { figma } = setupToolTest()
    const card = figma.createFrame()
    card.name = 'Card'
    const label = figma.createText()
    label.name = 'Label'
    label.characters = ''
    card.appendChild(label)
    makeInteractive(figma, label.id)

    const issue = matching(issuesOf(figma, label.id), 'no visible text')
    expect(issue).toBeDefined()
    expect(issue?.message).toContain('Label')
    expect(issue?.severity).toBe('warning')
  })

  test('leaves labelled interactive text alone', () => {
    const { figma } = setupToolTest()
    const card = figma.createFrame()
    card.name = 'Card'
    const label = figma.createText()
    label.name = 'Label'
    label.characters = 'Save'
    card.appendChild(label)
    makeInteractive(figma, label.id)

    expect(matching(issuesOf(figma, label.id), 'no visible text')).toBeUndefined()
  })
})

describe('describe text contrast issues (spec §55)', () => {
  function setupLabelledCard(cardFills: Fill[], textFills: Fill[]) {
    const { figma, graph } = setupToolTest()
    const card = figma.createFrame()
    card.name = 'Card'
    card.resize(200, 120)
    graph.updateNode(card.id, { fills: cardFills })
    const label = figma.createText()
    label.name = 'Caption'
    label.characters = 'Muted caption'
    card.appendChild(label)
    graph.updateNode(label.id, { fills: textFills })
    return { figma, labelId: label.id }
  }

  function lowContrast(figma: ToolContext['figma'], labelId: string): IssueSummary[] {
    return issuesOf(figma, labelId).filter((issue) => issue.message.includes('Low contrast'))
  }

  test('reports translucent text that flattens below WCAG AA', () => {
    const { figma, labelId } = setupLabelledCard(solidFills(WHITE), solidFills(CHARCOAL, 0.25))

    const issue = matching(issuesOf(figma, labelId), 'WCAG AA')
    expect(issue).toBeDefined()
    expect(issue?.message).toContain('4.5:1')
    expect(issue?.severity).toBe('warning')
    // The raw fill alone would pass; the flattened paint is what is read.
    expect(matching(issuesOf(figma, labelId), '(distance')).toBeUndefined()
  })

  test('reports solid text that is too light against its fill', () => {
    const { figma, labelId } = setupLabelledCard(solidFills(WHITE), solidFills(SMOKE))

    const issue = matching(issuesOf(figma, labelId), 'WCAG AA')
    expect(issue).toBeDefined()
    expect(issue?.severity).toBe('warning')
  })

  test('stays quiet for readable solid text', () => {
    const { figma, labelId } = setupLabelledCard(solidFills(WHITE), solidFills(BLACK))

    expect(lowContrast(figma, labelId)).toEqual([])
  })

  test('measures no contrast against an image background', () => {
    const imageFill: Fill[] = [
      {
        type: 'IMAGE',
        color: BLACK,
        opacity: 1,
        visible: true,
        imageHash: 'img-1',
        imageScaleMode: 'FILL'
      }
    ]
    const { figma, labelId } = setupLabelledCard(imageFill, solidFills(WHITE))

    expect(lowContrast(figma, labelId)).toEqual([])
  })
})
