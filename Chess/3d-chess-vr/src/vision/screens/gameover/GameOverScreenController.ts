import { ScreenNavigator } from '../ScreenNavigator'
import { GameOverPresenter } from './GameOverPresenter'
import { GameResult } from './GameResult'

/**
 * Game-over actions: show the result, rematch, or return to the lobby.
 *
 * Rematch of an online game calls the lobby port again with the same human
 * seek params. Rematch of the offline demo starts another local demo.
 * Neither path asks for a move.
 */
export class GameOverScreenController {
  /**
   * @param presenter - Result view model.
   * @param navigator - Screen stack. Game-over keeps the current session.
   * @param rematchOnline - Seeks again with the previous params.
   * @param rematchOffline - Starts another offline demo.
   * @param wasOffline - `true` when the finished game never called Lichess.
   */
  constructor(
    private readonly presenter: GameOverPresenter,
    private readonly navigator: ScreenNavigator,
    private readonly rematchOnline: () => Promise<void>,
    private readonly rematchOffline: () => void,
    private readonly wasOffline: () => boolean,
  ) {}

  /**
   * Show `result` on the game-over screen.
   * @param result - Terminal result. The controller does not inspect the position.
   * @throws {MissingGameSessionError} When the navigator has no session.
   */
  show(result: GameResult): void {
    this.presenter.show(result)
    this.navigator.showGameOver()
  }

  /**
   * Rematch. Offline games stay offline. Online games seek again.
   */
  async rematch(): Promise<void> {
    if (this.wasOffline()) {
      this.rematchOffline()
      return
    }
    await this.rematchOnline()
  }

  /** Leave the result and open the lobby. The session is cleared by the navigator. */
  backToLobby(): void {
    this.navigator.showLobby()
  }
}
