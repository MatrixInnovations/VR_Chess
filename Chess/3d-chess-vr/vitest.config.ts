import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    include: ['src/vision/**/*.test.ts'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json-summary', 'text-summary'],
      reportsDirectory: '/tmp/vision-coverage',
      include: ['src/vision/**/*.ts'],
      exclude: ['src/vision/**/*.test.ts', 'src/vision/__tests__/**'],
      thresholds: {
        lines: 90,
        branches: 75,
        functions: 90,
        statements: 90,
      },
    },
  },
})
