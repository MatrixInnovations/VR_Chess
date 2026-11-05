import type { IInputController, MoveIntent } from './IInputController'
import type { IGameSessionMovePort } from './IGameSessionMovePort'
import type { ISpeechRecognitionPort } from './ISpeechRecognitionPort'
import { ChessPhraseParser } from './ChessPhraseParser'

/**
 * Voice modality for {@link IInputController}.
 *
 * Resolves a transcript only against `GameSession` legal moves and submits at most one
 * `MoveIntent`. Ambiguous phrases ask for an origin square. Mic denial and a missing
 * speech API are soft failures. This class does not touch the board.
 */
export class VoiceCommandInput implements IInputController {
  private active = false
  private disposed = false
  /** One confirmed phrase per listening session. Restarting `start` clears it. */
  private consumed = false
  /**
   * Bumped on every start and stop. An in-flight `start` compares this with the value
   * it captured so a dispose that wins the race cannot turn the controller back on.
   */
  private generation = 0
  private unsubscribe: (() => void) | undefined

  /**
   * @param speech - Mic port. Denied and unsupported states leave the controller inactive.
   * @param parser - Phrase parser. Supplied so a test can substitute a fake.
   * @param session - Ultron's session. The only object allowed to accept a move.
   */
  constructor(
    private readonly speech: ISpeechRecognitionPort,
    private readonly parser: ChessPhraseParser,
    private readonly session: IGameSessionMovePort,
  ) {}

  /**
   * Begin listening.
   * Resolves without throwing when the mic is denied, speech is unsupported, or the port throws.
   * A final transcript that is already buffered is consumed once listening is confirmed.
   */
  async start(): Promise<void> {
    if (this.disposed) return
    const generation = ++this.generation
    this.clearSubscription()
    this.unsubscribe = this.speech.onFinal(() => {
      if (generation !== this.generation || this.disposed) return
      this.processFinalTranscript()
    })
    try {
      await this.speech.start()
    } catch {
      // Soft-fail: a broken device must not surface as an exception to the UI.
      if (generation === this.generation) {
        this.active = false
        this.clearSubscription()
      }
      return
    }
    if (this.disposed || generation !== this.generation) {
      this.active = false
      this.clearSubscription()
      // start() may have opened the mic after dispose already ran. Close it.
      if (this.speech.status() === 'listening') {
        try {
          await this.speech.stop()
        } catch {
          // The controller is already disposed. A second stop error is still a soft failure.
        }
      }
      return
    }
    this.active = this.speech.status() === 'listening'
    if (!this.active) {
      this.clearSubscription()
      return
    }
    this.consumed = false
    this.processFinalTranscript()
  }

  /**
   * Stop listening and cancel an in-flight capture.
   * A transcript that has not been consumed yet will not be submitted after this returns.
   */
  async stop(): Promise<void> {
    this.generation += 1
    this.active = false
    this.consumed = true
    this.clearSubscription()
    try {
      await this.speech.stop()
    } catch {
      // Soft-fail. `active` is already false, so a late transcript cannot submit.
    }
  }

  /**
   * Stop listening and refuse later `start` calls.
   * Cancels a `start` that has not resolved yet.
   */
  async dispose(): Promise<void> {
    this.disposed = true
    await this.stop()
  }

  /** True after a successful `start` until `stop` or `dispose`. */
  isActive(): boolean {
    return this.active && !this.disposed
  }

  /**
   * Submit at most one intent for the current final transcript.
   * Empty audio does nothing. Two or more legal matches ask for an origin and do not submit.
   * A second call in the same listening session is ignored.
   */
  processFinalTranscript(): void {
    if (this.disposed || !this.active || this.consumed) return
    const status = this.speech.status()
    if (status === 'denied' || status === 'unsupported') return
    const phrase = this.speech.readFinal()
    if (!phrase.trim()) return
    // Lock before submit so a listener re-entry cannot file a second intent for this phrase.
    this.consumed = true
    const candidates = this.parser.parse(phrase, this.session.legalMoves()).map((candidate) => {
      return this.asVoiceIntent(candidate)
    })
    if (candidates.length === 0) return
    if (candidates.length > 1) {
      this.session.requestOriginClarification(candidates)
      return
    }
    this.session.submitMoveIntent(candidates[0])
  }

  /** Force the voice channel even if a parser double returned another source. */
  private asVoiceIntent(candidate: MoveIntent): MoveIntent {
    return { ...candidate, source: 'voice' }
  }

  /** Drop the transcript listener. Safe when none is registered. */
  private clearSubscription(): void {
    this.unsubscribe?.()
    this.unsubscribe = undefined
  }
}
