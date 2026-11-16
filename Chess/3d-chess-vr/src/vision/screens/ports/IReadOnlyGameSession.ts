/**
 * Read-only game identity.
 *
 * Same member as Vision PR #1 `IGameSessionViewPort`: an id and nothing else.
 * That class is not on `main` (no foundation branch), so this lane declares the
 * shape here. After rebase, a `ViewModeManager` session satisfies it.
 * There is deliberately no `submitMoveIntent`.
 */
export interface IReadOnlyGameSession {
  /**
   * Opaque session id.
   * Callers also compare object identity so a view switch cannot swap the game.
   */
  readonly id: string
}
