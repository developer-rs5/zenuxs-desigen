import { expect, test, useEditorSetupWithClear } from '#tests/e2e/fixtures'

const editor = useEditorSetupWithClear('/editor?test')

test('deleting several points heals the path and keeps the fill region', async () => {
  const vectorId = await editor.page.evaluate(() => {
    const store = window.openPencil?.getStore?.()
    if (!store) throw new Error('OpenPencil store not initialized')
    const pageId = store.state.currentPageId
    const line = (start: number, end: number) => ({
      start,
      end,
      tangentStart: { x: 0, y: 0 },
      tangentEnd: { x: 0, y: 0 }
    })
    const vector = store.graph.createNode('VECTOR', pageId, {
      name: 'Healed path',
      x: 100,
      y: 100,
      width: 100,
      height: 100,
      vectorNetwork: {
        vertices: [
          { x: 0, y: 0 },
          { x: 50, y: 0 },
          { x: 100, y: 0 },
          { x: 100, y: 100 },
          { x: 50, y: 100 },
          { x: 0, y: 100 }
        ],
        segments: [line(0, 1), line(1, 2), line(2, 3), line(3, 4), line(4, 5), line(5, 0)],
        regions: [{ windingRule: 'NONZERO', loops: [[0, 1, 2, 3, 4, 5]] }]
      }
    })
    store.enterNodeEditMode(vector.id)
    const editState = store.getNodeEditState()
    if (!editState) throw new Error('Vector edit state unavailable')
    // The midpoints of the top and bottom edges.
    editState.selectedVertexIndices = new Set([1, 4])
    return vector.id
  })
  await editor.canvas.waitForRender()

  await editor.page.keyboard.press('Delete')
  await editor.canvas.waitForRender()

  const healed = await editor.page.evaluate(() => {
    const store = window.openPencil?.getStore?.()
    const editState = store?.getNodeEditState()
    if (!editState) throw new Error('Vector edit state unavailable')
    return {
      vertices: editState.vertices.length,
      segments: editState.segments.length,
      loop: editState.regions[0]?.loops[0]?.length ?? 0,
      valid: editState.segments.every(
        (segment) =>
          segment.start < editState.vertices.length && segment.end < editState.vertices.length
      )
    }
  })
  expect(healed).toEqual({ vertices: 4, segments: 4, loop: 4, valid: true })

  const committed = await editor.page.evaluate((id) => {
    const store = window.openPencil?.getStore?.()
    if (!store) throw new Error('OpenPencil store not initialized')
    store.exitNodeEditMode(true)
    const node = store.graph.getNode(id)
    if (node?.type !== 'VECTOR' || !node.vectorNetwork) throw new Error('Missing healed vector')
    return {
      vertices: node.vectorNetwork.vertices.length,
      segments: node.vectorNetwork.segments.length,
      loop: node.vectorNetwork.regions[0]?.loops[0]?.length ?? 0
    }
  }, vectorId)
  expect(committed).toEqual({ vertices: 4, segments: 4, loop: 4 })

  editor.canvas.assertNoErrors()
})
