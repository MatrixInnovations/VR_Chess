/**
 * Fridae chess-clock read model.
 *
 * Vision copies these fields onto the screen. It does not derive them.
 * Remaining time is owned by the clock lane; this stub is only the latest snapshot.
 */
export interface IChessClockReadModel {
  /** White's remaining time in milliseconds, as last reported by the clock. */
  whiteMs: number
  /** Black's remaining time in milliseconds, as last reported by the clock. */
  blackMs: number
  /** Side whose clock is running, or `none` when the clock is stopped. */
  active: 'white' | 'black' | 'none'
  /**
   * Online signal that a side's time appears to have hit zero before a flag
   * is confirmed. Vision does not compute this.
   */
  provisionalExpired: boolean
  /**
   * Side whose flag is confirmed. Online this is the adjudicated flag.
   * Offline it may be the locally adjudicated flag. `null` when there is none.
   */
  confirmedFlag: 'white' | 'black' | null
  /** `true` when no remote arbiter is attached and the clock is local. */
  offline: boolean
}
