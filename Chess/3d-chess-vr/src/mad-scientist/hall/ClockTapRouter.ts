import type { PieceColor } from '../contracts/types'
import type { ClockTapTarget } from './ClockTapTarget'

/**
 * What a table-clock press is allowed to do.
 * The router never awards an increment and never changes whose turn it is.
 */
export type ClockTapDecision =
  | { readonly accepted: false; readonly reason: 'online-authoritative' | 'offline-refused' | 'no-clock' }
  | { readonly accepted: true; readonly mode: 'offline' }

/**
 * Session policy for a clock press.
 *
 * Online, Lichess is the clock. A press must be refused and must not look
 * like a move. Offline, only this policy may accept a punch, and even then
 * the view waits for the next Fridae snapshot instead of editing the banks.
 */
export interface IClockTapPolicy {
  /**
   * @param press - Which face the player hit.
   */
  consider(press: { readonly side: PieceColor }): ClockTapDecision
}

/**
 * Default policy used until a session is bound.
 * Every press is refused. That keeps a new hall from punching a clock.
 */
export class ReadOnlyClockTapPolicy implements IClockTapPolicy {
  /** @inheritdoc */
  consider(): ClockTapDecision {
    return { accepted: false, reason: 'online-authoritative' }
  }
}

/**
 * Forwards a press to {@link ClockTapTarget.tap} and then to session policy.
 *
 * The target stays the only tap entry. A callback registered here must not
 * call `submitMoveIntent`. Online turns and Fischer increments change when
 * GameSession reports an accepted move, which this class does not see.
 */
export class ClockTapRouter {
  private pending: PieceColor | null = null

  private last: ClockTapDecision | null = null

  /**
   * @param target - Table volume from the hall.
   * @param policy - Who may accept a press. Online policies refuse.
   */
  constructor(
    private readonly target: ClockTapTarget,
    private policy: IClockTapPolicy,
  ) {}

  /** The decision from the last press, or null if none has landed. */
  get lastDecision(): ClockTapDecision | null {
    return this.last
  }

  /** Install the tap callback. Replaces any previous clock callback. */
  attach(): void {
    this.target.setOnTap(() => {
      const side = this.pending
      this.pending = null
      if (!side) return
      this.last = this.policy.consider({ side })
    })
  }

  /**
   * Swap the session policy and keep the same tap target.
   * @param policy - Replacement. Installed immediately.
   */
  setPolicy(policy: IClockTapPolicy): void {
    this.policy = policy
    this.attach()
  }

  /**
   * Press one face through the tap target.
   * @param side - Face that was hit.
   * @returns The policy decision, or null when no callback ran.
   */
  press(side: PieceColor): ClockTapDecision | null {
    this.pending = side
    this.target.tap()
    return this.last
  }
}
