import type { PieceColor } from './types'

/**
 * Thin read port for Fridae's chess clock.
 *
 * Fridae PR #3 is comment-ok / hold. The exact snapshot and subscription
 * fields are not frozen. This interface is the swap point: when she publishes
 * them, replace these members and keep {@link PhysicalChessClock} on `read`
 * and `subscribe`. The 3D clock does not own a countdown.
 *
 * Field names follow her current `ClockViewSnapshot` where that snapshot is
 * already explicit (`whiteDisplayMs`, `provisionalFlagColor`, `confirmedFlag`).
 * They are copies of a published reading, not values this lane computes.
 */
export interface IFridaeClockSnapshot {
  /** Realtime Fischer clock, correspondence, unlimited, or no game yet. */
  readonly kind: 'absent' | 'realtime' | 'correspondence' | 'unlimited'
  /** Online Lichess clock, or an offline punch clock. */
  readonly mode: 'online' | 'offline'
  /** Side whose clock is running, or null when nothing is running. */
  readonly activeColor: PieceColor | null
  /** Published white milliseconds. Null means there is no countdown. */
  readonly whiteDisplayMs: number | null
  /** Published black milliseconds. Null means there is no countdown. */
  readonly blackDisplayMs: number | null
  /** Published Fischer increment. The view must not add this on a tap. */
  readonly whiteIncrementMs: number
  /** Published Fischer increment. The view must not add this on a tap. */
  readonly blackIncrementMs: number
  /**
   * Online side whose published time has reached zero before a flag is confirmed.
   * Null when Fridae has not raised a provisional flag.
   */
  readonly provisionalFlagColor: PieceColor | null
  /**
   * Confirmed flag. Online this is the server flag. Offline it may be local.
   * Null when the game has no confirmed flag.
   */
  readonly confirmedFlag: {
    readonly color: PieceColor
    readonly source: 'server' | 'local'
  } | null
}

/**
 * Latest Fridae snapshot plus a push when she replaces it.
 * Listeners repaint. They do not sample time.
 */
export interface IFridaeClockPort {
  /** The snapshot currently published, or null when no clock is bound. */
  read(): IFridaeClockSnapshot | null

  /**
   * Repaint when the snapshot is replaced.
   * @param listener - Called with the new snapshot. Null clears the faces.
   * @returns Unsubscribe. Removing the listener does not change the clock.
   */
  subscribe(listener: (snapshot: IFridaeClockSnapshot | null) => void): () => void
}
