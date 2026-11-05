import type { Color } from './Color'
import type { Board } from './Board'
import { Move } from './Move'
import type { Position } from './Position'

export type PieceType = 'bishop' | 'king' | 'knight' | 'pawn' | 'queen' | 'rook'

export abstract class Piece {
  readonly color: Color
  readonly id: number
  readonly uid: number
  position: Position
  hasMoved = false

  constructor(color: Color, id: number, position: Position, uid: number) {
    this.color = color
    this.id = id
    this.position = position
    this.uid = uid
  }

  abstract readonly type: PieceType

  abstract clone(): Piece

  /** Moves and captures ignoring whether the mover's own king is left in check. */
  abstract pseudoMoves(board: Board): Move[]

  protected slide(board: Board, directions: Array<[number, number]>): Move[] {
    const moves: Move[] = []
    for (const [dx, dy] of directions) {
      for (let step = 1; step < 8; step += 1) {
        const to = this.position.offset(dx * step, dy * step)
        if (!to.inBounds()) break
        const occupant = board.at(to)
        if (!occupant) {
          moves.push(new Move(this, this.position, to, 'move'))
          continue
        }
        if (occupant.color !== this.color) {
          moves.push(new Move(this, this.position, to, 'capture', occupant))
        }
        break
      }
    }
    return moves
  }

  protected step(board: Board, deltas: Array<[number, number]>): Move[] {
    const moves: Move[] = []
    for (const [dx, dy] of deltas) {
      const to = this.position.offset(dx, dy)
      if (!to.inBounds()) continue
      const occupant = board.at(to)
      if (!occupant) {
        moves.push(new Move(this, this.position, to, 'move'))
      } else if (occupant.color !== this.color) {
        moves.push(new Move(this, this.position, to, 'capture', occupant))
      }
    }
    return moves
  }
}
