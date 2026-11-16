import { expect, test } from '@playwright/test'

import { expectPaintedCanvas, waitForHallCanvas } from './hallCanvas'

test('production build serves the hall without the debug hook', async ({ page }) => {
  const violations: string[] = []
  page.on('console', (message) => {
    const text = message.text()
    if (text.includes('Content Security Policy') || text.includes('Content-Security-Policy')) violations.push(text)
  })
  const response = await page.goto('/')
  const policy = response?.headers()['content-security-policy'] ?? ''
  expect(policy).toContain("script-src 'self'")
  expect(policy).not.toContain('unsafe-eval')
  expect(policy).not.toContain('unsafe-inline')
  await expect(page).toHaveTitle('Chess Hall')
  await expect(page.getByRole('heading', { name: 'Chess Hall' })).toBeVisible()
  const hook = await page.evaluate(() => (window as unknown as { __CHESS_APP__?: unknown }).__CHESS_APP__)
  expect(hook).toBeUndefined()
  await waitForHallCanvas(page)
  await expectPaintedCanvas(page)
  expect(violations).toEqual([])
})
