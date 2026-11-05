import type { IConnectionPort } from '../ports/ultronPorts'
import { ScreenId } from '../ScreenId'
import { ScreenNavigator } from '../ScreenNavigator'
import { ConnectionFailureClassifier } from './ConnectionFailureClassifier'
import { ErrorReconnectPresenter } from './ErrorReconnectPresenter'

/**
 * Error and reconnect screen.
 *
 * Re-reads {@link IConnectionPort} because the port has no subscription.
 * `retry` is the reconnect action. A successful retry restores the screen that
 * was interrupted, including the same session object when a game was in progress.
 * Auth failure also offers a return to sign-in. Failures of `retry` stay here.
 */
export class ErrorReconnectScreenController {
  /**
   * @param connection - Ultron connection port.
   * @param presenter - Error copy.
   * @param navigator - Screen stack.
   * @param classifier - Provisional versus hard versus auth.
   */
  constructor(
    private readonly connection: IConnectionPort,
    private readonly presenter: ErrorReconnectPresenter,
    private readonly navigator: ScreenNavigator,
    private readonly classifier: ConnectionFailureClassifier,
  ) {}

  /**
   * Read the port and open or leave the error screen.
   * Opening the error screen does not clear the game session.
   */
  sync(): void {
    const state = this.connection.getState()
    const error = this.connection.getLastError()
    const kind = this.classifier.classify(state, error)
    this.presenter.apply(state, error, kind)
    if (kind === 'clear') {
      if (this.navigator.screen.equals(ScreenId.error())) this.navigator.restoreAfterError()
      return
    }
    if (!this.navigator.screen.equals(ScreenId.error())) this.navigator.showError()
  }

  /**
   * Call `retry`, then read the port again.
   * A rejection leaves the player on the error screen with whatever state the
   * port kept. This method does not throw.
   */
  async retry(): Promise<void> {
    try {
      await this.connection.retry()
    } catch {
      // The port remains the source of truth after a failed retry.
    }
    this.sync()
  }

  /** Leave the error screen for sign-in. Used when the failure is auth. */
  returnToSignIn(): void {
    this.navigator.showSignIn()
  }
}
