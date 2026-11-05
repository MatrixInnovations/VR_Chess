/** Ambient types so the lane typechecks without adding @types/node. */

declare module "node:assert/strict" {
  function equal(actual: unknown, expected: unknown, message?: string): void
  function ok(value: unknown, message?: string): void
  function deepEqual(actual: unknown, expected: unknown, message?: string): void
  function throws(block: () => unknown, error?: unknown, message?: string): void
}

declare module "node:test" {
  function describe(name: string, fn: () => void): void
  function it(name: string, fn: () => void): void
}
