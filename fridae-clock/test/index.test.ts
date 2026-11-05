import assert from "node:assert/strict"
import { describe, it } from "node:test"
import {
  CLOCK_SNAPSHOT_FIELDS,
  ChessClock,
  ChessClockPort,
  LichessClockSynchronizer,
  LichessTimeControl,
  ManualMonotonicTimeSource,
  SystemMonotonicTimeSource,
} from "../src/index.ts"

describe("clock lane public exports", () => {
  it("exports every clock class from the lane entry", () => {
    assert.equal(typeof ChessClock, "function")
    assert.equal(typeof ChessClockPort, "function")
    assert.equal(CLOCK_SNAPSHOT_FIELDS.includes("whiteDisplayMs"), true)
    assert.equal(typeof LichessClockSynchronizer, "function")
    assert.equal(typeof LichessTimeControl, "function")
    assert.equal(typeof ManualMonotonicTimeSource, "function")
    assert.equal(typeof SystemMonotonicTimeSource, "function")
  })
})
