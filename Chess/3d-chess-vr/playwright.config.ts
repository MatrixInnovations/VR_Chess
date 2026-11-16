import { defineConfig } from '@playwright/test'

/**
 * Browser smoke for the seated hall.
 * `next dev` keeps `NODE_ENV` off production so the test hook exists.
 * The production build does not install `window.__CHESS_APP__`.
 */
export default defineConfig({
  testDir: './e2e',
  timeout: 90_000,
  use: {
    baseURL: 'http://127.0.0.1:3456',
    viewport: { width: 1280, height: 800 },
  },
  webServer: {
    command: 'npx next dev -p 3456',
    url: 'http://127.0.0.1:3456',
    reuseExistingServer: false,
    timeout: 120_000,
  },
})
