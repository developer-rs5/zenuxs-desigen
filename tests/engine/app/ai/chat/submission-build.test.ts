import { describe, expect, test } from 'bun:test'

import { SKILL_CONTEXT_MARKER, stripSkillContext } from '@open-pencil/core/skills'

import { appendReferencedNodeContext, type ReferencedNode } from '@/app/ai/chat/context'
import { buildTextSubmission } from '@/app/ai/chat/submission/build'

function referencedNode(id: string, name: string): ReferencedNode {
  return { id, name, type: 'TEXT' }
}

describe('buildTextSubmission (spec §9, §19)', () => {
  test('routes slash commands into modelText while displayText stays raw', () => {
    const submission = buildTextSubmission('/bottom-sheet turn this into a sheet')
    expect(submission.displayText).toBe('/bottom-sheet turn this into a sheet')
    expect(submission.modelText).toContain(SKILL_CONTEXT_MARKER)
    expect(submission.modelText).toContain('### prototype.bottom-sheet')
    expect(submission.modelText).toContain('### prototype.overlay')
    expect(submission.modelText.startsWith('/bottom-sheet turn this into a sheet')).toBe(true)
  })

  test('routes natural-language prompts through the same engine', () => {
    const submission = buildTextSubmission('Make the splash fade into login')
    expect(submission.modelText).toContain('### motion.fade')
    expect(submission.displayText).toBe('Make the splash fade into login')
  })

  test('keeps simple requests untouched when no skill matches', () => {
    const submission = buildTextSubmission('plain unrelated text')
    expect(submission.modelText).toBe('plain unrelated text')
    expect(submission.displayText).toBe('plain unrelated text')
  })

  test('appends skill context after referenced-node context and strips both for display', () => {
    const text = 'Make this button bounce when pressed'
    const nodes = [referencedNode('1:2', 'Button')]
    const submission = buildTextSubmission(text, { nodes })

    const nodeContext = appendReferencedNodeContext(text, nodes)
    expect(submission.modelText.startsWith(nodeContext)).toBe(true)
    expect(submission.modelText).toContain('### motion.spring')

    // Presentation strips skill first (appended last), then node context.
    const stripped = stripSkillContext(submission.modelText)
    expect(stripped).toBe(nodeContext)
    expect(stripped.startsWith(text)).toBe(true)
    expect(submission.nodes).toEqual(nodes)
  })

  test('image attachments ride along without changing skill routing (spec §61 pass 4)', () => {
    const draft = {
      file: new File(['png'], 'shot.png', { type: 'image/png' }),
      previewURL: 'blob:preview'
    }
    const submission = buildTextSubmission(
      'Turn this screenshot into an editable interactive prototype',
      { images: [draft] }
    )
    expect(submission.images).toEqual([draft])
    expect(submission.modelText).toContain('### prototype.navigation')
    expect(submission.displayText).toBe(
      'Turn this screenshot into an editable interactive prototype'
    )
  })

  test('reports an unknown command to the model and the composer (spec §63)', () => {
    const submission = buildTextSubmission('/bottm-sheet make it a sheet')
    expect(submission.notice).toEqual({ command: 'bottm-sheet', suggestions: ['bottom-sheet'] })
    expect(submission.modelText).toContain('Unknown command "/bottm-sheet"')
    expect(submission.modelText).toContain('did you mean /bottom-sheet?')
    // The note rides the stripped block; the transcript keeps the raw command.
    expect(stripSkillContext(submission.modelText)).toBe('/bottm-sheet make it a sheet')
    expect(submission.displayText).toBe('/bottm-sheet make it a sheet')

    const clean = buildTextSubmission('make a bottom sheet')
    expect(clean.notice).toBeUndefined()
    expect(clean.modelText).not.toContain('Unknown command')
  })

  test('threads attached nodes in as selection context (spec §61)', () => {
    const withSelection = buildTextSubmission('make this a modal', {
      nodes: [referencedNode('1:2', 'Hero')]
    })
    expect(withSelection.modelText).toContain('Routing mode: infer')
    expect(withSelection.modelText).toContain('Target: target = current selection.')

    const withoutSelection = buildTextSubmission('make this a modal')
    expect(withoutSelection.modelText).toContain('Routing mode: clarify')
    expect(withoutSelection.modelText).not.toContain('Target:')
  })
})
