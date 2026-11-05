import type { MoveIntent, PromotionPiece } from './IInputController'

/**
 * Piece that can move. Optional on {@link LegalMove} until Ultron's session stamps it.
 * When it is present, voice trusts it and does not infer a piece from the square delta.
 */
export type PieceKind = 'pawn' | 'knight' | 'bishop' | 'rook' | 'queen' | 'king'

/**
 * One move the session currently allows.
 * Voice filters speech against this list. It does not generate moves.
 */
export interface LegalMove {
  /** Origin square in algebraic notation. */
  from: string
  /** Destination square in algebraic notation. */
  to: string
  /** Promotion the session already associated with this move, when listed separately. */
  promotion?: PromotionPiece
  /**
   * Moving piece, when the session knows it.
   * Optional so a thin legal-move list still type-checks. Without it, knight moves and
   * castling are reliable; one-step slides overlap pawn, rook, queen, and king.
   */
  piece?: PieceKind
}

/**
 * The only GameSession surface voice is allowed to touch.
 * Ultron owns the real session. This stub stays a read of legal moves plus two writes:
 * submit one intent, or ask which origin the player meant. There is no board mutation here.
 */
export interface IGameSessionMovePort {
  /** Legal moves for the side to move, right now. Voice reads this at parse time, not at start. */
  legalMoves(): readonly LegalMove[]
  /**
   * Submit exactly one move intent.
   * @returns False when the session rejects it. Callers do not retry and do not move a piece themselves.
   */
  submitMoveIntent(intent: MoveIntent): boolean
  /**
   * Ask the player which origin square they meant.
   * Called only when more than one legal move fits the phrase. Voice does not pick one.
   */
  requestOriginClarification(candidates: readonly MoveIntent[]): void
}
