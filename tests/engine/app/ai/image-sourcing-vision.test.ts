import { describe, expect, test } from 'bun:test'

import { parseVerdictText } from '@/app/ai/image-sourcing/vision'

const VERDICT = {
  approved: true,
  relevanceScore: 0.86,
  matchedRequirements: ['subject', 'style'],
  failedRequirements: [],
  reason: 'The image shows roasted beans in a cooling tray.'
}

describe('parseVerdictText', () => {
  test('reads a plain JSON verdict', () => {
    expect(parseVerdictText(JSON.stringify(VERDICT))).toEqual(VERDICT)
  })

  test('reads a verdict wrapped in a code fence and prose', () => {
    const answer = `Here is my verdict:\n\`\`\`json\n${JSON.stringify(VERDICT, null, 2)}\n\`\`\`\nDone.`
    expect(parseVerdictText(answer)).toEqual(VERDICT)
  })

  test('keeps braces that appear inside a string', () => {
    const verdict = { ...VERDICT, reason: 'It matches the {roastery} brief.' }
    expect(parseVerdictText(`Verdict: ${JSON.stringify(verdict)}`)).toEqual(verdict)
  })

  test('fails when the model answered without JSON', () => {
    expect(() => parseVerdictText('The image looks good to me.')).toThrow(
      'did not answer with a JSON verdict'
    )
  })

  test('fails on malformed JSON', () => {
    expect(() => parseVerdictText('{"approved": true,')).toThrow(
      'did not answer with a JSON verdict'
    )
    expect(() => parseVerdictText('{"approved": tru}')).toThrow('malformed JSON')
  })

  test('fails when a field is missing or out of range', () => {
    expect(() =>
      parseVerdictText(
        JSON.stringify({
          approved: true,
          relevanceScore: 0.9,
          matchedRequirements: [],
          reason: 'fine'
        })
      )
    ).toThrow('incomplete')

    expect(() => parseVerdictText(JSON.stringify({ ...VERDICT, relevanceScore: 2 }))).toThrow(
      'incomplete'
    )

    expect(() => parseVerdictText(JSON.stringify({ ...VERDICT, approved: 'yes' }))).toThrow(
      'incomplete'
    )
  })
})
