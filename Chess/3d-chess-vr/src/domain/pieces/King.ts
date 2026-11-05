import type { Board } from '../Board'
import type { Color } from '../Color'
import { Move } from '../Move'
import { Piece } from '../Piece'
import { Position } from '../Position'

export class King extends Piece {
  readonly type = 'king' as const

  constructor(color: Color, id: number, position: Position, uid: number) {
    super(color, id, position, uid)
  }

  clone(): King {
    const copy = new King(this.color, this.id, this.position, this.uid)
    copy.hasMoved = this.hasMoved
    return copy
  }

  pseudoMoves(board: Board): Move[] {
    const moves = this.step(board, [
      [1, 0],
      [-1, 0],
      [0, 1],
      [0, -1],
      [1, 1],
      [1, -1],
      [-1, 1],
      [-1, -1],
    ])
    const kingSide = this.castle(board, 'king')
    const queenSide = this.castle(board, 'queen')
    if (kingSide) moves.push(kingSide)
    if (queenSide) moves.push(queenSide)
    return moves
  }

  private castle(board: Board, side: 'king' | 'queen'): Move | null {
    if (this.hasMoved) return null
    const y = this.position.y
    const rookX = side === 'king' ? 7 : 0
    const rook = board.at(new Position(rookX, y))
    if (!rook || rook.type !== 'rook' || rook.color !== this.color || rook.hasMoved) {
      return null
    }
    const between = side === 'king' ? [5, 6] : [1, 2, 3]
    for (const x of between) {
      if (board.at(new Position(x, y))) return null
    }
    const kingTo = new Position(side === 'king' ? 6 : 2, y)
    const rookTo = new Position(side === 'king' ? 5 : 3, y)
    return new Move(
      this,
      this.position,
      kingTo,
      'castle',
      null,
      null,
      rook.position,
      rookTo,
    )
  }
}
