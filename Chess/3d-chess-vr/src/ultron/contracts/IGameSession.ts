import type { CancelReason, MoveIntent, PieceSnapshot, Square } from './types';

/**
 * Rules boundary the hall and input call.
 *
 * Mad Scientist can delete `src/mad-scientist/contracts/IGameSession.ts` and the
 * stub session on rebase and import this type. The real {@link GameSession}
 * implements it. Input must not move pieces itself.
 */
export interface IGameSession {
  /**
   * Legal destination squares for `pieceId`.
   * An empty list means there is nothing to highlight.
   * @param pieceId - Stable piece id from {@link IGameSession.getPieces}.
   */
  getLegalDestinations(pieceId: string): readonly Square[];

  /**
   * Record one completed human move.
   * Returns false when the session rejects it. Callers submit at most once per gesture.
   * Online, true means the move was accepted for a single Lichess post, not that the stream has echoed it.
   * @param intent - Finished grab or voice command.
   */
  submitMoveIntent(intent: MoveIntent): boolean;

  /**
   * Drop an in-progress grab. Must not change piece placement and must not submit a move.
   * @param reason - Why the gesture stopped.
   */
  cancelPendingMove(reason: CancelReason): void;

  /**
   * Copies of the session's pieces.
   * Mutating the result does not change the game.
   */
  getPieces(): readonly PieceSnapshot[];
}
