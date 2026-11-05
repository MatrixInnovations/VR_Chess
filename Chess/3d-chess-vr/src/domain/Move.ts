import type { PieceType } from './Piece'
import type { Piece } from './Piece'
import type { Position } from './Position'

export type MoveKind = 'move' | 'capture' | 'enPassant' | 'castle'

export class Move {
  piece: Piece
  from: Position
  to: Position
  kind: MoveKind
  capture: Piece | null
  promotion: PieceType | null
  rookFrom: Position | null
  rookTo: Position | null

  constructor(
    piece: Piece,
    from: Position,
    to: Position,
    kind: MoveKind,
    capture: Piece | null = null,
    promotion: PieceType | null = null,
    rookFrom: Position | null = null,
    rookTo: Position | null = null,
  ) {
    this.piece = piece
    this.from = from
    this.to = to
    this.kind = kind
    this.capture = capture
    this.promotion = promotion
    this.rookFrom = rookFrom
    this.rookTo = rookTo
  }

  withPromotion(promotion: PieceType): Move {
    return new Move(
      this.piece,
      this.from,
      this.to,
      this.kind,
      this.capture,
      promotion,
      this.rookFrom,
      this.rookTo,
    )
  }
}
