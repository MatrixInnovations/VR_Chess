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
  await page.waitForSelector('canvas[data-frame="1"]')
  const sample = await page.evaluate(() => {
    const canvas = document.querySelector('canvas')
    return {
      mean: Number(canvas?.dataset.mean ?? 0),
      variance: Number(canvas?.dataset.variance ?? 0),
    }
  })
  expect(sample.mean).toBeGreaterThan(12)
  expect(sample.variance).toBeGreaterThan(4)
})
