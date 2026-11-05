/**
 * Port for a speech recognizer (Web Speech API, or a Quest shim that looks like it).
 * The voice controller depends on this port, not on `window`, so tests can fake the mic.
 */

/** Recognition availability. `denied` and `unsupported` are soft failures, not exceptions. */
export type SpeechStatus = 'idle' | 'listening' | 'denied' | 'unsupported'

/**
 * Speech recognition port.
 * Implementations must not submit chess moves. They only produce transcripts.
 */
export interface ISpeechRecognitionPort {
  /** Start a listening session. Rejects only on unexpected programmer errors; permission failures resolve. */
  start(): Promise<void>
  /** Stop listening and drop any result that has not already been finalized. */
  stop(): Promise<void>
  /** Latest confirmed transcript, or an empty string when nothing has been finalized. */
  readFinal(): string
  /** Current recognizer status. */
  status(): SpeechStatus
  /**
   * Subscribe to a confirmed transcript.
   * The listener is not called after {@link stop} until a later {@link start}.
   * @returns Unsubscribe function.
   */
  onFinal(listener: (transcript: string) => void): () => void
}
