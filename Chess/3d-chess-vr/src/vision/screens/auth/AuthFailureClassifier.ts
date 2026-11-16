/** How a rejected PKCE attempt is shown. All three stay on the sign-in screen. */
export type AuthFailureKind = 'cancelled' | 'denied' | 'failed'

/** Player-facing sign-in failure. No token and no stack trace. */
export interface IAuthFailure {
  readonly kind: AuthFailureKind
  readonly message: string
}

/**
 * Maps a rejected `beginLogin` or `completeLogin` to soft-fail copy.
 * Cancel and deny are not thrown to the shell. The player can try again.
 */
export class AuthFailureClassifier {
  /**
   * @param error - Rejection from {@link ILichessAuth}. Any value is accepted.
   * @returns Kind and a short message. Never includes an access token.
   */
  classify(error: unknown): IAuthFailure {
    const code = this.readCode(error)
    const raw = error instanceof Error ? error.message : ''
    if (code === 'cancelled' || /cancel/i.test(raw)) {
      return { kind: 'cancelled', message: 'Sign-in cancelled' }
    }
    if (code === 'denied' || code === 'access_denied' || /denied/i.test(raw)) {
      return { kind: 'denied', message: 'Sign-in was denied' }
    }
    return { kind: 'failed', message: 'Sign-in could not be completed' }
  }

  private readCode(error: unknown): string {
    if (typeof error !== 'object' || error === null || !('code' in error)) return ''
    const code = (error as { code: unknown }).code
    return typeof code === 'string' ? code : ''
  }
}
