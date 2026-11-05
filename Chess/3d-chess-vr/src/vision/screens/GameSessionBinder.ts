import type { IInGameViewHost } from './ports/IInGameViewHost'
import type { IReadOnlyGameSession } from './ports/IReadOnlyGameSession'
import { SessionIdentityError } from './ViewModeHostAdapter'

/**
 * Chooses the session object a paired game is mounted with.
 *
 * With no view host, the binder mints `{ id: gameId }`. With a host, it
 * returns that host's session when the ids match, so the navigator and
 * `ViewModeManager` share one object. A mismatched host is refused instead
 * of being overwritten with a copy.
 */
export class GameSessionBinder {
  /**
   * @param host - PR #1 view host, or `null` when this branch has not been rebased.
   */
  constructor(private readonly host: IInGameViewHost | null) {}

  /**
   * Session object for `gameId`.
   * @param gameId - `GameHandle.gameId` from the lobby port.
   * @returns The host session, or a new read-only identity.
   * @throws {SessionIdentityError} When a host is bound to a different id.
   */
  bind(gameId: string): IReadOnlyGameSession {
    if (!this.host) return { id: gameId }
    if (this.host.session.id !== gameId) throw new SessionIdentityError()
    return this.host.session
  }
}
