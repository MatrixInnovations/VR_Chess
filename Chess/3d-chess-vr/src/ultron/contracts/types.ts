/**
 * Shared chess vocabulary for the Ultron lane.
 * Peer lanes should import these instead of redefining colors, squares, or clocks.
 */

/** Side to move. Same vocabulary as {@link PieceColor}. */
export type PieceColor = 'white' | 'black';

/** Side to move, or the seat a local human occupies. */
export type Color = PieceColor;

/**
 * Promotion piece named the way a grab or voice command names it.
 * The session maps this to a UCI letter and never assumes a queen.
 */
export type PromotionPiece = 'queen' | 'rook' | 'bishop' | 'knight';

/** UCI promotion letter used on the wire to Lichess. */
export type PromotionLetter = 'q' | 'r' | 'b' | 'n';

/** Piece kind on the board. */
export type PieceKind = 'pawn' | 'knight' | 'bishop' | 'rook' | 'queen' | 'king';

/** Visual finish only. It does not change whose turn it is. */
export type PieceFinish = 'idle' | 'selected' | 'dragging';

/**
 * Device family that produced a move.
 * `voice` is included for Sundae. Pointer, controller, and hand match Mad Scientist.
 */
export type MoveSource = 'pointer' | 'xr-controller' | 'hand' | 'voice';

/** Internal sources plus the shared {@link MoveSource} values. */
export type InputSource = MoveSource | 'local' | 'session';

/**
 * Why an in-progress grab was dropped before a move was accepted.
 * `rejected` is for a session that already refused the intent.
 */
export type CancelReason = 'pointer-cancel' | 'tracking-loss' | 'released-origin' | 'detached' | 'rejected';

/**
 * Board square in the existing hall index.
 * File `0` is the a-file. Rank `0` is the far rank (y = 0, black's back rank).
 */
export interface Square {
  readonly file: number;
  readonly rank: number;
}

/** World or joint position in meters. */
export interface Vec3 {
  readonly x: number;
  readonly y: number;
  readonly z: number;
}

/** Read-only piece identity. Input must not write this back onto the board. */
export interface PieceSnapshot {
  readonly id: string;
  readonly kind: PieceKind;
  readonly color: PieceColor;
  readonly square: Square;
}

/**
 * One completed human move for {@link IGameSession.submitMoveIntent}.
 * A gesture produces at most one of these.
 */
export interface MoveIntent {
  readonly intentId: string;
  readonly pieceId: string;
  readonly from: Square;
  readonly to: Square;
  readonly source: MoveSource;
  readonly promotion?: PromotionPiece;
}

/** Seated hall versus immersive WebXR. The session survives both. */
export type ViewMode = 'seated' | 'immersive';

/** Official Lichess variant keys. This lane validates standard and fromPosition only. */
export type VariantKey =
  | 'standard'
  | 'chess960'
  | 'crazyhouse'
  | 'antichess'
  | 'atomic'
  | 'horde'
  | 'kingOfTheHill'
  | 'racingKings'
  | 'threeCheck'
  | 'fromPosition';

/** Days-per-turn values accepted by the Board API correspondence schema. */
export type CorrespondenceDays = 1 | 2 | 3 | 5 | 7 | 10 | 14;

/** Game status names from the official GameStatusName schema. */
export type GameStatusName =
  | 'created'
  | 'started'
  | 'aborted'
  | 'mate'
  | 'resign'
  | 'stalemate'
  | 'timeout'
  | 'draw'
  | 'outoftime'
  | 'cheat'
  | 'noStart'
  | 'unknownFinish'
  | 'insufficientMaterialClaim'
  | 'variantEnd';

/** Why a command was not submitted to the rules engine or to Lichess. */
export type RejectReason =
  | 'duplicate-command'
  | 'duplicate-move'
  | 'illegal'
  | 'not-your-turn'
  | 'terminal'
  | 'seat-required'
  | 'origin-required'
  | 'promotion-required'
  | 'promotion-not-needed'
  | 'cancelled'
  | 'disposed'
  | 'no-active-game'
  | 'unsupported-variant'
  | 'not-board-game'
  | 'color-unknown'
  | 'offline-only'
  | 'online-only'
  | 'invalid-time-control'
  | 'invalid-command'
  | 'rejected-by-lichess'
  | 'unauthorized'
  | 'busy';

/**
 * One legal move a voice parser or pointer can choose.
 * `uci` is the Board API move token.
 */
export interface LegalMove {
  readonly from: string;
  readonly to: string;
  readonly promotion?: PromotionLetter;
  readonly uci: string;
  readonly san: string;
}

/**
 * Square names in the form a1–h8.
 * Validation lives here so every lane rejects the same malformed squares.
 */
export class SquareName {
  /**
   * @param value - Candidate square.
   * @returns Whether `value` is a real board square.
   */
  static isValid(value: string): boolean {
    return /^[a-h][1-8]$/.test(value);
  }
}
