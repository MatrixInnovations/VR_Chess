import type { IFridaeClockSnapshot } from '../contracts/IFridaeClockPort'
import type { PieceColor } from '../contracts/types'
import type { ClockTapDecision, IClockTapPolicy } from './ClockTapRouter'

/**
 * Offline punch permission.
 * Returning true records that the session allowed the press.
 * It does not add an increment. Fridae does that when a move is accepted.
 */
export interface IOfflineClockPolicy {
  /**
   * @param side - Face the player pressed.
   * @returns Whether the offline session accepts the punch.
   */
  acceptOfflineClockTap(side: PieceColor): boolean
}

/**
 * Clock-press policy that reads a Fridae snapshot and does not write one.
 *
 * Online presses return `online-authoritative` and do not call the offline
 * policy. Offline presses call {@link IOfflineClockPolicy} and still leave
 * the snapshot's milliseconds, active side, and increments untouched.
 * This class has no method that submits a chess move.
 */
export class SessionClockTapPolicy implements IClockTapPolicy {
  /**
   * @param read - Latest Fridae snapshot. Called on each press.
   * @param offline - Session permission for an offline punch.
   */
  constructor(
    private readonly read: () => IFridaeClockSnapshot | null,
    private readonly offline: IOfflineClockPolicy,
  ) {}

  /** @inheritdoc */
  consider(press: { readonly side: PieceColor }): ClockTapDecision {
    const snapshot = this.read()
    if (!snapshot || snapshot.kind !== 'realtime') {
      return { accepted: false, reason: 'no-clock' }
    }
    if (snapshot.mode === 'online') {
      return { accepted: false, reason: 'online-authoritative' }
    }
    if (!this.offline.acceptOfflineClockTap(press.side)) {
      return { accepted: false, reason: 'offline-refused' }
    }
    return { accepted: true, mode: 'offline' }
  }
}
