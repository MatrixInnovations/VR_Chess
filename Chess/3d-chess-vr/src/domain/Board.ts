import type { Color } from './Color'
import { Move } from './Move'
import type { Piece, PieceType } from './Piece'
import { PieceFactory } from './PieceFactory'
import { Position } from './Position'

export class DoubleStep {
  color: Color
  from: Position
  to: Position

  constructor(color: Color, from: Position, to: Position) {
    this.color = color
    this.from = from
    this.to = to
  }
}

export class Board {
  squares: Array<Array<Piece | null>>
  lastDoubleStep: DoubleStep | null = null
  lastFrom: Position | null = null
  lastTo: Position | null = null
  private nextUid: number

  private constructor(squares: Array<Array<Piece | null>>, nextUid: number) {
    this.squares = squares
    this.nextUid = nextUid
  }

  static empty(): Board {
    const squares = Array.from({ length: 8 }, () =>
      Array.from({ length: 8 }, () => null as Piece | null),
    )
    return new Board(squares, 1)
  }

  static initial(): Board {
    const board = Board.empty()
    const back: PieceType[] = [
      'rook',
      'knight',
      'bishop',
      'queen',
      'king',
      'bishop',
      'knight',
      'rook',
    ]
    back.forEach((type, x) => {
      board.spawn(type, 'black', x < 5 ? x + 1 : x - 3, new Position(x, 0))
      board.spawn(type, 'white', x < 5 ? x + 1 : x - 3, new Position(x, 7))
    })
    for (let x = 0; x < 8; x += 1) {
      board.spawn('pawn', 'black', x + 1, new Position(x, 1))
      board.spawn('pawn', 'white', x + 1, new Position(x, 6))
    }
    return board
  }

  spawn(type: PieceType, color: Color, id: number, position: Position): Piece {
    const piece = PieceFactory.create(type, color, id, position, this.nextUid)
    this.nextUid += 1
    this.squares[position.y][position.x] = piece
    return piece
  }

  at(position: Position): Piece | null {
    if (!position.inBounds()) return null
    return this.squares[position.y][position.x]
  }

  pieces(): Piece[] {
    const found: Piece[] = []
    for (const row of this.squares) {
      for (const piece of row) {
        if (piece) found.push(piece)
      }
    }
    return found
  }

  pieceByUid(uid: number): Piece | null {
    return this.pieces().find((piece) => piece.uid === uid) ?? null
  }

  king(color: Color): Piece | null {
    return this.pieces().find((piece) => piece.type === 'king' && piece.color === color) ?? null
  }

  clone(): Board {
    const squares = this.squares.map((row) => row.map((piece) => (piece ? piece.clone() : null)))
    const copy = new Board(squares, this.nextUid)
    if (this.lastDoubleStep) {
      copy.lastDoubleStep = new DoubleStep(
        this.lastDoubleStep.color,
        this.lastDoubleStep.from,
        this.lastDoubleStep.to,
      )
    }
    copy.lastFrom = this.lastFrom
    copy.lastTo = this.lastTo
    return copy
  }

  legalMovesFor(piece: Piece): Move[] {
    return piece.pseudoMoves(this).filter((move) => this.isLegal(move))
  }

  isLegal(move: Move): boolean {
    if (move.capture?.type === 'king') return false
    if (move.kind === 'castle') {
      if (this.inCheck(move.piece.color)) return false
      const dir = Math.sign(move.to.x - move.from.x)
      const through = new Position(move.from.x + dir, move.from.y)
      const step = new Move(move.piece, move.from, through, 'move')
      if (this.leavesKingInCheck(step)) return false
    }
    return !this.leavesKingInCheck(move)
  }

  leavesKingInCheck(move: Move): boolean {
    const next = this.clone()
    next.commit(move)
    return next.inCheck(move.piece.color)
  }

  inCheck(color: Color): boolean {
    const king = this.king(color)
    if (!king) return false
    for (const piece of this.pieces()) {
      if (piece.color === color) continue
      for (const move of piece.pseudoMoves(this)) {
        if (move.to.equals(king.position)) return true
      }
    }
    return false
  }

  commit(move: Move): void {
    const moving = this.at(move.from)
    if (!moving) return
    this.squares[move.from.y][move.from.x] = null

    if (move.kind === 'enPassant') {
      const capturedRank = move.from.y
      this.squares[capturedRank][move.to.x] = null
    }

    if (move.kind === 'castle' && move.rookFrom && move.rookTo) {
      const rook = this.at(move.rookFrom)
      if (rook) {
        this.squares[move.rookFrom.y][move.rookFrom.x] = null
        rook.position = move.rookTo
        rook.hasMoved = true
        this.squares[move.rookTo.y][move.rookTo.x] = rook
      }
    }

    let placed = moving
    if (move.promotion) {
      placed = PieceFactory.create(
        move.promotion,
        moving.color,
        moving.id,
        move.to,
        moving.uid,
      )
      placed.hasMoved = true
    } else {
      moving.position = move.to
      moving.hasMoved = true
    }
    this.squares[move.to.y][move.to.x] = placed

    if (moving.type === 'pawn' && Math.abs(move.to.y - move.from.y) === 2) {
      this.lastDoubleStep = new DoubleStep(moving.color, move.from, move.to)
    } else {
      this.lastDoubleStep = null
    }
    this.lastFrom = move.from
    this.lastTo = move.to
  }

  outcome(sideToMove: Color): 'checkmate' | 'stalemate' | 'insufficient' | null {
    const hasMove = this.pieces().some(
      (piece) => piece.color === sideToMove && this.legalMovesFor(piece).length > 0,
    )
    if (!hasMove) {
      return this.inCheck(sideToMove) ? 'checkmate' : 'stalemate'
    }
    if (this.insufficientMaterial()) return 'insufficient'
    return null
  }

  insufficientMaterial(): boolean {
    const pieces = this.pieces()
    const others = pieces.filter((piece) => piece.type !== 'king')
    if (others.length === 0) return true
    if (others.length === 1 && (others[0].type === 'bishop' || others[0].type === 'knight')) {
      return true
    }
    if (
      others.length === 2 &&
      others.every((piece) => piece.type === 'bishop') &&
      others[0].color !== others[1].color
    ) {
      const dark = (piece: Piece) => (piece.position.x + piece.position.y) % 2 === 0
      return dark(others[0]) === dark(others[1])
    }
    return false
  }
}
