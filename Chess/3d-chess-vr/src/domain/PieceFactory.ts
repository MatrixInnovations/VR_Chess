import type { Color } from './Color'
import type { Piece, PieceType } from './Piece'
import type { Position } from './Position'
import { Bishop } from './pieces/Bishop'
import { King } from './pieces/King'
import { Knight } from './pieces/Knight'
import { Pawn } from './pieces/Pawn'
import { Queen } from './pieces/Queen'
import { Rook } from './pieces/Rook'

export class PieceFactory {
  static create(
    type: PieceType,
    color: Color,
    id: number,
    position: Position,
    uid: number,
  ): Piece {
    switch (type) {
      case 'pawn':
        return new Pawn(color, id, position, uid)
      case 'rook':
        return new Rook(color, id, position, uid)
      case 'knight':
        return new Knight(color, id, position, uid)
      case 'bishop':
        return new Bishop(color, id, position, uid)
      case 'queen':
        return new Queen(color, id, position, uid)
      case 'king':
        return new King(color, id, position, uid)
      default:
        return new Pawn(color, id, position, uid)
    }
  }
}
