import type { IFridaeClockSnapshot } from '../contracts/IFridaeClockPort'
import type { PieceColor } from '../contracts/types'

/**
 * How one face should be drawn.
 *
 * Mirrors Vision's `ClockExpiryVisual`, plus `no-clock` so an unlimited game
 * or a missing bank cannot be drawn as `0:00`.
 *
 * - `running` — no expiry styling. A published zero with no flag stays here.
 * - `provisional-expired` — online, Fridae says this side hit zero, flag not confirmed.
 * - `confirmed-flag` — online confirmed flag.
 * - `offline-local-flag` — offline confirmed flag.
 * - `no-clock` — absent, unlimited, correspondence, or a null bank.
 */
export type ClockFaceExpiry =
  | 'running'
  | 'provisional-expired'
  | 'confirmed-flag'
  | 'offline-local-flag'
  | 'no-clock'

/** One player's clock face. Numbers are copied from the snapshot. */
export interface IClockSideFace {
  readonly side: PieceColor
  /** Published milliseconds, or null when this face is not a countdown. */
  readonly remainingMs: number | null
  /** Plate text. `—` is no-clock. `0:00` is a published zero. */
  readonly label: string
  /** True when Fridae says this side's clock is the one that is running. */
  readonly isActive: boolean
  readonly expiry: ClockFaceExpiry
}

/**
 * Presentation for both faces.
 * Shaped so Vision's `ChessClockView.present()` can be compared field for field
 * on the shared cases (running, provisional, confirmed, offline flag).
 */
export interface IClockFaceSnapshot {
  readonly white: IClockSideFace
  readonly black: IClockSideFace
  readonly active: PieceColor | 'none'
  readonly provisionalExpired: boolean
  readonly confirmedFlag: PieceColor | null
  readonly offline: boolean
  readonly kind: IFridaeClockSnapshot['kind']
}

/**
 * Format a published millisecond value for a clock plate.
 * This divides the number Fridae already published. It does not read a clock.
 *
 * @param ms - Published remaining time.
 * @returns `m:ss`, or `h:mm:ss` at an hour and beyond.
 */
export function formatPublishedMs(ms: number): string {
  const wholeSeconds = Math.floor(Math.max(0, ms) / 1000)
  const hours = Math.floor(wholeSeconds / 3600)
  const minutes = Math.floor((wholeSeconds % 3600) / 60)
  const seconds = wholeSeconds % 60
  const ss = String(seconds).padStart(2, '0')
  if (hours > 0) {
    return `${hours}:${String(minutes).padStart(2, '0')}:${ss}`
  }
  return `${minutes}:${ss}`
}

/**
 * Maps a Fridae snapshot onto the clock-face contract Vision already uses.
 *
 * Precedence matches `ChessClockView`: a confirmed flag wins, then an online
 * provisional zero, then running. Comparing a published millisecond value with
 * zero only classifies a snapshot Fridae already emitted. This class has no
 * `Date` call and no stored countdown.
 */
export class ClockViewMirror {
  /**
   * Project `snapshot` into two faces.
   * Calling this twice with the same snapshot returns the same labels.
   *
   * @param snapshot - Latest Fridae reading.
   */
  present(snapshot: IFridaeClockSnapshot): IClockFaceSnapshot {
    const offline = snapshot.mode === 'offline'
    const noClock = isNoClock(snapshot)
    return {
      white: this.side('white', snapshot, noClock),
      black: this.side('black', snapshot, noClock),
      active: snapshot.activeColor ?? 'none',
      provisionalExpired:
        !offline && !noClock && snapshot.provisionalFlagColor !== null && snapshot.confirmedFlag === null,
      confirmedFlag: snapshot.confirmedFlag?.color ?? null,
      offline,
      kind: snapshot.kind,
    }
  }

  private side(side: PieceColor, snapshot: IFridaeClockSnapshot, noClock: boolean): IClockSideFace {
    const published = side === 'white' ? snapshot.whiteDisplayMs : snapshot.blackDisplayMs
    if (noClock || published === null) {
      return {
        side,
        remainingMs: null,
        label: '—',
        isActive: false,
        expiry: 'no-clock',
      }
    }
    return {
      side,
      remainingMs: published,
      label: formatPublishedMs(published),
      isActive: snapshot.activeColor === side,
      expiry: this.expiryFor(side, published, snapshot),
    }
  }

  /**
   * Same order as Vision's private `expiryFor`.
   * A published zero is not a flag unless Fridae set one.
   */
  private expiryFor(side: PieceColor, remainingMs: number, snapshot: IFridaeClockSnapshot): ClockFaceExpiry {
    if (snapshot.confirmedFlag?.color === side) {
      return snapshot.mode === 'offline' ? 'offline-local-flag' : 'confirmed-flag'
    }
    if (
      snapshot.mode === 'online' &&
      snapshot.provisionalFlagColor === side &&
      snapshot.confirmedFlag === null &&
      remainingMs <= 0
    ) {
      return 'provisional-expired'
    }
    return 'running'
  }
}

/** Absent, unlimited, and correspondence have no Fischer plate. */
function isNoClock(snapshot: IFridaeClockSnapshot): boolean {
  return snapshot.kind === 'absent' || snapshot.kind === 'unlimited' || snapshot.kind === 'correspondence'
}
