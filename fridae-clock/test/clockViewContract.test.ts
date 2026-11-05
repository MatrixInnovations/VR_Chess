import assert from "node:assert/strict"
import { describe, it } from "node:test"
import { CLOCK_SNAPSHOT_FIELDS, CLOCK_EVENT_TYPES } from "../src/clockViewContract.ts"
import { ChessClock } from "../src/ChessClock.ts"
import { LichessTimeControl } from "../src/LichessTimeControl.ts"
import { ManualMonotonicTimeSource } from "../src/MonotonicTimeSource.ts"

describe("read-only clock view contract", () => {
  it("exports the snapshot fields Vision and the physical clock may render", () => {
    const clock = ChessClock.createOffline(
      new ManualMonotonicTimeSource(0),
      LichessTimeControl.realtime(60, 0),
    )
    const snap = clock.snapshot()
    assert.deepEqual(Object.keys(snap), [...CLOCK_SNAPSHOT_FIELDS])
    assert.equal(Object.isFrozen(snap), true)
    assert.equal(typeof clock.displayMillis("white"), "number")
    let heard = 0
    const unsubscribe = clock.subscribe((event) => {
      heard += 1
      assert.equal(CLOCK_EVENT_TYPES.includes(event.type), true)
    })
    clock.notifyTapped("white")
    unsubscribe()
    assert.equal(heard, 1)
    assert.equal(clock.snapshot().activeColor, "white")
  })
})
