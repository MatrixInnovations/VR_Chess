import type { Board } from '../Board'
import type { Color } from '../Color'
import type { Move } from '../Move'
import { Piece } from '../Piece'
import type { Position } from '../Position'

export class Knight extends Piece {
  readonly type = 'knight' as const

  constructor(color: Color, id: number, position: Position, uid: number) {
    super(color, id, position, uid)
  }

  clone(): Knight {
    const copy = new Knight(this.color, this.id, this.position, this.uid)
    copy.hasMoved = this.hasMoved
    return copy
  }

  pseudoMoves(board: Board): Move[] {
    return this.step(board, [
      [1, 2],
      [2, 1],
      [-1, 2],
      [-2, 1],
      [1, -2],
      [2, -1],
      [-1, -2],
      [-2, -1],
    ])
  }
}
