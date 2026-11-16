import type { ISpeechRecognitionPort, SpeechStatus } from './ISpeechRecognitionPort'

/**
 * Minimal recognizer surface the browser adapter drives.
 * Structural on purpose: the DOM `SpeechRecognition` type is not required, and tests supply a fake.
 */
export interface SpeechRecognitionLike {
  lang: string
  continuous: boolean
  interimResults: boolean
  onresult: ((event: SpeechRecognitionEventLike) => void) | null
  onerror: ((event: { error: string }) => void) | null
  onend: (() => void) | null
  onstart: (() => void) | null
  start(): void
  stop(): void
  abort(): void
}

/** Hypothesis list from one recognition event. `results` is cumulative for the utterance. */
export interface SpeechRecognitionEventLike {
  readonly resultIndex: number
  readonly results: ArrayLike<SpeechRecognitionResultLike>
}

/** One hypothesis. Only `isFinal` entries become a transcript the parser may see. */
export interface SpeechRecognitionResultLike {
  readonly isFinal: boolean
  readonly length: number
  readonly 0: { transcript: string }
}

/**
 * Builds recognizers.
 * Production code uses {@link BrowserSpeechRecognitionFactory}. Tests pass a fake.
 */
export interface SpeechRecognitionFactory {
  /** True when this environment can construct a recognizer. */
  isSupported(): boolean
  /** Construct a recognizer. Throws when {@link isSupported} is false. */
  create(): SpeechRecognitionLike
}

interface SpeechGlobal {
  SpeechRecognition?: new () => SpeechRecognitionLike
  webkitSpeechRecognition?: new () => SpeechRecognitionLike
}

/**
 * Browser Web Speech API adapter.
 *
 * Soft-fails to `unsupported` when the constructor is missing and to `denied` on a permission
 * error. `stop` aborts the recognizer and detaches the result handler first, so an in-flight
 * event cannot publish a transcript after the listen was cancelled.
 */
export class WebSpeechRecognitionAdapter implements ISpeechRecognitionPort {
  private recognition: SpeechRecognitionLike | null = null
  private statusKind: SpeechStatus = 'idle'
  private finalTranscript = ''
  private readonly listeners = new Set<(transcript: string) => void>()

  /**
   * @param factory - Source of recognizer instances. Defaults to the browser constructors.
   * @param lang - BCP-47 language tag passed to the recognizer. Chess phrases are English.
   */
  constructor(
    private readonly factory: SpeechRecognitionFactory = new BrowserSpeechRecognitionFactory(),
    private readonly lang = 'en-US',
  ) {}

  /**
   * Start a one-shot listen.
   * Resolves on `onstart`, on an error, or on `onend` if the engine never starts.
   * A second call while already listening does not open another recognizer.
   */
  async start(): Promise<void> {
    if (this.statusKind === 'listening') return
    if (!this.factory.isSupported()) {
      this.statusKind = 'unsupported'
      return
    }
    this.detach()
    this.finalTranscript = ''

    let recognition: SpeechRecognitionLike
    try {
      recognition = this.factory.create()
    } catch (error) {
      this.applyThrown(error)
      return
    }
    this.recognition = recognition
    recognition.lang = this.lang
    recognition.continuous = false
    // Interims are requested so we can ignore them. Treating a partial as a move would submit early.
    recognition.interimResults = true

    await new Promise<void>((resolve) => {
      let settled = false
      const finish = () => {
        if (settled) return
        settled = true
        resolve()
      }
      recognition.onstart = () => {
        this.statusKind = 'listening'
        finish()
      }
      recognition.onerror = (event) => {
        this.applyError(event.error)
        finish()
      }
      recognition.onend = () => {
        if (this.statusKind === 'listening') this.statusKind = 'idle'
        finish()
      }
      recognition.onresult = (event) => {
        this.capture(event)
      }
      try {
        recognition.start()
      } catch (error) {
        this.applyThrown(error)
        finish()
      }
    })
  }

  /**
   * Abort the recognizer and ignore any result that has not already been finalized.
   * A transcript that was finalized before `stop` is kept so the controller can still read it
   * if it consumed the phrase in the same turn. Later events are not delivered.
   */
  async stop(): Promise<void> {
    this.detach()
    if (this.statusKind === 'listening') this.statusKind = 'idle'
  }

  /**
   * Cancel the recognizer. Same as {@link stop}.
   * Exposed so a UI teardown can release the mic without knowing which method the port uses.
   */
  async dispose(): Promise<void> {
    await this.stop()
  }

  /** Latest confirmed transcript, or an empty string. */
  readFinal(): string {
    return this.finalTranscript
  }

  /** Current recognizer status. Permission denial sticks across `stop`. */
  status(): SpeechStatus {
    return this.statusKind
  }

  /**
   * Subscribe to a confirmed transcript.
   * Listeners are not called for interim text or for a result that arrives after `stop`.
   * @returns Unsubscribe function.
   */
  onFinal(listener: (transcript: string) => void): () => void {
    this.listeners.add(listener)
    return () => {
      this.listeners.delete(listener)
    }
  }

  /** Drop handlers before abort so a synchronous result inside `abort` cannot publish. */
  private detach(): void {
    const recognition = this.recognition
    this.recognition = null
    if (!recognition) return
    recognition.onresult = null
    recognition.onstart = null
    recognition.onerror = null
    recognition.onend = null
    try {
      recognition.abort()
    } catch {
      // `abort` throws if the engine already ended. The listen is still cancelled.
    }
  }

  /** Keep final segments only, and only once the recognizer has actually started. */
  private capture(event: SpeechRecognitionEventLike): void {
    if (this.statusKind !== 'listening') return
    let text = ''
    for (let index = 0; index < event.results.length; index += 1) {
      const result = event.results[index]
      if (!result.isFinal) continue
      text += result[0].transcript
    }
    const trimmed = text.trim()
    if (!trimmed) return
    this.finalTranscript = trimmed
    // Copy before iterating so a listener that unsubscribes itself cannot skip the next one.
    for (const listener of [...this.listeners]) listener(trimmed)
  }

  /** Permission errors are denial. Everything else, including `no-speech`, is a soft idle. */
  private applyError(error: string): void {
    if (error === 'not-allowed' || error === 'service-not-allowed') {
      this.statusKind = 'denied'
      return
    }
    // A late no-speech after denial must not clear the denied state.
    if (this.statusKind !== 'denied') this.statusKind = 'idle'
  }

  /** Synchronous throws from `create` or `start` use the same denial rule as error events. */
  private applyThrown(error: unknown): void {
    const text = error instanceof Error ? `${error.name} ${error.message}` : String(error)
    if (/NotAllowedError|not-allowed|permission/i.test(text)) {
      this.statusKind = 'denied'
      return
    }
    this.statusKind = 'idle'
  }
}

/**
 * Locates `SpeechRecognition` or the webkit-prefixed constructor on `globalThis`.
 * The standard name wins when both exist.
 */
export class BrowserSpeechRecognitionFactory implements SpeechRecognitionFactory {
  /** True when either browser constructor is present. */
  isSupported(): boolean {
    return this.resolve() !== null
  }

  /**
   * Construct a recognizer.
   * @throws When speech recognition is not available. Callers that want a soft failure
   * should check {@link isSupported} first. The adapter does that.
   */
  create(): SpeechRecognitionLike {
    const Ctor = this.resolve()
    if (!Ctor) {
      throw new Error('Speech recognition is unsupported in this environment')
    }
    return new Ctor()
  }

  /** Standard constructor, then the webkit prefix, then null. */
  private resolve(): (new () => SpeechRecognitionLike) | null {
    const scope = globalThis as SpeechGlobal
    return scope.SpeechRecognition ?? scope.webkitSpeechRecognition ?? null
  }
}
