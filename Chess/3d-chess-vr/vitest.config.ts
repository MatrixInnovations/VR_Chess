import { defineConfig } from 'vitest/config'

/**
 * Voice-lane tests only. Other lanes keep their own configs on their branches.
 * Coverage is reported outside the repo so the worktree stays limited to source.
 */
export default defineConfig({
  test: {
    environment: 'node',
    include: ['src/input/voice/**/*.test.ts'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'text-summary', 'json-summary'],
      reportsDirectory: '/tmp/sundae-voice-coverage',
      include: ['src/input/voice/**/*.ts'],
      exclude: ['src/input/voice/**/*.test.ts', 'src/input/voice/**/__tests__/**'],
      thresholds: {
        lines: 90,
        branches: 75,
        functions: 90,
        statements: 90,
      },
    },
  },
})
