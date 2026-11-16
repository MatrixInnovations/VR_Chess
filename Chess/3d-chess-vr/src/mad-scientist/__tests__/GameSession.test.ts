import { describe, expect, it } from 'vitest'

import { isOnBoard, squaresEqual } from '../contracts/squares'
import type { IGameSession } from '../contracts/IGameSession'
import type { MoveIntent } from '../contracts/types'
import { GameSession } from '../session/GameSession'
import { whitePawn } from './helpers'

function intent(overrides: Partial<MoveIntent> = {}): MoveIntent {
  return {
    intentId: 'intent-1',
    pieceId: 'white-pawn-1',
    from: { file: 4, rank: 6 },
    to: { file: 4, rank: 4 },
    source: 'pointer',
    ...overrides,
  }
}

describe('square coordinates', () => {
  it('accepts only the 64 integer squares', () => {
    expect(isOnBoard({ file: 0, rank: 0 })).toBe(true)
    expect(isOnBoard({ file: 7, rank: 7 })).toBe(true)
    expect(isOnBoard({ file: -1, rank: 0 })).toBe(false)
    expect(isOnBoard({ file: 8, rank: 0 })).toBe(false)
    expect(isOnBoard({ file: 1.5, rank: 0 })).toBe(false)
    expect(isOnBoard({ file: 0, rank: -1 })).toBe(false)
    expect(isOnBoard({ file: 0, rank: 8 })).toBe(false)
    expect(isOnBoard({ file: 0, rank: 1.5 })).toBe(false)
  })

  it('compares file and rank', () => {
    expect(squaresEqual({ file: 1, rank: 2 }, { file: 1, rank: 2 })).toBe(true)
    expect(squaresEqual({ file: 1, rank: 2 }, { file: 1, rank: 3 })).toBe(false)
    expect(squaresEqual({ file: 1, rank: 2 }, { file: 0, rank: 2 })).toBe(false)
  })
})

describe('GameSession', () => {
  it('accepts one legal intent and is the only place a piece changes square', () => {
    const pieces = [whitePawn()]
    const session: IGameSession = new GameSession({
      pieces,
      legalDestinations: { 'white-pawn-1': [{ file: 4, rank: 4 }] },
    })
    pieces[0] = whitePawn({ id: 'caller-mutated' })

    expect(session.submitMoveIntent(intent())).toBe(true)
    expect(session.getPieces()[0]).toMatchObject({
      id: 'white-pawn-1',
      square: { file: 4, rank: 4 },
    })
    expect(session.submitMoveIntent(intent())).toBe(false)
    expect('suggestMove' in session).toBe(false)
    expect('bestMove' in session).toBe(false)
  })

  it('rejects an illegal square without moving the piece', () => {
    const session = new GameSession({
      pieces: [whitePawn()],
      legalDestinations: { 'white-pawn-1': [{ file: 4, rank: 4 }] },
    })
    expect(session.submitMoveIntent(intent({ to: { file: 4, rank: 5 } }))).toBe(false)
    expect(session.getPieces()[0].square).toEqual({ file: 4, rank: 6 })
  })

  it('rejects a listed destination that is not a real square', () => {
    const session = new GameSession({
      pieces: [whitePawn()],
      legalDestinations: { 'white-pawn-1': [{ file: 8, rank: 0 }] },
    })
    expect(session.submitMoveIntent(intent({ to: { file: 8, rank: 0 } }))).toBe(false)
    expect(session.getPieces()[0].square).toEqual({ file: 4, rank: 6 })
  })

  it('rejects a missing piece, a stale origin, and an empty legal list', () => {
    const session = new GameSession({
      pieces: [whitePawn()],
      legalDestinations: {},
    })
    expect(session.getLegalDestinations('white-pawn-1')).toEqual([])
    expect(session.getLegalDestinations('missing')).toEqual([])
    expect(session.submitMoveIntent(intent())).toBe(false)
    expect(session.submitMoveIntent(intent({ pieceId: 'nope' }))).toBe(false)

    const open = new GameSession({
      pieces: [whitePawn()],
      legalDestinations: {
        'white-pawn-1': [
          { file: 4, rank: 4 },
          { file: 4, rank: 3 },
        ],
      },
    })
    expect(open.submitMoveIntent(intent())).toBe(true)
    expect(
      open.submitMoveIntent(
        intent({ intentId: 'intent-2', from: { file: 4, rank: 6 }, to: { file: 4, rank: 3 } }),
      ),
    ).toBe(false)
    expect(open.getPieces()[0].square).toEqual({ file: 4, rank: 4 })
  })

  it('removes a piece that occupied the destination and applies an explicit promotion', () => {
    const session = new GameSession({
      pieces: [
        whitePawn(),
        whitePawn({ id: 'black-pawn-1', color: 'black', square: { file: 4, rank: 4 } }),
      ],
      legalDestinations: { 'white-pawn-1': [{ file: 4, rank: 4 }] },
    })
    expect(session.submitMoveIntent(intent({ promotion: 'queen' }))).toBe(true)
    expect(session.getPieces()).toEqual([
      {
        id: 'white-pawn-1',
        kind: 'queen',
        color: 'white',
        square: { file: 4, rank: 4 },
      },
    ])
  })

  it('ignores promotion on a piece that is not a pawn', () => {
    const session = new GameSession({
      pieces: [whitePawn({ kind: 'knight' })],
      legalDestinations: { 'white-pawn-1': [{ file: 3, rank: 4 }] },
    })
    expect(
      session.submitMoveIntent(intent({ to: { file: 3, rank: 4 }, promotion: 'queen' })),
    ).toBe(true)
    expect(session.getPieces()[0].kind).toBe('knight')
  })

  it('returns copies so callers cannot mutate session state', () => {
    const session = new GameSession({
      pieces: [whitePawn()],
      legalDestinations: { 'white-pawn-1': [{ file: 4, rank: 4 }] },
    })
    const view = session.getPieces()[0]
    const mutableSquare = view.square as { file: number }
    mutableSquare.file = 0
    const legal = session.getLegalDestinations('white-pawn-1')
    const mutableLegal = legal[0] as { file: number }
    mutableLegal.file = 1
    expect(session.getPieces()[0].square).toEqual({ file: 4, rank: 6 })
    expect(session.getLegalDestinations('white-pawn-1')[0]).toEqual({ file: 4, rank: 4 })
  })

  it('records a cancellation without moving a piece', () => {
    const session = new GameSession({
      pieces: [whitePawn()],
      legalDestinations: { 'white-pawn-1': [{ file: 4, rank: 4 }] },
    })
    expect(session.getLastCancelReason()).toBeNull()
    session.cancelPendingMove('tracking-loss')
    expect(session.getLastCancelReason()).toBe('tracking-loss')
    expect(session.getPieces()[0].square).toEqual({ file: 4, rank: 6 })
  })
})
