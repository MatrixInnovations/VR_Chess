import type { IReadOnlyGameSession } from './IReadOnlyGameSession'

/**
 * In-game presentation host.
 *
 * Vision PR #1 `ViewModeManager` is the intended implementation: `session`
 * stays the same object when the player flips desktop 3D and immersive.
 * This lane does not import that class. {@link ViewModeHostAdapter} is the
 * rebase point.
 */
export interface IInGameViewHost {
  /** Session the host was constructed with. A view switch must not replace it. */
  readonly session: IReadOnlyGameSession

  /**
   * Switch desktop 3D and immersive presentation.
   * @param next - Target presentation. Must leave {@link IInGameViewHost.session} in place.
   */
  switchTo(next: 'desktop3d' | 'immersive'): void
}
