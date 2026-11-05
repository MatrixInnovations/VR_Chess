import assert from "node:assert/strict"
import { describe, it } from "node:test"
import {
  ChessClock,
  ClockDisposedError,
  ClockModeError,
  type AuthoritativeClockSnapshot,
  type ClockEvent,
} from "../src/ChessClock.ts"
import { LichessTimeControl } from "../src/LichessTimeControl.ts"
import { ManualMonotonicTimeSource } from "../src/MonotonicTimeSource.ts"
import { auth } from "./helpers.ts"

function online() {
  const time = new ManualMonotonicTimeSource(1_000)
  const clock = ChessClock.createOnline(time)
  return { time, clock }
}

function offline(limitSeconds = 300, incrementSeconds = 0, side: "white" | "black" = "white") {
  const time = new ManualMonotonicTimeSource(1_000)
  const clock = ChessClock.createOffline(
    time,
    LichessTimeControl.realtime(limitSeconds, incrementSeconds),
    side,
  )
  return { time, clock }
}

function listen(clock: ChessClock) {
  const events: ClockEvent[] = []
  const unsubscribe = clock.subscribe((event) => {
    events.push(event)
  })
  return { events, unsubscribe }
}

function apply(clock: ChessClock, partial: Record<string, unknown>) {
  clock.applyAuthoritativeSnapshot(auth(partial) as AuthoritativeClockSnapshot)
}

describe("ChessClock online display", () => {
  it("starts absent until an authoritative snapshot arrives", () => {
    const { clock } = online()
    const snap = clock.snapshot()
    assert.equal(snap.kind, "absent")
    assert.equal(snap.phase, "absent")
    assert.equal(snap.mode, "online")
    assert.equal(snap.whiteDisplayMs, null)
    assert.equal(snap.blackDisplayMs, null)
    assert.equal(snap.provisionalFlagColor, null)
    assert.equal(snap.confirmedFlag, null)
    assert.equal(snap.terminal, false)
    assert.equal(clock.displayMillis("white"), null)
    assert.equal(Object.isFrozen(snap), true)
  })

  it("counts down only the side to move from the server remaining time", () => {
    const { clock, time } = online()
    apply(clock, { whiteMs: 300_000, blackMs: 300_000, sideToMove: "white" })
    time.advance(1_500)
    assert.equal(clock.displayMillis("white"), 298_500)
    assert.equal(clock.displayMillis("black"), 300_000)
    const first = clock.displayMillis("white")
    for (let i = 0; i < 100; i += 1) clock.snapshot()
    assert.equal(clock.displayMillis("white"), first)
  })

  it("does not run a created game and starts when the server says started", () => {
    const { clock, time } = online()
    apply(clock, { status: "created", whiteMs: 300_000 })
    time.advance(5_000)
    assert.equal(clock.displayMillis("white"), 300_000)
    assert.equal(clock.snapshot().phase, "armed")
    apply(clock, { status: "started", whiteMs: 300_000, generation: 1, ply: 0 })
    time.advance(1_000)
    assert.equal(clock.displayMillis("white"), 299_000)
    assert.equal(clock.snapshot().phase, "running")
  })

  it("freezes every documented terminal status without calling it a clock flag", () => {
    const terminal = [
      "aborted",
      "mate",
      "resign",
      "stalemate",
      "timeout",
      "draw",
      "cheat",
      "noStart",
      "unknownFinish",
      "insufficientMaterialClaim",
      "variantEnd",
    ] as const
    for (const status of terminal) {
      const { clock, time } = online()
      apply(clock, {
        status,
        winner: status === "mate" ? "white" : null,
        whiteMs: 12_000,
        blackMs: 8_000,
      })
      time.advance(4_000)
      const snap = clock.snapshot()
      assert.equal(snap.phase, "frozen", status)
      assert.equal(snap.terminal, true, status)
      assert.equal(snap.whiteDisplayMs, 12_000, status)
      assert.equal(snap.blackDisplayMs, 8_000, status)
      assert.equal(snap.confirmedFlag, null, status)
      assert.equal(snap.provisionalFlagColor, null, status)
    }
  })

  it("keeps an unlimited game from counting or flagging, including a huge sentinel", () => {
    const { clock, time } = online()
    apply(clock, {
      kind: "unlimited",
      speed: null,
      whiteMs: 2_147_483_647,
      blackMs: 2_147_483_647,
      status: "started",
    })
    time.advance(50_000)
    const snap = clock.snapshot()
    assert.equal(snap.kind, "unlimited")
    assert.equal(snap.whiteDisplayMs, null)
    assert.equal(snap.blackDisplayMs, null)
    assert.equal(snap.phase, "armed")
    assert.equal(snap.provisionalFlagColor, null)
    clock.applyAcceptedMove({
      accepted: true,
      revision: "u1",
      ply: 1,
      mover: "white",
    })
    assert.equal(clock.snapshot().kind, "unlimited")
  })

  it("freezes unlimited and correspondence games when the server ends them", () => {
    const unlimited = online()
    apply(unlimited.clock, { kind: "unlimited", speed: null, status: "mate", winner: "black" })
    assert.equal(unlimited.clock.snapshot().terminal, true)
    assert.equal(unlimited.clock.snapshot().phase, "frozen")

    const correspondence = online()
    apply(correspondence.clock, {
      kind: "correspondence",
      speed: "correspondence",
      daysPerTurn: 2,
      whiteMs: 172_800_000,
      blackMs: 172_800_000,
      whiteIncrementMs: 0,
      blackIncrementMs: 0,
    })
    correspondence.time.advance(1_000)
    assert.equal(correspondence.clock.displayMillis("white"), 172_799_000)
    apply(correspondence.clock, {
      kind: "correspondence",
      speed: "correspondence",
      daysPerTurn: 2,
      status: "resign",
      winner: "black",
      whiteMs: 172_799_000,
      blackMs: 172_800_000,
      ply: 1,
      sideToMove: "black",
    })
    correspondence.time.advance(5_000)
    assert.equal(correspondence.clock.displayMillis("white"), 172_799_000)
    assert.equal(correspondence.clock.snapshot().terminal, true)
  })
})

describe("ChessClock flags", () => {
  it("treats a local online zero as provisional and does not confirm it", () => {
    const { clock, time } = online()
    const { events } = listen(clock)
    apply(clock, { whiteMs: 5_000, blackMs: 9_000 })
    time.advance(5_000)
    const snap = clock.snapshot()
    assert.equal(snap.whiteDisplayMs, 0)
    assert.equal(snap.provisionalFlagColor, "white")
    assert.equal(snap.confirmedFlag, null)
    assert.equal(snap.terminal, false)
    assert.equal(snap.phase, "running")
    time.advance(10_000)
    clock.snapshot()
    assert.equal(events.filter((event) => event.type === "provisionalFlag").length, 1)
  })

  it("clears a provisional zero when the server still shows time", () => {
    const { clock, time } = online()
    const { events } = listen(clock)
    apply(clock, { whiteMs: 5_000 })
    time.advance(5_000)
    clock.snapshot()
    apply(clock, { whiteMs: 4_000, ply: 0 })
    const snap = clock.snapshot()
    assert.equal(snap.whiteDisplayMs, 4_000)
    assert.equal(snap.provisionalFlagColor, null)
    assert.equal(snap.confirmedFlag, null)
    assert.ok(events.some((event) => event.type === "provisionalFlagCleared"))
  })

  it("confirms a flag only from a server outoftime status", () => {
    const { clock, time } = online()
    apply(clock, { whiteMs: 1_000, blackMs: 20_000 })
    time.advance(1_000)
    clock.snapshot()
    apply(clock, {
      status: "outoftime",
      winner: "black",
      whiteMs: 0,
      blackMs: 20_000,
      ply: 0,
    })
    time.advance(3_000)
    const snap = clock.snapshot()
    assert.deepEqual(snap.confirmedFlag, { color: "white", source: "server" })
    assert.equal(snap.provisionalFlagColor, null)
    assert.equal(snap.terminal, true)
    assert.equal(snap.blackDisplayMs, 20_000)
    assert.equal(snap.whiteDisplayMs, 0)
  })

  it("maps server winner and remaining time onto the confirmed flag color", () => {
    const blackFlagged = online()
    apply(blackFlagged.clock, {
      status: "outoftime",
      winner: "white",
      whiteMs: 10,
      blackMs: 10,
    })
    assert.deepEqual(blackFlagged.clock.snapshot().confirmedFlag, {
      color: "black",
      source: "server",
    })

    const whiteByTime = online()
    apply(whiteByTime.clock, {
      status: "outoftime",
      winner: null,
      whiteMs: 0,
      blackMs: 10,
    })
    assert.equal(whiteByTime.clock.snapshot().confirmedFlag?.color, "white")

    const neither = online()
    apply(neither.clock, {
      status: "outoftime",
      winner: null,
      whiteMs: 10,
      blackMs: 10,
    })
    assert.equal(neither.clock.snapshot().confirmedFlag, null)
    assert.equal(neither.clock.snapshot().terminal, true)

    const both = online()
    apply(both.clock, {
      status: "outoftime",
      winner: null,
      whiteMs: 0,
      blackMs: 0,
    })
    assert.equal(both.clock.snapshot().confirmedFlag, null)
  })

  it("flags black locally when black is the side to move", () => {
    const { clock, time } = offline(60, 0, "black")
    time.advance(60_000)
    const snap = clock.snapshot()
    assert.deepEqual(snap.confirmedFlag, { color: "black", source: "local" })
    assert.equal(snap.blackDisplayMs, 0)
    assert.equal(snap.whiteDisplayMs, 60_000)
    assert.equal(snap.terminal, true)
  })

  it("flags an offline clock locally and then ignores the late move", () => {
    const { clock, time } = offline(60, 1)
    const { events } = listen(clock)
    time.advance(60_000)
    clock.applyAcceptedMove({
      accepted: true,
      revision: "late",
      ply: 1,
      mover: "white",
    })
    const snap = clock.snapshot()
    assert.deepEqual(snap.confirmedFlag, { color: "white", source: "local" })
    assert.equal(snap.provisionalFlagColor, null)
    assert.equal(snap.terminal, true)
    assert.equal(snap.whiteDisplayMs, 0)
    assert.equal(snap.phase, "frozen")
    time.advance(1_000)
    assert.equal(clock.displayMillis("black"), 60_000)
    assert.ok(events.some((event) => event.type === "confirmedFlag" && event.source === "local"))
    assert.ok(events.some((event) => event.type === "moveIgnored" && event.reason === "localFlag"))
  })
})

describe("ChessClock increments", () => {
  it("adds a zero increment once and only for an accepted move", () => {
    const { clock, time } = online()
    apply(clock, { whiteIncrementMs: 0, blackIncrementMs: 0 })
    time.advance(1_000)
    clock.applyAcceptedMove({ accepted: false, revision: "nope", ply: 1, mover: "white" })
    assert.equal(clock.displayMillis("white"), 299_000)
    assert.equal(clock.snapshot().activeColor, "white")
    clock.applyAcceptedMove({ accepted: true, revision: "m1", ply: 1, mover: "white" })
    assert.equal(clock.displayMillis("white"), 299_000)
    assert.equal(clock.displayMillis("black"), 300_000)
    assert.equal(clock.snapshot().activeColor, "black")
    clock.applyAcceptedMove({ accepted: true, revision: "m1", ply: 1, mover: "white" })
    assert.equal(clock.displayMillis("white"), 299_000)
    assert.equal(clock.snapshot().activeColor, "black")
  })

  it("adds Fischer increment once, then adopts the server time without adding it again", () => {
    const { clock, time } = online()
    const { events } = listen(clock)
    apply(clock, { whiteIncrementMs: 3_000, blackIncrementMs: 3_000, speed: "blitz" })
    time.advance(1_000)
    clock.applyAcceptedMove({ accepted: true, revision: "m1", ply: 1, mover: "white" })
    assert.equal(clock.displayMillis("white"), 302_000)
    assert.equal(clock.snapshot().activeColor, "black")
    time.advance(500)
    assert.equal(clock.displayMillis("black"), 299_500)
    apply(clock, {
      ply: 1,
      sideToMove: "black",
      whiteMs: 301_200,
      blackMs: 299_000,
      whiteIncrementMs: 3_000,
      blackIncrementMs: 3_000,
    })
    assert.equal(clock.displayMillis("white"), 301_200)
    assert.equal(clock.displayMillis("black"), 299_000)
    clock.applyAcceptedMove({ accepted: true, revision: "m1", ply: 1, mover: "white" })
    assert.equal(clock.displayMillis("white"), 301_200)
    const applied = events.filter((event) => event.type === "moveApplied")
    assert.equal(applied.length, 1)
    assert.equal(applied[0]?.type === "moveApplied" ? applied[0].incrementMs : null, 3_000)
  })

  it("does not increment a move the server snapshot already includes", () => {
    const { clock } = online()
    const { events } = listen(clock)
    apply(clock, {
      ply: 1,
      sideToMove: "black",
      whiteMs: 302_000,
      whiteIncrementMs: 3_000,
      blackIncrementMs: 3_000,
    })
    clock.applyAcceptedMove({ accepted: true, revision: "m1", ply: 1, mover: "white" })
    assert.equal(clock.displayMillis("white"), 302_000)
    assert.equal(clock.snapshot().activeColor, "black")
    assert.ok(events.some((event) => event.type === "moveIgnored" && event.reason === "alreadyReconciled"))
  })

  it("uses each side's own increment and ignores the wrong mover", () => {
    const { clock, time } = online()
    apply(clock, { whiteIncrementMs: 2_000, blackIncrementMs: 5_000 })
    time.advance(1_000)
    clock.applyAcceptedMove({ accepted: true, revision: "black-first", ply: 1, mover: "black" })
    assert.equal(clock.snapshot().activeColor, "white")
    assert.equal(clock.displayMillis("white"), 299_000)
    clock.applyAcceptedMove({ accepted: true, revision: "w", ply: 1, mover: "white" })
    time.advance(2_000)
    clock.applyAcceptedMove({ accepted: true, revision: "b", ply: 2, mover: "black" })
    assert.equal(clock.displayMillis("white"), 301_000)
    assert.equal(clock.displayMillis("black"), 303_000)
    assert.equal(clock.snapshot().activeColor, "white")
  })

  it("lets a rejected revision be accepted later, exactly once", () => {
    const { clock, time } = offline(300, 3)
    time.advance(1_000)
    clock.applyAcceptedMove({ accepted: false, revision: "r", ply: 1, mover: "white" })
    clock.applyAcceptedMove({ accepted: true, revision: "r", ply: 1, mover: "white" })
    clock.applyAcceptedMove({ accepted: true, revision: "r", ply: 1, mover: "white" })
    assert.equal(clock.displayMillis("white"), 302_000)
    assert.equal(clock.snapshot().activeColor, "black")
  })

  it("does not apply the same ply twice while the first revision is still live", () => {
    const { clock } = offline(300, 3)
    clock.applyAcceptedMove({ accepted: true, revision: "a", ply: 1, mover: "white" })
    clock.applyAcceptedMove({ accepted: true, revision: "b", ply: 1, mover: "white" })
    assert.equal(clock.displayMillis("white"), 303_000)
    assert.equal(clock.snapshot().activeColor, "black")
  })

  it("still increments an online move the server accepted after a provisional zero", () => {
    const { clock, time } = online()
    apply(clock, { whiteMs: 5_000, blackMs: 30_000, whiteIncrementMs: 1_000, blackIncrementMs: 1_000 })
    time.advance(5_000)
    clock.snapshot()
    clock.applyAcceptedMove({ accepted: true, revision: "in-time", ply: 1, mover: "white" })
    assert.equal(clock.displayMillis("white"), 1_000)
    assert.equal(clock.snapshot().activeColor, "black")
    assert.equal(clock.snapshot().provisionalFlagColor, null)
    assert.equal(clock.snapshot().confirmedFlag, null)
    apply(clock, {
      ply: 1,
      sideToMove: "black",
      whiteMs: 800,
      blackMs: 30_000,
      whiteIncrementMs: 1_000,
      blackIncrementMs: 1_000,
    })
    assert.equal(clock.displayMillis("white"), 800)
  })

  it("adds increment for an offline move with one millisecond left and not at zero", () => {
    const { clock, time } = offline(60, 1)
    time.advance(59_999)
    clock.applyAcceptedMove({ accepted: true, revision: "just", ply: 1, mover: "white" })
    assert.equal(clock.displayMillis("white"), 1_001)
    assert.equal(clock.snapshot().confirmedFlag, null)
    assert.equal(clock.snapshot().activeColor, "black")
  })

  it("does not synthesize a correspondence or absent increment", () => {
    const { clock, time } = online()
    const { events } = listen(clock)
    clock.applyAcceptedMove({ accepted: true, revision: "early", ply: 1, mover: "white" })
    apply(clock, {
      kind: "correspondence",
      speed: "correspondence",
      daysPerTurn: 2,
      whiteMs: 172_800_000,
      blackMs: 172_800_000,
      whiteIncrementMs: 5_000,
      blackIncrementMs: 5_000,
    })
    time.advance(1_000)
    clock.applyAcceptedMove({ accepted: true, revision: "c1", ply: 1, mover: "white" })
    assert.equal(clock.displayMillis("white"), 172_799_000)
    assert.equal(clock.snapshot().activeColor, "white")
    assert.ok(events.some((event) => event.type === "moveIgnored" && event.reason === "absent"))
    assert.ok(
      events.some((event) => event.type === "moveIgnored" && event.reason === "nonFischerTimeControl"),
    )
  })

  it("ignores a move while the online clock is created but not running", () => {
    const { clock } = online()
    const { events } = listen(clock)
    apply(clock, { status: "created" })
    clock.applyAcceptedMove({ accepted: true, revision: "c", ply: 1, mover: "white" })
    assert.equal(clock.snapshot().activeColor, "white")
    assert.equal(clock.displayMillis("white"), 300_000)
    assert.ok(events.some((event) => event.type === "moveIgnored" && event.reason === "notRunning"))
  })

  it("ignores a move after a terminal snapshot", () => {
    const { clock } = online()
    apply(clock, { status: "mate", winner: "white", whiteMs: 10_000, blackMs: 10_000 })
    clock.applyAcceptedMove({ accepted: true, revision: "after", ply: 1, mover: "white" })
    assert.equal(clock.displayMillis("white"), 10_000)
    assert.equal(clock.snapshot().activeColor, "white")
  })
})

describe("ChessClock authoritative ordering", () => {
  it("applies a higher server time instead of treating elapsed time as staleness", () => {
    const { clock, time } = online()
    apply(clock, { whiteMs: 300_000 })
    time.advance(10_000)
    assert.equal(clock.displayMillis("white"), 290_000)
    apply(clock, { whiteMs: 295_000, ply: 0 })
    assert.equal(clock.displayMillis("white"), 295_000)
  })

  it("ignores an exact duplicate snapshot so it does not refund elapsed time", () => {
    const { clock, time } = online()
    const { events } = listen(clock)
    const first = auth()
    clock.applyAuthoritativeSnapshot(first)
    time.advance(1_000)
    clock.applyAuthoritativeSnapshot(first)
    assert.equal(clock.displayMillis("white"), 299_000)
    assert.ok(events.some((event) => event.type === "authoritativeIgnored" && event.reason === "duplicate"))
  })

  it("updates expiration without resetting the running anchor", () => {
    const { clock, time } = online()
    apply(clock, { expiration: { idleMillis: 10, millisToMove: 30_000 } })
    time.advance(1_000)
    apply(clock, { expiration: { idleMillis: 1_500, millisToMove: 30_000 } })
    const snap = clock.snapshot()
    assert.equal(snap.whiteDisplayMs, 299_000)
    assert.deepEqual(snap.expiration, { idleMillis: 1_500, millisToMove: 30_000 })
  })

  it("drops a stale generation and applies a newer one even when its time is higher", () => {
    const { clock, time } = online()
    const { events } = listen(clock)
    apply(clock, { generation: 2, whiteMs: 280_000 })
    time.advance(1_000)
    apply(clock, { generation: 1, whiteMs: 1 })
    assert.equal(clock.displayMillis("white"), 279_000)
    apply(clock, { generation: 3, whiteMs: 300_000 })
    assert.equal(clock.displayMillis("white"), 300_000)
    assert.ok(
      events.some((event) => event.type === "authoritativeIgnored" && event.reason === "staleGeneration"),
    )
  })

  it("rewinds to a shorter ply and allows the replacement move to increment once", () => {
    const { clock } = online()
    apply(clock, { whiteIncrementMs: 1_000, blackIncrementMs: 1_000, whiteMs: 100_000, blackMs: 100_000 })
    clock.applyAcceptedMove({ accepted: true, revision: "w", ply: 1, mover: "white" })
    clock.applyAcceptedMove({ accepted: true, revision: "b", ply: 2, mover: "black" })
    apply(clock, {
      ply: 1,
      sideToMove: "black",
      whiteMs: 110_000,
      blackMs: 90_000,
      whiteIncrementMs: 1_000,
      blackIncrementMs: 1_000,
    })
    clock.applyAcceptedMove({ accepted: true, revision: "b", ply: 2, mover: "black" })
    clock.applyAcceptedMove({ accepted: true, revision: "new", ply: 2, mover: "black" })
    assert.equal(clock.displayMillis("white"), 110_000)
    assert.equal(clock.displayMillis("black"), 91_000)
    assert.equal(clock.snapshot().activeColor, "white")
  })

  it("ignores a malformed authoritative snapshot", () => {
    const { clock, time } = online()
    apply(clock, { whiteMs: 50_000 })
    time.advance(1_000)
    apply(clock, { whiteMs: -1, ply: 1 })
    apply(clock, { whiteMs: 1.5, ply: 2 })
    apply(clock, { status: "not-a-status", ply: 3 })
    assert.equal(clock.displayMillis("white"), 49_000)
    assert.equal(clock.snapshot().ply, 0)
  })
})

describe("ChessClock offline controls and view continuity", () => {
  it("runs a deterministic offline clock for the side to move", () => {
    const white = offline(600, 0, "white")
    white.time.advance(2_000)
    assert.equal(white.clock.displayMillis("white"), 598_000)
    assert.equal(white.clock.displayMillis("black"), 600_000)
    assert.equal(white.clock.snapshot().speed, "rapid")

    const black = offline(300, 0, "black")
    black.time.advance(2_000)
    assert.equal(black.clock.displayMillis("black"), 298_000)
    assert.equal(black.clock.displayMillis("white"), 300_000)
    assert.equal(black.clock.snapshot().activeColor, "black")
  })

  it("uses the Lichess 3 second floor for a 0+1 offline clock", () => {
    const { clock } = offline(0, 1)
    assert.equal(clock.displayMillis("white"), 3_000)
    assert.equal(clock.displayMillis("black"), 3_000)
    assert.equal(clock.snapshot().whiteIncrementMs, 1_000)
  })

  it("pauses black's offline clock without moving white", () => {
    const { clock, time } = offline(60, 0, "black")
    time.advance(1_500)
    assert.equal(clock.pause(), true)
    time.advance(9_000)
    assert.equal(clock.displayMillis("black"), 58_500)
    assert.equal(clock.displayMillis("white"), 60_000)
    assert.equal(clock.snapshot().phase, "paused")
  })

  it("pauses and resumes without accumulating paused time", () => {
    const { clock, time } = offline()
    time.advance(1_500)
    assert.equal(clock.pause(), true)
    time.advance(9_000)
    assert.equal(clock.displayMillis("white"), 298_500)
    assert.equal(clock.snapshot().phase, "paused")
    assert.equal(clock.pause(), false)
    assert.equal(clock.resume(), true)
    time.advance(500)
    assert.equal(clock.displayMillis("white"), 298_000)
    assert.equal(clock.resume(), false)
  })

  it("does not pause or resume an authoritative online clock", () => {
    const { clock, time } = online()
    const { events } = listen(clock)
    apply(clock, {})
    assert.equal(clock.pause(), false)
    assert.equal(clock.resume(), false)
    time.advance(1_000)
    assert.equal(clock.displayMillis("white"), 299_000)
    assert.ok(
      events.some(
        (event) => event.type === "pauseRejected" && event.reason === "onlineClockIsAuthoritative",
      ),
    )
  })

  it("ignores clock taps for turn and increment in both modes", () => {
    const local = offline(300, 5)
    const localEvents = listen(local.clock)
    local.time.advance(1_000)
    local.clock.notifyTapped("white")
    local.clock.notifyTapped("black")
    assert.equal(local.clock.snapshot().activeColor, "white")
    assert.equal(local.clock.displayMillis("white"), 299_000)
    assert.equal(localEvents.events.filter((event) => event.type === "tapIgnored").length, 2)

    const remote = online()
    apply(remote.clock, { whiteIncrementMs: 5_000, blackIncrementMs: 5_000 })
    remote.time.advance(1_000)
    remote.clock.notifyTapped("white")
    assert.equal(remote.clock.snapshot().activeColor, "white")
    assert.equal(remote.clock.displayMillis("white"), 299_000)
  })

  it("keeps the same instance and bank across a view unsubscribe and resubscribe", () => {
    const { clock, time } = offline(600, 0)
    const firstView = listen(clock)
    time.advance(2_000)
    firstView.unsubscribe()
    const mid = clock.displayMillis("white")
    assert.equal(mid, 598_000)
    const sameClock = clock
    const secondView = listen(sameClock)
    time.advance(3_000)
    assert.equal(sameClock, clock)
    assert.equal(clock.displayMillis("white"), 595_000)
    assert.equal(clock.snapshot().phase, "running")
    secondView.unsubscribe()
    assert.equal(firstView.events.length, 0)
  })

  it("records opponent-gone without moving the chess clock", () => {
    const { clock, time } = online()
    apply(clock, {})
    time.advance(1_000)
    const before = clock.displayMillis("white")
    clock.noteOpponentGone({ gone: true, claimWinInSeconds: 30 })
    assert.equal(clock.displayMillis("white"), before)
    time.advance(1_000)
    assert.equal(clock.displayMillis("white"), 298_000)
    assert.deepEqual(clock.snapshot().opponentGone, { gone: true, claimWinInSeconds: 30 })
  })

  it("refuses a server snapshot on an offline clock and a non-realtime offline control", () => {
    const { clock } = offline()
    assert.throws(() => apply(clock, { whiteMs: 1 }), ClockModeError)
    assert.equal(clock.displayMillis("white"), 300_000)
    const time = new ManualMonotonicTimeSource()
    assert.throws(
      () => ChessClock.createOffline(time, LichessTimeControl.unlimited()),
      ClockModeError,
    )
    assert.throws(
      () => ChessClock.createOffline(time, LichessTimeControl.correspondence(2)),
      ClockModeError,
    )
  })

  it("does not expose a move, resign, or network submission method", () => {
    const names = Object.getOwnPropertyNames(ChessClock.prototype)
    assert.equal(names.some((name) => /submit|resign|fetch|network|uci/i.test(name)), false)
  })
})

describe("ChessClock listeners and dispose", () => {
  it("isolates listener failures and honors unsubscribe", () => {
    const { clock } = offline()
    let healthy = 0
    const unsubscribe = clock.subscribe(() => {
      healthy += 1
    })
    clock.subscribe(() => {
      throw new Error("view failed")
    })
    clock.notifyTapped("white")
    assert.equal(healthy, 1)
    unsubscribe()
    clock.notifyTapped("black")
    assert.equal(healthy, 1)
  })

  it("freezes snapshots so a view cannot write back into the clock", () => {
    const { clock, time } = offline()
    const snap = clock.snapshot()
    assert.throws(() => {
      ;(snap as { phase: string }).phase = "frozen"
    }, TypeError)
    time.advance(1_000)
    assert.equal(clock.displayMillis("white"), 299_000)
  })

  it("disposes listeners and rejects later use", () => {
    const { clock, time } = offline()
    const { events } = listen(clock)
    clock.dispose()
    assert.equal(events.at(-1)?.type, "disposed")
    time.advance(1_000)
    assert.equal(events.length, 1)
    for (const action of [
      () => clock.snapshot(),
      () => clock.displayMillis("white"),
      () => clock.subscribe(() => undefined),
      () => clock.pause(),
      () => clock.resume(),
      () => clock.notifyTapped("white"),
      () => clock.applyAcceptedMove({ accepted: true, revision: "x", ply: 1, mover: "white" }),
      () => clock.noteOpponentGone({ gone: false, claimWinInSeconds: null }),
    ]) {
      assert.throws(action, ClockDisposedError)
    }
  })

  it("rejects pause after an offline flag", () => {
    const { clock, time } = offline(60, 0)
    time.advance(60_000)
    clock.snapshot()
    assert.equal(clock.pause(), false)
    assert.equal(clock.resume(), false)
  })
})
