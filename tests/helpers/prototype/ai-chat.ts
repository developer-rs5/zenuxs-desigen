import type { Page } from '@playwright/test'

type Call = { toolName: string; args: Record<string, unknown>; output: unknown }

/**
 * Replace the chat transport with one that runs the *real* prototype ToolDefs
 * (spec §26: "ask AI to modify it"). No LLM key is available in this
 * environment, so the model's decision is scripted from the prompt text, but
 * tool execution goes through `createAITools` — the same validation, mutation,
 * undo, and flash path the live agent uses.
 */
export async function injectPrototypeAIToolsTransport(page: Page): Promise<void> {
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
        const lastUser = [...messages].reverse().find((message) => message.role === 'user')
        const text = lastUser?.parts?.find((part) => part.type === 'text')?.text ?? ''
        const messageId = `proto-ai-${++counter}`
        const normalized = text.toLowerCase()
        document.documentElement.dataset.lastChatRequest = text

        const store = api.getStore?.()
        if (!store) throw new Error('OpenPencil store not initialized')

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
        const readInteractionId = (value: string): string | undefined => {
          try {
            const parsed = JSON.parse(value) as Array<{ id?: string }>
            return parsed[0]?.id
          } catch {
            // garbage pluginData — treat as absent
            return undefined
          }
        }

        // Locate the node that owns prototype interactions (for transitions).
        const findInteractionNode = (): { nodeId: string; interactionId: string } | undefined => {
          const canvasPage = store.graph.getNode(store.state.currentPageId)
          for (const id of canvasPage?.childIds ?? []) {
            const node = store.graph.getNode(id)
            const entry = node?.pluginData.find(
              (e) => e.pluginId === 'open-pencil' && e.key === 'interactions'
            )
            if (!entry) continue
            const interactionId = readInteractionId(entry.value)
            if (interactionId) return { nodeId: id, interactionId }
          }
          return undefined
        }

        /** Scripted model decision, split from the transport plumbing. */
        const scriptReply = async (): Promise<string> => {
          const interaction = findInteractionNode()
          if (normalized.includes('wobble') || normalized.includes('invalid')) {
            if (!interaction) return 'No change was needed.'
            const err = toolError(
              await run('set_interaction_transition', {
                node_id: interaction.nodeId,
                interaction_id: interaction.interactionId,
                transition: 'wobble'
              })
            )
            return err ? `Could not apply: ${err}` : 'Unexpected success.'
          }
          if (normalized.includes('loading')) {
            const selectedId = [...store.state.selectedIds][0]
            if (!selectedId) return 'No change was needed.'
            for (const stateName of ['loading', 'success', 'error']) {
              await run('create_state', { node_id: selectedId, state_name: stateName })
            }
            return 'Added states: loading, success, error.'
          }
          if (normalized.includes('slide')) {
            if (!interaction) return 'No change was needed.'
            const err = toolError(
              await run('set_interaction_transition', {
                node_id: interaction.nodeId,
                interaction_id: interaction.interactionId,
                transition: 'slide',
                direction: 'up',
                duration_ms: 400
              })
            )
            return err ? `Could not apply: ${err}` : 'Updated the transition to a slide.'
          }
          return 'I did not change anything for that request.'
        }

        const response = await scriptReply()

        document.documentElement.dataset.aiToolOutput = JSON.stringify(
          calls.map((call) => call.output)
        )

        return new ReadableStream({
          start(controller) {
            controller.enqueue({ type: 'start', messageId })
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
            controller.enqueue({ type: 'text-start', id: 'text-1' })
            controller.enqueue({ type: 'text-delta', id: 'text-1', delta: response })
            controller.enqueue({ type: 'text-end', id: 'text-1' })
            controller.enqueue({ type: 'finish', finishReason: 'stop' })
            controller.close()
          }
        })
      },
      async reconnectToStream() {
        return null
      }
    }))
  })
}

/**
 * Scripted model that answers a bottom-sheet request with the REAL
 * `create_bottom_sheet` ToolDef through `createAITools` — one undo entry,
 * layout pass, flash, and validation, exactly like the live agent path.
 * The trigger is the current canvas selection; the sheet is the top-level
 * frame named "Sheet".
 */
export async function injectBottomSheetAIToolsTransport(page: Page): Promise<void> {
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
        const lastUser = [...messages].reverse().find((message) => message.role === 'user')
        const text = lastUser?.parts?.find((part) => part.type === 'text')?.text ?? ''
        const messageId = `sheet-ai-${++counter}`
        const normalized = text.toLowerCase()
        document.documentElement.dataset.lastChatRequest = text

        const store = api.getStore?.()
        if (!store) throw new Error('OpenPencil store not initialized')

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

        /** Top-level frame named "Sheet" on the current page. */
        const findSheet = (): string | undefined => {
          const canvasPage = store.graph.getNode(store.state.currentPageId)
          for (const id of canvasPage?.childIds ?? []) {
            const node = store.graph.getNode(id)
            if (node?.type === 'FRAME' && node.name === 'Sheet') return id
          }
          return undefined
        }

        /** Scripted model decision, split from the transport plumbing. */
        const scriptReply = async (): Promise<string> => {
          if (!normalized.includes('bottom sheet')) return 'No change was needed.'
          const sheetId = findSheet()
          const selectedId = [...store.state.selectedIds][0]
          if (!sheetId || !selectedId) {
            return 'I could not find a Sheet frame and a selected trigger.'
          }
          const err = toolError(
            await run('create_bottom_sheet', {
              sheet_id: sheetId,
              trigger_node_id: selectedId
            })
          )
          return err ? `Could not apply: ${err}` : 'Created the bottom sheet with a backdrop.'
        }

        const response = await scriptReply()

        document.documentElement.dataset.aiToolOutput = JSON.stringify(
          calls.map((call) => call.output)
        )

        return new ReadableStream({
          start(controller) {
            controller.enqueue({ type: 'start', messageId })
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
            controller.enqueue({ type: 'text-start', id: 'text-1' })
            controller.enqueue({ type: 'text-delta', id: 'text-1', delta: response })
            controller.enqueue({ type: 'text-end', id: 'text-1' })
            controller.enqueue({ type: 'finish', finishReason: 'stop' })
            controller.close()
          }
        })
      },
      async reconnectToStream() {
        return null
      }
    }))
  })
}

/**
 * Scripted model for the lifecycle journeys (spec2 §50 create → save → reopen
 * → modify; §51 second-turn continuity). Every turn runs the REAL ToolDefs
 * through `createAITools`, and later turns resolve targets from the live
 * document — so a turn that says "the card" only works if the document still
 * holds what the previous turn built. The full message history the transport
 * receives is recorded for assertions.
 */
export async function injectLifecycleAIToolsTransport(page: Page): Promise<void> {
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
        const messageId = `lifecycle-ai-${++counter}`
        // Routed prompts carry the skill block inside modelText; the scripted
        // turns answer what the user typed, so match on the display text.
        // Routed prompts carry the skill block inside modelText; strip it the
        // same way presentation does (no module import — this runs per request).
        const marker = '[Design skills activated for this request]'
        const markerIndex = text.lastIndexOf(marker)
        const normalized = (markerIndex === -1 ? text : text.slice(0, markerIndex))
          .trim()
          .toLowerCase()
        document.documentElement.dataset.lastChatRequest = text
        document.documentElement.dataset.chatTurnCount = String(userTexts.length)
        document.documentElement.dataset.chatHistory = JSON.stringify(userTexts)

        const store = api.getStore?.()
        if (!store) throw new Error('OpenPencil store not initialized')

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
        const readInteractionId = (value: string): string | undefined => {
          try {
            const parsed = JSON.parse(value) as Array<{ id?: string }>
            return parsed[0]?.id
          } catch {
            // garbage pluginData — treat as absent
            return undefined
          }
        }

        /** Find a node by exact name anywhere on the current page. */
        const findByName = (name: string): { id: string; name: string } | undefined => {
          const canvasPage = store.graph.getNode(store.state.currentPageId)
          let found: { id: string; name: string } | undefined
          const walk = (id: string): void => {
            if (found) return
            const node = store.graph.getNode(id)
            if (!node) return
            if (node.name === name) {
              found = { id: node.id, name: node.name }
              return
            }
            for (const childId of node.childIds) walk(childId)
          }
          for (const childId of canvasPage?.childIds ?? []) walk(childId)
          return found
        }

        /** First interaction on a node, parsed from pluginData. */
        const firstInteraction = (nodeId: string): { id: string; nodeId: string } | undefined => {
          const node = store.graph.getNode(nodeId)
          const entry = node?.pluginData.find(
            (e) => e.pluginId === 'open-pencil' && e.key === 'interactions'
          )
          if (!entry) return undefined
          const id = readInteractionId(entry.value)
          return id ? { id, nodeId } : undefined
        }

        /**
         * Scripted turns in match order: each turn declares the keywords it
         * answers, the first fully-matching turn runs.
         */
        const scriptReply = async (): Promise<string> => {
          const turns: Array<{ keys: string[]; handle: () => Promise<string> }> = [
            {
              // Turn 1: build the base document (AI chat exposes `render`, JSX).
              keys: ['dashboard', 'card'],
              handle: async () => {
                await run('render', {
                  x: 40,
                  y: 40,
                  jsx: '<Frame name="Dashboard" w={640} h={420} bg="#101014"><Rectangle name="Card" x={40} y={40} w={220} h={140} bg="#2b6cb0" /></Frame>'
                })
                return 'Created a dashboard with a card inside it.'
              }
            },
            {
              // Turn 2: "make the card interactive" — resolves the card from turn 1.
              keys: ['interactive'],
              handle: async () => {
                const card = findByName('Card')
                if (!card) return 'I could not find a card in the document.'
                await run('create_state', { node_id: card.id, state_name: 'default' })
                await run('create_state', { node_id: card.id, state_name: 'pressed' })
                await run('set_state_visual', {
                  node_id: card.id,
                  state_name: 'pressed',
                  scale: 0.97
                })
                await run('create_interaction', {
                  node_id: card.id,
                  trigger: 'press',
                  action: 'setState',
                  state: 'pressed'
                })
                return 'The card now has pressed feedback.'
              }
            },
            {
              // Turn 3: "animate the card" — targets turn 2's interaction.
              keys: ['animate'],
              handle: async () => {
                const card = findByName('Card')
                const interaction = card ? firstInteraction(card.id) : undefined
                if (!card || !interaction) return 'There is no interaction to animate yet.'
                const err = toolError(
                  await run('set_interaction_transition', {
                    node_id: card.id,
                    interaction_id: interaction.id,
                    transition: 'spring',
                    spring_bounce: 0.4,
                    duration_ms: 350
                  })
                )
                return err ? `Could not apply: ${err}` : 'The press now springs back.'
              }
            },
            {
              // Turn 4: "change the mobile behavior" — responsive layout change.
              keys: ['mobile'],
              handle: async () => {
                const dashboard = findByName('Dashboard')
                if (!dashboard) return 'I could not find the dashboard.'
                const err = toolError(
                  await run('set_layout', {
                    id: dashboard.id,
                    direction: 'VERTICAL',
                    spacing: 16,
                    padding: 16
                  })
                )
                return err
                  ? `Could not apply: ${err}`
                  : 'The dashboard stacks vertically for mobile.'
              }
            },
            {
              // Post-reopen modify: change the transition on the existing flow.
              keys: ['slide'],
              handle: async () => {
                const card = findByName('Card')
                const interaction = card ? firstInteraction(card.id) : undefined
                if (!card || !interaction) return 'There is no interaction to update.'
                const err = toolError(
                  await run('set_interaction_transition', {
                    node_id: card.id,
                    interaction_id: interaction.id,
                    transition: 'slide',
                    direction: 'up',
                    duration_ms: 400
                  })
                )
                return err ? `Could not apply: ${err}` : 'Changed the transition to a slide.'
              }
            },
            {
              keys: ['validate'],
              handle: async () => {
                const output = (await run('validate_prototype', {})) as {
                  ok?: boolean
                  errors?: string[]
                } | null
                if (output?.ok === true) return 'Validation passed: the prototype is executable.'
                return `Validation failed: ${(output?.errors ?? []).join(', ')}`
              }
            }
          ]
          const turn = turns.find((candidate) =>
            candidate.keys.every((key) => normalized.includes(key))
          )
          return turn ? await turn.handle() : 'No change was needed.'
        }

        const response = await scriptReply()

        document.documentElement.dataset.aiToolOutput = JSON.stringify(
          calls.map((call) => call.output)
        )

        return new ReadableStream({
          start(controller) {
            controller.enqueue({ type: 'start', messageId })
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
            controller.enqueue({ type: 'text-start', id: 'text-1' })
            controller.enqueue({ type: 'text-delta', id: 'text-1', delta: response })
            controller.enqueue({ type: 'text-end', id: 'text-1' })
            controller.enqueue({ type: 'finish', finishReason: 'stop' })
            controller.close()
          }
        })
      },
      async reconnectToStream() {
        return null
      }
    }))
  })
}
