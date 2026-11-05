import type { Square } from './types';

/**
 * Square helpers shared with the hall.
 * File 0 is the a-file. Rank 0 is the far rank, so e2 is `{ file: 4, rank: 6 }`.
 */
export class Squares {
  /**
   * @param square - Candidate square.
   * @returns Whether it is one of the 64 squares. Non-integers are rejected.
   */
  static isOnBoard(square: Square): boolean {
    return (
      Number.isInteger(square.file) &&
      Number.isInteger(square.rank) &&
      square.file >= 0 &&
      square.file < 8 &&
      square.rank >= 0 &&
      square.rank < 8
    );
  }

  /**
   * @param left - First square.
   * @param right - Second square.
   * @returns File and rank equality.
   */
  static equal(left: Square, right: Square): boolean {
    return left.file === right.file && left.rank === right.rank;
  }

  /**
   * @param square - Square to key.
   * @returns A stable map key.
   */
  static key(square: Square): string {
    return `${square.file}:${square.rank}`;
  }

  /**
   * @param square - Hall square.
   * @returns Algebraic name such as `e2`, or null when the square is off the board.
   */
  static toAlgebraic(square: Square): string | null {
    if (!Squares.isOnBoard(square)) return null;
    const file = 'abcdefgh'[square.file];
    const rank = 8 - square.rank;
    return `${file}${rank}`;
  }

  /**
   * @param algebraic - Square such as `e4`.
   * @returns The hall index, or null.
   */
  static fromAlgebraic(algebraic: string): Square | null {
    if (!/^[a-h][1-8]$/.test(algebraic)) return null;
    return {
      file: algebraic.charCodeAt(0) - 97,
      rank: 8 - Number(algebraic[1]),
    };
  }
}

/** @param square - Candidate square. */
export function isOnBoard(square: Square): boolean {
  return Squares.isOnBoard(square);
}

/** @param left - First square. @param right - Second square. */
export function squaresEqual(left: Square, right: Square): boolean {
  return Squares.equal(left, right);
}

/** @param square - Square to key. */
export function squareKey(square: Square): string {
  return Squares.key(square);
}
