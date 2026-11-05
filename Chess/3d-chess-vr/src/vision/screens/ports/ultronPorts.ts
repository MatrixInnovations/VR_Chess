/**
 * Ultron-owned Lichess auth, lobby, and connection ports.
 *
 * These are the Nov 5, 2026 shared-contract names and fields. Vision screens
 * bind to them and do not add methods or rename fields. Ultron ships the real
 * clients; until that lands, tests use in-memory stand-ins that never open a
 * socket. Nothing here submits a move or asks an engine for a move.
 */

/** Signed-in Lichess player. The access token stays inside Ultron's client. */
export interface AuthSession {
  /** Lichess username shown on the sign-in screen. */
  readonly username: string
  /** Epoch milliseconds when the session expires, or `null` when unknown. */
  readonly expiresAt: number | null
}

/**
 * PKCE OAuth against Lichess.
 * The screen shows `authorizationUrl` and does not fetch it.
 */
export interface ILichessAuth {
  /**
   * Start PKCE login.
   * @returns Authorization URL and OAuth `state`. Vision must not request the URL.
   */
  beginLogin(): Promise<{ authorizationUrl: string; state: string }>

  /**
   * Finish PKCE from the redirect the player came back with.
   * @param callbackUrl - Full redirect URL, including `code` and `state`.
   * @returns Token and username. Screens read {@link ILichessAuth.getSession}, not the token.
   */
  completeLogin(callbackUrl: string): Promise<{ accessToken: string; username: string }>

  /** End the Lichess session. */
  logout(): Promise<void>

  /** Current session, or `null` when nobody is signed in. */
  getSession(): AuthSession | null
}

/**
 * Human seek options.
 * `timeControl` is an opaque label (for example `5+0`). Fridae owns clock math.
 */
export type SeekParams = {
  rated: boolean
  timeControl: string
  color?: 'white' | 'black' | 'random'
}

/** Same fields as {@link SeekParams}. Ultron's draft names the challenge form separately. */
export type ChallengeParams = SeekParams

/**
 * A paired human game.
 * Vision uses this as read-only identity plus the seat color. It does not submit moves.
 */
export interface GameHandle {
  readonly gameId: string
  readonly color: 'white' | 'black'
}

/**
 * Lobby actions for human games.
 * Offline demo is not a method here: it never calls Lichess.
 */
export interface ILichessLobby {
  /**
   * Seek a random opponent.
   * Resolves when a game exists. The handle has no seek id; cancel uses
   * {@link ILichessLobby.cancelSeek} with an id published beside this port.
   */
  seek(params: SeekParams): Promise<GameHandle>

  /**
   * Challenge one account.
   * @param user - Lichess username.
   * @param params - Rated flag, time control, and optional color.
   */
  challenge(user: string, params: ChallengeParams): Promise<GameHandle>

  /**
   * Accept an inbound challenge.
   * @param challengeId - Id the player already has. This port has no inbox method.
   */
  acceptChallenge(challengeId: string): Promise<GameHandle>

  /**
   * Cancel an outgoing seek.
   * @param seekId - Id known to Ultron. Callers skip this when they have no id.
   */
  cancelSeek(seekId: string): Promise<void>
}

/** Connection the error screen reads. Provisional states are not a lost game. */
export type ConnectionState =
  | 'idle'
  | 'connecting'
  | 'online'
  | 'reconnecting'
  | 'offline'
  | 'error'

/**
 * Stream and auth health.
 * There is no listener; the screen re-reads {@link IConnectionPort.getState}.
 * `retry` is the only recovery call.
 */
export interface IConnectionPort {
  /** Latest connection state. */
  getState(): ConnectionState

  /** Last failure, or `null` when the port has nothing to report. */
  getLastError(): { code: string; message: string } | null

  /** Ask Ultron to reconnect the stream or refresh auth. */
  retry(): Promise<void>
}
