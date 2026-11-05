import type { ILichessAuth } from '../ports/ultronPorts'
import { ScreenNavigator } from '../ScreenNavigator'
import { AuthFailureClassifier } from './AuthFailureClassifier'
import { LichessAuthPresenter } from './LichessAuthPresenter'

/**
 * OAuth PKCE sign-in.
 *
 * Calls `beginLogin`, `completeLogin`, `logout`, and `getSession` on
 * {@link ILichessAuth}. The token returned by `completeLogin` is discarded
 * here; the view reads the session username only. Deny and cancel do not throw.
 */
export class SignInScreenController {
  private readonly failures = new AuthFailureClassifier()

  /**
   * @param auth - Ultron auth port.
   * @param presenter - Sign-in view model.
   * @param navigator - Screen stack. Success opens the lobby.
   */
  constructor(
    private readonly auth: ILichessAuth,
    private readonly presenter: LichessAuthPresenter,
    private readonly navigator: ScreenNavigator,
  ) {}

  /**
   * Read `getSession` without starting OAuth.
   * A session that disappeared after we had shown it returns the screen to signed-out.
   */
  sync(): void {
    const session = this.auth.getSession()
    if (session) {
      this.presenter.showSignedIn(session)
      return
    }
    if (this.presenter.snapshot().phase === 'signed-in') this.presenter.showSignedOut()
  }

  /**
   * Start PKCE. Stores the authorization URL and does not fetch it.
   * A rejection is a soft failure.
   */
  async begin(): Promise<void> {
    try {
      const started = await this.auth.beginLogin()
      this.presenter.showRedirect(started.authorizationUrl)
    } catch (error) {
      const failure = this.failures.classify(error)
      this.presenter.showDenied(failure.message)
    }
  }

  /**
   * Finish PKCE from the redirect URL.
   * On success, navigates to the lobby. On deny, cancel, or a missing session,
   * stays on sign-in and does not throw.
   * @param callbackUrl - Full redirect URL.
   */
  async complete(callbackUrl: string): Promise<void> {
    try {
      await this.auth.completeLogin(callbackUrl)
    } catch (error) {
      const failure = this.failures.classify(error)
      this.presenter.showDenied(failure.message)
      this.navigator.showSignIn()
      return
    }
    const session = this.auth.getSession()
    if (!session) {
      this.presenter.showDenied('Sign-in finished without a session')
      this.navigator.showSignIn()
      return
    }
    this.presenter.showSignedIn(session)
    this.navigator.showLobby()
  }

  /**
   * Enter the lobby with the session already on the port.
   * Does nothing harmful when signed out: the message stays on sign-in.
   */
  continueWithSession(): void {
    const session = this.auth.getSession()
    if (!session) {
      this.presenter.showDenied('Not signed in')
      return
    }
    this.presenter.showSignedIn(session)
    this.navigator.showLobby()
  }

  /**
   * Sign out through the port.
   * A logout rejection keeps the session and does not throw.
   */
  async signOut(): Promise<void> {
    try {
      await this.auth.logout()
    } catch {
      this.presenter.showDenied('Sign-out could not be completed')
      return
    }
    this.presenter.showSignedOut()
    this.navigator.showSignIn()
  }
}
