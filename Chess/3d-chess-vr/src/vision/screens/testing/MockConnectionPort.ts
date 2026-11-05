import type { ConnectionState, IConnectionPort } from '../ports/ultronPorts'

/**
 * In-memory {@link IConnectionPort}.
 * `retry` returns to `online` unless {@link MockConnectionPort.failRetry} is set.
 */
export class MockConnectionPort implements IConnectionPort {
  /** How many times `retry` was called. */
  retryCount = 0
  /** When true, `retry` stays on `error` and rejects. */
  failRetry = false
  private state: ConnectionState = 'online'
  private error: { code: string; message: string } | null = null

  /** @inheritdoc */
  getState(): ConnectionState {
    return this.state
  }

  /** @inheritdoc */
  getLastError(): { code: string; message: string } | null {
    return this.error
  }

  /** @inheritdoc */
  async retry(): Promise<void> {
    this.retryCount += 1
    if (this.failRetry) {
      this.state = 'error'
      this.error = { code: 'stream-drop', message: 'Still disconnected' }
      throw new Error('retry failed')
    }
    this.state = 'online'
    this.error = null
  }

  /**
   * Set the reading the next `sync` will see.
   * @param state - Connection state.
   * @param error - Last error. Defaults to none.
   */
  setState(
    state: ConnectionState,
    error: { code: string; message: string } | null = null,
  ): void {
    this.state = state
    this.error = error
  }
}
