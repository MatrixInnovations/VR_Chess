import path from 'path'
import { defineConfig } from 'vitest/config'

/**
 * Coverage gate for this scaffold and, once they land, the core lane classes.
 *
 * Changed scaffold source must stay at or above 80% lines and 75% branches.
 * GameSession, ChessClock, LichessClient, ChessPhraseParser, and
 * ViewModeManager must stay at or above 90% lines wherever those files exist.
 * Render-only scene files are not excluded: there are none on this branch.
 * Add a path to `coverage.exclude` only together with a smoke test that imports it.
 */
export default defineConfig({
  esbuild: {
    jsx: 'automatic',
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  test: {
    environment: 'jsdom',
    include: ['src/**/*.test.ts', 'src/**/*.test.tsx'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'text-summary', 'json-summary'],
      include: ['src/**/*.{ts,tsx}'],
      exclude: ['src/**/*.test.ts', 'src/**/*.test.tsx'],
      thresholds: {
        lines: 80,
        branches: 75,
        'src/**/GameSession.ts': { lines: 90 },
        'src/**/ChessClock.ts': { lines: 90 },
        'src/**/LichessClient.ts': { lines: 90 },
        'src/**/ChessPhraseParser.ts': { lines: 90 },
        'src/**/ViewModeManager.ts': { lines: 90 },
      },
    },
  },
})
