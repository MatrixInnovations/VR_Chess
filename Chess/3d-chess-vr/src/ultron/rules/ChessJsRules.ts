import { Chess, type ChessInstance } from 'chess.js';

import type { IChessRules, PlayedMove } from '../contracts/IChessRules';
import type { Color, LegalMove, PromotionLetter } from '../contracts/types';

/**
 * Standard-chess rules backed by chess.js.
 * This is a human rules engine, not an engine that chooses moves.
 */
export class ChessJsRules implements IChessRules {
  private chess: ChessInstance;

  /**
   * @param fen - Starting FEN. Omit for the initial position.
   */
  constructor(fen?: string) {
    this.chess = Chess(fen);
  }

  /** @returns Current FEN. */
  fen(): string {
    return this.chess.fen();
  }

  /** @returns Side to move. */
  turn(): Color {
    return this.chess.turn() === 'w' ? 'white' : 'black';
  }

  /** @returns Legal moves, one entry per promotion choice. */
  legalMoves(): readonly LegalMove[] {
    return this.chess.moves({ verbose: true }).map((move) => this.toLegal(move));
  }

  /**
   * @param from - Origin.
   * @param to - Destination.
   * @returns Whether every legal move between those squares is a promotion.
   */
  isPromotionRequired(from: string, to: string): boolean {
    const matches = this.chess.moves({ verbose: true }).filter((move) => move.from === from && move.to === to);
    return matches.length > 0 && matches.every((move) => Boolean(move.promotion));
  }

  /**
   * @param move - Requested move.
   * @returns The played move, or null when it is illegal or the promotion is missing.
   */
  play(move: { from: string; to: string; promotion?: PromotionLetter }): PlayedMove | null {
    const required = this.isPromotionRequired(move.from, move.to);
    if (required && !move.promotion) return null;
    if (move.promotion && !required) return null;
    const played = this.chess.move({ from: move.from, to: move.to, promotion: move.promotion });
    if (!played) return null;
    const uci = `${played.from}${played.to}${played.promotion ?? ''}`;
    return { uci, san: played.san, fen: this.chess.fen() };
  }

  /**
   * @param initialFen - `startpos` or a FEN.
   * @param uciMoves - Moves to apply from that position.
   * @returns False when the FEN or any move is illegal. The previous position is kept.
   */
  replay(initialFen: string, uciMoves: readonly string[]): boolean {
    const next = Chess();
    if (initialFen !== 'startpos') {
      if (!next.load(initialFen)) return false;
    }
    for (const uci of uciMoves) {
      if (!/^[a-h][1-8][a-h][1-8][qrbn]?$/.test(uci)) return false;
      const played = next.move({
        from: uci.slice(0, 2),
        to: uci.slice(2, 4),
        promotion: uci.length > 4 ? uci.slice(4) : undefined,
      });
      if (!played) return false;
    }
    this.chess = next;
    return true;
  }

  /** @returns Whether the side to move is checkmated. */
  isCheckmate(): boolean {
    return this.chess.in_checkmate();
  }

  /** @returns Whether the position is stalemate. */
  isStalemate(): boolean {
    return this.chess.in_stalemate();
  }

  /** @returns Whether chess.js already scores the game as a draw. */
  isDraw(): boolean {
    return this.chess.in_draw();
  }

  /** @returns Whether the game is over under standard rules. */
  isTerminal(): boolean {
    return this.chess.game_over();
  }

  /**
   * Local approximation of “the opponent can still mate”.
   * King, or king plus a lone knight or bishop, cannot win on time here.
   * Online games ignore this and wait for Lichess.
   * @param flagged - Side that ran out of time.
   */
  opponentHasMatingMaterial(flagged: Color): boolean {
    const enemy = flagged === 'white' ? 'b' : 'w';
    const pieces = this.chess
      .board()
      .flat()
      .filter((piece): piece is NonNullable<typeof piece> => piece !== null && piece.color === enemy)
      .map((piece) => piece.type)
      .filter((type) => type !== 'k');
    if (pieces.length === 0) return false;
    if (pieces.length === 1 && (pieces[0] === 'n' || pieces[0] === 'b')) return false;
    return true;
  }

  private toLegal(move: { from: string; to: string; san: string; promotion?: string }): LegalMove {
    const promotion = this.promotion(move.promotion);
    return {
      from: move.from,
      to: move.to,
      promotion,
      uci: `${move.from}${move.to}${promotion ?? ''}`,
      san: move.san,
    };
  }

  private promotion(value: string | undefined): PromotionLetter | undefined {
    if (value === 'q' || value === 'r' || value === 'b' || value === 'n') return value;
    return undefined;
  }
}
