import { expect, test } from '@playwright/test'

test('pass and play moves the clock and the immersive switch keeps the session', async ({ page }) => {
  await page.goto('/')
  await page.waitForFunction(() => Boolean((window as unknown as { __CHESS_APP__?: object }).__CHESS_APP__))
  await page.waitForTimeout(600)
  await page.screenshot({ path: '/opt/cursor/artifacts/hall-seated.png', fullPage: false })

  await page.evaluate(() => {
    const app = (window as unknown as { __CHESS_APP__: {
      tourSkip: () => void
      selectPiece: (id: string) => boolean
    } }).__CHESS_APP__
    app.tourSkip()
    app.selectPiece('white-pawn-5')
  })
  await page.waitForTimeout(400)
  await page.screenshot({ path: '/opt/cursor/artifacts/legal-moves.png', fullPage: false })

  const before = await page.getByTestId('session-id').innerText()
  const clockBefore = await page.getByTestId('clock-active').innerText()
  expect(clockBefore).toBe('white')

  await page.evaluate(() => {
    const app = (window as unknown as { __CHESS_APP__: {
      playAlgebraic: (from: string, to: string) => boolean
      frame: (at: number) => void
    } }).__CHESS_APP__
    if (!app.playAlgebraic('e2', 'e4')) throw new Error('e2e4 rejected')
    if (!app.playAlgebraic('e7', 'e5')) throw new Error('e7e5 rejected')
    if (!app.playAlgebraic('g1', 'f3')) throw new Error('g1f3 rejected')
    app.frame(performance.now())
  })
  await expect(page.getByTestId('clock-active')).toHaveText('black')

  await page.getByRole('button', { name: '3D / Immersive' }).click()
  await page.waitForTimeout(500)
  await page.screenshot({ path: '/opt/cursor/artifacts/immersive-toggle.png', fullPage: false })
  await expect(page.getByTestId('session-id')).toHaveText(before)
  await expect(page.getByTestId('clock-active')).toHaveText('black')
  const sample = await readBoardPixels(page)
  expect(sample.mean).toBeGreaterThan(12)
  expect(sample.variance).toBeGreaterThan(4)
})

async function readBoardPixels(page: import('@playwright/test').Page): Promise<{ mean: number; variance: number }> {
  return page.evaluate(() => {
    const canvas = document.querySelector('canvas') as HTMLCanvasElement | null
    const gl = canvas?.getContext('webgl2') ?? canvas?.getContext('webgl')
    if (!canvas || !gl) return { mean: 0, variance: 0 }
    const size = 24
    const x = Math.max(0, Math.floor(canvas.width / 2) - size / 2)
    const y = Math.max(0, Math.floor(canvas.height / 2) - size / 2)
    const pixels = new Uint8Array(size * size * 4)
    gl.readPixels(x, y, size, size, gl.RGBA, gl.UNSIGNED_BYTE, pixels)
    let sum = 0
    let sum2 = 0
    const count = size * size
    for (let index = 0; index < pixels.length; index += 4) {
      const luminance = pixels[index] + pixels[index + 1] + pixels[index + 2]
      sum += luminance
      sum2 += luminance * luminance
    }
    const mean = sum / count
    return { mean, variance: sum2 / count - mean * mean }
  })
}
