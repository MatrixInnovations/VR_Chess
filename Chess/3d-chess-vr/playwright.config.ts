import { defineConfig } from '@playwright/test'

/**
 * Dev smoke. `next dev` keeps `NODE_ENV` off production so the test hook exists.
 * The production smoke is `playwright.prod.config.ts` and runs against `next start`.
 */
export default defineConfig({
  testMatch: '**/hall.spec.ts',
  timeout: 180_000,
  use: {
    baseURL: 'http://127.0.0.1:3456',
    viewport: { width: 1280, height: 800 },
  },
  webServer: {
    command: 'NEXT_PUBLIC_E2E=1 npx next dev -p 3456',
    url: 'http://127.0.0.1:3456',
    reuseExistingServer: false,
    timeout: 120_000,
  },
})
