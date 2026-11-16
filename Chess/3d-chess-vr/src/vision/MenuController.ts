import type { IGameSessionViewPort } from './ports/IGameSessionViewPort'

/**
 * Which menu screen is on top. `null` on {@link MenuController.screen} means closed.
 */
export type MenuScreen = 'main' | 'pause' | 'settings'

/**
 * Main, pause, and settings menus for a human player.
 *
 * Pause and settings change which screen is visible. They do not pause the
 * clock, apply a move, undo a move, or replace the Ultron session. The
 * controller retains the session only so chrome can read
 * {@link IGameSessionViewPort.id}.
 */
export class MenuController {
  private current: MenuScreen | null = null

  /**
   * @param boundSession - Session whose id may be shown. Never written.
   */
  constructor(private readonly boundSession: IGameSessionViewPort) {}

  /**
   * The same session instance passed to the constructor.
   * Exposed for identity checks. This controller does not call mutating methods on it.
   */
  get session(): IGameSessionViewPort {
    return this.boundSession
  }

  /** Session id for menu chrome. */
  get sessionId(): string {
    return this.boundSession.id
  }

  /** Active screen, or `null` when every menu is closed. */
  get screen(): MenuScreen | null {
    return this.current
  }

  /** Whether any menu screen is open. */
  get isOpen(): boolean {
    return this.current !== null
  }

  /** Open the main menu, replacing any other open screen. */
  openMain(): void {
    this.current = 'main'
  }

  /**
   * Open the pause menu, replacing any other open screen.
   * Does not alter session moves.
   */
  openPause(): void {
    this.current = 'pause'
  }

  /** Open settings, replacing any other open screen. */
  openSettings(): void {
    this.current = 'settings'
  }

  /** Close whichever menu is open. */
  close(): void {
    this.current = null
  }
}
