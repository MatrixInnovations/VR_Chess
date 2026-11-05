import type { IChessClockReadModel } from './ports/IChessClockReadModel'

/** A side of the chess clock. */
export type ClockSide = 'white' | 'black'

/**
 * How one side's time should be drawn.
 *
 * - `running` — no expiry styling. A zero reading alone stays here.
 * - `provisional-expired` — online, time appears expired, flag not confirmed.
 * - `confirmed-flag` — online confirmed flag.
 * - `offline-local-flag` — offline locally adjudicated flag.
 */
export type ClockExpiryVisual =
  | 'running'
  | 'provisional-expired'
  | 'confirmed-flag'
  | 'offline-local-flag'

/**
 * Presentation of one side, copied from the bound read model.
 */
export interface IClockSideView {
  /** Which side this row describes. */
  readonly side: ClockSide
  /** Remaining milliseconds, unchanged from the read model. */
  readonly remainingMs: number
  /** Whether the read model says this side's clock is running. */
  readonly isActive: boolean
  /** Expiry styling derived only from read-model flags plus the reported time. */
  readonly expiry: ClockExpiryVisual
}

/**
 * Full clock presentation for one read of the bound model.
 */
export interface IClockViewSnapshot {
  /** White's row. */
  readonly white: IClockSideView
  /** Black's row. */
  readonly black: IClockSideView
  /** Active side, copied from the read model. */
  readonly active: IChessClockReadModel['active']
  /** Provisional-expired flag, copied from the read model. */
  readonly provisionalExpired: boolean
  /** Confirmed flag, copied from the read model. */
  readonly confirmedFlag: IChessClockReadModel['confirmedFlag']
  /** Offline flag, copied from the read model. */
  readonly offline: boolean
}

/**
 * Visual binding to a Fridae {@link IChessClockReadModel}.
 *
 * This class does not own time. It does not subtract milliseconds, read the
 * wall clock, or decide that zero by itself is a flag. Every number and flag
 * on a snapshot is taken from the bound read model inside {@link ChessClockView.present}.
 *
 * Online, `provisionalExpired` together with a non-positive reported remaining
 * time and no confirmed flag renders `provisional-expired` ("time appears
 * expired"). A `confirmedFlag` renders `confirmed-flag` and wins over the
 * provisional bit so the two states cannot look the same. Offline, a
 * `confirmedFlag` renders `offline-local-flag`. Offline provisional expiry is
 * not shown: without a remote arbiter the confirmed flag is the only flag UI.
 */
export class ChessClockView {
  private model: IChessClockReadModel

  /**
   * @param model - Clock read model to mirror. Stored by reference, not copied.
   */
  constructor(model: IChessClockReadModel) {
    this.model = model
  }

  /**
   * Bind a different read model.
   * Times are not copied into local countdown state.
   *
   * @param model - Replacement read model.
   */
  bind(model: IChessClockReadModel): void {
    this.model = model
  }

  /** The read model last passed to the constructor or {@link ChessClockView.bind}. */
  get source(): IChessClockReadModel {
    return this.model
  }

  /**
   * Build a presentation snapshot from the current read-model fields.
   * Repeated calls do not change the model and do not advance time.
   */
  present(): IClockViewSnapshot {
    return {
      white: this.presentSide('white'),
      black: this.presentSide('black'),
      active: this.model.active,
      provisionalExpired: this.model.provisionalExpired,
      confirmedFlag: this.model.confirmedFlag,
      offline: this.model.offline,
    }
  }

  /**
   * @param side - Side to project. The millisecond value is the model's field, not a diff.
   */
  private presentSide(side: ClockSide): IClockSideView {
    const remainingMs = side === 'white' ? this.model.whiteMs : this.model.blackMs
    return {
      side,
      remainingMs,
      isActive: this.model.active === side,
      expiry: this.expiryFor(side, remainingMs),
    }
  }

  /**
   * Map read-model flags to a visual.
   *
   * Precedence is confirmed or offline flag, then online provisional expiry,
   * then running. Comparing `remainingMs` with zero only classifies a snapshot
   * the clock already published. It is not a tick.
   *
   * @param side - Side being classified.
   * @param remainingMs - That side's reported remaining time.
   */
  private expiryFor(side: ClockSide, remainingMs: number): ClockExpiryVisual {
    if (this.model.confirmedFlag === side) {
      return this.model.offline ? 'offline-local-flag' : 'confirmed-flag'
    }
    if (
      !this.model.offline &&
      this.model.provisionalExpired &&
      this.model.confirmedFlag === null &&
      remainingMs <= 0
    ) {
      return 'provisional-expired'
    }
    return 'running'
  }
}
