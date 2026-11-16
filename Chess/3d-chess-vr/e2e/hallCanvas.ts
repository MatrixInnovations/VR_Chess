import { expect, type Page } from '@playwright/test'

import { pngStats } from './pngStats'

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

/** Screenshot the canvas until the board is actually painted. */
export async function expectPaintedCanvas(page: Page): Promise<void> {
  const canvas = page.locator('.hall-stage canvas')
  await expect.poll(async () => {
    const sample = pngStats(await canvas.screenshot())
    return sample.mean > 12 && sample.variance > 4
  }, { timeout: 60_000 }).toBe(true)
}
