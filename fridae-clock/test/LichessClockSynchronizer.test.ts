import assert from "node:assert/strict"
import { describe, it } from "node:test"
import { ChessClock } from "../src/ChessClock.ts"
import {
  LichessClockSynchronizer,
  type LichessBoardStreamEvent,
} from "../src/LichessClockSynchronizer.ts"
import { ManualMonotonicTimeSource } from "../src/MonotonicTimeSource.ts"
import { full, state } from "./helpers.ts"

function harness() {
  const time = new ManualMonotonicTimeSource(0)
  const clock = ChessClock.createOnline(time)
  const sync = new LichessClockSynchronizer(clock)
  const syncEvents: { type: string; reason?: string }[] = []
  sync.subscribe((event) => {
    syncEvents.push(event)
  })
  return { time, clock, sync, syncEvents }
}

describe("LichessClockSynchronizer stream snapshots", () => {
  it("displays gameFull remaining time rather than the configured initial time", () => {
    const { clock, sync, time } = harness()
    sync.receive(
      1,
      full({
        clock: { initial: 300_000, increment: 2_000 },
        speed: "blitz",
        state: { wtime: 123_456, btime: 222_000, winc: 2_000, binc: 2_000, moves: "e2e4", status: "started" },
      }) as LichessBoardStreamEvent,
    )
    assert.equal(clock.displayMillis("white"), 123_456)
    assert.equal(clock.displayMillis("black"), 222_000)
    assert.equal(clock.snapshot().activeColor, "black")
    assert.equal(clock.snapshot().speed, "blitz")
    assert.equal(clock.snapshot().whiteIncrementMs, 2_000)
    time.advance(1_000)
    assert.equal(clock.displayMillis("black"), 221_000)
    assert.equal(clock.displayMillis("white"), 123_456)
  })

  it("starts from a black-to-move FEN and alternates by ply", () => {
    const { clock, sync } = harness()
    const fen = "rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq e3 0 1"
    sync.receive(1, full({ initialFen: fen, state: { moves: "" } }) as LichessBoardStreamEvent)
    assert.equal(clock.snapshot().activeColor, "black")
    sync.receive(
      1,
      state({ moves: "e7e5", wtime: 290_000, btime: 300_000 }) as LichessBoardStreamEvent,
    )
    assert.equal(clock.snapshot().activeColor, "white")
    assert.equal(clock.displayMillis("white"), 290_000)

    const whiteFen = harness()
    whiteFen.sync.receive(
      1,
      full({
        initialFen: "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1",
        state: { moves: "e2e4" },
      }) as LichessBoardStreamEvent,
    )
    assert.equal(whiteFen.clock.snapshot().activeColor, "black")
  })

  it("holds gameState until gameFull, including after a reconnect", () => {
    const early = harness()
    early.sync.receive(4, state({ wtime: 1 }) as LichessBoardStreamEvent)
    assert.equal(early.clock.snapshot().kind, "absent")

    const { clock, sync, syncEvents } = harness()
    sync.beginStream(1)
    sync.receive(1, state({ wtime: 1 }) as LichessBoardStreamEvent)
    assert.equal(clock.snapshot().kind, "absent")
    sync.receive(1, full() as LichessBoardStreamEvent)
    assert.equal(clock.displayMillis("white"), 300_000)
    sync.beginStream(2)
    sync.receive(1, state({ wtime: 1, moves: "e2e4" }) as LichessBoardStreamEvent)
    sync.receive(2, state({ wtime: 1, moves: "e2e4" }) as LichessBoardStreamEvent)
    assert.equal(clock.displayMillis("white"), 300_000)
    sync.receive(
      2,
      full({ state: { wtime: 280_000, btime: 300_000 } }) as LichessBoardStreamEvent,
    )
    assert.equal(clock.displayMillis("white"), 280_000)
    assert.ok(syncEvents.some((event) => event.reason === "awaitingGameFull"))
    assert.ok(syncEvents.some((event) => event.reason === "staleGeneration"))
  })

  it("applies a reconnect correction whose remaining time is higher than the local estimate", () => {
    const { clock, sync, time } = harness()
    sync.receive(1, full() as LichessBoardStreamEvent)
    time.advance(20_000)
    assert.equal(clock.displayMillis("white"), 280_000)
    sync.beginStream(2)
    sync.receive(
      2,
      full({ state: { wtime: 290_000, btime: 300_000, moves: "e2e4" } }) as LichessBoardStreamEvent,
    )
    assert.equal(clock.displayMillis("white"), 290_000)
    assert.equal(clock.snapshot().activeColor, "black")
    time.advance(1_000)
    assert.equal(clock.displayMillis("black"), 299_000)
  })

  it("ignores an exact duplicate and still applies a same-ply time correction", () => {
    const { clock, sync, time } = harness()
    const opening = full() as LichessBoardStreamEvent
    sync.receive(1, opening)
    time.advance(1_000)
    sync.receive(1, opening)
    assert.equal(clock.displayMillis("white"), 299_000)
    sync.receive(
      1,
      state({ moves: "", wtime: 295_000, btime: 300_000, status: "started" }) as LichessBoardStreamEvent,
    )
    assert.equal(clock.displayMillis("white"), 295_000)
  })

  it("treats a shorter move list on the same generation as a rewind", () => {
    const { clock, sync } = harness()
    sync.receive(1, full({ state: { moves: "e2e4 e7e5", wtime: 100_000, btime: 100_000 } }) as LichessBoardStreamEvent)
    sync.receive(
      1,
      state({ moves: "e2e4", wtime: 110_000, btime: 90_000 }) as LichessBoardStreamEvent,
    )
    assert.equal(clock.snapshot().ply, 1)
    assert.equal(clock.displayMillis("white"), 110_000)
    assert.equal(clock.displayMillis("black"), 90_000)
    assert.equal(clock.snapshot().activeColor, "black")
  })

  it("passes expiration through and ignores chat, opponent claims, and unknown events", () => {
    const { clock, sync, time } = harness()
    sync.receive(
      1,
      full({
        state: { expiration: { idleMillis: 20, millisToMove: 15_000 } },
      }) as LichessBoardStreamEvent,
    )
    time.advance(1_000)
    sync.receive(1, { type: "chatLine", text: "hi" })
    sync.receive(1, { type: "opponentGone", gone: true, claimWinInSeconds: 51 })
    sync.receive(1, { type: "opponentGone", gone: false })
    sync.receive(1, { type: "puzzle" })
    const snap = clock.snapshot()
    assert.equal(snap.whiteDisplayMs, 299_000)
    assert.deepEqual(snap.expiration, { idleMillis: 20, millisToMove: 15_000 })
    assert.deepEqual(snap.opponentGone, { gone: false, claimWinInSeconds: null })
    time.advance(1_000)
    assert.equal(clock.displayMillis("white"), 298_000)
  })

  it("ignores an opening gameFull whose remaining time is not a whole millisecond count", () => {
    const { clock, sync } = harness()
    sync.receive(1, full({ state: { wtime: -1 } }) as LichessBoardStreamEvent)
    assert.equal(clock.snapshot().kind, "absent")
  })

  it("rejects invalid fen, status, and clock numbers without moving the previous clock", () => {
    const { clock, sync, time } = harness()
    sync.receive(1, full() as LichessBoardStreamEvent)
    time.advance(1_000)
    sync.receive(1, full({ initialFen: "not a fen" }) as LichessBoardStreamEvent)
    sync.receive(1, state({ status: "flagged-locally", moves: "e2e4" }) as LichessBoardStreamEvent)
    sync.receive(1, state({ wtime: -5, moves: "e2e4" }) as LichessBoardStreamEvent)
    sync.receive(1, state({ wtime: 1.2, moves: "e2e4" }) as LichessBoardStreamEvent)
    sync.receive(1, state({ moves: 12 }) as LichessBoardStreamEvent)
    sync.receive(
      1,
      state({
        moves: "e2e4",
        expiration: { idleMillis: -1, millisToMove: 1 },
      }) as LichessBoardStreamEvent,
    )
    assert.equal(clock.displayMillis("white"), 299_000)
    assert.equal(clock.snapshot().ply, 0)
  })

  it("classifies clock, correspondence, and unlimited without inventing a hybrid", () => {
    const realtime = harness()
    realtime.sync.receive(
      1,
      full({
        daysPerTurn: 14,
        clock: { initial: 600_000, increment: 0 },
        speed: "rapid",
        state: { wtime: 600_000, btime: 600_000, winc: 0, binc: 0 },
      }) as LichessBoardStreamEvent,
    )
    assert.equal(realtime.clock.snapshot().kind, "realtime")
    assert.equal(realtime.clock.snapshot().daysPerTurn, null)

    const correspondence = harness()
    correspondence.sync.receive(
      1,
      full({
        clock: undefined,
        daysPerTurn: 4,
        speed: "correspondence",
        state: { wtime: 300_000_000, btime: 400_000_000, winc: 0, binc: 0 },
      }) as LichessBoardStreamEvent,
    )
    correspondence.time.advance(1_000)
    assert.equal(correspondence.clock.snapshot().kind, "correspondence")
    assert.equal(correspondence.clock.snapshot().daysPerTurn, 4)
    assert.equal(correspondence.clock.displayMillis("white"), 299_999_000)

    const unlimited = harness()
    unlimited.sync.receive(
      1,
      full({
        clock: undefined,
        speed: "correspondence",
        state: { wtime: 2_147_483_647, btime: 2_147_483_647, winc: 0, binc: 0 },
      }) as LichessBoardStreamEvent,
    )
    unlimited.time.advance(5_000)
    assert.equal(unlimited.clock.snapshot().kind, "unlimited")
    assert.equal(unlimited.clock.displayMillis("white"), null)

    const bullet = harness()
    bullet.sync.receive(
      1,
      full({
        speed: "bullet",
        clock: { initial: 60_000, increment: 0 },
        state: { wtime: 60_000, btime: 60_000, winc: 0, binc: 0 },
      }) as LichessBoardStreamEvent,
    )
    bullet.time.advance(1_000)
    assert.equal(bullet.clock.snapshot().speed, "bullet")
    assert.equal(bullet.clock.displayMillis("white"), 59_000)

    const unknownSpeed = harness()
    unknownSpeed.sync.receive(
      1,
      full({ speed: "hyperbullet" }) as LichessBoardStreamEvent,
    )
    assert.equal(unknownSpeed.clock.snapshot().speed, null)
    assert.equal(unknownSpeed.clock.snapshot().kind, "realtime")
  })

  it("uses streamed per-side increment, not the initial clock increment", () => {
    const { clock, sync, time } = harness()
    sync.receive(
      1,
      full({
        clock: { initial: 300_000, increment: 2_000 },
        state: { winc: 0, binc: 0, wtime: 150_000, btime: 150_000 },
      }) as LichessBoardStreamEvent,
    )
    time.advance(1_000)
    sync.acceptedMove({ accepted: true, revision: "berserk", ply: 1, mover: "white" })
    assert.equal(clock.displayMillis("white"), 149_000)
    assert.equal(clock.snapshot().activeColor, "black")
  })

  it("confirms outoftime from the stream and does not confirm timeout or noStart", () => {
    const flagged = harness()
    flagged.sync.receive(
      1,
      full({
        state: { status: "outoftime", winner: "white", wtime: 12_000, btime: 0, moves: "e2e4" },
      }) as LichessBoardStreamEvent,
    )
    assert.deepEqual(flagged.clock.snapshot().confirmedFlag, { color: "black", source: "server" })
    assert.equal(flagged.clock.snapshot().terminal, true)

    const abandoned = harness()
    abandoned.sync.receive(
      1,
      full({ state: { status: "timeout", winner: "white", wtime: 10, btime: 10 } }) as LichessBoardStreamEvent,
    )
    assert.equal(abandoned.clock.snapshot().confirmedFlag, null)
    assert.equal(abandoned.clock.snapshot().terminal, true)

    const noStart = harness()
    noStart.sync.receive(
      1,
      full({ state: { status: "noStart", wtime: 0, btime: 300_000 } }) as LichessBoardStreamEvent,
    )
    assert.equal(noStart.clock.snapshot().confirmedFlag, null)
    assert.equal(noStart.clock.snapshot().lichessStatus, "noStart")

    const mate = harness()
    mate.sync.receive(
      1,
      full({ state: { status: "mate", winner: "black", wtime: 5, btime: 6, moves: "e2e4" } }) as LichessBoardStreamEvent,
    )
    assert.equal(mate.clock.snapshot().confirmedFlag, null)
    assert.equal(mate.clock.snapshot().terminal, true)
    assert.equal(mate.clock.displayMillis("white"), 5)
  })

  it("does not let a lower beginStream rewind the active generation", () => {
    const { clock, sync, syncEvents } = harness()
    sync.beginStream(2)
    sync.receive(2, full({ state: { wtime: 200_000 } }) as LichessBoardStreamEvent)
    sync.beginStream(1)
    sync.receive(1, full({ state: { wtime: 1 } }) as LichessBoardStreamEvent)
    assert.equal(clock.displayMillis("white"), 200_000)
    assert.ok(syncEvents.some((event) => event.reason === "staleGeneration"))
  })
})

describe("LichessClockSynchronizer moves and dispose", () => {
  it("forwards an accepted move once and ignores a rejected move", () => {
    const { clock, sync, time } = harness()
    sync.receive(
      1,
      full({
        clock: { initial: 300_000, increment: 3_000 },
        state: { winc: 3_000, binc: 3_000 },
      }) as LichessBoardStreamEvent,
    )
    time.advance(2_000)
    sync.acceptedMove({ accepted: false, revision: "r", ply: 1, mover: "white" })
    assert.equal(clock.displayMillis("white"), 298_000)
    assert.equal(clock.snapshot().activeColor, "white")
    sync.acceptedMove({ accepted: true, revision: "r", ply: 1, mover: "white" })
    sync.acceptedMove({ accepted: true, revision: "r", ply: 1, mover: "white" })
    assert.equal(clock.displayMillis("white"), 301_000)
    assert.equal(clock.snapshot().activeColor, "black")
    sync.receive(
      1,
      state({
        moves: "e2e4",
        wtime: 300_400,
        btime: 300_000,
        winc: 3_000,
        binc: 3_000,
      }) as LichessBoardStreamEvent,
    )
    assert.equal(clock.displayMillis("white"), 300_400)
    sync.acceptedMove({ accepted: true, revision: "r", ply: 1, mover: "white" })
    assert.equal(clock.displayMillis("white"), 300_400)
  })

  it("does not add a day-sized increment for correspondence moves", () => {
    const { clock, sync, time } = harness()
    sync.receive(
      1,
      full({
        clock: undefined,
        daysPerTurn: 2,
        speed: "correspondence",
        state: { wtime: 172_800_000, btime: 172_800_000, winc: 0, binc: 0 },
      }) as LichessBoardStreamEvent,
    )
    time.advance(5_000)
    sync.acceptedMove({ accepted: true, revision: "c", ply: 1, mover: "white" })
    assert.equal(clock.displayMillis("white"), 172_795_000)
    assert.equal(clock.snapshot().activeColor, "white")
    sync.receive(
      1,
      state({
        moves: "e2e4",
        wtime: 172_790_000,
        btime: 172_800_000,
        winc: 0,
        binc: 0,
        status: "started",
      }) as LichessBoardStreamEvent,
    )
    assert.equal(clock.displayMillis("black"), 172_800_000)
    assert.equal(clock.snapshot().activeColor, "black")
  })

  it("stops the synchronizer without disposing the clock", () => {
    const { clock, sync } = harness()
    sync.receive(1, full() as LichessBoardStreamEvent)
    sync.dispose()
    sync.beginStream(9)
    sync.receive(1, full({ state: { wtime: 1 } }) as LichessBoardStreamEvent)
    sync.acceptedMove({ accepted: true, revision: "x", ply: 1, mover: "white" })
    assert.equal(clock.displayMillis("white"), 300_000)
    assert.equal(clock.snapshot().activeColor, "white")
    clock.dispose()
  })

  it("drops synchronizer listeners after dispose and after unsubscribe", () => {
    const { sync } = harness()
    let calls = 0
    const unsubscribe = sync.subscribe(() => {
      calls += 1
    })
    unsubscribe()
    sync.receive(1, { type: "chatLine" })
    assert.equal(calls, 0)
    sync.subscribe(() => {
      calls += 1
    })
    sync.dispose()
    const before = calls
    sync.receive(1, full() as LichessBoardStreamEvent)
    assert.equal(calls, before)
  })
})
