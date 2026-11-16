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
  private pendingIntent: MoveIntent | null = null
  private pendingCandidates: MoveIntent[] | null = null
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
    this.clearPending()
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
    this.clearPending()
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

  /** Drop a confirmation that belongs to the previous game or phrase. */
  reset(): void {
    this.clearPending()
    this.consumed = false
  }

  /** Recognizer status, so the UI can tell a denied mic from a missing API. */
  speechStatus(): 'idle' | 'listening' | 'denied' | 'unsupported' {
    return this.speech.status()
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
    const normalized = phrase.trim().toLowerCase()
    if (this.pendingIntent && this.isAffirmative(normalized)) {
      const pending = this.pendingIntent
      this.pendingIntent = null
      this.consumed = false
      const accepted = this.session.submitMoveIntent(pending)
      if (!accepted) this.session.requestOriginClarification([])
      return
    }
    if (this.isNegative(normalized)) {
      this.pendingIntent = null
      this.pendingCandidates = null
      this.consumed = false
      return
    }
    if (this.pendingCandidates && this.pendingCandidates.length > 1) {
      const narrowed = this.narrowFollowUp(phrase, this.pendingCandidates)
      this.consumed = false
      if (narrowed.length === 1) {
        this.pendingCandidates = null
        this.pendingIntent = narrowed[0]
        this.session.requestOriginClarification([narrowed[0]])
        return
      }
      if (narrowed.length > 1) {
        this.pendingCandidates = narrowed
        this.session.requestOriginClarification(narrowed)
        return
      }
    }
    this.consumed = true
    const candidates = this.parser.parse(phrase, this.session.legalMoves()).map((candidate) => {
      return this.asVoiceIntent(candidate)
    })
    if (candidates.length === 0) {
      this.consumed = false
      this.session.requestOriginClarification([])
      return
    }
    if (candidates.length > 1) {
      this.pendingCandidates = candidates
      this.consumed = false
      this.session.requestOriginClarification(candidates)
      return
    }
    this.pendingIntent = candidates[0]
    this.consumed = false
    this.session.requestOriginClarification([candidates[0]])
  }

  /** “no” or “cancel”, including a trailing period. */
  private isNegative(phrase: string): boolean {
    const words = phrase
      .toLowerCase()
      .replace(/[^a-z\s]/g, ' ')
      .split(/\s+/)
      .filter((word) => word.length > 0)
    return words.length === 1 && (words[0] === 'no' || words[0] === 'cancel')
  }

  /** Yes, including “Yes.” and “yes please”. */
  private isAffirmative(phrase: string): boolean {
    const words = phrase
      .toLowerCase()
      .replace(/[^a-z\s]/g, ' ')
      .split(/\s+/)
      .filter((word) => word.length > 0 && !VoiceCommandInput.YES_FILLERS.has(word))
    if (words.length === 1 && VoiceCommandInput.YES_WORDS.has(words[0])) return true
    return words.length === 2 && words[0] === 'do' && words[1] === 'it'
  }

  /**
   * Resolve a clarification against the moves already on screen.
   * The follow-up is parsed as chess, then a square or promotion filters that list.
   */
  private narrowFollowUp(phrase: string, pending: readonly MoveIntent[]): MoveIntent[] {
    const legal = pending.map((candidate) => ({
      from: candidate.from ?? '',
      to: candidate.to,
      promotion: candidate.promotion,
    }))
    const parsed = this.parser.parse(phrase, legal)
    if (parsed.length > 0 && parsed.length < pending.length) {
      return pending.filter((candidate) =>
        parsed.some(
          (intent) =>
            intent.from === candidate.from &&
            intent.to === candidate.to &&
            intent.promotion === candidate.promotion,
        ),
      )
    }
    const squares = this.squaresIn(phrase)
    if (squares.length > 0) {
      const fromHit = pending.filter((candidate) => candidate.from && squares.includes(candidate.from))
      const toHit = pending.filter((candidate) => squares.includes(candidate.to))
      if (fromHit.length > 0 && fromHit.length < pending.length) return [...fromHit]
      if (toHit.length > 0 && toHit.length < pending.length) return [...toHit]
    }
    const promotion = this.promotionIn(phrase)
    if (promotion) {
      const matched = pending.filter((candidate) => candidate.promotion === promotion)
      if (matched.length > 0 && matched.length < pending.length) return [...matched]
    }
    return []
  }

  /** Squares named in a short follow-up, including file homophones such as “bee one”. */
  private squaresIn(phrase: string): string[] {
    const text = phrase
      .toLowerCase()
      .replace(/\bthe one\b/g, ' ')
      .replace(/\b(bee|be)\b/g, 'b')
      .replace(/\b(see|sea)\b/g, 'c')
      .replace(/\b(one|won)\b/g, '1')
      .replace(/\b(two|too|to)\b/g, '2')
      .replace(/\b(for|fore|four)\b/g, '4')
      .replace(/\bate\b/g, '8')
      .replace(/[^a-z0-9\s]/g, ' ')
    const tokens = text.split(/\s+/).filter((token) => token.length > 0)
    const squares: string[] = []
    for (let index = 0; index < tokens.length; index += 1) {
      const token = tokens[index]
      const next = tokens[index + 1]
      if (/^[a-h]$/.test(token) && next && /^[1-8]$/.test(next)) {
        squares.push(`${token}${next}`)
        index += 1
        continue
      }
      if (/^[a-h][1-8]$/.test(token)) squares.push(token)
    }
    return squares
  }

  /** Promotion letter from “queen” or “q”. */
  private promotionIn(phrase: string): MoveIntent['promotion'] | undefined {
    const words = phrase.toLowerCase().replace(/[^a-z\s]/g, ' ').split(/\s+/).filter(Boolean)
    for (const word of words) {
      if (word === 'q' || word === 'queen' || word === 'queens') return 'q'
      if (word === 'r' || word === 'rook' || word === 'rooks') return 'r'
      if (word === 'b' || word === 'bishop' || word === 'bishops') return 'b'
      if (word === 'n' || word === 'knight' || word === 'knights') return 'n'
    }
    return undefined
  }

  /** Forget a move that was waiting for “yes” or a square. */
  private clearPending(): void {
    this.pendingIntent = null
    this.pendingCandidates = null
  }

  private static readonly YES_WORDS = new Set(['yes', 'yeah', 'yep', 'confirm'])

  private static readonly YES_FILLERS = new Set(['please', 'thanks', 'thank'])

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
