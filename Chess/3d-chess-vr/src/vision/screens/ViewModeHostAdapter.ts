import type { IReadOnlyGameSession } from './ports/IReadOnlyGameSession'
import type { IInGameViewHost } from './ports/IInGameViewHost'

/**
 * Duck-typed surface of Vision PR #1 `ViewModeManager`.
 * `switchTo` accepts a string there, so a mode name is enough here.
 */
export interface IViewModeManagerLike {
  /** Session object that must survive `switchTo`. */
  readonly session: IReadOnlyGameSession
  /**
   * Replace only the presentation mode.
   * @param next - Mode name. `desktop3d` and `immersive` are the legal pair.
   */
  switchTo(next: string): void
}

/**
 * Raised when an in-game view switch replaces the session object.
 * The board and the navigator must keep one game, not a copy of it.
 */
export class SessionIdentityError extends Error {
  constructor() {
    super('In-game view switch replaced the game session')
    this.name = 'SessionIdentityError'
  }
}

/**
 * Adapts PR #1 `ViewModeManager` once this branch is rebased onto it.
 *
 * There is no foundation branch on `main`, and PR #1 is a separate PR, so this
 * lane does not import `ViewModeManager`. Pass the manager here after rebase.
 * The adapter refuses a switch that swaps the session object.
 */
export class ViewModeHostAdapter implements IInGameViewHost {
  /**
   * @param manager - View-mode owner. Only `session` and `switchTo` are used.
   */
  constructor(private readonly manager: IViewModeManagerLike) {}

  /** Session the manager was constructed with. */
  get session(): IReadOnlyGameSession {
    return this.manager.session
  }

  /**
   * Forward a presentation change and demand the same session object back.
   * @param next - Desktop 3D or immersive.
   * @throws {SessionIdentityError} When the manager replaces `session`.
   */
  switchTo(next: 'desktop3d' | 'immersive'): void {
    const before = this.manager.session
    this.manager.switchTo(next)
    if (this.manager.session !== before) throw new SessionIdentityError()
  }
}
