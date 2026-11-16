import { defineConfig } from '@playwright/test'

/**
 * Browser smoke for the seated hall.
 * The server is the production build so the smoke matches what CI compiles.
 */
export default defineConfig({
  testDir: './e2e',
  timeout: 60_000,
  use: {
    baseURL: 'http://127.0.0.1:3456',
    viewport: { width: 1280, height: 800 },
  },
  webServer: {
    command: 'npx next start -p 3456',
    url: 'http://127.0.0.1:3456',
    reuseExistingServer: false,
    timeout: 30_000,
  },
})
