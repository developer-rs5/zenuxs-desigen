import { expect, type BoundingBox, type Page } from '@playwright/test'

/**
 * The prototype player is a fixed full-viewport overlay above the canvas, so it
 * owns its own geometry. Driving playback by canvas coordinates addresses the
 * overlay instead of the canvas, and the Present button is physically covered
 * while presenting. Interact through the DOM the player renders instead.
 */

function playerRoot(page: Page) {
  return page.getByTestId('prototype-player-root')
}

/** The DOM element the player renders for a node, if it is on screen. */
export function playerNode(page: Page, nodeId: string) {
  return playerRoot(page).locator(`[data-node-id="${nodeId}"]`).first()
}

function sameRect(a: BoundingBox, b: BoundingBox): boolean {
  return a.x === b.x && a.y === b.y && a.width === b.width && a.height === b.height
}

/** Resolve after the browser has painted the next two frames. */
async function nextFrames(page: Page): Promise<void> {
  await page.evaluate(
    () =>
      new Promise<void>((resolve) => {
        requestAnimationFrame(() => requestAnimationFrame(() => resolve()))
      })
  )
}

/**
 * Wait until a node stops moving inside the player. Overlays slide in and out,
 * so a node's painted position differs from its authored one until the
 * transition settles; a click during that window aims at where it used to be.
 * Two identical frame samples mean the surface has stopped moving it.
 */
export async function waitForPlayerSettled(page: Page, nodeId: string): Promise<void> {
  const target = playerNode(page, nodeId)
  let previous = await target.boundingBox()
  for (let attempt = 0; attempt < 40; attempt++) {
    await nextFrames(page)
    const current = await target.boundingBox()
    if (previous && current && sameRect(previous, current)) return
    previous = current
  }
  throw new Error(`prototype player never settled on node ${nodeId}`)
}

/** Click a node inside the presentation surface. */
export async function clickNodeInPlayer(page: Page, nodeId: string): Promise<void> {
  const target = playerNode(page, nodeId)
  await expect(target).toBeVisible()
  await waitForPlayerSettled(page, nodeId)
  await target.click()
}

/**
 * Position the pointer over a node without pressing. Triggers that fire on
 * press/release are driven by the screen container's pointer handlers, so the
 * caller follows this with `page.mouse.down()` / `.up()`.
 */
export async function hoverNodeInPlayer(page: Page, nodeId: string): Promise<void> {
  const target = playerNode(page, nodeId)
  await expect(target).toBeVisible()
  await waitForPlayerSettled(page, nodeId)
  await target.hover()
}

/** The player header names the flow and the screen it is currently showing. */
export async function expectPlayerScreen(page: Page, screenName: string): Promise<void> {
  await expect(playerRoot(page)).toContainText(`· ${screenName}`, { timeout: 15_000 })
}

/**
 * Leave presentation. The overlay covers the Present button, so Escape is the
 * only keyboard exit. Closing must also stop the core preview runtime, not just
 * hide the overlay.
 */
export async function closePlayer(page: Page): Promise<void> {
  await page.keyboard.press('Escape')
  await expect(playerRoot(page)).toHaveCount(0)
  await page.waitForFunction(() => {
    const store = window.openPencil?.getStore?.()
    return store?.state.prototypePreview == null
  })
}
