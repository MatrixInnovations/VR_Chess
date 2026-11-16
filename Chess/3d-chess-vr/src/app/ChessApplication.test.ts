import { describe, expect, it } from 'vitest'

import type { XrSessionPort } from './XrSessionPort'
import { ChessApplication } from './ChessApplication'
import { MemoryKeyValueStore } from '../ultron/auth/MemoryKeyValueStore'
import type { IHttpTransport } from '../ultron/contracts/http'
import { WebSpeechRecognitionAdapter } from '../input/voice/WebSpeechRecognitionAdapter'
import type { SpeechRecognitionFactory, SpeechRecognitionLike } from '../input/voice/WebSpeechRecognitionAdapter'

class FakeXr implements XrSessionPort {
  lastError = ''
  vr = 0
  ended = 0

  async enterVR(): Promise<boolean> {
    this.vr += 1
    return true
  }

  async enterAR(): Promise<boolean> {
    this.lastError = 'no ar'
    return false
  }

  async exit(): Promise<void> {
    this.ended += 1
  }

  onSessionEnd(): void {
    return undefined
  }
}

class DeadTransport implements IHttpTransport {
  async send(): Promise<never> {
    throw new Error('network is not used in pass and play')
  }
}

class ScriptedSpeech implements SpeechRecognitionLike {
  lang = 'en-US'
  continuous = false
  interimResults = false
  onresult: SpeechRecognitionLike['onresult'] = null
  onerror: SpeechRecognitionLike['onerror'] = null
  onend: (() => void) | null = null
  onstart: (() => void) | null = null
  transcript = 'move pawn to e4'

  start(): void {
    this.onstart?.()
    this.onresult?.({
      resultIndex: 0,
      results: [{ isFinal: true, length: 1, 0: { transcript: this.transcript } }],
    })
  }

  stop(): void {
    this.onend?.()
  }

  abort(): void {
    this.onend?.()
  }
}

describe('ChessApplication pass and play', () => {
  function app(now: () => number = () => 0): { app: ChessApplication; xr: FakeXr } {
    const xr = new FakeXr()
    return {
      xr,
      app: new ChessApplication({
        now,
        xr,
        whiteMs: 60_000,
        blackMs: 60_000,
        incrementMs: 2_000,
        transport: new DeadTransport(),
        storage: new MemoryKeyValueStore(),
        clientId: '',
        redirectUri: 'http://localhost:3000/',
        speech: new WebSpeechRecognitionAdapter(new ScriptFactory()),
      }),
    }
  }

  it('plays a few moves, switches the clock, and keeps the session across immersive', async () => {
    let time = 0
    const { app: hall, xr } = app(() => time)
    const session = hall.game
    const clock = hall.readModel.clockPort
    expect(hall.clockView.present().white.isActive).toBe(true)
    expect(hall.selectPiece('white-pawn-5')).toBe(true)
    expect(hall.runtime.hall.board.highlightedSquares().some((square) => square.file === 4 && square.rank === 4)).toBe(true)
    expect(hall.playAlgebraic('e2', 'e4')).toBe(true)
    time = 1_000
    hall.frame(time)
    const after = hall.clockView.present()
    expect(after.black.isActive).toBe(true)
    expect(after.white.remainingMs).toBeGreaterThan(60_000)
    expect(hall.playAlgebraic('e7', 'e5')).toBe(true)
    expect(hall.playAlgebraic('g1', 'f3')).toBe(true)
    expect(hall.game).toBe(session)
    expect(hall.readModel.clockPort).toBe(clock)
    await hall.toggleImmersive()
    expect(xr.vr).toBe(1)
    expect(hall.presentation).toBe('immersive')
    expect(hall.game).toBe(session)
    expect(hall.readModel.clockPort).toBe(clock)
    expect(hall.game.snapshot.moves).toEqual(['e2e4', 'e7e5', 'g1f3'])
    await hall.toggleImmersive()
    expect(hall.presentation).toBe('desktop3d')
    expect(hall.game).toBe(session)
    await hall.resign()
    expect(hall.game.snapshot.outcome?.status).toBe('resign')
  })

  it('agrees a draw, speaks a pawn move, and rejects sign-in without a client id', async () => {
    const { app: hall } = app()
    await hall.offerDraw()
    expect(hall.game.snapshot.whiteOfferingDraw).toBe(true)
    expect(hall.playAlgebraic('e2', 'e4')).toBe(true)
    await hall.offerDraw()
    expect(hall.game.snapshot.outcome?.status).toBe('draw')
    const spoken = app()
    await spoken.app.listen()
    expect(spoken.app.game.snapshot.moves).toEqual([])
    expect(spoken.app.message).toMatch(/^Confirm /)
    await spoken.app.shell.signIn.begin()
    expect(spoken.app.shell.authPresenter.snapshot().phase).toBe('denied')
    const before = spoken.app.game
    spoken.app.newPassAndPlay()
    expect(spoken.app.game).not.toBe(before)
    expect(spoken.app.game.snapshot.moves).toEqual([])
  })
})

class ScriptFactory implements SpeechRecognitionFactory {
  isSupported(): boolean {
    return true
  }

  create(): SpeechRecognitionLike {
    return new ScriptedSpeech()
  }
}
