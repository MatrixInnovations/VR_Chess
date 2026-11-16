import { expect, test } from '@playwright/test'

test('production build serves the hall without the debug hook', async ({ page }) => {
  const response = await page.goto('/')
  const policy = response?.headers()['content-security-policy'] ?? ''
  expect(policy).toContain("script-src 'self'")
  expect(policy).not.toContain('unsafe-eval')
  expect(policy).not.toContain('unsafe-inline')
  await expect(page.getByRole('heading', { name: 'Chess Hall' })).toBeVisible()
  const hook = await page.evaluate(() => (window as unknown as { __CHESS_APP__?: unknown }).__CHESS_APP__)
  expect(hook).toBeUndefined()
  await page.waitForFunction(() => {
    const canvas = document.querySelector('canvas')
    return Boolean(canvas && canvas.width > 0 && canvas.height > 0)
  })
  const sample = await page.evaluate(() => {
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
  expect(sample.mean).toBeGreaterThan(12)
  expect(sample.variance).toBeGreaterThan(4)
})
