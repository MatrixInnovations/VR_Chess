import assert from "node:assert/strict"
import { describe, it } from "node:test"
import { ChessClockPort } from "../src/ChessClockPort.ts"

describe("ChessClockPort Ultron IClockPort", () => {
  it("arms one shared increment and counts only the side to move", () => {
    const port = new ChessClockPort("offline")
    port.arm({ whiteMs: 60_000, blackMs: 60_000, incrementMs: 1_000 }, "white", 5_000)
    const later = port.read(6_500)
    assert.equal(later.whiteMs, 58_500)
    assert.equal(later.blackMs, 60_000)
    assert.equal(later.flagged, null)
    assert.equal(port.chessClock.snapshot().whiteIncrementMs, 1_000)
    assert.equal(port.chessClock.snapshot().blackIncrementMs, 1_000)
  })

  it("adds that increment once per onMovePlayed and switches the turn", () => {
    const port = new ChessClockPort("offline")
    port.arm({ whiteMs: 60_000, blackMs: 60_000, incrementMs: 1_000 }, "white", 0)
    const after = port.onMovePlayed("white", 1_000)
    assert.equal(after.whiteMs, 60_000)
    assert.equal(after.blackMs, 60_000)
    assert.equal(after.flagged, null)
    assert.equal(port.chessClock.snapshot().activeColor, "black")
    const again = port.onMovePlayed("white", 1_000)
    assert.equal(again.whiteMs, 60_000)
    assert.equal(port.chessClock.snapshot().activeColor, "black")
  })

  it("uses a new revision after a snapshot rewind so the replacement move increments once", () => {
    const port = new ChessClockPort("offline")
    port.arm({ whiteMs: 30_000, blackMs: 30_000, incrementMs: 1_000 }, "white", 0)
    port.onMovePlayed("white", 0)
    port.sync({ whiteMs: 20_000, blackMs: 15_000 }, 0)
    const played = port.onMovePlayed("black", 0)
    assert.equal(played.blackMs, 16_000)
    assert.equal(played.whiteMs, 20_000)
    assert.equal(port.chessClock.snapshot().activeColor, "white")
  })

  it("replaces banks from sync without adding increment, including a higher give-time", () => {
    const port = new ChessClockPort("online")
    port.arm({ whiteMs: 10_000, blackMs: 10_000, incrementMs: 2_000 }, "white", 0)
    const given = port.sync({ whiteMs: 15_000, blackMs: 10_000 }, 500)
    assert.equal(given.whiteMs, 15_000)
    assert.equal(given.blackMs, 10_000)
    assert.equal(port.chessClock.snapshot().activeColor, "white")
    const moved = port.onMovePlayed("white", 500)
    assert.equal(moved.whiteMs, 17_000)
    const server = port.sync({ whiteMs: 16_400, blackMs: 10_000, sideToMove: "black" }, 500)
    assert.equal(server.whiteMs, 16_400)
    assert.equal(server.blackMs, 10_000)
    assert.equal(port.chessClock.snapshot().activeColor, "black")
  })

  it("keeps an online zero provisional so read().flagged stays null", () => {
    const port = new ChessClockPort("online")
    port.arm({ whiteMs: 1_000, blackMs: 9_000, incrementMs: 0 }, "white", 100)
    const reading = port.read(1_100)
    assert.equal(reading.whiteMs, 0)
    assert.equal(reading.blackMs, 9_000)
    assert.equal(reading.flagged, null)
    assert.equal(port.chessClock.snapshot().provisionalFlagColor, "white")
    assert.equal(port.chessClock.snapshot().confirmedFlag, null)
    assert.equal(port.chessClock.snapshot().terminal, false)
  })

  it("flags an offline clock locally and reports that color", () => {
    const port = new ChessClockPort("offline")
    port.arm({ whiteMs: 9_000, blackMs: 1_000, incrementMs: 0 }, "black", 0)
    const reading = port.read(1_000)
    assert.equal(reading.blackMs, 0)
    assert.equal(reading.whiteMs, 9_000)
    assert.equal(reading.flagged, "black")
    assert.equal(port.chessClock.snapshot().confirmedFlag?.source, "local")
    port.sync({ whiteMs: 1, blackMs: 1 }, 1_000)
    const later = port.read(3_000)
    assert.equal(later.flagged, "black")
    assert.equal(later.blackMs, 0)
  })

  it("stops the countdown without disposing or flagging", () => {
    const port = new ChessClockPort("online")
    port.arm({ whiteMs: 8_000, blackMs: 8_000, incrementMs: 0 }, "white", 0)
    port.read(1_000)
    port.stop()
    const held = port.read(5_000)
    assert.equal(held.whiteMs, 7_000)
    assert.equal(held.flagged, null)
    assert.equal(port.chessClock.snapshot().phase, "armed")
    port.sync({ whiteMs: 7_000, blackMs: 8_000 }, 5_000)
    const still = port.read(9_000)
    assert.equal(still.whiteMs, 7_000)
    assert.equal(still.blackMs, 8_000)
  })

  it("holds black's bank when black is the runner", () => {
    const port = new ChessClockPort("offline")
    port.arm({ whiteMs: 8_000, blackMs: 8_000, incrementMs: 0 }, "black", 0)
    port.read(1_000)
    port.stop()
    const held = port.read(4_000)
    assert.equal(held.blackMs, 7_000)
    assert.equal(held.whiteMs, 8_000)
    assert.equal(held.flagged, null)
  })

  it("does not rewind when the session timestamp jumps backward", () => {
    const port = new ChessClockPort("offline")
    port.arm({ whiteMs: 5_000, blackMs: 5_000, incrementMs: 0 }, "white", 10_000)
    port.read(12_000)
    const reading = port.read(11_000)
    assert.equal(reading.whiteMs, 3_000)
  })

  it("ignores a ClockTapTarget for the online turn", () => {
    const port = new ChessClockPort("online")
    port.arm({ whiteMs: 20_000, blackMs: 20_000, incrementMs: 3_000 }, "white", 0)
    port.chessClock.acceptTap({ color: "white" })
    port.chessClock.acceptTap({ color: "black" })
    const reading = port.read(1_000)
    assert.equal(reading.whiteMs, 19_000)
    assert.equal(reading.blackMs, 20_000)
    assert.equal(reading.flagged, null)
    assert.equal(port.chessClock.snapshot().activeColor, "white")
  })

  it("starts the named side when the first signal is a server sync", () => {
    const port = new ChessClockPort("online")
    const first = port.sync({ whiteMs: 12_000, blackMs: 11_000, sideToMove: "black" }, 50)
    assert.equal(first.whiteMs, 12_000)
    assert.equal(first.blackMs, 11_000)
    const later = port.read(1_050)
    assert.equal(later.blackMs, 10_000)
    assert.equal(later.whiteMs, 12_000)
    assert.equal(later.flagged, null)
  })

  it("keeps the previous banks when a sync is not a whole millisecond count", () => {
    const port = new ChessClockPort("online")
    port.arm({ whiteMs: 10_000, blackMs: 10_000, incrementMs: 0 }, "white", 0)
    const kept = port.sync({ whiteMs: -5, blackMs: 10_000 }, 0)
    assert.equal(kept.whiteMs, 10_000)
    assert.equal(kept.blackMs, 10_000)
  })

  it("dispose rejects later reads", () => {
    const port = new ChessClockPort("offline")
    port.arm({ whiteMs: 1_000, blackMs: 1_000, incrementMs: 0 }, "white", 0)
    port.dispose()
    assert.throws(() => port.read(1), Error)
  })
})
