import { defineConfig } from '@playwright/test'

/**
 * Production smoke. Build first, then `next start`, so the page is the
 * production bundle. It does not install `window.__CHESS_APP__`.
 */
export default defineConfig({
  testMatch: '**/production.spec.ts',
  timeout: 90_000,
  use: {
    baseURL: 'http://127.0.0.1:3457',
    viewport: { width: 1280, height: 800 },
  },
  webServer: {
    command: 'npx next build && npx next start -p 3457',
    url: 'http://127.0.0.1:3457',
    reuseExistingServer: false,
    timeout: 180_000,
  },
})
