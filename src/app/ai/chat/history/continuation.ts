import type { ChatTransport, UIMessage } from 'ai'

/**
 * Some relay/model pairs re-mint the same tool-call id across turns (observed:
 * `call_27886` for both a `validate_prototype` and a later `viewport_zoom_to_fit`
 * call). Upstream providers reject a replayed history whose `tool_use` ids
 * collide (HTTP 400 INVALID_ARGUMENT), which poisons every later turn. Tool
 * results are derived from the same part, so rewriting the id on later
 * occurrences keeps the call/result pair consistent inside the request.
 */
function dedupeToolCallIds(messages: UIMessage[]): UIMessage[] {
  const seen = new Set<string>()
  return messages.map((message) => ({
    ...message,
    parts: message.parts.map((part) => {
      if (!('toolCallId' in part) || typeof part.toolCallId !== 'string') return part
      if (!seen.has(part.toolCallId)) {
        seen.add(part.toolCallId)
        return part
      }
      let candidate = `${part.toolCallId}-dedup`
      let counter = 2
      while (seen.has(candidate)) candidate = `${part.toolCallId}-dedup-${counter++}`
      seen.add(candidate)
      return { ...part, toolCallId: candidate }
    })
  }))
}

/** Preserve partial tool activity in history but omit unpaired calls from new requests. */
export function resumableTransport(transport: ChatTransport<UIMessage>): ChatTransport<UIMessage> {
  return {
    reconnectToStream: (options) => transport.reconnectToStream(options),
    sendMessages: (options) =>
      transport.sendMessages({
        ...options,
        messages: dedupeToolCallIds(
          options.messages
            .map((message) => ({
              ...message,
              parts: message.parts.filter(
                (part) =>
                  !('toolCallId' in part) ||
                  part.state === 'output-available' ||
                  part.state === 'output-error' ||
                  part.state === 'output-denied'
              )
            }))
            .filter((message) => message.parts.length > 0)
        )
      })
  }
}
