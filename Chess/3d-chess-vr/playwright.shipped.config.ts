import { defineConfig } from '@playwright/test'

/**
 * The real production bundle. No NEXT_PUBLIC_E2E, so probes and the debug hook stay out.
 */
export default defineConfig({
  testMatch: '**/shipped.spec.ts',
  timeout: 180_000,
  use: {
    baseURL: 'http://127.0.0.1:3458',
    viewport: { width: 1280, height: 800 },
  },
  webServer: {
    command: 'npx next build && npx next start -p 3458',
    url: 'http://127.0.0.1:3458',
    reuseExistingServer: false,
    timeout: 180_000,
  },
})
