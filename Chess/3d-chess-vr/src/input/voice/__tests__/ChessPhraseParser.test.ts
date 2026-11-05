import { describe, expect, it } from 'vitest'
import { ChessPhraseParser } from '../ChessPhraseParser'
import type { LegalMove } from '../IGameSessionMovePort'
import type { MoveIntent } from '../IInputController'

function voice(from: string, to: string, promotion?: MoveIntent['promotion']): MoveIntent {
  const intent: MoveIntent = { from, to, source: 'voice' }
  if (promotion) intent.promotion = promotion
  return intent
}

describe('ChessPhraseParser', () => {
  const parser = new ChessPhraseParser()

  it('returns one intent for an unambiguous pawn phrase', () => {
    const legal: LegalMove[] = [{ from: 'e2', to: 'e4' }]
    expect(parser.parse('move pawn to e4', legal)).toEqual([voice('e2', 'e4')])
  })

  it('ignores filler words and punctuation', () => {
    const legal: LegalMove[] = [{ from: 'e2', to: 'e4' }]
    expect(parser.parse('uh, please move the pawn to E4!', legal)).toEqual([voice('e2', 'e4')])
    expect(parser.parse('hey can you move a pawn to e four now', legal)).toEqual([voice('e2', 'e4')])
  })

  it('rejects garbage, blanks, and phrases with no chess signal', () => {
    const legal: LegalMove[] = [{ from: 'e2', to: 'e4' }]
    expect(parser.parse('order a pizza', legal)).toEqual([])
    expect(parser.parse('hello there friend', legal)).toEqual([])
    expect(parser.parse('', legal)).toEqual([])
    expect(parser.parse('   ', legal)).toEqual([])
    expect(parser.parse('please just move', legal)).toEqual([])
    expect(parser.parse('promote to king', legal)).toEqual([])
  })

  it('keeps only session-legal moves', () => {
    const legal: LegalMove[] = [
      { from: 'e2', to: 'e4' },
      { from: 'e7', to: 'e5' },
      { from: 'g1', to: 'f3' },
    ]
    expect(parser.parse('pawn to e4', legal)).toEqual([voice('e2', 'e4')])
    expect(parser.parse('pawn to e5', [{ from: 'e2', to: 'e4' }])).toEqual([])
  })

  it('asks via multiple candidates when several pieces can reach the square', () => {
    // d2-f3 and g1-f3 are both knight moves. b1 cannot reach f3, so it is not a second candidate.
    const legal: LegalMove[] = [
      { from: 'g1', to: 'f3' },
      { from: 'd2', to: 'f3' },
    ]
    expect(parser.parse('knight to f3', legal)).toEqual([voice('g1', 'f3'), voice('d2', 'f3')])
  })

  it('uses an explicit origin instead of guessing between pieces that share a destination', () => {
    const legal: LegalMove[] = [
      { from: 'e2', to: 'e4' },
      { from: 'd3', to: 'e4', piece: 'queen' },
    ]
    expect(parser.parse('e2 to e4', legal)).toEqual([voice('e2', 'e4')])
    expect(parser.parse('from e2 to e4', legal)).toEqual([voice('e2', 'e4')])
  })

  it('separates a knight from a pawn that can both land on the same square', () => {
    const legal: LegalMove[] = [
      { from: 'f2', to: 'f3' },
      { from: 'g1', to: 'f3' },
    ]
    expect(parser.parse('knight to f3', legal)).toEqual([voice('g1', 'f3')])
    expect(parser.parse('pawn to f3', legal)).toEqual([voice('f2', 'f3')])
  })

  it('names bishop, rook, queen, and king moves from geometry', () => {
    const legal: LegalMove[] = [
      { from: 'c1', to: 'a3' },
      { from: 'a1', to: 'a4' },
      { from: 'd1', to: 'h5' },
      { from: 'e1', to: 'e2' },
      { from: 'g1', to: 'e2' },
    ]
    expect(parser.parse('bishop to a3', legal)).toEqual([voice('c1', 'a3')])
    expect(parser.parse('rook to a4', legal)).toEqual([voice('a1', 'a4')])
    expect(parser.parse('queen to h5', legal)).toEqual([voice('d1', 'h5')])
    expect(parser.parse('king to e2', legal)).toEqual([voice('e1', 'e2')])
    expect(parser.parse('knight to e2', legal)).toEqual([voice('g1', 'e2')])
  })

  it('trusts a session piece tag when a one-step move is geometrically ambiguous', () => {
    const legal: LegalMove[] = [{ from: 'e2', to: 'e4', piece: 'pawn' }]
    expect(parser.parse('rook to e4', legal)).toEqual([])
    expect(parser.parse('pawn to e4', legal)).toEqual([voice('e2', 'e4')])
  })

  it('parses castling without guessing a side when both are legal', () => {
    const legal: LegalMove[] = [
      { from: 'e1', to: 'g1' },
      { from: 'e1', to: 'c1' },
    ]
    expect(parser.parse('castle kingside', legal)).toEqual([voice('e1', 'g1')])
    expect(parser.parse('king side castle', legal)).toEqual([voice('e1', 'g1')])
    expect(parser.parse('short castle', legal)).toEqual([voice('e1', 'g1')])
    expect(parser.parse('o-o', legal)).toEqual([voice('e1', 'g1')])
    expect(parser.parse('0 - 0', legal)).toEqual([voice('e1', 'g1')])
    expect(parser.parse('castle queenside', legal)).toEqual([voice('e1', 'c1')])
    expect(parser.parse('queen side castle', legal)).toEqual([voice('e1', 'c1')])
    expect(parser.parse('long castle', legal)).toEqual([voice('e1', 'c1')])
    expect(parser.parse('o - o - o', legal)).toEqual([voice('e1', 'c1')])
    expect(parser.parse('0-0-0', legal)).toEqual([voice('e1', 'c1')])
    expect(parser.parse('castling kingside', legal)).toEqual([voice('e1', 'g1')])
    expect(parser.parse('kingside', legal)).toEqual([voice('e1', 'g1')])
    expect(parser.parse('castle', legal)).toEqual([voice('e1', 'g1'), voice('e1', 'c1')])
    expect(parser.parse('castle kingside queenside', legal)).toEqual([])
    expect(parser.parse('castle queenside', [{ from: 'e1', to: 'g1' }])).toEqual([])
  })

  it('castles for black and refuses a rook that merely shares the castle squares', () => {
    expect(parser.parse('castle kingside', [{ from: 'e8', to: 'g8', piece: 'king' }])).toEqual([
      voice('e8', 'g8'),
    ])
    expect(parser.parse('castle queenside', [{ from: 'e8', to: 'c8' }])).toEqual([voice('e8', 'c8')])
    expect(parser.parse('castle kingside', [{ from: 'e1', to: 'g1', piece: 'rook' }])).toEqual([])
    expect(parser.parse('rook to g1', [{ from: 'e1', to: 'g1' }])).toEqual([])
    expect(parser.parse('king to g1', [{ from: 'e1', to: 'g1' }])).toEqual([voice('e1', 'g1')])
    expect(
      parser.parse('castle', [{ from: 'e1', to: 'g1', piece: 'king' }]),
    ).toEqual([voice('e1', 'g1')])
  })

  it('parses UCI, including a knight move and a promotion suffix', () => {
    expect(parser.parse('e2e4', [{ from: 'e2', to: 'e4', piece: 'queen' }])).toEqual([
      voice('e2', 'e4'),
    ])
    expect(
      parser.parse('g1f3', [
        { from: 'g1', to: 'f3' },
        { from: 'b1', to: 'f3' },
      ]),
    ).toEqual([voice('g1', 'f3')])
    expect(
      parser.parse('e7e8q', [
        { from: 'e7', to: 'e8', promotion: 'q' },
        { from: 'e7', to: 'e8', promotion: 'r' },
      ]),
    ).toEqual([voice('e7', 'e8', 'q')])
  })

  it('parses SAN, file and rank disambiguation, and preserves bishop case', () => {
    const knights: LegalMove[] = [
      { from: 'g1', to: 'f3' },
      { from: 'b1', to: 'c3' },
      { from: 'e5', to: 'f3' },
    ]
    expect(parser.parse('Nf3', knights)).toEqual([voice('g1', 'f3'), voice('e5', 'f3')])
    expect(parser.parse('Ngf3', knights)).toEqual([voice('g1', 'f3')])
    expect(parser.parse('N1f3', knights)).toEqual([voice('g1', 'f3')])
    expect(parser.parse('e4', [{ from: 'e2', to: 'e4' }, { from: 'g1', to: 'e4', piece: 'knight' }])).toEqual([
      voice('e2', 'e4'),
    ])

    const captures: LegalMove[] = [
      { from: 'f2', to: 'c5', piece: 'bishop' },
      { from: 'b4', to: 'c5', piece: 'pawn' },
    ]
    expect(parser.parse('Bxc5', captures)).toEqual([voice('f2', 'c5')])
    expect(parser.parse('bxc5', captures)).toEqual([voice('b4', 'c5')])
    expect(parser.parse('exd5', [
      { from: 'e4', to: 'd5' },
      { from: 'c4', to: 'd5' },
    ])).toEqual([voice('e4', 'd5')])
  })

  it('speaks captures and an origin square', () => {
    const legal: LegalMove[] = [
      { from: 'e4', to: 'd5' },
      { from: 'c4', to: 'd5' },
      { from: 'a2', to: 'a4' },
    ]
    expect(parser.parse('pawn takes d5', legal)).toEqual([voice('e4', 'd5'), voice('c4', 'd5')])
    expect(parser.parse('pawn captures on d5', legal)).toEqual([voice('e4', 'd5'), voice('c4', 'd5')])
    expect(parser.parse('knight on g1 to f3', [{ from: 'g1', to: 'f3' }, { from: 'd2', to: 'f3' }])).toEqual([
      voice('g1', 'f3'),
    ])
    expect(parser.parse('move a pawn to a4', legal)).toEqual([voice('a2', 'a4')])
    expect(parser.parse('move the pawn from e2 to e4', [{ from: 'e2', to: 'e4' }, { from: 'd2', to: 'd4' }])).toEqual([
      voice('e2', 'e4'),
    ])
  })

  it('does not guess a promotion when several are legal', () => {
    const legal: LegalMove[] = [
      { from: 'e7', to: 'e8', promotion: 'q' },
      { from: 'e7', to: 'e8', promotion: 'r' },
      { from: 'e7', to: 'e8', promotion: 'b' },
      { from: 'e7', to: 'e8', promotion: 'n' },
    ]
    expect(parser.parse('pawn to e8', legal)).toEqual([
      voice('e7', 'e8', 'q'),
      voice('e7', 'e8', 'r'),
      voice('e7', 'e8', 'b'),
      voice('e7', 'e8', 'n'),
    ])
    expect(parser.parse('pawn to e8 queen', legal)).toEqual([voice('e7', 'e8', 'q')])
    expect(parser.parse('pawn to e8 equals rook', legal)).toEqual([voice('e7', 'e8', 'r')])
    expect(parser.parse('promote to queen', legal)).toEqual([voice('e7', 'e8', 'q')])
    expect(parser.parse('e8=Q', legal)).toEqual([voice('e7', 'e8', 'q')])
  })

  it('stamps a spoken promotion onto an untagged pawn move to the last rank', () => {
    expect(parser.parse('pawn to e8 queen', [{ from: 'e7', to: 'e8' }])).toEqual([
      voice('e7', 'e8', 'q'),
    ])
    expect(parser.parse('pawn to e8 bishop', [{ from: 'e7', to: 'e8', piece: 'pawn' }])).toEqual([
      voice('e7', 'e8', 'b'),
    ])
    expect(parser.parse('knight to e8 queen', [{ from: 'd6', to: 'e8', piece: 'knight' }])).toEqual([])
    expect(parser.parse('pawn to e5 queen', [{ from: 'e7', to: 'e5' }])).toEqual([])
  })

  it('rejects a two-square slide that is not a pawn double from the home rank', () => {
    expect(parser.parse('pawn to e6', [{ from: 'e4', to: 'e6' }])).toEqual([])
    expect(parser.parse('pawn to a5', [{ from: 'a7', to: 'a5' }])).toEqual([voice('a7', 'a5')])
    expect(parser.parse('pawn to e3', [{ from: 'e2', to: 'e3' }])).toEqual([voice('e2', 'e3')])
  })

  it('drops malformed squares, collapses duplicate legal moves, and lowercases squares', () => {
    const legal: LegalMove[] = [
      { from: 'E2', to: 'E4' },
      { from: 'e2', to: 'e4' },
      { from: 'z9', to: 'e4' },
      { from: '', to: 'e4' },
      { from: 'e4', to: 'e4' },
    ]
    expect(parser.parse('pawn to e4', legal)).toEqual([voice('e2', 'e4')])
  })

  it('does not mutate the legal-move list it was given', () => {
    const legal: LegalMove[] = [{ from: 'e2', to: 'e4', promotion: 'q' }]
    const snapshot = structuredClone(legal)
    parser.parse('pawn to e8 queen', legal)
    expect(legal).toEqual(snapshot)
  })

  it('returns every legal move of a named piece when the destination was left out', () => {
    const legal: LegalMove[] = [
      { from: 'g1', to: 'f3' },
      { from: 'g1', to: 'e2' },
      { from: 'e2', to: 'e4' },
    ]
    expect(parser.parse('knight', legal)).toEqual([voice('g1', 'f3'), voice('g1', 'e2')])
  })

  it('matches a lone origin when the player names only the from-square', () => {
    const legal: LegalMove[] = [
      { from: 'e2', to: 'e4' },
      { from: 'e2', to: 'e3' },
      { from: 'd2', to: 'd4' },
    ]
    expect(parser.parse('from e2', legal)).toEqual([voice('e2', 'e4'), voice('e2', 'e3')])
  })
})
