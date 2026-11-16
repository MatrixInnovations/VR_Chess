import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'

const root = fileURLToPath(new URL('..', import.meta.url))
const result = spawnSync(
  process.execPath,
  [
    '--import',
    'tsx',
    '--experimental-test-coverage',
    '--test-coverage-include=src/**/*.ts',
    '--test-coverage-lines=90',
    '--test-coverage-branches=75',
    '--test',
    'test/**/*.test.ts',
  ],
  { cwd: root, encoding: 'utf8' },
)
process.stdout.write(result.stdout ?? '')
process.stderr.write(result.stderr ?? '')
const text = `${result.stdout ?? ''}\n${result.stderr ?? ''}`
const row = text.split('\n').find((line) => /\bChessClock\.ts\b/.test(line) && !line.includes('Port'))
if (!row) {
  console.error('ChessClock.ts was not in the coverage report')
  process.exit(1)
}
const cells = row.split('|').map((cell) => cell.trim()).filter((cell) => cell.length > 0)
const lines = Number(cells[1])
if (!(lines >= 90)) {
  console.error(`ChessClock.ts lines ${lines}% are below 90`)
  process.exit(1)
}
process.exit(result.status === 0 ? 0 : result.status ?? 1)
