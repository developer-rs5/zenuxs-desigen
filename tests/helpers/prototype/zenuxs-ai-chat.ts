import type { Page } from '@playwright/test'

type Call = { toolName: string; args: Record<string, unknown>; output: unknown }

/**
 * Replace the chat transport with a scripted designer that runs the *real*
 * `zenuxs_*` ToolDefs plus the core `create_instance` ToolDef through
 * `createAITools`. No LLM key exists here, so the model's decision is derived
 * from the prompt text — but validation, engine execution, layout, flashes,
 * prototype validation, and undo entries are the live agent's code path.
 *
 * The plan text streams *before* the tools run, so the transcript order and the
 * published node counts prove the plan was visible while the document was still
 * untouched.
 */
export async function injectZenuxsDesignerAIToolsTransport(page: Page): Promise<void> {
  await page.evaluate(() => {
    const api = window.openPencil
    if (!api?.setChatTransport) throw new Error('Transport override not available')
    let counter = 0

    api.setChatTransport(() => ({
      async sendMessages({
        messages
      }: {
        messages: Array<{ role: string; parts: Array<{ type: string; text?: string }> }>
      }) {
        const userTexts = messages
          .filter((message) => message.role === 'user')
          .map((message) => message.parts.find((part) => part.type === 'text')?.text ?? '')
          .filter((text) => text.length > 0)
        const text = userTexts[userTexts.length - 1] ?? ''
        const messageId = `zenuxs-ai-${++counter}`
        // Routed prompts append the skill block; the scripted turns answer what
        // the designer typed, so match on the display text only.
        const marker = '[Design skills activated for this request]'
        const markerIndex = text.lastIndexOf(marker)
        const normalized = (markerIndex === -1 ? text : text.slice(0, markerIndex))
          .trim()
          .toLowerCase()
        document.documentElement.dataset.lastChatRequest = text
        document.documentElement.dataset.chatTurnCount = String(userTexts.length)
        document.documentElement.dataset.chatHistory = JSON.stringify(userTexts)
        // Cleared on submit, set once every tool and the summary have streamed.
        document.documentElement.dataset.zenuxsDesignFinishedTurn = ''

        const store = api.getStore?.()
        if (!store) throw new Error('OpenPencil store not initialized')
        document.documentElement.dataset.zenuxsDesignPromptNodeCount = String(
          store.graph.nodes.size
        )
        document.documentElement.dataset.zenuxsDesignUndoCheckpoint = String(store.undo.depth)

        const toolsPath = '/src/app/ai/tools/index.ts'
        const toolsModule = await import(toolsPath)
        const tools = await toolsModule.createAITools(store)

        const calls: Call[] = []
        const run = async (toolName: string, args: Record<string, unknown>): Promise<unknown> => {
          const tool = tools[toolName] as
            | { execute?: (input: Record<string, unknown>) => Promise<unknown> }
            | undefined
          if (!tool?.execute) throw new Error(`Unknown tool: ${toolName}`)
          const output = await tool.execute(args)
          calls.push({ toolName, args, output })
          return output
        }
        const toolError = (output: unknown): string | undefined =>
          (output as { error?: string } | null)?.error
        /** A throwing tool is still a reportable agent step, not a transport crash. */
        const attempt = async (
          toolName: string,
          args: Record<string, unknown>
        ): Promise<unknown> => {
          try {
            return await run(toolName, args)
          } catch (error) {
            const message = error instanceof Error ? error.message : String(error)
            const output = { error: message }
            calls.push({ toolName, args, output })
            return output
          }
        }

        /** Find a node by exact name anywhere on the current page. */
        const findByName = (name: string): { id: string; name: string } | undefined => {
          const walk = (id: string): { id: string; name: string } | undefined => {
            const node = store.graph.getNode(id)
            if (!node) return undefined
            if (node.name === name) return { id: node.id, name: node.name }
            for (const childId of node.childIds) {
              const hit = walk(childId)
              if (hit) return hit
            }
            return undefined
          }
          const canvasPage = store.graph.getNode(store.state.currentPageId)
          for (const childId of canvasPage?.childIds ?? []) {
            const hit = walk(childId)
            if (hit) return hit
          }
          return undefined
        }

        interface Turn {
          keys: string[]
          plan: string
          act: () => Promise<string>
        }

        const turns: Turn[] = [
          {
            // Turn 1: the brief builds the whole slice — screens, component,
            // repeated instance, vector asset, text, paint, and the flow.
            keys: ['welcome'],
            plan: [
              'Plan:',
              '1. Two mobile screens — Home and Details (390×844).',
              '2. A reusable Card component placed on Home plus a second instance.',
              '3. A closed Spark vector as the brand mark, and a Title heading.',
              '4. Home → Details navigation so the flow is playable, then validate it.'
            ].join('\n'),
            act: async () => {
              await run('zenuxs_create_screen', {
                name: 'Home',
                x: 0,
                y: 0,
                width: 390,
                height: 844,
                cornerRadius: 12
              })
              await run('zenuxs_create_screen', {
                name: 'Details',
                x: 420,
                y: 0,
                width: 390,
                height: 844,
                cornerRadius: 12
              })
              await run('zenuxs_create_rectangle', {
                name: 'Card',
                x: 24,
                y: 120,
                width: 342,
                height: 180,
                cornerRadius: 16
              })
              const card = findByName('Card')
              if (!card) return 'I could not find the card I just created.'
              await run('zenuxs_make_component', { id: card.id, description: 'Feature card' })
              await run('create_instance', { component_id: card.id, x: 24, y: 320 })
              await run('zenuxs_create_vector', {
                name: 'Spark',
                points: [
                  [0, 0],
                  [40, 0],
                  [20, 36]
                ],
                closed: true
              })
              await run('zenuxs_create_text', {
                name: 'Title',
                x: 24,
                y: 48,
                characters: 'Welcome to Zenuxs',
                fontSize: 28
              })
              const home = findByName('Home')
              if (home) {
                await run('zenuxs_set_node_properties', {
                  id: home.id,
                  fills: [{ type: 'SOLID', color: { r: 0.06, g: 0.06, b: 0.09, a: 1 } }]
                })
              }
              const details = findByName('Details')
              const source = findByName('Home')
              if (!source || !details) return 'I could not find both screens to connect.'
              await run('zenuxs_add_navigation', {
                sourceId: source.id,
                destinationFrameId: details.id
              })
              // A destination that is not a frame must be refused, not guessed.
              const rejected = toolError(
                await attempt('zenuxs_add_navigation', {
                  sourceId: source.id,
                  destinationFrameId: card.id
                })
              )
              return rejected
                ? `Built Home and Details with a Card component, a Spark mark, and Home → Details navigation. Could not apply: ${rejected}`
                : 'Built Home and Details, but the invalid navigation was accepted.'
            }
          },
          {
            // Turn 2: follow-up edits the existing document — it must find the
            // text node the first turn created, not build a parallel one.
            keys: ['headline'],
            plan: 'Plan: rename the existing Title text to Headline on the Home screen.',
            act: async () => {
              const title = findByName('Title')
              if (!title) return 'I could not find the Title text in the document.'
              const err = toolError(
                await run('zenuxs_set_node_properties', { id: title.id, name: 'Headline' })
              )
              return err ? `Could not apply: ${err}` : 'Renamed the Title text to Headline.'
            }
          }
        ]

        const turn = turns.find((candidate) =>
          candidate.keys.every((key) => normalized.includes(key))
        )
        const plan = turn?.plan ?? 'I did not change anything for that request.'

        document.documentElement.dataset.aiToolOutput = JSON.stringify(
          calls.map((call) => call.output)
        )

        return new ReadableStream({
          async start(controller) {
            controller.enqueue({ type: 'start', messageId })
            controller.enqueue({ type: 'text-start', id: 'text-plan' })
            controller.enqueue({ type: 'text-delta', id: 'text-plan', delta: plan })
            controller.enqueue({ type: 'text-end', id: 'text-plan' })
            // Snapshot taken here: the plan is already streamed, the tools have
            // not run. Equal to the pre-prompt count proves "plan before edits".
            document.documentElement.dataset.zenuxsDesignPlanNodeCount = String(
              store.graph.nodes.size
            )

            const summary = turn ? await turn.act() : ''

            calls.forEach((call, index) => {
              const toolCallId = `call-${messageId}-${index}`
              controller.enqueue({
                type: 'tool-input-start',
                toolCallId,
                toolName: call.toolName
              })
              controller.enqueue({
                type: 'tool-input-available',
                toolCallId,
                toolName: call.toolName,
                input: call.args
              })
              controller.enqueue({
                type: 'tool-output-available',
                toolCallId,
                toolName: call.toolName,
                output: call.output
              })
            })

            document.documentElement.dataset.aiToolOutput = JSON.stringify(
              calls.map((call) => call.output)
            )
            document.documentElement.dataset.zenuxsDesignUndoDepth = String(store.undo.depth)

            controller.enqueue({ type: 'text-start', id: 'text-summary' })
            controller.enqueue({ type: 'text-delta', id: 'text-summary', delta: summary })
            controller.enqueue({ type: 'text-end', id: 'text-summary' })
            controller.enqueue({ type: 'finish', finishReason: 'stop' })
            controller.close()
            // Only now is the turn fully applied; tests poll this to know the
            // transcript stopped streaming and every tool has finished.
            document.documentElement.dataset.zenuxsDesignFinishedTurn = messageId
          }
        })
      },
      async reconnectToStream() {
        return null
      }
    }))
  })
}
