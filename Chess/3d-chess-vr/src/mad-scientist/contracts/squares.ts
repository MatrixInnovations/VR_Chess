import type { Square } from './types'

/**
 * True when `square` is one of the 64 board squares.
 * Non-integers are rejected so a raycast rounding error cannot become a move.
 */
export function isOnBoard(square: Square): boolean {
  return (
    Number.isInteger(square.file) &&
    Number.isInteger(square.rank) &&
    square.file >= 0 &&
    square.file < 8 &&
    square.rank >= 0 &&
    square.rank < 8
  )
}

/** File/rank equality. Callers check for null before using this. */
export function squaresEqual(a: Square, b: Square): boolean {
  return a.file === b.file && a.rank === b.rank
}

/** Stable map key for a square. */
export function squareKey(square: Square): string {
  return `${square.file}:${square.rank}`
}
