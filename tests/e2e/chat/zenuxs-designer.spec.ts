import { expect, test, useEditorSetupWithClear } from '#tests/e2e/fixtures'
import { ChatHarness } from '#tests/helpers/chat/harness'
import { injectZenuxsDesignerAIToolsTransport } from '#tests/helpers/prototype/zenuxs-ai-chat'

// § "prompt → playable design": one brief through the real chat UI must produce
// two screens, a reusable component with a second instance, a vector asset, and
// a Home → Details navigation that actually plays in the prototype player.
// Every step runs the production `zenuxs_*` ToolDefs via `createAITools`, so
// validation, layout, flashes, and undo entries are the live agent's path.
const editor = useEditorSetupWithClear('/demo')

const BRIEF =
  'Build a two-screen mobile welcome flow called Zenuxs with a reusable feature card.'
const FOLLOW_UP = 'Rename the headline on the home screen.'

interface NodeSummary {
  id: string
  name: string
  type: string
  x: number
  y: number
  width: number
  height: number
  cornerRadius: number
  fills: Array<{ color: { r: number; g: number; b: number; a: number } }>
  text?: string
  componentId?: string | null
  childIds: string[]
}

interface InteractionRecord {
  id: string
  trigger: string
  action: { type: string; destinationId?: string }
}

/** Every node on the current page, flattened depth-first. */
function readDocument() {
  return editor.page.evaluate(() => {
    const store = window.openPencil?.getStore?.()
    if (!store) throw new Error('OpenPencil store not initialized')
    const flattened: Array<Record<string, unknown>> = []
    const walk = (id: string): void => {
      const node = store.graph.getNode(id)
      if (!node) return
      flattened.push({
        id: node.id,
        name: node.name,
        type: node.type,
        x: node.x,
        y: node.y,
        width: node.width,
        height: node.height,
        cornerRadius: node.cornerRadius,
        fills: node.fills,
        text: node.text,
        componentId: node.componentId,
        childIds: node.childIds
      })
      for (const childId of node.childIds) walk(childId)
    }
    const page = store.graph.getNode(store.state.currentPageId)
    for (const childId of page?.childIds ?? []) walk(childId)
    return { nodes: flattened as unknown as NodeSummary[], total: store.graph.nodes.size }
  })
}

function readDataset(key: string) {
  return editor.page.evaluate(
    (name) => (document.documentElement.dataset as Record<string, string | undefined>)[name] ?? null,
    key
  )
}

async function readInteractions(nodeId: string) {
  return editor.page.evaluate((id) => {
    const store = window.openPencil?.getStore?.()
    if (!store) throw new Error('OpenPencil store not initialized')
    const node = store.graph.getNode(id)
    const entry = node?.pluginData.find(
      (item) => item.pluginId === 'open-pencil' && item.key === 'interactions'
    )
    if (!entry) return []
    return JSON.parse(entry.value) as Array<{
      id: string
      trigger: string
      action: { type: string; destinationId?: string }
    }>
  }, nodeId)
}

/**
 * Click a node inside the presentation surface. The player is a fixed overlay
 * above the canvas, so it owns its own geometry: the real DOM node it renders
 * for `nodeId` is the only reliable click target.
 */
async function clickInPlayer(nodeId: string) {
  const player = editor.page.getByTestId('prototype-player-root')
  const target = player.locator(`[data-node-id="${nodeId}"]`).first()
  await expect(target).toBeVisible()
  await target.click()
}

/**
 * Submit a prompt and return *its* assistant bubble. The chat page is shared by
 * every test in this file, so the transcript already holds earlier turns —
 * asserting on `.last()` would match a stale message and pass too early.
 */
async function submitTurn(harness: ChatHarness, text: string) {
  const messages = harness.page.getByTestId('chat-message-assistant')
  const before = await messages.count()
  await harness.submit(text)
  await expect(messages).toHaveCount(before + 1, { timeout: 30_000 })
  // The bubble appears while streaming; wait for the transport to finish so
  // assertions read the settled document, not a half-applied turn.
  await expect
    .poll(() => readDataset('zenuxsDesignFinishedTurn'), { timeout: 60_000 })
    .not.toBe('')
  return messages.nth(before)
}

async function configureProvider(harness: ChatHarness): Promise<void> {
  // The provider setup modal only exists before a model is configured. The
  // shared page keeps the saved provider across tests, so only set it up once.
  await harness.chatTab.click()
  const setup = harness.page.getByTestId('provider-setup-open-settings')
  if ((await setup.count()) > 0) {
    await harness.configureOpenRouter('sk-or-test-key-12345')
    return
  }
  await harness.input.waitFor({ timeout: 15_000 })
}

/** The player header names the screen it is currently showing. */
function expectPlayerScreen(name: string) {
  return expect(editor.page.getByTestId('prototype-player-root')).toContainText(
    `· ${name}`,
    { timeout: 15_000 }
  )
}

test('one design brief builds a playable two-screen flow through the real AI tools', async () => {
  test.setTimeout(120_000)
  const harness = new ChatHarness(editor.page)
  await injectZenuxsDesignerAIToolsTransport(editor.page)
  await configureProvider(harness)

  const before = await readDocument()
  const assistant = await submitTurn(harness, BRIEF)

  // The plan is streamed before any tool runs: the document is untouched at
  // that moment, which is exactly what "plan before mutations" means.
  await expect
    .poll(async () => readDataset('zenuxsDesignPlanNodeCount'), { timeout: 30_000 })
    .not.toBeNull()
  expect(await readDataset('zenuxsDesignPlanNodeCount')).toBe(
    await readDataset('zenuxsDesignPromptNodeCount')
  )

  // The agent plan and its warning about the refused call both surface in the
  // transcript, so the user sees what was and was not applied.
  await expect(assistant).toContainText('Plan:', { timeout: 30_000 })
  await expect(assistant).toContainText('Could not apply:', { timeout: 30_000 })
  expect(await readDataset('lastChatRequest')).toContain(BRIEF)

  // Visible results land in the real document.
  const built = await readDocument()
  expect(built.total).toBeGreaterThan(before.total)
  const byName = new Map(built.nodes.map((node) => [node.name, node]))
  const home = byName.get('Home')
  const details = byName.get('Details')
  expect(home?.type).toBe('FRAME')
  expect(details?.type).toBe('FRAME')
  expect(home).toMatchObject({ width: 390, height: 844, x: 0, y: 0 })
  expect(details).toMatchObject({ width: 390, height: 844, x: 420, y: 0 })
  expect(home?.cornerRadius).toBe(12)
  expect(home?.fills?.[0]?.color).toMatchObject({ r: 0.06, g: 0.06, b: 0.09 })

  // The card is a component and a second, independent instance repeats it.
  const card = built.nodes.find((node) => node.name === 'Card' && node.type === 'COMPONENT')
  expect(card).toMatchObject({ type: 'COMPONENT', width: 342, height: 180, cornerRadius: 16 })
  const instances = built.nodes.filter((node) => node.type === 'INSTANCE')
  expect(instances.length).toBeGreaterThanOrEqual(1)
  expect(instances[0]?.componentId).toBe(card?.id)
  // The instance is a sibling on the page, not a child of the component.
  expect(card?.childIds ?? []).not.toContain(instances[0]?.id)

  // The vector asset exists as authored geometry.
  const spark = byName.get('Spark')
  expect(spark?.type).toBe('VECTOR')
  const sparkNode = await editor.page.evaluate((id) => {
    const store = window.openPencil?.getStore?.()
    const node = id ? store?.graph.getNode(id) : null
    return { vertices: node?.vectorNetwork?.vertices.length ?? 0, closed: node?.vectorNetwork?.regions.length ?? 0 }
  }, spark?.id ?? null)
  expect(sparkNode.vertices).toBe(3)
  expect(sparkNode.closed).toBeGreaterThanOrEqual(1)

  // The heading is real text, not a rectangle.
  const title = byName.get('Title')
  expect(title).toMatchObject({ type: 'TEXT', text: 'Welcome to Zenuxs' })

  // Navigation resolves to the second screen — the refused attempt did not
  // overwrite it.
  expect(home).toBeDefined()
  const interactions = await readInteractions(home?.id ?? '')
  expect(interactions).toHaveLength(1)
  expect(interactions[0]).toMatchObject({
    trigger: 'click',
    action: { type: 'navigate', destinationId: details?.id }
  })

  // Undo the exact number of AI mutations this turn recorded.
  const checkpoint = Number(await readDataset('zenuxsDesignUndoCheckpoint'))
  const depth = Number(await readDataset('zenuxsDesignUndoDepth'))
  expect(depth).toBeGreaterThan(checkpoint)
  await editor.page.evaluate(
    ({ target }) => {
      const store = window.openPencil?.getStore?.()
      if (!store) throw new Error('OpenPencil store not initialized')
      store.undo.undoToDepth(target)
    },
    { target: checkpoint }
  )
  await editor.canvas.waitForRender()
  const reverted = await readDocument()
  expect(reverted.total).toBe(before.total)
  expect(reverted.nodes.map((node) => node.name)).not.toContain('Home')

  editor.canvas.assertNoErrors()
})

test('a follow-up brief edits the existing design instead of building a parallel one', async () => {
  test.setTimeout(120_000)
  const harness = new ChatHarness(editor.page)
  await injectZenuxsDesignerAIToolsTransport(editor.page)
  await configureProvider(harness)

  await submitTurn(harness, BRIEF)
  const afterFirstTurn = await readDocument()
  const home = afterFirstTurn.nodes.find((node) => node.name === 'Home')
  expect(home).toBeDefined()

  const followUp = await submitTurn(harness, FOLLOW_UP)
  await expect(followUp).toContainText('Renamed the Title text', { timeout: 30_000 })

  const afterFollowUp = await readDocument()
  // Same document, one node renamed: nothing was re-created.
  const titles = afterFollowUp.nodes.filter(
    (node) => node.name === 'Title' || node.name === 'Headline'
  )
  expect(titles).toHaveLength(1)
  expect(titles[0]?.name).toBe('Headline')
  expect(afterFollowUp.nodes.filter((node) => node.name === 'Home')).toHaveLength(1)
  expect(afterFollowUp.nodes.filter((node) => node.name === 'Details')).toHaveLength(1)
  expect(afterFollowUp.total).toBe(afterFirstTurn.total)

  // The follow-up is undoable on its own, leaving the first turn intact.
  await editor.page.keyboard.press('ControlOrMeta+z')
  await editor.canvas.waitForRender()
  const afterUndo = await readDocument()
  expect(afterUndo.nodes.filter((node) => node.name === 'Headline')).toHaveLength(0)
  expect(afterUndo.nodes.filter((node) => node.name === 'Title')).toHaveLength(1)
  expect(afterUndo.nodes.filter((node) => node.name === 'Home')).toHaveLength(1)

  editor.canvas.assertNoErrors()
})

test('the generated flow plays in the prototype player', async () => {
  test.setTimeout(120_000)
  const harness = new ChatHarness(editor.page)
  await injectZenuxsDesignerAIToolsTransport(editor.page)
  await configureProvider(harness)

  await submitTurn(harness, BRIEF)

  const document_ = await readDocument()
  const home = document_.nodes.find((node) => node.name === 'Home')
  const details = document_.nodes.find((node) => node.name === 'Details')
  expect(home).toBeDefined()
  expect(details).toBeDefined()
  await harness.designTab.click()
  await editor.canvas.waitForRender()

  const presentButton = editor.page
    .locator('[data-test-id="prototype-present-button"]')
    .first()
  await presentButton.click()
  const player = editor.page.getByTestId('prototype-player-root')
  await expect(player).toBeVisible()
  await expectPlayerScreen('Home')

  // Clicking the screen follows the authored interaction to the second frame.
  await clickInPlayer(home?.id ?? '')
  await expectPlayerScreen('Details')

  // The player overlay covers the toolbar, so it closes itself (Esc).
  await editor.page.keyboard.press('Escape')
  await expect(player).toBeHidden()
  await expect
    .poll(() =>
      editor.page.evaluate(() => window.openPencil?.getStore?.()?.state.prototypePresenterOpen)
    )
    .toBe(false)

  editor.canvas.assertNoErrors()
})
