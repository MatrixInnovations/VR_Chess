import assert from "node:assert/strict"
import { describe, it } from "node:test"
import {
  ManualMonotonicTimeSource,
  SystemMonotonicTimeSource,
} from "../src/MonotonicTimeSource.ts"

describe("SystemMonotonicTimeSource", () => {
  it("reads a finite monotonic clock", () => {
    const time = new SystemMonotonicTimeSource()
    const first = time.now()
    const second = time.now()
    assert.equal(Number.isFinite(first), true)
    assert.equal(Number.isFinite(second), true)
    assert.ok(second >= first)
  })
})

describe("ManualMonotonicTimeSource", () => {
  it("starts at the given origin and only moves forward", () => {
    const time = new ManualMonotonicTimeSource(10)
    assert.equal(time.now(), 10)
    time.advance(5)
    assert.equal(time.now(), 15)
    time.advance(0)
    assert.equal(time.now(), 15)
  })

  it("rejects a backward or non-finite step without moving", () => {
    const time = new ManualMonotonicTimeSource(4)
    assert.throws(() => time.advance(-1), RangeError)
    assert.throws(() => time.advance(Number.NaN), RangeError)
    assert.throws(() => time.advance(Number.POSITIVE_INFINITY), RangeError)
    assert.equal(time.now(), 4)
  })

  it("rejects a negative or non-finite origin", () => {
    assert.throws(() => new ManualMonotonicTimeSource(-1), RangeError)
    assert.throws(() => new ManualMonotonicTimeSource(Number.NaN), RangeError)
  })
})
