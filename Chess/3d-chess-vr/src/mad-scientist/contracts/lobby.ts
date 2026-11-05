/**
 * Lobby and auth ports from the Ultron shared-contract draft.
 *
 * Ultron PR #5 does not export these yet. They live here so opponent presence
 * can take a {@link GameHandle} and an {@link AuthSession} without calling
 * Lichess. Delete this file when Ultron publishes the same shapes.
 */

/** Signed-in Lichess account. Tokens stay out of this object. */
export interface AuthSession {
  readonly username: string
  readonly expiresAt: number | null
}

/** A human game the lobby created or accepted. */
export interface GameHandle {
  readonly gameId: string
  readonly color: 'white' | 'black'
}

/** Seek parameters. Human games only. */
export type SeekParams = {
  rated: boolean
  timeControl: string
  color?: 'white' | 'black' | 'random'
}

/** Challenge parameters. Same fields as a seek. */
export type ChallengeParams = SeekParams

/**
 * PKCE login against Lichess.
 * Implementations used in CI must not perform a network request.
 */
export interface ILichessAuth {
  beginLogin(): Promise<{ authorizationUrl: string; state: string }>
  completeLogin(callbackUrl: string): Promise<{ accessToken: string; username: string }>
  logout(): Promise<void>
  getSession(): AuthSession | null
}

/**
 * Lobby actions. Human play only. No engine.
 * CI uses {@link MockLichessLobby}. Nothing in this lane calls lichess.org.
 */
export interface ILichessLobby {
  seek(params: SeekParams): Promise<GameHandle>
  challenge(user: string, params: ChallengeParams): Promise<GameHandle>
  acceptChallenge(challengeId: string): Promise<GameHandle>
  cancelSeek(seekId: string): Promise<void>
}
