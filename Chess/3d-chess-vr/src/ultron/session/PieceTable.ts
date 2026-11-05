import { Squares } from '../contracts/squares';
import type { LegalMove, PieceKind, PieceSnapshot, PromotionLetter, Square } from '../contracts/types';

const BACK_RANK: readonly PieceKind[] = ['rook', 'knight', 'bishop', 'queen', 'king', 'bishop', 'knight', 'rook'];

/**
 * Stable piece identities for the hall.
 * Ids stay with a piece across moves. Captures drop the taken piece.
 * This is bookkeeping, not a move generator.
 */
export class PieceTable {
  private pieces: PieceSnapshot[] = PieceTable.standard();

  /** @returns Copies. Mutating them does not change the table. */
  getPieces(): readonly PieceSnapshot[] {
    return this.pieces.map((piece) => PieceTable.copy(piece));
  }

  /**
   * @param id - Piece id.
   * @returns A copy, or undefined.
   */
  find(id: string): PieceSnapshot | undefined {
    const found = this.pieces.find((piece) => piece.id === id);
    return found ? PieceTable.copy(found) : undefined;
  }

  /** Restore the initial position. */
  reset(): void {
    this.pieces = PieceTable.standard();
  }

  /**
   * Rebuild from the initial array by replaying UCI moves.
   * @param moves - Full move list from the start position.
   */
  replay(moves: readonly string[]): void {
    this.reset();
    for (const uci of moves) this.applyUci(uci);
  }

  /**
   * @param uci - One UCI move, including a promotion letter when present.
   */
  applyUci(uci: string): void {
    const from = Squares.fromAlgebraic(uci.slice(0, 2));
    const to = Squares.fromAlgebraic(uci.slice(2, 4));
    if (!from || !to) return;
    const mover = this.pieces.find((piece) => Squares.equal(piece.square, from));
    if (!mover) return;
    const promotion = uci.length > 4 ? (uci[4] as PromotionLetter) : undefined;
    const target = this.pieces.find((piece) => Squares.equal(piece.square, to));
    const enPassant = mover.kind === 'pawn' && from.file !== to.file && !target;
    const castle = mover.kind === 'king' && Math.abs(to.file - from.file) === 2;
    const rookFile = to.file === 6 ? 7 : 0;
    const rookTo = to.file === 6 ? 5 : 3;
    this.pieces = this.pieces.flatMap((piece) => {
      if (enPassant && piece.color !== mover.color && piece.square.file === to.file && piece.square.rank === from.rank) {
        return [];
      }
      if (piece.id !== mover.id && Squares.equal(piece.square, to)) return [];
      if (castle && piece.kind === 'rook' && piece.color === mover.color && piece.square.file === rookFile && piece.square.rank === from.rank) {
        return [{ ...piece, square: { file: rookTo, rank: from.rank } }];
      }
      if (piece.id === mover.id) {
        return [{
          ...piece,
          kind: promotion ? PieceTable.kindFor(promotion) : piece.kind,
          square: { file: to.file, rank: to.rank },
        }];
      }
      return [piece];
    });
  }

  /**
   * @param pieceId - Piece to move.
   * @param legal - Session legal moves in algebraic form.
   * @returns Destination squares, one per square.
   */
  destinations(pieceId: string, legal: readonly LegalMove[]): readonly Square[] {
    const piece = this.pieces.find((candidate) => candidate.id === pieceId);
    if (!piece) return [];
    const from = Squares.toAlgebraic(piece.square);
    const seen = new Set<string>();
    const squares: Square[] = [];
    for (const move of legal) {
      if (move.from !== from) continue;
      const square = Squares.fromAlgebraic(move.to);
      if (!square) continue;
      const key = Squares.key(square);
      if (seen.has(key)) continue;
      seen.add(key);
      squares.push(square);
    }
    return squares;
  }

  private static standard(): PieceSnapshot[] {
    const pieces: PieceSnapshot[] = [];
    BACK_RANK.forEach((kind, file) => {
      pieces.push({ id: PieceTable.backId('black', kind, file), kind, color: 'black', square: { file, rank: 0 } });
      pieces.push({ id: PieceTable.backId('white', kind, file), kind, color: 'white', square: { file, rank: 7 } });
    });
    for (let file = 0; file < 8; file += 1) {
      pieces.push({ id: `black-pawn-${file + 1}`, kind: 'pawn', color: 'black', square: { file, rank: 1 } });
      pieces.push({ id: `white-pawn-${file + 1}`, kind: 'pawn', color: 'white', square: { file, rank: 6 } });
    }
    return pieces;
  }

  private static backId(color: 'white' | 'black', kind: PieceKind, file: number): string {
    if (kind === 'queen' || kind === 'king') return `${color}-${kind}`;
    const index = file < 4 ? 1 : 2;
    return `${color}-${kind}-${index}`;
  }

  private static kindFor(letter: PromotionLetter): PieceKind {
    if (letter === 'q') return 'queen';
    if (letter === 'r') return 'rook';
    if (letter === 'b') return 'bishop';
    return 'knight';
  }

  private static copy(piece: PieceSnapshot): PieceSnapshot {
    return { id: piece.id, kind: piece.kind, color: piece.color, square: { ...piece.square } };
  }
}

/**
 * @param piece - Named promotion, if the human supplied one.
 * @returns The UCI letter, or undefined.
 */
export function promotionLetter(piece: 'queen' | 'rook' | 'bishop' | 'knight' | undefined): PromotionLetter | undefined {
  if (piece === 'queen') return 'q';
  if (piece === 'rook') return 'r';
  if (piece === 'bishop') return 'b';
  if (piece === 'knight') return 'n';
  return undefined;
}
