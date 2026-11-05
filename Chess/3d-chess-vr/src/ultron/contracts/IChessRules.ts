import type { Color, LegalMove, PromotionLetter } from './types';

/** A move the rules engine accepted. */
export interface PlayedMove {
  readonly uci: string;
  readonly san: string;
  readonly fen: string;
}

/**
 * Chess rules port. {@link ChessJsRules} is the default for standard chess.
 * The session asks this object before any online post, and trusts it completely offline.
 */
export interface IChessRules {
  /** @returns Current FEN. */
  fen(): string;
  /** @returns Side to move. */
  turn(): Color;
  /** @returns Every legal move, including each promotion choice. */
  legalMoves(): readonly LegalMove[];
  /**
   * @param from - Origin square.
   * @param to - Destination square.
   * @returns Whether a promotion piece is required.
   */
  isPromotionRequired(from: string, to: string): boolean;
  /**
   * Play a move. Illegal moves leave the position unchanged.
   * @param move - Origin, destination, and optional promotion.
   * @returns The played move, or null.
   */
  play(move: { from: string; to: string; promotion?: PromotionLetter }): PlayedMove | null;
  /**
   * Replace the position by replaying UCI moves. Failure leaves the previous position in place.
   * @param initialFen - `startpos` or a FEN.
   * @param uciMoves - Full move list.
   * @returns Whether every move applied.
   */
  replay(initialFen: string, uciMoves: readonly string[]): boolean;
  /** @returns Whether the side to move is checkmated. */
  isCheckmate(): boolean;
  /** @returns Whether the position is a stalemate. */
  isStalemate(): boolean;
  /** @returns Whether the rules engine already calls the game a draw. */
  isDraw(): boolean;
  /** @returns Whether no further moves should be accepted. */
  isTerminal(): boolean;
  /**
   * Local timeout helper. Online games do not use this; Lichess names the winner.
   * @param flagged - Side whose clock hit zero.
   * @returns Whether the other side has enough material to win on time.
   */
  opponentHasMatingMaterial(flagged: Color): boolean;
}
