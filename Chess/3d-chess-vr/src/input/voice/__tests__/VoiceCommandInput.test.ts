import { describe, expect, it, vi } from 'vitest'
import { ChessPhraseParser } from '../ChessPhraseParser'
import type { LegalMove } from '../IGameSessionMovePort'
import type { MoveIntent } from '../IInputController'
import type { ISpeechRecognitionPort, SpeechStatus } from '../ISpeechRecognitionPort'
import { VoiceCommandInput } from '../VoiceCommandInput'

class FakeSpeech implements ISpeechRecognitionPort {
  statusKind: SpeechStatus = 'idle'
  finalText = ''
  startCount = 0
  stopCount = 0
  startError: Error | null = null
  stopError: Error | null = null
  /** When set, `stop` throws only once `stopCount` reaches this value. */
  stopFailuresAt: number | null = null
  /** When set, `start` waits so a caller can dispose mid-listen. */
  holdStart: Promise<void> | null = null
  private listeners = new Set<(transcript: string) => void>()

  async start(): Promise<void> {
    this.startCount += 1
    if (this.holdStart) await this.holdStart
    if (this.startError) throw this.startError
    if (this.statusKind !== 'denied' && this.statusKind !== 'unsupported') {
      this.statusKind = 'listening'
    }
  }

  async stop(): Promise<void> {
    this.stopCount += 1
    if (this.stopError && (this.stopFailuresAt === null || this.stopCount >= this.stopFailuresAt)) {
      throw this.stopError
    }
    if (this.statusKind === 'listening') this.statusKind = 'idle'
    this.listeners.clear()
  }

  readFinal(): string {
    return this.finalText
  }

  status(): SpeechStatus {
    return this.statusKind
  }

  onFinal(listener: (transcript: string) => void): () => void {
    this.listeners.add(listener)
    return () => {
      this.listeners.delete(listener)
    }
  }

  emit(transcript: string): void {
    this.finalText = transcript
    if (this.statusKind !== 'listening') return
    for (const listener of [...this.listeners]) listener(transcript)
  }
}

function createSession(legal: readonly LegalMove[]) {
  return {
    legalMoves: vi.fn(() => legal),
    submitMoveIntent: vi.fn((_intent: MoveIntent) => true),
    requestOriginClarification: vi.fn((_candidates: readonly MoveIntent[]) => undefined),
    applyMove: vi.fn(),
    setBoard: vi.fn(),
    movePiece: vi.fn(),
  }
}

type SessionSpy = ReturnType<typeof createSession>

function expectNoBoardWrite(session: SessionSpy): void {
  expect(session.applyMove).not.toHaveBeenCalled()
  expect(session.setBoard).not.toHaveBeenCalled()
  expect(session.movePiece).not.toHaveBeenCalled()
}

describe('VoiceCommandInput', () => {
  it('soft-fails start when the mic is denied', async () => {
    const speech = new FakeSpeech()
    speech.statusKind = 'denied'
    const session = createSession([{ from: 'e2', to: 'e4' }])
    const input = new VoiceCommandInput(speech, new ChessPhraseParser(), session)
    await expect(input.start()).resolves.toBeUndefined()
    expect(input.isActive()).toBe(false)
    speech.finalText = 'pawn to e4'
    input.processFinalTranscript()
    expect(session.submitMoveIntent).not.toHaveBeenCalled()
    expectNoBoardWrite(session)
  })

  it('soft-fails start when speech recognition is unsupported', async () => {
    const speech = new FakeSpeech()
    speech.statusKind = 'unsupported'
    const session = createSession([{ from: 'e2', to: 'e4' }])
    const input = new VoiceCommandInput(speech, new ChessPhraseParser(), session)
    await input.start()
    expect(input.isActive()).toBe(false)
    expect(session.submitMoveIntent).not.toHaveBeenCalled()
  })

  it('soft-fails when the port throws on start', async () => {
    const speech = new FakeSpeech()
    speech.startError = new Error('no audio device')
    const session = createSession([{ from: 'e2', to: 'e4' }])
    const input = new VoiceCommandInput(speech, new ChessPhraseParser(), session)
    await expect(input.start()).resolves.toBeUndefined()
    expect(input.isActive()).toBe(false)
    expect(session.submitMoveIntent).not.toHaveBeenCalled()
  })

  it('does not submit an empty or whitespace transcript', async () => {
    const speech = new FakeSpeech()
    const session = createSession([{ from: 'e2', to: 'e4' }])
    const input = new VoiceCommandInput(speech, new ChessPhraseParser(), session)
    input.processFinalTranscript()
    await input.start()
    speech.finalText = '   '
    input.processFinalTranscript()
    expect(session.submitMoveIntent).not.toHaveBeenCalled()
    expect(session.requestOriginClarification).not.toHaveBeenCalled()
    expect(session.legalMoves).not.toHaveBeenCalled()
    expectNoBoardWrite(session)
  })

  it('submits exactly one voice intent for a confirmed legal phrase', async () => {
    const speech = new FakeSpeech()
    const legal: LegalMove[] = [{ from: 'e2', to: 'e4' }]
    const session = createSession(legal)
    const input = new VoiceCommandInput(speech, new ChessPhraseParser(), session)
    speech.finalText = 'move pawn to e4'
    await input.start()
    expect(input.isActive()).toBe(true)
    expect(session.submitMoveIntent).toHaveBeenCalledTimes(1)
    expect(session.submitMoveIntent).toHaveBeenCalledWith({
      from: 'e2',
      to: 'e4',
      source: 'voice',
    })
    expect(session.requestOriginClarification).not.toHaveBeenCalled()
    expectNoBoardWrite(session)
    input.processFinalTranscript()
    expect(session.submitMoveIntent).toHaveBeenCalledTimes(1)
  })

  it('submits a later transcript from the recognizer and then refuses a second one until restart', async () => {
    const speech = new FakeSpeech()
    const session = createSession([{ from: 'g1', to: 'f3' }])
    const input = new VoiceCommandInput(speech, new ChessPhraseParser(), session)
    await input.start()
    speech.emit('knight to f3')
    expect(session.submitMoveIntent).toHaveBeenCalledTimes(1)
    expect(session.submitMoveIntent).toHaveBeenCalledWith({
      from: 'g1',
      to: 'f3',
      source: 'voice',
    })
    speech.emit('knight to f3')
    expect(session.submitMoveIntent).toHaveBeenCalledTimes(1)

    await input.stop()
    expect(input.isActive()).toBe(false)
    expect(speech.stopCount).toBe(1)
    speech.emit('knight to f3')
    expect(session.submitMoveIntent).toHaveBeenCalledTimes(1)

    speech.finalText = 'knight to f3'
    await input.start()
    expect(session.submitMoveIntent).toHaveBeenCalledTimes(2)
    expectNoBoardWrite(session)
  })

  it('requests origin clarification and does not submit when the phrase matches two legal moves', async () => {
    const speech = new FakeSpeech()
    const session = createSession([
      { from: 'g1', to: 'f3' },
      { from: 'd2', to: 'f3' },
    ])
    const input = new VoiceCommandInput(speech, new ChessPhraseParser(), session)
    await input.start()
    speech.emit('knight to f3')
    expect(session.submitMoveIntent).not.toHaveBeenCalled()
    expect(session.requestOriginClarification).toHaveBeenCalledTimes(1)
    expect(session.requestOriginClarification).toHaveBeenCalledWith([
      { from: 'g1', to: 'f3', source: 'voice' },
      { from: 'd2', to: 'f3', source: 'voice' },
    ])
    expectNoBoardWrite(session)
  })

  it('does not submit garbage and does not ask for clarification', async () => {
    const speech = new FakeSpeech()
    const session = createSession([{ from: 'e2', to: 'e4' }])
    const input = new VoiceCommandInput(speech, new ChessPhraseParser(), session)
    await input.start()
    speech.emit('order a pizza')
    expect(session.submitMoveIntent).not.toHaveBeenCalled()
    expect(session.requestOriginClarification).not.toHaveBeenCalled()
    expectNoBoardWrite(session)
  })

  it('reads legal moves at phrase time, not when listening started', async () => {
    const speech = new FakeSpeech()
    let legal: LegalMove[] = [{ from: 'e2', to: 'e4' }]
    const session = createSession(legal)
    session.legalMoves = vi.fn(() => legal)
    const input = new VoiceCommandInput(speech, new ChessPhraseParser(), session)
    await input.start()
    legal = []
    speech.emit('pawn to e4')
    expect(session.submitMoveIntent).not.toHaveBeenCalled()
    expect(session.legalMoves).toHaveBeenCalledTimes(1)
  })

  it('overwrites a parser source and still submits only through the session', async () => {
    const speech = new FakeSpeech()
    const session = createSession([{ from: 'e2', to: 'e4' }])
    const parser = new ChessPhraseParser()
    vi.spyOn(parser, 'parse').mockReturnValue([{ to: 'e4', source: 'pointer' }])
    const input = new VoiceCommandInput(speech, parser, session)
    await input.start()
    speech.finalText = 'anywhere'
    input.processFinalTranscript()
    expect(session.submitMoveIntent).toHaveBeenCalledTimes(1)
    expect(session.submitMoveIntent).toHaveBeenCalledWith({ to: 'e4', source: 'voice' })
    expectNoBoardWrite(session)
  })

  it('submits once even when the session rejects the intent', async () => {
    const speech = new FakeSpeech()
    const session = createSession([{ from: 'e2', to: 'e4' }])
    session.submitMoveIntent.mockReturnValue(false)
    const input = new VoiceCommandInput(speech, new ChessPhraseParser(), session)
    await input.start()
    speech.emit('pawn to e4')
    expect(session.submitMoveIntent).toHaveBeenCalledTimes(1)
    expectNoBoardWrite(session)
  })

  it('swallows a stop failure and stays inactive', async () => {
    const speech = new FakeSpeech()
    const session = createSession([{ from: 'e2', to: 'e4' }])
    const input = new VoiceCommandInput(speech, new ChessPhraseParser(), session)
    await input.start()
    speech.stopError = new Error('device gone')
    await expect(input.stop()).resolves.toBeUndefined()
    expect(input.isActive()).toBe(false)
    speech.finalText = 'pawn to e4'
    input.processFinalTranscript()
    expect(session.submitMoveIntent).not.toHaveBeenCalled()
  })

  it('soft-fails when dispose closes a mic that start opened a moment later', async () => {
    let release: () => void = () => undefined
    const speech = new FakeSpeech()
    speech.holdStart = new Promise<void>((resolve) => {
      release = resolve
    })
    speech.stopError = new Error('mic already closed')
    speech.stopFailuresAt = 2
    const session = createSession([{ from: 'e2', to: 'e4' }])
    const input = new VoiceCommandInput(speech, new ChessPhraseParser(), session)
    const pending = input.start()
    const disposing = input.dispose()
    release()
    await expect(disposing).resolves.toBeUndefined()
    await pending
    expect(input.isActive()).toBe(false)
    expect(speech.stopCount).toBeGreaterThan(1)
    expect(session.submitMoveIntent).not.toHaveBeenCalled()
  })

  it('cancels an in-flight listen on dispose and does not submit afterwards', async () => {
    let release: () => void = () => undefined
    const speech = new FakeSpeech()
    speech.holdStart = new Promise<void>((resolve) => {
      release = resolve
    })
    const session = createSession([{ from: 'e2', to: 'e4' }])
    const parser = new ChessPhraseParser()
    vi.spyOn(parser, 'parse').mockReturnValue([{ from: 'e2', to: 'e4', source: 'voice' }])
    const input = new VoiceCommandInput(speech, parser, session)
    const pending = input.start()
    const disposing = input.dispose()
    release()
    await disposing
    await pending
    expect(speech.stopCount).toBeGreaterThan(0)
    expect(input.isActive()).toBe(false)
    speech.statusKind = 'listening'
    speech.finalText = 'pawn to e4'
    input.processFinalTranscript()
    expect(session.submitMoveIntent).not.toHaveBeenCalled()
    expectNoBoardWrite(session)
  })

  it('does not submit a transcript that arrives while the controller is inactive', () => {
    const speech = new FakeSpeech()
    speech.finalText = 'pawn to e4'
    const session = createSession([{ from: 'e2', to: 'e4' }])
    const input = new VoiceCommandInput(speech, new ChessPhraseParser(), session)
    input.processFinalTranscript()
    expect(session.submitMoveIntent).not.toHaveBeenCalled()
    expect(session.legalMoves).not.toHaveBeenCalled()
  })

  it('ignores a transcript when the port reports denied or unsupported after listening began', async () => {
    const deniedSpeech = new FakeSpeech()
    const deniedSession = createSession([{ from: 'e2', to: 'e4' }])
    const deniedInput = new VoiceCommandInput(deniedSpeech, new ChessPhraseParser(), deniedSession)
    await deniedInput.start()
    deniedSpeech.statusKind = 'denied'
    deniedSpeech.finalText = 'pawn to e4'
    deniedInput.processFinalTranscript()
    expect(deniedSession.submitMoveIntent).not.toHaveBeenCalled()

    const unsupportedSpeech = new FakeSpeech()
    const unsupportedSession = createSession([{ from: 'e2', to: 'e4' }])
    const unsupportedInput = new VoiceCommandInput(
      unsupportedSpeech,
      new ChessPhraseParser(),
      unsupportedSession,
    )
    await unsupportedInput.start()
    unsupportedSpeech.statusKind = 'unsupported'
    unsupportedSpeech.finalText = 'pawn to e4'
    unsupportedInput.processFinalTranscript()
    expect(unsupportedSession.submitMoveIntent).not.toHaveBeenCalled()
  })

  it('does not start again after dispose', async () => {
    const speech = new FakeSpeech()
    const session = createSession([{ from: 'e2', to: 'e4' }])
    const input = new VoiceCommandInput(speech, new ChessPhraseParser(), session)
    await input.dispose()
    speech.finalText = 'pawn to e4'
    await input.start()
    expect(speech.startCount).toBe(0)
    expect(input.isActive()).toBe(false)
    expect(session.submitMoveIntent).not.toHaveBeenCalled()
  })
})

describe('VoiceCommandInput session boundary', () => {
  it('never calls a board writer even if one is attached beside the session port', async () => {
    const speech = new FakeSpeech()
    const session = createSession([{ from: 'e2', to: 'e4' }])
    const input = new VoiceCommandInput(speech, new ChessPhraseParser(), session)
    await input.start()
    speech.emit('pawn to e4')
    const calls = [
      session.legalMoves.mock.calls.length,
      session.submitMoveIntent.mock.calls.length,
      session.requestOriginClarification.mock.calls.length,
      session.applyMove.mock.calls.length,
      session.setBoard.mock.calls.length,
      session.movePiece.mock.calls.length,
    ]
    expect(calls).toEqual([1, 1, 0, 0, 0, 0])
    const submitted = session.submitMoveIntent.mock.calls[0][0] as MoveIntent
    expect(submitted.source).toBe('voice')
  })
})
