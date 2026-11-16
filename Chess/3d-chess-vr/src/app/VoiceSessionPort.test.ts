import { describe, expect, it } from 'vitest'
import { LocalPlayer } from '../ultron/players/LocalPlayer'
import { ChessJsRules } from '../ultron/rules/ChessJsRules'
import { GameSession } from '../ultron/session/GameSession'
import { SequentialIds } from '../ultron/session/SequentialIds'
import { VoiceSessionPort } from './VoiceSessionPort'

function session(): GameSession {
  return GameSession.offline({
    rules: new ChessJsRules(),
    ids: new SequentialIds('voice'),
    now: () => 0,
    sessionId: 'spoken',
    white: new LocalPlayer('white', 'Left'),
    black: new LocalPlayer('black', 'Right'),
  })
}

describe('VoiceSessionPort', () => {
  it('submits a legal spoken move and asks when the phrase is not one move', () => {
    const notes: string[] = []
    const game = session()
    const port = new VoiceSessionPort(game, (text) => notes.push(text))
    expect(port.legalMoves().some((move) => move.from === 'e2' && move.to === 'e4' && move.piece === 'pawn')).toBe(
      true,
    )
    expect(port.submitMoveIntent({ from: 'e2', to: 'e4', promotion: 'q', source: 'voice' })).toBe(false)
    expect(port.submitMoveIntent({ from: 'e2', to: 'e4', promotion: 'r', source: 'voice' })).toBe(false)
    expect(port.submitMoveIntent({ from: 'e2', to: 'e4', promotion: 'b', source: 'voice' })).toBe(false)
    expect(port.submitMoveIntent({ from: 'e2', to: 'e4', promotion: 'n', source: 'voice' })).toBe(false)
    expect(port.submitMoveIntent({ from: 'e2', to: 'e4', source: 'voice' })).toBe(true)
    expect(game.snapshot.moves).toEqual(['e2e4'])
    expect(port.submitMoveIntent({ to: 'e5', source: 'voice' })).toBe(false)
    expect(port.submitMoveIntent({ from: 'zz', to: 'e4', source: 'voice' })).toBe(false)
    expect(port.submitMoveIntent({ from: 'a3', to: 'a4', source: 'voice' })).toBe(false)

    port.requestOriginClarification([])
    port.requestOriginClarification([{ to: 'e4', source: 'voice' }])
    port.requestOriginClarification([{ from: 'g1', to: 'f3', source: 'voice' }])
    port.requestOriginClarification([
      { from: 'e7', to: 'e8', promotion: 'q', source: 'voice' },
      { from: 'e7', to: 'e8', promotion: 'n', source: 'voice' },
    ])
    port.requestOriginClarification([
      { from: 'e2', to: 'e3', source: 'voice' },
      { from: 'e2', to: 'e4', source: 'voice' },
    ])
    port.requestOriginClarification([
      { from: 'g1', to: 'f3', source: 'voice' },
      { from: 'b1', to: 'c3', source: 'voice' },
    ])
    expect(notes.some((note) => note.includes("Didn't catch"))).toBe(true)
    expect(notes.some((note) => note.startsWith('Confirm'))).toBe(true)
    expect(notes.some((note) => note.includes('become'))).toBe(true)
    expect(notes.some((note) => note.startsWith('Which square'))).toBe(true)
    expect(notes.some((note) => note.startsWith('Which piece'))).toBe(true)

    const next = session()
    port.retarget(next)
    expect(port.submitMoveIntent({ from: 'e2', to: 'e4', source: 'voice' })).toBe(true)
    expect(next.snapshot.moves).toEqual(['e2e4'])
  })
})
