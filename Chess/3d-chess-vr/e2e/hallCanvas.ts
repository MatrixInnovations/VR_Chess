import { expect, type Page } from '@playwright/test'

/** The canvas has left the 300×150 default and a real frame has been drawn. */
export async function waitForHallCanvas(page: Page): Promise<void> {
  const canvas = page.locator('.hall-stage canvas')
  await expect.poll(async () => {
    const size = await canvas.evaluate((node) => {
      const element = node as HTMLCanvasElement
      return element.width > 300 && element.height > 150
    })
    return size
  }, { timeout: 60_000 }).toBe(true)
  await expect.poll(async () => canvas.getAttribute('data-frame'), { timeout: 60_000 }).toBe('1')
}

/**
 * The center of the WebGL buffer, read immediately after render.
 * A screenshot of the canvas element also includes the HUD, so it can pass with nothing drawn.
 */
/**
 * The white king must show highlights and dark sides.
 * A flat silhouette stays under the luminance spread.
 */
export async function expectPiecesShaded(page: Page): Promise<void> {
  await expect.poll(async () => {
    return page.evaluate(() => {
      const probe = (window as unknown as { __CHESS_PIECE_PROBE__?: { mean: number; stddev: number; samples: number } }).__CHESS_PIECE_PROBE__
      return Boolean(probe && probe.samples >= 256 && probe.stddev > 15 && probe.mean > 100)
    })
  }, { timeout: 60_000 }).toBe(true)
}

export async function expectProbePainted(page: Page): Promise<void> {
  await expect.poll(async () => {
    return page.evaluate(() => {
      const probe = (window as unknown as { __CHESS_FRAME_PROBE__?: { mean: number; variance: number } }).__CHESS_FRAME_PROBE__
      return Boolean(probe && probe.mean > 12 && probe.variance > 4)
    })
  }, { timeout: 60_000 }).toBe(true)
}
