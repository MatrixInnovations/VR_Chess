import { defineConfig } from 'vitest/config'
import path from 'node:path'

/**
 * Vision screen lane. Include is `src/vision/**` so a rebase onto PR #1
 * still collects both view tests and these screen tests.
 */
export default defineConfig({
  resolve: {
    alias: {
      '@': path.resolve(__dirname, 'src'),
    },
  },
  test: {
    include: ['src/vision/**/*.test.ts', 'src/vision/**/*.test.tsx'],
    environment: 'node',
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json-summary', 'text-summary'],
      reportsDirectory: '/tmp/vision-screens-coverage',
      include: ['src/vision/**/*.ts'],
      exclude: [
        'src/vision/**/*.test.ts',
        'src/vision/**/__tests__/**',
        'src/vision/**/*.tsx',
      ],
      thresholds: {
        lines: 90,
        branches: 75,
        functions: 90,
        statements: 90,
      },
    },
  },
})
