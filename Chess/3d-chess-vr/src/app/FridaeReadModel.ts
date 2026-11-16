import type { ChessClockPort } from '../../../../fridae-clock/src/ChessClockPort'
import type { ClockViewSnapshot } from '../../../../fridae-clock/src/ChessClock'
import type { IFridaeClockSnapshot } from '../mad-scientist/contracts/IFridaeClockPort'
import type { IChessClockReadModel } from '../vision/ports/IChessClockReadModel'

/**
 * Vision and Mad Scientist read models over one Fridae {@link ChessClockPort}.
 *
 * `refresh` is the only method that samples the clock. The getters copy the
 * last snapshot and do not subtract time themselves.
 */
export class FridaeReadModel implements IChessClockReadModel {
  private snap: ClockViewSnapshot | null = null

  /**
   * @param port - Clock the session also holds. Identity stays put across view toggles.
   */
  constructor(private port: ChessClockPort) {}

  /**
   * Point the same read model at a replacement port.
   * Used when a new game builds a new clock. A view toggle does not call this.
   * @param port - Next clock.
   */
  bind(port: ChessClockPort): void {
    this.port = port
    this.snap = null
  }

  /** The port last bound. */
  get clockPort(): ChessClockPort {
    return this.port
  }

  /**
   * Sample the clock at `atMs` and store the snapshot.
   * @param atMs - Session timestamp. Forward deltas advance the countdown.
   */
  refresh(atMs: number): void {
    this.port.read(atMs)
    this.snap = this.port.chessClock.snapshot()
  }

  /** Latest Fridae snapshot, or null before the first {@link FridaeReadModel.refresh}. */
  fridae(): IFridaeClockSnapshot | null {
    return this.snap
  }

  /** {@inheritdoc} */
  get whiteMs(): number {
    return this.snap?.whiteDisplayMs ?? 0
  }

  /** {@inheritdoc} */
  get blackMs(): number {
    return this.snap?.blackDisplayMs ?? 0
  }

  /** {@inheritdoc} */
  get active(): 'white' | 'black' | 'none' {
    return this.snap?.activeColor ?? 'none'
  }

  /** {@inheritdoc} */
  get provisionalExpired(): boolean {
    return this.snap?.provisionalFlagColor != null && this.snap.confirmedFlag == null
  }

  /** {@inheritdoc} */
  get confirmedFlag(): 'white' | 'black' | null {
    return this.snap?.confirmedFlag?.color ?? null
  }

  /** {@inheritdoc} */
  get offline(): boolean {
    return this.snap?.mode !== 'online'
  }
}
