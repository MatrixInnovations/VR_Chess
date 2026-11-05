import { ChessClock, type ClockTapTarget, type Color } from "./ChessClock.ts"
import { ManualMonotonicTimeSource } from "./MonotonicTimeSource.ts"

/**
 * Reading Ultron's `GameSession` stores from `IClockPort`.
 * `flagged` is a confirmed clock flag only. An online zero leaves it null
 * so the session does not adjudicate a provisional timeout.
 */
export interface ClockReading {
  readonly whiteMs: number
  readonly blackMs: number
  readonly flagged: Color | null
}

/**
 * Structural match for Ultron `IClockPort` (`Chess/3d-chess-vr/src/ultron/contracts/IClockPort.ts` in PR #5).
 * This lane does not import that branch. On a foundation rebase, prefer that import.
 *
 * `atMs` is the session clock. Only forward deltas are applied, so an epoch
 * stamp and a monotonic stamp both work. LichessClient mints stream generation
 * for {@link LichessClockSynchronizer}; this port does not.
 * Give-time and berserk arrive through `sync` and do not emit an accepted move.
 * Correspondence still waits for `gameState` on the synchronizer; this port is the realtime Fischer port the session calls.
 */
export interface IClockPort {
  /**
   * @param reading - Server or corrected remaining time. `sideToMove` is optional because the published session call omits it.
   * @param atMs - Session timestamp.
   */
  sync(
    reading: { readonly whiteMs: number; readonly blackMs: number; readonly sideToMove?: Color },
    atMs: number,
  ): ClockReading
  /**
   * @param movedBy - Side that completed an accepted move. Offline today; online after Lichess confirms.
   * @param atMs - Session timestamp.
   */
  onMovePlayed(movedBy: Color, atMs: number): ClockReading
  /**
   * @param atMs - Session timestamp.
   */
  read(atMs: number): ClockReading
  /**
   * @param config - Initial banks and the one offline increment shared by both sides.
   * @param turn - Side about to move.
   * @param atMs - Session timestamp.
   */
  arm(
    config: { readonly whiteMs: number; readonly blackMs: number; readonly incrementMs: number },
    turn: Color,
    atMs: number,
  ): ClockReading
  /** Stop the countdown without disposing the clock. */
  stop(): void
  /** Release the underlying clock. */
  dispose(): void
}

/**
 * Adapts {@link ChessClock} to {@link IClockPort}.
 * The same `chessClock` is what Vision and the physical model subscribe to.
 * {@link ClockTapTarget} goes to `chessClock.acceptTap` and never to `onMovePlayed`.
 */
export class ChessClockPort implements IClockPort {
  readonly chessClock: ChessClock
  private readonly time: ManualMonotonicTimeSource
  private lastAt: number | null = null
  private moveSerial = 0
  private ply = 0

  /**
   * @param mode - Offline clocks may flag locally. Online zeros stay provisional.
   */
  constructor(mode: "online" | "offline") {
    this.time = new ManualMonotonicTimeSource(0)
    this.chessClock = ChessClock.createArmed(this.time, {
      mode,
      whiteMs: 0,
      blackMs: 0,
      incrementMs: 0,
      sideToMove: "white",
    })
  }

  /** @inheritdoc */
  sync(
    reading: { readonly whiteMs: number; readonly blackMs: number; readonly sideToMove?: Color },
    atMs: number,
  ): ClockReading {
    this.seek(atMs)
    this.chessClock.replaceRemaining(reading.whiteMs, reading.blackMs, reading.sideToMove)
    return this.reading()
  }

  /** @inheritdoc */
  onMovePlayed(movedBy: Color, atMs: number): ClockReading {
    this.seek(atMs)
    this.ply += 1
    this.moveSerial += 1
    this.chessClock.applyAcceptedMove({
      accepted: true,
      mover: movedBy,
      ply: this.ply,
      revision: `ultron-${this.moveSerial}`,
    })
    return this.reading()
  }

  /** @inheritdoc */
  read(atMs: number): ClockReading {
    this.seek(atMs)
    return this.reading()
  }

  /** @inheritdoc */
  arm(
    config: { readonly whiteMs: number; readonly blackMs: number; readonly incrementMs: number },
    turn: Color,
    atMs: number,
  ): ClockReading {
    this.seek(atMs)
    this.ply = 0
    this.moveSerial = 0
    this.chessClock.rearm({
      whiteMs: config.whiteMs,
      blackMs: config.blackMs,
      incrementMs: config.incrementMs,
      sideToMove: turn,
    })
    return this.reading()
  }

  /** @inheritdoc */
  stop(): void {
    this.chessClock.hold()
  }

  /** @inheritdoc */
  dispose(): void {
    this.chessClock.dispose()
  }

  private seek(atMs: number): void {
    if (this.lastAt === null) {
      this.lastAt = atMs
      return
    }
    const delta = atMs - this.lastAt
    if (delta > 0) {
      this.time.advance(delta)
      this.lastAt = atMs
    }
  }

  private reading(): ClockReading {
    const snap = this.chessClock.snapshot()
    return Object.freeze({
      whiteMs: snap.whiteDisplayMs ?? 0,
      blackMs: snap.blackDisplayMs ?? 0,
      flagged: snap.confirmedFlag?.color ?? null,
    })
  }
}

export type { ClockTapTarget }
