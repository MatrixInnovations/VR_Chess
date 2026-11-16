import type { Color } from '../contracts/types';
import { Player } from './Player';

/**
 * One human at the same device.
 * Offline games use two of these, one per color. This class does not pick moves.
 */
export class LocalPlayer extends Player {
  readonly kind = 'local-human' as const;

  /**
   * @param color - Seat this person plays.
   * @param displayName - Name shown to the other human.
   */
  constructor(readonly color: Color, readonly displayName: string) {
    super();
  }

  /** @returns The display name. */
  get label(): string {
    return this.displayName;
  }

  /**
   * @param turn - Side about to move.
   * @returns Whether this seat is allowed to move.
   */
  canAct(turn: Color): boolean {
    return !this.isDisposed && turn === this.color;
  }

  /** Nothing to release. The session drops its reference. */
  protected onDispose(): void {
    return undefined;
  }
}
