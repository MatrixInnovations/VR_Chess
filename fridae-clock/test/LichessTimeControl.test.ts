import assert from "node:assert/strict"
import { describe, it } from "node:test"
import {
  LichessTimeControl,
  LichessTimeControlError,
  type BoardApiOrigin,
  type LichessSpeed,
} from "../src/LichessTimeControl.ts"

describe("LichessTimeControl realtime domain", () => {
  it("accepts the documented challenge-API limits and increments", () => {
    for (const limit of [0, 15, 30, 45, 60, 90, 120, 180, 600, 1140, 10800]) {
      const control = LichessTimeControl.realtime(limit, 0 === limit ? 1 : 0)
      assert.equal(control.kind, "realtime")
      assert.equal(control.limitSeconds, limit)
      assert.equal(control.daysPerTurn, null)
    }
    assert.equal(LichessTimeControl.realtime(300, 60).incrementSeconds, 60)
    assert.equal(LichessTimeControl.realtime(300, 0).incrementSeconds, 0)
  })

  it("rejects limits and increments outside the documented set, including 0+0", () => {
    for (const [limit, increment] of [
      [0, 0],
      [1, 0],
      [20, 0],
      [61, 0],
      [75, 0],
      [105, 1],
      [10801, 0],
      [10860, 0],
      [-15, 1],
      [300, -1],
      [300, 61],
      [300, 180],
      [15.5, 0],
      [60, 1.2],
    ] as const) {
      assert.throws(
        () => LichessTimeControl.realtime(limit, increment),
        LichessTimeControlError,
      )
    }
  })

  it("labels realtime controls the way Lichess prints them", () => {
    assert.equal(LichessTimeControl.realtime(0, 1).show, "0+1")
    assert.equal(LichessTimeControl.realtime(15, 1).show, "¼+1")
    assert.equal(LichessTimeControl.realtime(30, 0).show, "½+0")
    assert.equal(LichessTimeControl.realtime(45, 2).show, "¾+2")
    assert.equal(LichessTimeControl.realtime(90, 1).show, "1.5+1")
    assert.equal(LichessTimeControl.realtime(60, 0).show, "1+0")
    assert.equal(LichessTimeControl.realtime(300, 3).show, "5+3")
    assert.equal(LichessTimeControl.realtime(10800, 60).show, "180+60")
  })

  it("uses Lichess initTime, including the 3 second floor when the limit is 0", () => {
    assert.equal(LichessTimeControl.realtime(300, 0).initialBankMs(), 300_000)
    assert.equal(LichessTimeControl.realtime(15, 0).initialBankMs(), 15_000)
    assert.equal(LichessTimeControl.realtime(0, 1).initialBankMs(), 3_000)
    assert.equal(LichessTimeControl.realtime(0, 5).initialBankMs(), 5_000)
  })
})

describe("LichessTimeControl correspondence and unlimited", () => {
  it("accepts only the documented correspondence day enum", () => {
    for (const days of [1, 2, 3, 5, 7, 10, 14]) {
      const control = LichessTimeControl.correspondence(days)
      assert.equal(control.kind, "correspondence")
      assert.equal(control.daysPerTurn, days)
      assert.equal(control.speed, "correspondence")
      assert.equal(control.limitSeconds, null)
      assert.equal(control.incrementSeconds, null)
      assert.equal(control.initialBankMs(), null)
      assert.equal(control.show, `${days}d`)
    }
    for (const days of [0, 4, 6, 15, -1, 1.5]) {
      assert.throws(
        () => LichessTimeControl.correspondence(days),
        LichessTimeControlError,
      )
    }
  })

  it("represents unlimited as its own control with no bank and no Fischer increment", () => {
    const control = LichessTimeControl.unlimited()
    assert.equal(control.kind, "unlimited")
    assert.equal(control.speed, null)
    assert.equal(control.show, "unlimited")
    assert.equal(control.initialBankMs(), null)
    assert.equal(control.daysPerTurn, null)
  })
})

describe("Lichess speed and Board API policy", () => {
  const origins: readonly BoardApiOrigin[] = [
    "seek",
    "directChallenge",
    "ai",
    "bulkPairing",
  ]

  function controlFor(speed: LichessSpeed | "unlimited"): LichessTimeControl {
    switch (speed) {
      case "ultraBullet":
        return LichessTimeControl.realtime(15, 0)
      case "bullet":
        return LichessTimeControl.realtime(60, 0)
      case "blitz":
        return LichessTimeControl.realtime(300, 0)
      case "rapid":
        return LichessTimeControl.realtime(600, 0)
      case "classical":
        return LichessTimeControl.realtime(1800, 0)
      case "correspondence":
        return LichessTimeControl.correspondence(3)
      case "unlimited":
        return LichessTimeControl.unlimited()
      default: {
        const neverSpeed: never = speed
        return neverSpeed
      }
    }
  }

  it("classifies estimated total time with the scalachess ranges", () => {
    assert.equal(LichessTimeControl.realtime(15, 0).speed, "ultraBullet")
    assert.equal(LichessTimeControl.realtime(0, 1).speed, "bullet")
    assert.equal(LichessTimeControl.realtime(30, 0).speed, "bullet")
    assert.equal(LichessTimeControl.realtime(120, 1).speed, "bullet")
    assert.equal(LichessTimeControl.realtime(180, 0).speed, "blitz")
    assert.equal(LichessTimeControl.realtime(300, 3).speed, "blitz")
    assert.equal(LichessTimeControl.realtime(420, 0).speed, "blitz")
    assert.equal(LichessTimeControl.realtime(480, 0).speed, "rapid")
    assert.equal(LichessTimeControl.realtime(1440, 0).speed, "rapid")
    assert.equal(LichessTimeControl.realtime(900, 10).speed, "rapid")
    assert.equal(LichessTimeControl.realtime(1500, 0).speed, "classical")
    assert.equal(LichessTimeControl.realtime(10800, 60).speed, "classical")
  })

  it("allows only the Board API speeds, with blitz limited to direct, AI, and bulk games", () => {
    const cases: readonly (LichessSpeed | "unlimited")[] = [
      "ultraBullet",
      "bullet",
      "blitz",
      "rapid",
      "classical",
      "correspondence",
      "unlimited",
    ]
    for (const speed of cases) {
      for (const origin of origins) {
        const allowed = controlFor(speed).isAllowedForBoardApi(origin)
        const expectAllowed =
          speed === "rapid" ||
          speed === "classical" ||
          speed === "correspondence" ||
          (speed === "blitz" && origin !== "seek")
        assert.equal(allowed, expectAllowed, `${speed} via ${origin}`)
      }
    }
  })
})
