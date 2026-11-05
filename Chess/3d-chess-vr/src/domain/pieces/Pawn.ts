import type { Board } from '../Board'
import type { Color } from '../Color'
import { Move } from '../Move'
import { Piece } from '../Piece'
import { Position } from '../Position'

export class Pawn extends Piece {
  readonly type = 'pawn' as const

  constructor(color: Color, id: number, position: Position, uid: number) {
    super(color, id, position, uid)
  }

  clone(): Pawn {
    const copy = new Pawn(this.color, this.id, this.position, this.uid)
    copy.hasMoved = this.hasMoved
    return copy
  }

  reachesLastRank(to: Position): boolean {
    return to.y === 0 || to.y === 7
  }

  pseudoMoves(board: Board): Move[] {
    const moves: Move[] = []
    const forward = this.color === 'white' ? -1 : 1
    const one = this.position.offset(0, forward)
    if (one.inBounds() && !board.at(one)) {
      moves.push(new Move(this, this.position, one, 'move'))
      if (!this.hasMoved) {
        const two = this.position.offset(0, forward * 2)
        if (two.inBounds() && !board.at(two)) {
          moves.push(new Move(this, this.position, two, 'move'))
        }
      }
    }

    for (const dx of [-1, 1]) {
      const to = this.position.offset(dx, forward)
      if (!to.inBounds()) continue
      const occupant = board.at(to)
      if (occupant && occupant.color !== this.color) {
        moves.push(new Move(this, this.position, to, 'capture', occupant))
      }
    }

    const step = board.lastDoubleStep
    if (
      step &&
      step.color !== this.color &&
      step.to.y === this.position.y &&
      Math.abs(step.to.x - this.position.x) === 1
    ) {
      const to = new Position(step.to.x, this.position.y + forward)
      const captured = board.at(step.to)
      if (captured) {
        moves.push(new Move(this, this.position, to, 'enPassant', captured))
      }
    }

    return moves
  }
}
