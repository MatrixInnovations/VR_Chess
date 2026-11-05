/**
 * Documented Lichess time controls for the Board API and for the offline clock.
 *
 * Realtime limits and increments follow the challenge endpoint
 * (`clock.limit`, `clock.increment`): limits are 0, 15, 30, 45, 60, 90, or a
 * multiple of 60 up to 10800 seconds, and increment is an integer from 0 to 60
 * seconds. 0+0 is rejected. Correspondence days are 1, 2, 3, 5, 7, 10, or 14.
 * Unlimited is a separate control with no clock and no day budget.
 *
 * Speed buckets match scalachess: estimated seconds = limit + 40 × increment,
 * then ultraBullet 0–29, bullet 30–179, blitz 180–479, rapid 480–1499,
 * classical 1500 and above. The Board API allows rapid, classical, and
 * correspondence. Blitz is additionally allowed for direct challenges, games
 * versus AI, and bulk pairing. Bullet, ultraBullet, and unlimited are outside
 * that Board API list. A live stream may still carry them; display policy
 * lives on the clock, not in this check.
 */

/** Where a Board API game is being created. */
export type BoardApiOrigin = "seek" | "directChallenge" | "ai" | "bulkPairing"

/** `speed` values from the Lichess game stream. */
export type LichessSpeed =
  | "ultraBullet"
  | "bullet"
  | "blitz"
  | "rapid"
  | "classical"
  | "correspondence"

/** Thrown when a caller builds a time control the Lichess docs do not list. */
export class LichessTimeControlError extends Error {
  /**
   * @param message - Which documented constraint failed.
   */
  constructor(message: string) {
    super(message)
    this.name = "LichessTimeControlError"
  }
}

const CORRESPONDENCE_DAYS: readonly number[] = [1, 2, 3, 5, 7, 10, 14]

/**
 * Immutable description of one Lichess time control.
 * Construct it through the static factories so invalid combinations cannot exist.
 */
export class LichessTimeControl {
  /** Realtime Fischer clock, correspondence days, or unlimited. */
  readonly kind: "realtime" | "correspondence" | "unlimited"

  /** Initial realtime budget in seconds, or null when this is not realtime. */
  readonly limitSeconds: number | null

  /** Fischer increment in seconds, or null when this is not realtime. */
  readonly incrementSeconds: number | null

  /** Correspondence days per turn, or null. */
  readonly daysPerTurn: number | null

  /** Lichess speed for a realtime or correspondence control. Null for unlimited. */
  readonly speed: LichessSpeed | null

  /** Short label such as `5+3`, `¼+1`, `2d`, or `unlimited`. */
  readonly show: string

  private constructor(
    kind: "realtime" | "correspondence" | "unlimited",
    limitSeconds: number | null,
    incrementSeconds: number | null,
    daysPerTurn: number | null,
    speed: LichessSpeed | null,
    show: string,
  ) {
    this.kind = kind
    this.limitSeconds = limitSeconds
    this.incrementSeconds = incrementSeconds
    this.daysPerTurn = daysPerTurn
    this.speed = speed
    this.show = show
  }

  /**
   * Realtime Fischer control in the challenge-API domain.
   * @param limitSeconds - Documented initial time in seconds.
   * @param incrementSeconds - Documented Fischer increment in seconds.
   */
  static realtime(limitSeconds: number, incrementSeconds: number): LichessTimeControl {
    if (
      !LichessTimeControl.isRealtimeLimit(limitSeconds) ||
      !LichessTimeControl.isRealtimeIncrement(incrementSeconds) ||
      limitSeconds + incrementSeconds <= 0
    ) {
      throw new LichessTimeControlError(
        "Realtime clock must use a documented limit and a 0–60 second increment, and 0+0 is not a clock.",
      )
    }
    return new LichessTimeControl(
      "realtime",
      limitSeconds,
      incrementSeconds,
      null,
      LichessTimeControl.speedFor(limitSeconds, incrementSeconds),
      `${LichessTimeControl.limitLabel(limitSeconds)}+${incrementSeconds}`,
    )
  }

  /**
   * Correspondence control. Days per turn reset on the server; this class does not invent a Fischer day increment.
   * @param daysPerTurn - One of 1, 2, 3, 5, 7, 10, 14.
   */
  static correspondence(daysPerTurn: number): LichessTimeControl {
    if (!CORRESPONDENCE_DAYS.includes(daysPerTurn)) {
      throw new LichessTimeControlError(
        "Correspondence days per turn must be 1, 2, 3, 5, 7, 10, or 14.",
      )
    }
    return new LichessTimeControl(
      "correspondence",
      null,
      null,
      daysPerTurn,
      "correspondence",
      `${daysPerTurn}d`,
    )
  }

  /**
   * Unlimited game. There is no countdown and no increment.
   */
  static unlimited(): LichessTimeControl {
    return new LichessTimeControl("unlimited", null, null, null, null, "unlimited")
  }

  /**
   * Starting bank for a realtime clock, in milliseconds.
   * scalachess gives a 0+increment game at least three seconds (`Clock.initTime`).
   * Correspondence and unlimited have no Fischer bank.
   */
  initialBankMs(): number | null {
    if (this.kind !== "realtime" || this.limitSeconds === null || this.incrementSeconds === null) {
      return null
    }
    if (this.limitSeconds === 0) {
      return Math.max(this.incrementSeconds * 1000, 3_000)
    }
    return this.limitSeconds * 1000
  }

  /**
   * Whether the Board API restrictions allow creating this control from `origin`.
   * @param origin - Seek, direct challenge, AI game, or bulk pairing.
   */
  isAllowedForBoardApi(origin: BoardApiOrigin): boolean {
    if (this.kind === "correspondence" || this.speed === "rapid" || this.speed === "classical") {
      return true
    }
    if (this.speed === "blitz") {
      return origin !== "seek"
    }
    return false
  }

  private static isRealtimeLimit(limitSeconds: number): boolean {
    if (!Number.isInteger(limitSeconds)) return false
    if (limitSeconds < 0 || limitSeconds > 10_800) return false
    if (limitSeconds % 60 === 0) return true
    return limitSeconds === 15 || limitSeconds === 30 || limitSeconds === 45 || limitSeconds === 90
  }

  private static isRealtimeIncrement(incrementSeconds: number): boolean {
    return Number.isInteger(incrementSeconds) && incrementSeconds >= 0 && incrementSeconds <= 60
  }

  private static speedFor(limitSeconds: number, incrementSeconds: number): LichessSpeed {
    const estimatedSeconds = limitSeconds + 40 * incrementSeconds
    if (estimatedSeconds <= 29) return "ultraBullet"
    if (estimatedSeconds <= 179) return "bullet"
    if (estimatedSeconds <= 479) return "blitz"
    if (estimatedSeconds <= 1499) return "rapid"
    return "classical"
  }

  private static limitLabel(limitSeconds: number): string {
    if (limitSeconds === 15) return "\u00bc"
    if (limitSeconds === 30) return "\u00bd"
    if (limitSeconds === 45) return "\u00be"
    if (limitSeconds === 90) return "1.5"
    return String(limitSeconds / 60)
  }
}
