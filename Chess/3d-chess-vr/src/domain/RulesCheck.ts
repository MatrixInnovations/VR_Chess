import { Board } from './Board'
import { ChessClock } from './ChessClock'
import type { Move } from './Move'
import { Position } from './Position'
import { Uci } from './Uci'

export class RulesCheck {
  static run(): string[] {
    const errors: string[] = []
    const expect = (condition: boolean, message: string) => {
      if (!condition) errors.push(message)
    }

    const board = Board.initial()
    const e2 = board.at(Position.fromAlgebraic('e2'))
    const pawnMoves = board.legalMovesFor(e2!).map((move) => move.to.toAlgebraic()).sort()
    expect(pawnMoves.join(',') === 'e3,e4', `e2 pawn moves were ${pawnMoves.join(',')}`)

    play(board, 'e2e4')
    play(board, 'e7e5')
    play(board, 'd1h5')
    play(board, 'b8c6')
    play(board, 'f1c4')
    play(board, 'g8f6')
    play(board, 'h5f7')
    expect(board.outcome('black') === 'checkmate', 'scholar mate should be checkmate')
    expect(board.inCheck('black'), 'black king should be in check')

    const castleBoard = Board.empty()
    castleBoard.spawn('king', 'white', 1, Position.fromAlgebraic('e1'))
    castleBoard.spawn('rook', 'white', 1, Position.fromAlgebraic('h1'))
    castleBoard.spawn('rook', 'white', 2, Position.fromAlgebraic('a1'))
    castleBoard.spawn('king', 'black', 1, Position.fromAlgebraic('e8'))
    const castles = castleBoard
      .legalMovesFor(castleBoard.king('white')!)
      .filter((move) => move.kind === 'castle')
      .map((move) => move.to.toAlgebraic())
      .sort()
    expect(castles.join(',') === 'c1,g1', `castles were ${castles.join(',')}`)

    const pin = Board.empty()
    pin.spawn('king', 'white', 1, Position.fromAlgebraic('e1'))
    pin.spawn('bishop', 'white', 1, Position.fromAlgebraic('e2'))
    pin.spawn('rook', 'black', 1, Position.fromAlgebraic('e8'))
    pin.spawn('king', 'black', 1, Position.fromAlgebraic('a8'))
    const pinned = pin.legalMovesFor(pin.at(Position.fromAlgebraic('e2'))!)
    expect(pinned.length === 0, 'pinned bishop should have no legal move')

    const ep = Board.empty()
    ep.spawn('king', 'white', 1, Position.fromAlgebraic('e1'))
    ep.spawn('king', 'black', 1, Position.fromAlgebraic('e8'))
    ep.spawn('pawn', 'white', 1, Position.fromAlgebraic('e5'))
    ep.spawn('pawn', 'black', 1, Position.fromAlgebraic('d7'))
    play(ep, 'd7d5')
    const passer = ep.legalMovesFor(ep.at(Position.fromAlgebraic('e5'))!).find((move) => move.kind === 'enPassant')
    expect(!!passer && passer.to.toAlgebraic() === 'd6', 'en passant should be available')
    if (passer) {
      ep.commit(passer)
      expect(ep.at(Position.fromAlgebraic('d5')) === null, 'en passant should remove the pawn')
      expect(ep.at(Position.fromAlgebraic('d6'))?.type === 'pawn', 'capturing pawn should land on d6')
    }

    const clock = ChessClock.local(1, 1)
    clock.start('white', 0)
    expect(clock.remaining('white', 1000) === 59000, 'clock should count down')
    clock.punch('white', 1000)
    expect(clock.active === 'black', 'punch should hand the clock to black')
    expect(clock.remaining('white', 1000) === 60000, 'increment should be added to white')

    const sample = board.legalMovesFor(board.king('white')!)[0]
    if (sample) {
      const parsed = Uci.parse(Uci.fromMove(sample))
      expect(parsed.from.equals(sample.from) && parsed.to.equals(sample.to), 'uci round trip')
    }

    return errors
  }
}

function play(board: Board, uci: string): void {
  const parsed = Uci.parse(uci)
  const piece = board.at(parsed.from)
  if (!piece) throw new Error(`no piece for ${uci}`)
  const move = board.legalMovesFor(piece).find((item) => item.to.equals(parsed.to))
  if (!move) throw new Error(`illegal in test: ${uci}`)
  const played: Move = parsed.promotion ? move.withPromotion(parsed.promotion) : move
  board.commit(played)
}

const invoked = process.argv[1]?.includes('RulesCheck')
if (invoked) {
  const errors = RulesCheck.run()
  if (errors.length) {
    console.error(errors.join('\n'))
    process.exit(1)
  }
  console.log('rules ok')
}
