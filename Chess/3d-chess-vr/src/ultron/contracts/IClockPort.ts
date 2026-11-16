import type { Color } from './types';

/** A reading from Fridae's clock, or from a test double. */
export interface ClockReading {
  readonly whiteMs: number;
  readonly blackMs: number;
  readonly flagged: Color | null;
}

/**
 * Time port. Ultron does not own clock math.
 * Offline sessions adjudicate when `flagged` is set. Online sessions treat a
 * local zero as provisional until Lichess sends a terminal status.
 */
export interface IClockPort {
  /**
   * @param reading - Authoritative milliseconds.
   * @param atMs - Timestamp of the reading.
   */
  sync(
    reading: { whiteMs: number; blackMs: number; sideToMove?: Color },
    atMs: number,
  ): ClockReading;
  /**
   * @param movedBy - Side that just completed a move.
   * @param atMs - Timestamp of the move.
   */
  onMovePlayed(movedBy: Color, atMs: number): ClockReading;
  /**
   * @param atMs - Timestamp of the read.
   */
  read(atMs: number): ClockReading;
  /**
   * @param config - Initial clock.
   * @param turn - Side about to move.
   * @param atMs - Arm timestamp.
   */
  arm(config: { whiteMs: number; blackMs: number; incrementMs: number }, turn: Color, atMs: number): ClockReading;
  /** Stop the countdown without disposing the clock. */
  stop(): void;
  /**
   * Tell the clock a terminal Lichess status.
   * `outoftime` confirms the flag. Other terminal statuses freeze the clock.
   * Optional so a countdown double can omit it.
   * @param status - Game status name from the stream.
   * @param winner - Winner, or null for a draw.
   */
  finish?(status: string, winner: Color | null): void;
  /**
   * Apply one Board API stream line. Generations are shared with {@link finish}.
   * @param generation - Socket generation. A later finish uses a higher one.
   * @param event - `gameFull` or `gameState`.
   */
  receive?(generation: number, event: object): void;
  /** Release timers. */
  dispose(): void;
}
