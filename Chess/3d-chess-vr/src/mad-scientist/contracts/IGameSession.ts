import type { CancelReason, MoveIntent, PieceSnapshot, Square } from './types'

/**
 * Rules boundary owned by Ultron's GameSession.
 *
 * The Mad Scientist lane ships this interface locally so input can compile
 * before the foundation pull request lands. Replace the import with the
 * foundation type when rebasing. Do not grow chess search into this file.
 *
 * Input and the move animator may call these methods. They must not move
 * pieces on a board model themselves.
 */
export interface IGameSession {
  /**
   * Legal destination squares for `pieceId`, as already decided by the session.
   * An empty list means "no highlighted moves", not "ask an engine".
   */
  getLegalDestinations(pieceId: string): readonly Square[]

  /**
   * Record one completed human move.
   * Returns false when the session rejects it. Callers submit at most once per gesture.
   */
  submitMoveIntent(intent: MoveIntent): boolean

  /**
   * Drop an in-progress grab. Must not change piece placement.
   */
  cancelPendingMove(reason: CancelReason): void

  /** Copies of the session's pieces. Mutating the result does not change the game. */
  getPieces(): readonly PieceSnapshot[]
}
