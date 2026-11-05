import type { Move } from './Move'
import type { PieceType } from './Piece'
import { Position } from './Position'

export class ParsedUci {
  from: Position
  to: Position
  promotion: PieceType | null

  constructor(from: Position, to: Position, promotion: PieceType | null) {
    this.from = from
    this.to = to
    this.promotion = promotion
  }
}

export class Uci {
  static fromMove(move: Move): string {
    const mark = move.promotion ? Uci.letter(move.promotion) : ''
    return `${move.from.toAlgebraic()}${move.to.toAlgebraic()}${mark}`
  }

  static parse(value: string): ParsedUci {
    return new ParsedUci(
      Position.fromAlgebraic(value.slice(0, 2)),
      Position.fromAlgebraic(value.slice(2, 4)),
      value.length > 4 ? Uci.piece(value[4]) : null,
    )
  }

  static letter(type: PieceType): string {
    if (type === 'knight') return 'n'
    return type[0]
  }

  static piece(letter: string): PieceType {
    if (letter === 'r') return 'rook'
    if (letter === 'b') return 'bishop'
    if (letter === 'n') return 'knight'
    return 'queen'
  }
}
