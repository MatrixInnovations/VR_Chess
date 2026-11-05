import type { IChessClockReadModel } from './ports/IChessClockReadModel'
import type { IGameSessionViewPort } from './ports/IGameSessionViewPort'
import { InvalidViewModeError, ViewMode } from './ViewMode'

/**
 * Owns the active {@link ViewMode} for one human game.
 *
 * Switching between desktop 3D and immersive replaces only the mode value.
 * The Ultron session and the Fridae clock read model stay the same objects:
 * their identity is preserved and the clock snapshot is not zeroed or copied.
 * There is no engine assist here; the manager does not choose moves.
 */
export class ViewModeManager {
  private current: ViewMode

  /**
   * @param boundSession - Session view held for the manager's lifetime.
   * @param boundClock - Clock read model held for the manager's lifetime.
   * @param initial - Starting mode. Defaults to desktop 3D.
   */
  constructor(
    private readonly boundSession: IGameSessionViewPort,
    private readonly boundClock: IChessClockReadModel,
    initial: ViewMode = ViewMode.desktop3d(),
  ) {
    this.current = initial
  }

  /** Active presentation mode. */
  get mode(): ViewMode {
    return this.current
  }

  /**
   * The session instance passed to the constructor.
   * A mode change does not replace it.
   */
  get session(): IGameSessionViewPort {
    return this.boundSession
  }

  /**
   * The clock read model passed to the constructor.
   * A mode change does not replace it or rewrite its fields.
   */
  get clock(): IChessClockReadModel {
    return this.boundClock
  }

  /**
   * Switch to `next`.
   *
   * Session and clock references are left untouched whether the switch
   * succeeds or is rejected.
   *
   * @param next - A {@link ViewMode} or a raw mode name.
   * @throws {InvalidViewModeError} When `next` is not desktop 3D or immersive.
   */
  switchTo(next: ViewMode | string): void {
    const resolved = typeof next === 'string' ? ViewMode.parse(next) : next
    if (!(resolved instanceof ViewMode)) {
      throw new InvalidViewModeError(String(next))
    }
    this.current = resolved
  }

  /**
   * Flip between desktop 3D and immersive.
   * Does not copy or reset session or clock state.
   */
  toggle(): void {
    this.current = this.current.opposite()
  }
}
