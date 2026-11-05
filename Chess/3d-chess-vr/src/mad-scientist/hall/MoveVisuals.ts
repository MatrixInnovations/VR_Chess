import type { PromotionPiece, Square } from '../contracts/types'

/**
 * A capture the session has already accepted.
 * The animator does not delete the captured mesh. Ultron's session tells the
 * hall which piece left the board.
 */
export interface CaptureVisual {
  readonly attackerId: string
  readonly capturedId: string
  readonly square: Square
}

/**
 * King and rook squares for a castle.
 * Both slides are the session's job to describe. This lane only hears them.
 */
export interface CastlingVisual {
  readonly kingId: string
  readonly rookId: string
  readonly kingFrom: Square
  readonly kingTo: Square
  readonly rookFrom: Square
  readonly rookTo: Square
}

/**
 * A pawn promotion the human already chose.
 * The mesh kind stays put until a later hall update swaps the model.
 */
export interface PromotionVisual {
  readonly pieceId: string
  readonly square: Square
  readonly promoteTo: PromotionPiece
}

/**
 * Visual hooks Ultron can implement when GameSession emits capture, castle,
 * or promotion. The default is {@link NoOpMoveVisuals}.
 */
export interface IMoveVisuals {
  /** A piece was taken on `event.square`. */
  onCapture(event: CaptureVisual): void
  /** King and rook both moved in one castle. */
  onCastling(event: CastlingVisual): void
  /** A pawn's promotion choice. */
  onPromotion(event: PromotionVisual): void
}

/**
 * Default visuals. Each method returns without moving a mesh or submitting
 * an intent, so the lane stays free of chess rules until Ultron wires events.
 */
export class NoOpMoveVisuals implements IMoveVisuals {
  /** @inheritdoc */
  onCapture(_event: CaptureVisual): void {
    // Stub. The captured mesh stays where the session last placed it.
  }

  /** @inheritdoc */
  onCastling(_event: CastlingVisual): void {
    // Stub. King and rook slides are separate animate() calls when Ultron wants them.
  }

  /** @inheritdoc */
  onPromotion(_event: PromotionVisual): void {
    // Stub. Piece kind is not swapped here.
  }
}
