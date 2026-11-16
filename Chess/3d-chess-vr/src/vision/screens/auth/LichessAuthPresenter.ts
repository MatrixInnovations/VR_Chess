import type { AuthSession } from '../ports/ultronPorts'

/** Sign-in phases the view can draw. `denied` covers cancel, deny, and other soft failures. */
export type SignInPhase = 'signed-out' | 'redirecting' | 'signed-in' | 'denied'

/**
 * View model for the sign-in screen.
 * The access token is intentionally absent: Ultron keeps it inside `ILichessAuth`.
 */
export interface ISignInSnapshot {
  readonly phase: SignInPhase
  readonly username: string | null
  readonly expiresAt: number | null
  readonly authorizationUrl: string | null
  readonly callbackDraft: string
  readonly message: string | null
}

/**
 * Holds the sign-in view model.
 * The controller writes it; the React view only reads {@link LichessAuthPresenter.snapshot}.
 */
export class LichessAuthPresenter {
  private phase: SignInPhase = 'signed-out'
  private username: string | null = null
  private expiresAt: number | null = null
  private authorizationUrl: string | null = null
  private callbackDraft = ''
  private message: string | null = null

  /** Immutable view of the current sign-in state. */
  snapshot(): ISignInSnapshot {
    return {
      phase: this.phase,
      username: this.username,
      expiresAt: this.expiresAt,
      authorizationUrl: this.authorizationUrl,
      callbackDraft: this.callbackDraft,
      message: this.message,
    }
  }

  /**
   * Remember the redirect URL the player pasted, before `completeLogin`.
   * @param value - Full callback URL. May be empty.
   */
  setCallbackDraft(value: string): void {
    this.callbackDraft = value
  }

  /** Signed out, with no leftover URL or error. */
  showSignedOut(): void {
    this.phase = 'signed-out'
    this.username = null
    this.expiresAt = null
    this.authorizationUrl = null
    this.message = null
    this.callbackDraft = ''
  }

  /**
   * PKCE has started. The view may show the URL. It must not request it.
   * @param authorizationUrl - Value returned by `beginLogin`.
   */
  showRedirect(authorizationUrl: string): void {
    this.phase = 'redirecting'
    this.authorizationUrl = authorizationUrl
    this.message = null
  }

  /**
   * A session exists. Username comes from {@link AuthSession}, not from the token payload.
   * @param session - Port session.
   */
  showSignedIn(session: AuthSession): void {
    this.phase = 'signed-in'
    this.username = session.username
    this.expiresAt = session.expiresAt
    this.authorizationUrl = null
    this.message = null
  }

  /**
   * Soft failure. The screen stays on sign-in.
   * @param message - Copy from {@link AuthFailureClassifier} or a local check.
   */
  showDenied(message: string): void {
    this.phase = 'denied'
    this.message = message
    this.authorizationUrl = null
  }
}
