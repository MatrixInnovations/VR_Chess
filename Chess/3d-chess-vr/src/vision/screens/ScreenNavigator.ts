import type { IInGameViewHost } from './ports/IInGameViewHost'
import type { IReadOnlyGameSession } from './ports/IReadOnlyGameSession'
import { ScreenId } from './ScreenId'
import { SessionIdentityError } from './ViewModeHostAdapter'

/** Presentation the board shell can request. Mirrors PR #1 view mode names. */
export type PresentationMode = 'desktop3d' | 'immersive'

/**
 * Raised when game-over is opened with no session to attach the result to.
 */
export class MissingGameSessionError extends Error {
  constructor() {
    super('Game over requires a game session')
    this.name = 'MissingGameSessionError'
  }
}

/**
 * Screen stack for the shell around the board.
 *
 * The navigator owns which screen is visible and the session object for the
 * current game. Switching desktop 3D and immersive updates presentation only.
 * An error screen remembers where to return and does not drop the session:
 * a stream reconnect is not a new game.
 */
export class ScreenNavigator {
  private currentScreen: ScreenId = ScreenId.signIn()
  private boundSession: IReadOnlyGameSession | null = null
  private resume: ScreenId | null = null
  private waitCancelled = false
  private host: IInGameViewHost | null = null
  private presentation: PresentationMode = 'desktop3d'
  private readonly listeners = new Set<() => void>()

  /**
   * Subscribe to screen, session, or presentation changes.
   * @param listener - Called after each change.
   * @returns Unsubscribe.
   */
  subscribe(listener: () => void): () => void {
    this.listeners.add(listener)
    return () => {
      this.listeners.delete(listener)
    }
  }

  /** Screen currently visible. */
  get screen(): ScreenId {
    return this.currentScreen
  }

  /**
   * Session object for the game on the board or the game-over screen.
   * `null` on sign-in, the lobby, and while a seek is still waiting.
   */
  get session(): IReadOnlyGameSession | null {
    return this.boundSession
  }

  /** Desktop 3D or immersive. Independent of which screen is visible. */
  get presentationMode(): PresentationMode {
    return this.presentation
  }

  /** Host bound for in-game view switches, or `null` when PR #1 is not wired. */
  get viewHost(): IInGameViewHost | null {
    return this.host
  }

  /**
   * Remember a view host. Does not change the screen or copy its session.
   * @param host - Adapter around `ViewModeManager`, or a test double.
   */
  bindViewHost(host: IInGameViewHost): void {
    this.host = host
  }

  /** Show sign-in and drop any game session. */
  showSignIn(): void {
    this.boundSession = null
    this.currentScreen = ScreenId.signIn()
    this.emit()
  }

  /** Show the lobby and drop any game session. */
  showLobby(): void {
    this.boundSession = null
    this.currentScreen = ScreenId.lobby()
    this.emit()
  }

  /**
   * Open the waiting screen for a new seek or challenge.
   * Clears the cancel flag and the previous session so a late handle cannot
   * be mistaken for the game the player just left.
   */
  beginWait(): void {
    this.waitCancelled = false
    this.boundSession = null
    this.currentScreen = ScreenId.waiting()
    this.emit()
  }

  /**
   * Mark the in-flight seek or challenge as abandoned.
   * A handle that resolves afterwards must not open the board.
   */
  cancelWait(): void {
    this.waitCancelled = true
  }

  /** Whether {@link ScreenNavigator.cancelWait} won the race with pairing. */
  isWaitCancelled(): boolean {
    return this.waitCancelled
  }

  /**
   * Open the board on `session`.
   * Stores the object it is given. It does not clone it.
   * @param session - Read-only game identity.
   */
  showBoard(session: IReadOnlyGameSession): void {
    this.boundSession = session
    this.currentScreen = ScreenId.board()
    this.emit()
  }

  /**
   * Open game-over on the current session.
   * @throws {MissingGameSessionError} When no game is bound.
   */
  showGameOver(): void {
    if (!this.boundSession) throw new MissingGameSessionError()
    this.currentScreen = ScreenId.gameOver()
    this.emit()
  }

  /**
   * Open the error screen.
   * The previous screen is kept for {@link ScreenNavigator.restoreAfterError}.
   * A second call does not overwrite that return target with the error screen
   * itself. The session is left in place.
   */
  showError(): void {
    if (!this.currentScreen.equals(ScreenId.error())) {
      this.resume = this.currentScreen
    }
    this.currentScreen = ScreenId.error()
    this.emit()
  }

  /**
   * Leave the error screen for the screen that was visible before it.
   * Falls back to the lobby when the error screen was never entered.
   * Does not replace the session object.
   */
  restoreAfterError(): void {
    const next = this.resume ?? ScreenId.lobby()
    this.resume = null
    this.currentScreen = next
    this.emit()
  }

  /**
   * Switch in-game presentation without replacing the session.
   *
   * When a host is bound, its session must be the same object the navigator
   * holds. That is the PR #1 `ViewModeManager` rule, enforced here so a
   * rebase cannot silently copy the game.
   *
   * @param next - Desktop 3D or immersive.
   * @throws {SessionIdentityError} When the host session is a different object.
   */
  switchInGameView(next: PresentationMode): void {
    const before = this.boundSession
    if (this.host) {
      if (before !== null && this.host.session !== before) {
        throw new SessionIdentityError()
      }
      this.host.switchTo(next)
      if (before !== null && this.host.session !== before) {
        throw new SessionIdentityError()
      }
    }
    if (this.boundSession !== before) throw new SessionIdentityError()
    this.presentation = next
    this.emit()
  }

  private emit(): void {
    for (const listener of this.listeners) listener()
  }
}
