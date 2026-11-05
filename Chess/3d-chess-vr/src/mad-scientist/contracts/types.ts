/**
 * Shared move vocabulary for the Mad Scientist lane.
 *
 * Ultron owns the foundation contracts (PR #5, `src/ultron`). That branch is not
 * mergeable here yet (`package.json` conflicts), so this folder stays until the
 * rebase. Delete `src/mad-scientist/contracts` and `session/GameSession.ts` then
 * and import the Ultron types. `voice` is already on {@link MoveSource} so a
 * Sundae intent is not a type error. This lane never asks a chess engine for a
 * suggestion (Lichess ToS).
 */

/** File `0` is the a-file. Rank `0` is the far rank in the existing 2D board (y = 0). */
export interface Square {
  readonly file: number
  readonly rank: number
}

/** World or joint position in meters. */
export interface Vec3 {
  readonly x: number
  readonly y: number
  readonly z: number
}

export type PieceKind = 'pawn' | 'knight' | 'bishop' | 'rook' | 'queen' | 'king'

export type PieceColor = 'white' | 'black'

/** Visual finish only. It does not change whose turn it is. */
export type PieceFinish = 'idle' | 'selected' | 'dragging'

/** Pointer, Touch controller, bare hand, or Sundae voice. Matches Ultron's `MoveSource`. */
export type MoveSource = 'pointer' | 'xr-controller' | 'hand' | 'voice'

export type PromotionPiece = 'queen' | 'rook' | 'bishop' | 'knight'

/**
 * Why an in-progress grab was dropped before a move was accepted.
 * `rejected` is reserved for a session that already refused the intent.
 */
export type CancelReason =
  | 'pointer-cancel'
  | 'tracking-loss'
  | 'released-origin'
  | 'detached'
  | 'rejected'

/** Read-only piece identity. Input must not write this back onto the board. */
export interface PieceSnapshot {
  id: string
  kind: PieceKind
  color: PieceColor
  square: Square
}

/**
 * One completed human move, ready for {@link IGameSession.submitMoveIntent}.
 * A gesture produces at most one of these.
 */
export interface MoveIntent {
  readonly intentId: string
  readonly pieceId: string
  readonly from: Square
  readonly to: Square
  readonly source: MoveSource
  readonly promotion?: PromotionPiece
}
