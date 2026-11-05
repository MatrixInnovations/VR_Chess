import type { ConnectionState } from '../ports/ultronPorts'
import type { ConnectionFailureKind } from './ConnectionFailureClassifier'

/** Error-screen view model. */
export interface IErrorSnapshot {
  readonly kind: ConnectionFailureKind
  readonly state: ConnectionState
  readonly message: string | null
  readonly code: string | null
  readonly provisional: boolean
}

/**
 * Copy for stream loss, reconnect, and auth failure.
 */
export class ErrorReconnectPresenter {
  private kind: ConnectionFailureKind = 'clear'
  private state: ConnectionState = 'idle'
  private message: string | null = null
  private code: string | null = null

  /**
   * Store the latest classification.
   * Provisional copy says the game is still in progress. Auth and hard failures
   * prefer the port's message when it has one.
   * @param state - Port state.
   * @param error - Port error, or `null`.
   * @param kind - Classification from {@link ConnectionFailureClassifier}.
   */
  apply(
    state: ConnectionState,
    error: { code: string; message: string } | null,
    kind: ConnectionFailureKind,
  ): void {
    this.kind = kind
    this.state = state
    this.code = error?.code ?? null
    if (kind === 'clear') {
      this.message = null
      return
    }
    if (kind === 'provisional') {
      this.message = error?.message
        ? `Reconnecting. ${error.message}`
        : 'Reconnecting to the game stream'
      return
    }
    if (kind === 'auth') {
      this.message = error?.message ?? 'Sign-in is no longer valid'
      return
    }
    this.message = error?.message ?? 'The connection dropped'
  }

  /** Immutable error view. */
  snapshot(): IErrorSnapshot {
    return {
      kind: this.kind,
      state: this.state,
      message: this.message,
      code: this.code,
      provisional: this.kind === 'provisional',
    }
  }
}
