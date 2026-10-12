import {
  readNodeInteractions,
  readNodeStateModel,
  readPrototypeDocument,
  type SceneGraph,
  type SceneNode
} from '@open-pencil/scene-graph'

/**
 * Reference-based evaluation (spec2 §48/§49): compares a real document
 * against expected structural/behavioral facts. Never compares serialized
 * bytes — node ids are nondeterministic, so every expectation matches on
 * names, types, and counts.
 */

export interface ReferenceInteraction {
  /** Screen/node name the interaction is authored on (optional). */
  from?: string
  /** Destination screen/node name for navigate/openOverlay actions. */
  to?: string
  trigger?: string
  action?: string
  transition?: string
}

export interface ReferenceState {
  node: string
  states: string[]
  initial?: string
}

export interface ReferenceExpectations {
  /** Minimum top-level frames/components on any page. */
  minScreens?: number
  /** Screen (frame/component) names that must exist — order-free. */
  screenNames?: string[]
  interactions?: ReferenceInteraction[]
  states?: ReferenceState[]
  /** Transition kinds that must appear on at least one interaction. */
  transitionKinds?: string[]
  /** Prototype flow start screen name. */
  flowStart?: string
}

export interface ReferenceIssue {
  dimension: string
  expected: string
  actual: string
}

export interface ReferenceReport {
  ok: boolean
  checked: number
  issues: ReferenceIssue[]
}

function nameOf(graph: SceneGraph, id: string): string {
  return graph.getNode(id)?.name ?? id
}

function screenNodes(graph: SceneGraph): SceneNode[] {
  const result: SceneNode[] = []
  for (const page of graph.getPages()) {
    for (const childId of page.childIds) {
      const node = graph.getNode(childId)
      if (node && (node.type === 'FRAME' || node.type === 'COMPONENT')) result.push(node)
    }
  }
  return result
}

type InteractionAction = ReturnType<typeof readNodeInteractions>[number]['action']

/** Destination screen name for navigate/openOverlay actions; null otherwise. */
function actionDestinationName(graph: SceneGraph, action: InteractionAction): string | null {
  if (action.type === 'navigate') return nameOf(graph, action.destinationId)
  if (action.type === 'openOverlay') return nameOf(graph, action.overlayId)
  return null
}

function interactionRecords(graph: SceneGraph) {
  type Record = {
    from: string
    to: string | null
    trigger: string
    action: string
    transition: string | null
  }
  const records: Record[] = []
  const collect = (node: SceneNode): void => {
    for (const interaction of readNodeInteractions(node)) {
      const action = interaction.action
      records.push({
        from: node.name,
        to: actionDestinationName(graph, action),
        trigger: interaction.trigger,
        action: action.type,
        transition: interaction.transition?.kind ?? null
      })
    }
  }
  for (const node of screenNodes(graph)) {
    collect(node)
    // Interactions also live on descendants (buttons inside screens).
    for (const childId of node.childIds) {
      const child = graph.getNode(childId)
      if (child) collect(child)
    }
  }
  return records
}

function matchesRecord(
  expected: ReferenceInteraction,
  actual: ReturnType<typeof interactionRecords>[number]
): boolean {
  if (expected.from !== undefined && expected.from !== actual.from) return false
  if (expected.to !== undefined && expected.to !== actual.to) return false
  if (expected.trigger !== undefined && expected.trigger !== actual.trigger) return false
  if (expected.action !== undefined && expected.action !== actual.action) return false
  if (expected.transition !== undefined && expected.transition !== actual.transition) return false
  return true
}

interface CheckOutcome {
  checked: number
  issues: ReferenceIssue[]
}

function checkScreens(expected: ReferenceExpectations, screens: SceneNode[]): CheckOutcome {
  const issues: ReferenceIssue[] = []
  if (expected.minScreens === undefined || screens.length >= expected.minScreens) {
    return { checked: expected.minScreens === undefined ? 0 : 1, issues }
  }
  issues.push({
    dimension: 'screens',
    expected: `≥ ${expected.minScreens} screens`,
    actual: `${screens.length}`
  })
  return { checked: 1, issues }
}

function checkScreenNames(expected: ReferenceExpectations, screens: SceneNode[]): CheckOutcome {
  if (!expected.screenNames) return { checked: 0, issues: [] }
  const names = new Set(screens.map((node) => node.name))
  const issues: ReferenceIssue[] = []
  for (const wanted of expected.screenNames) {
    if (!names.has(wanted)) {
      issues.push({ dimension: 'screenNames', expected: wanted, actual: [...names].join(', ') })
    }
  }
  return { checked: expected.screenNames.length, issues }
}

function checkInteractions(
  expected: ReferenceExpectations,
  records: ReturnType<typeof interactionRecords>
): CheckOutcome {
  const wanted = expected.interactions ?? []
  const issues: ReferenceIssue[] = []
  for (const interaction of wanted) {
    if (!records.some((record) => matchesRecord(interaction, record))) {
      issues.push({
        dimension: 'interactions',
        expected: JSON.stringify(interaction),
        actual: records.length === 0 ? 'none' : JSON.stringify(records)
      })
    }
  }
  return { checked: wanted.length, issues }
}

function checkTransitionKinds(
  expected: ReferenceExpectations,
  records: ReturnType<typeof interactionRecords>
): CheckOutcome {
  if (!expected.transitionKinds) return { checked: 0, issues: [] }
  const kinds = new Set(records.map((record) => record.transition).filter((k) => k !== null))
  const issues: ReferenceIssue[] = []
  for (const wanted of expected.transitionKinds) {
    if (!kinds.has(wanted)) {
      issues.push({
        dimension: 'transitions',
        expected: wanted,
        actual: kinds.size === 0 ? 'none' : [...kinds].join(', ')
      })
    }
  }
  return { checked: expected.transitionKinds.length, issues }
}

function checkStates(
  expected: ReferenceExpectations,
  graph: SceneGraph,
  screens: SceneNode[]
): CheckOutcome {
  const wantedStates = expected.states ?? []
  const issues: ReferenceIssue[] = []
  for (const wanted of wantedStates) {
    const owner = screens.find(
      (node) =>
        node.name === wanted.node ||
        node.childIds.some((id) => graph.getNode(id)?.name === wanted.node)
    )
    const target =
      owner?.name === wanted.node
        ? owner
        : owner?.childIds.map((id) => graph.getNode(id)).find((n) => n?.name === wanted.node)
    const model = target ? readNodeStateModel(target) : null
    if (!model) {
      issues.push({ dimension: 'states', expected: wanted.node, actual: 'no state model' })
      continue
    }
    const have = new Set(model.states.map((state) => state.name))
    for (const stateName of wanted.states) {
      if (!have.has(stateName)) {
        issues.push({
          dimension: 'states',
          expected: `${wanted.node}: ${stateName}`,
          actual: [...have].join(', ')
        })
      }
    }
    if (wanted.initial !== undefined && model.initial !== wanted.initial) {
      issues.push({
        dimension: 'states.initial',
        expected: `${wanted.node}: ${wanted.initial}`,
        actual: model.initial
      })
    }
  }
  return { checked: wantedStates.length, issues }
}

function checkFlowStart(expected: ReferenceExpectations, graph: SceneGraph): CheckOutcome {
  if (expected.flowStart === undefined) return { checked: 0, issues: [] }
  const root = graph.getNode(graph.rootId)
  const doc = root ? readPrototypeDocument(root) : null
  const startName = doc?.flows[0] ? nameOf(graph, doc.flows[0].startNodeId) : null
  if (startName === expected.flowStart) return { checked: 1, issues: [] }
  return {
    checked: 1,
    issues: [
      { dimension: 'flowStart', expected: expected.flowStart, actual: startName ?? 'no flow' }
    ]
  }
}

export function evaluateAgainstReference(
  graph: SceneGraph,
  expected: ReferenceExpectations
): ReferenceReport {
  const screens = screenNodes(graph)
  const records = interactionRecords(graph)
  const outcomes = [
    checkScreens(expected, screens),
    checkScreenNames(expected, screens),
    checkInteractions(expected, records),
    checkTransitionKinds(expected, records),
    checkStates(expected, graph, screens),
    checkFlowStart(expected, graph)
  ]
  const issues = outcomes.flatMap((outcome) => outcome.issues)
  const checked = outcomes.reduce((total, outcome) => total + outcome.checked, 0)
  return { ok: issues.length === 0, checked, issues }
}
