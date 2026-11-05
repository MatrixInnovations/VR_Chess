import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    environment: 'node',
    include: ['src/mad-scientist/**/*.test.ts', 'src/mad-scientist/**/*.test.tsx'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'text-summary', 'json-summary'],
      include: ['src/mad-scientist/**/*.ts', 'src/mad-scientist/**/*.tsx'],
      exclude: [
        'src/mad-scientist/**/*.test.ts',
        'src/mad-scientist/**/__tests__/**',
      ],
      thresholds: {
        lines: 90,
        branches: 75,
        functions: 80,
        statements: 90,
      },
    },
  },
})
