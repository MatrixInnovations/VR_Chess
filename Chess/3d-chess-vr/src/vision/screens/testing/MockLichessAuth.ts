import type { AuthSession, ILichessAuth } from '../ports/ultronPorts'

/** How the next `completeLogin` should fail. `none` stores a session. */
export type MockAuthFailure = 'none' | 'denied' | 'cancelled' | 'failed'

/**
 * In-memory {@link ILichessAuth}.
 * Returns an authorization URL and never fetches it. The access token is
 * returned from `completeLogin` so the port shape stays exact, and screens
 * are expected to ignore it.
 */
export class MockLichessAuth implements ILichessAuth {
  /** When true, `beginLogin` rejects. */
  failBegin = false
  /** Failure mode for the next `completeLogin`. */
  failComplete: MockAuthFailure = 'none'
  /** When true, `logout` rejects and the session is kept. */
  failLogout = false
  /** When true, `completeLogin` succeeds at the port but `getSession` stays empty. */
  dropSession = false
  /** Last callback URL passed to `completeLogin`. */
  lastCallbackUrl: string | null = null
  private session: AuthSession | null = null

  /**
   * Plant a session without going through PKCE.
   * @param session - Session `getSession` should return.
   */
  seedSession(session: AuthSession): void {
    this.session = session
  }

  /** @inheritdoc */
  async beginLogin(): Promise<{ authorizationUrl: string; state: string }> {
    if (this.failBegin) throw new Error('oauth endpoint unreachable')
    return {
      authorizationUrl: 'https://lichess.org/oauth?mock=1',
      state: 'mock-state',
    }
  }

  /** @inheritdoc */
  async completeLogin(callbackUrl: string): Promise<{ accessToken: string; username: string }> {
    this.lastCallbackUrl = callbackUrl
    if (this.failComplete === 'denied') {
      throw Object.assign(new Error('access denied'), { code: 'denied' })
    }
    if (this.failComplete === 'cancelled') {
      throw Object.assign(new Error('user cancelled'), { code: 'cancelled' })
    }
    if (this.failComplete === 'failed') throw new Error('socket reset')
    if (!this.dropSession) {
      this.session = { username: 'vision-tester', expiresAt: null }
    }
    return { accessToken: 'mock-access-token', username: 'token-user' }
  }

  /** @inheritdoc */
  async logout(): Promise<void> {
    if (this.failLogout) throw new Error('logout failed')
    this.session = null
  }

  /** @inheritdoc */
  getSession(): AuthSession | null {
    return this.session
  }
}
