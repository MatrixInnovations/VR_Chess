import type { Board } from '../Board'
import type { Color } from '../Color'
import type { Move } from '../Move'
import { Piece } from '../Piece'
import type { Position } from '../Position'

export class Rook extends Piece {
  readonly type = 'rook' as const

  constructor(color: Color, id: number, position: Position, uid: number) {
    super(color, id, position, uid)
  }

  clone(): Rook {
    const copy = new Rook(this.color, this.id, this.position, this.uid)
    copy.hasMoved = this.hasMoved
    return copy
  }

  pseudoMoves(board: Board): Move[] {
    return this.slide(board, [
      [1, 0],
      [-1, 0],
      [0, 1],
      [0, -1],
    ])
  }
}
