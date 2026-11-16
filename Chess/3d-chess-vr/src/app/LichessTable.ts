import type { IHttpTransport } from '../ultron/contracts/http'
import type { IKeyValueStore } from '../ultron/contracts/ports'
import type { GameHandle, IConnectionPort, ILichessAuth, ILichessLobby, SeekParams } from '../vision/screens/ports/ultronPorts'
import type { ConnectionState } from '../vision/screens/ports/ultronPorts'
import { LobbyWaitLog } from '../vision/screens/lobby/LobbyWaitLog'
import { OAuthPkceClient } from '../ultron/auth/OAuthPkceClient'
import { WebCryptoRandom } from '../ultron/auth/WebCryptoRandom'
import { WebCryptoSha256 } from '../ultron/auth/WebCryptoSha256'
import { LichessClient } from '../ultron/lichess/LichessClient'
import { TimerSleeper } from '../ultron/lichess/TimerSleeper'
import type { GameSession } from '../ultron/session/GameSession'
import type { ITakebackEtiquette } from '../ultron/session/GameSession'
import { TimeControlLabel } from './TimeControlLabel'

const SCOPES = ['board:play', 'challenge:read', 'challenge:write'] as const
const USERNAME_KEY = 'ultron.lichess.username'

/**
 * What the table asks the hall to do when a lobby button is pressed.
 * The hall owns the {@link GameSession}. This class does not construct one.
 */
export interface LichessTableHooks {
  /** Build an online session bound to the current token. */
  openOnline(): GameSession
  /** Abort the open seek. Does not post a move. */
  cancelSeek(): void
  /** Called from the error screen. */
  retry(): Promise<void>
}

/**
 * Lichess sign-in, lobby, draw, and takeback for the hall.
 *
 * The access token stays inside {@link OAuthPkceClient}. Screens read
 * {@link LichessTable.getSession}, which has a username and no token.
 * Nothing here is written to a log.
 */
export class LichessTable implements ILichessAuth, ILichessLobby, IConnectionPort, ITakebackEtiquette {
  /** Seek ids the waiting screen reads. */
  readonly waits = new LobbyWaitLog()
  /** Board API client. Moves are posted once. */
  readonly client: LichessClient

  private oauth: OAuthPkceClient | null = null
  private username: string | null = null
  private state: ConnectionState = 'idle'
  private error: { code: string; message: string } | null = null

  /**
   * @param hooks - Session factory owned by the hall.
   * @param transport - HTTP. Tests pass a scripted transport.
   * @param store - PKCE verifier and token. Use session storage in the browser.
   * @param clientId - Public Lichess OAuth client id. Empty until the owner sets it.
   * @param redirectUri - Redirect URI registered on Lichess.
   */
  constructor(
    private readonly hooks: LichessTableHooks,
    private readonly transport: IHttpTransport,
    private readonly store: IKeyValueStore,
    private readonly clientId: string,
    private readonly redirectUri: string,
  ) {
    this.client = new LichessClient({ transport, sleeper: new TimerSleeper() })
    if (this.clientId.trim()) {
      this.oauth = this.buildOauth()
      const saved = this.store.get(USERNAME_KEY)
      if (saved && this.oauth.getAccessToken()) {
        this.username = saved
        this.state = 'online'
      }
    }
  }

  /**
   * Start PKCE.
   * @returns The authorize URL and the state to expect on the way back.
   */
  async beginLogin(): Promise<{ authorizationUrl: string; state: string }> {
    const oauth = this.ensureOauth()
    const started = await oauth.beginAuthorization()
    return { authorizationUrl: started.url, state: started.state }
  }

  /**
   * Finish PKCE and read the account username.
   * The token is stored by the OAuth client and is not returned to the screen for display.
   * @param callbackUrl - Full redirect URL.
   */
  async completeLogin(callbackUrl: string): Promise<{ username: string }> {
    const oauth = this.ensureOauth()
    const exchanged = await oauth.completeAuthorization(callbackUrl)
    if (!exchanged.ok) throw new Error(exchanged.message)
    const accessToken = oauth.getAccessToken()
    if (!accessToken) throw new Error('Sign-in finished without a token')
    const account = await this.client.getAccount(accessToken, new AbortController().signal)
    if (!account.ok) throw new Error(account.result.message)
    this.username = account.username
    this.store.set(USERNAME_KEY, account.username)
    this.state = 'online'
    this.error = null
    return { username: account.username }
  }

  /**
   * Revoke the token when Lichess accepts it, and always drop the local copy.
   * An expired or already-revoked token must not trap the player as signed in.
   */
  async logout(): Promise<void> {
    if (!this.oauth) return
    try {
      const revoked = await this.oauth.revoke()
      if (!revoked.ok) this.error = { code: 'revoke', message: revoked.message }
    } finally {
      this.oauth.forget()
      this.store.delete(USERNAME_KEY)
      this.username = null
      this.state = 'idle'
    }
  }

  /** Username for the sign-in screen, or null when signed out. The token is not included. */
  getSession(): { username: string; expiresAt: number | null } | null {
    if (!this.username || !this.oauth?.getAccessToken()) return null
    return { username: this.username, expiresAt: null }
  }

  /**
   * Seek a random opponent. Resolves when a game id and color are known.
   * @param params - Form values. Blitz seeks are rejected locally.
   */
  async seek(params: SeekParams): Promise<GameHandle> {
    const built = TimeControlLabel.seek(params.timeControl, params.rated, params.color ?? 'random')
    if (!built.ok) throw new Error(built.message)
    const session = this.hooks.openOnline()
    this.waits.noteSeek('board-seek')
    this.state = 'connecting'
    try {
      const result = await session.seek(built.request)
      if (!result.ok) throw new Error(result.reason)
      if (result.kind === 'cancelled') throw new Error('Seek cancelled')
      this.state = 'online'
      return await this.waitFor(session)
    } finally {
      this.waits.clearSeek()
    }
  }

  /**
   * Challenge one account.
   * @param user - Lichess username.
   * @param params - Clock and color. Blitz is allowed here.
   */
  async challenge(user: string, params: SeekParams): Promise<GameHandle> {
    const built = TimeControlLabel.challenge(params.timeControl, params.rated, params.color ?? 'random')
    if (!built.ok) throw new Error(built.message)
    const session = this.hooks.openOnline()
    this.waits.noteChallenge(user)
    this.state = 'connecting'
    const result = await session.challenge(user, built.request)
    if (!result.ok) throw new Error(result.reason)
    this.state = 'online'
    return await this.waitFor(session)
  }

  /**
   * Accept a challenge by id.
   * @param challengeId - Id the player pasted or received.
   */
  async acceptChallenge(challengeId: string): Promise<GameHandle> {
    const session = this.hooks.openOnline()
    this.state = 'connecting'
    const result = await session.acceptChallenge(challengeId)
    if (!result.ok) throw new Error(result.reason)
    this.state = 'online'
    return await this.waitFor(session)
  }

  /**
   * Abort the open seek.
   * @param _seekId - Ignored. Ultron cancels by closing the seek connection.
   */
  async cancelSeek(_seekId: string): Promise<void> {
    this.waits.clearSeek()
    this.hooks.cancelSeek()
  }

  /**
   * Offer a draw, or accept the opponent's offer. Same Lichess endpoint.
   * @param gameId - Current game.
   */
  async offerOrAcceptDraw(gameId: string): Promise<void> {
    await this.postDraw(gameId, true)
  }

  /**
   * Decline a draw offer.
   * @param gameId - Current game.
   */
  async declineDraw(gameId: string): Promise<void> {
    await this.postDraw(gameId, false)
  }

  /**
   * Decline a takeback once. The board is not rewound.
   * @param gameId - Current game.
   */
  declineTakeback(gameId: string): void {
    const token = this.oauth?.getAccessToken()
    if (!token) return
    void this.client.declineTakeback(token, gameId, new AbortController().signal)
  }

  /** Latest connection state for the error screen. */
  getState(): ConnectionState {
    return this.state
  }

  /** Last stream or auth failure, or null. */
  getLastError(): { code: string; message: string } | null {
    return this.error
  }

  /**
   * Record a stream fault for the error screen.
   * @param code - Fault code from the session.
   * @param message - Human detail. Must already be free of tokens.
   */
  noteFault(code: string, message: string): void {
    this.state = code === 'unauthorized' ? 'error' : 'reconnecting'
    this.error = { code, message }
  }

  /** Mark the stream healthy. */
  noteOnline(): void {
    this.state = 'online'
    this.error = null
  }

  /** Ask the hall to reopen the stream. */
  async retry(): Promise<void> {
    this.state = 'connecting'
    await this.hooks.retry()
  }

  /** Token source for a new {@link LichessPlayer}. Null until login has been attempted. */
  tokenSource(): OAuthPkceClient | null {
    return this.oauth
  }

  private async postDraw(gameId: string, accept: boolean): Promise<void> {
    const token = this.oauth?.getAccessToken()
    if (!token) throw new Error('Not signed in')
    const signal = new AbortController().signal
    const result = accept
      ? await this.client.offerOrAcceptDraw(token, gameId, signal)
      : await this.client.declineDraw(token, gameId, signal)
    if (!result.ok) throw new Error(result.message)
  }

  private ensureOauth(): OAuthPkceClient {
    if (!this.clientId.trim()) {
      throw new Error('Set NEXT_PUBLIC_LICHESS_CLIENT_ID to your Lichess OAuth client id. No token belongs in the repo.')
    }
    if (!this.oauth) this.oauth = this.buildOauth()
    return this.oauth
  }

  private buildOauth(): OAuthPkceClient {
    return new OAuthPkceClient({
      clientId: this.clientId,
      redirectUri: this.redirectUri,
      scopes: SCOPES,
      store: this.store,
      random: new WebCryptoRandom(),
      digest: new WebCryptoSha256(),
      transport: this.transport,
    })
  }

  private async waitFor(session: GameSession): Promise<GameHandle> {
    const immediate = LichessTable.readHandle(session)
    if (immediate) return immediate
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        stop()
        reject(new Error('Timed out waiting for Lichess to start the game'))
      }, 120_000)
      const stop = session.subscribe(() => {
        const handle = LichessTable.readHandle(session)
        if (!handle) return
        clearTimeout(timer)
        stop()
        resolve(handle)
      })
    })
  }

  private static readHandle(session: GameSession): GameHandle | null {
    const snap = session.snapshot
    if (!snap.gameId) return null
    if (snap.ourColor !== 'white' && snap.ourColor !== 'black') return null
    return { gameId: snap.gameId, color: snap.ourColor }
  }
}
