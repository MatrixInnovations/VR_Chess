import { describe, expect, it } from 'vitest'

import {
  GameSession,
  GameSessionHost,
  LichessClient,
  LichessPlayer,
  LocalPlayer,
  OAuthPkceClient,
  Player,
  Squares,
  isOnBoard,
  squareKey,
  squaresEqual,
} from './index'

describe('ultron public exports', () => {
  it('re-exports the session, the player, and the square helpers', () => {
    expect(GameSession).toBeTypeOf('function')
    expect(GameSessionHost).toBeTypeOf('function')
    expect(LichessClient).toBeTypeOf('function')
    expect(LichessPlayer).toBeTypeOf('function')
    expect(LocalPlayer).toBeTypeOf('function')
    expect(OAuthPkceClient).toBeTypeOf('function')
    expect(Player).toBeTypeOf('function')
    expect(isOnBoard({ file: 0, rank: 0 })).toBe(true)
    expect(isOnBoard({ file: 8, rank: 0 })).toBe(false)
    expect(squareKey({ file: 4, rank: 6 })).toBe(Squares.key({ file: 4, rank: 6 }))
    expect(squaresEqual({ file: 1, rank: 1 }, { file: 1, rank: 1 })).toBe(true)
  })
})
