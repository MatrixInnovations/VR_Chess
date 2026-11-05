import type { ConnectionState } from '../ports/ultronPorts'

/**
 * How the error screen treats a connection reading.
 * `clear` means leave the error screen. `provisional` means the game is still
 * the same game. `hard` is a dropped stream. `auth` needs sign-in again.
 */
export type ConnectionFailureKind = 'clear' | 'provisional' | 'hard' | 'auth'

/**
 * Classifies {@link IConnectionPort} readings.
 * `connecting` and `reconnecting` are provisional: a clock that looks dead is
 * not a confirmed loss, and this screen does not adjudicate one.
 */
export class ConnectionFailureClassifier {
  /**
   * @param state - Current port state.
   * @param error - Last error, used for the auth code when the state is terminal.
   * @returns Which error-screen treatment to use.
   */
  classify(
    state: ConnectionState,
    error: { code: string; message: string } | null,
  ): ConnectionFailureKind {
    if (state === 'online' || state === 'idle') return 'clear'
    if (state === 'connecting' || state === 'reconnecting') return 'provisional'
    const code = error?.code ?? ''
    if (code === 'auth' || code === 'auth-error') return 'auth'
    return 'hard'
  }
}
