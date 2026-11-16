import type { BoardStreamFixture } from '../fixtures/BoardStreamFixtureLoader'
import { SignInScreenController } from '../auth/SignInScreenController'
import { LichessAuthPresenter } from '../auth/LichessAuthPresenter'
import { BoardShellModel } from '../board/BoardShellModel'
import { ErrorReconnectScreenController } from '../error/ErrorReconnectScreenController'
import { ConnectionFailureClassifier } from '../error/ConnectionFailureClassifier'
import { ErrorReconnectPresenter } from '../error/ErrorReconnectPresenter'
import { GameOverPresenter } from '../gameover/GameOverPresenter'
import { GameOverScreenController } from '../gameover/GameOverScreenController'
import { LobbyPresenter } from '../lobby/LobbyPresenter'
import { LobbyScreenController } from '../lobby/LobbyScreenController'
import { LobbyWaitLog } from '../lobby/LobbyWaitLog'
import type { IInGameViewHost } from '../ports/IInGameViewHost'
import type { IReadOnlyGameSession } from '../ports/IReadOnlyGameSession'
import type { ILichessAuth, ILichessLobby, IConnectionPort } from '../ports/ultronPorts'
import type { ISeekIdSource } from '../ports/ISeekIdSource'
import { ScreenNavigator } from '../ScreenNavigator'
import { SequentialIdFactory } from '../SequentialIdFactory'
import { GameSessionBinder } from '../GameSessionBinder'
import { ViewModeHostAdapter } from '../ViewModeHostAdapter'
import { WaitingPresenter, WaitingScreenController } from '../waiting/WaitingScreenController'

/**
 * Dependencies for {@link VisionShell}.
 * Tests pass the in-memory ports. The hall passes the Lichess adapters.
 */
export interface VisionShellOptions {
  readonly auth: ILichessAuth
  readonly lobby: ILichessLobby
  readonly connection: IConnectionPort
  readonly seekIds?: ISeekIdSource
  readonly ids?: SequentialIdFactory
  readonly fixture?: BoardStreamFixture
  readonly viewHost?: IInGameViewHost
  readonly bindSession?: (gameId: string) => IReadOnlyGameSession
  readonly onOnline?: (session: IReadOnlyGameSession, color: 'white' | 'black') => void
  readonly onOffline?: (session: IReadOnlyGameSession) => void
  readonly wasOffline?: () => boolean
}

/**
 * Wires the sign-in, lobby, waiting, board, game-over, and error controllers.
 *
 * The shell does not submit chess moves and does not open a socket of its own.
 * A view-mode host, when bound, is checked so immersive mode cannot swap the session.
 */
export class VisionShell {
  /** Screen stack. */
  readonly navigator = new ScreenNavigator()
  /** Sign-in view model. */
  readonly authPresenter = new LichessAuthPresenter()
  /** Lobby form. */
  readonly lobbyPresenter = new LobbyPresenter()
  /** Waiting copy. */
  readonly waitingPresenter = new WaitingPresenter()
  /** Game-over copy. */
  readonly gameOverPresenter = new GameOverPresenter()
  /** Error copy. */
  readonly errorPresenter = new ErrorReconnectPresenter()
  /** Board shell copy. */
  readonly board = new BoardShellModel()
  /** Seek ids the waiting screen cancels. */
  readonly waits: ISeekIdSource
  /** Sign-in actions. */
  readonly signIn: SignInScreenController
  /** Waiting actions. */
  readonly waiting: WaitingScreenController
  /** Lobby actions. */
  readonly lobby: LobbyScreenController
  /** Game-over actions. */
  readonly gameOver: GameOverScreenController
  /** Error actions. */
  readonly errors: ErrorReconnectScreenController

  private viewHost: IInGameViewHost | null

  /**
   * @param options - Ports and optional callbacks. Missing callbacks mount the board model only.
   */
  constructor(private readonly options: VisionShellOptions) {
    this.waits = options.seekIds ?? new LobbyWaitLog()
    const ids = options.ids ?? new SequentialIdFactory()
    this.viewHost = options.viewHost ?? null
    if (this.viewHost) this.navigator.bindViewHost(this.viewHost)
    this.signIn = new SignInScreenController(options.auth, this.authPresenter, this.navigator)
    this.waiting = new WaitingScreenController(options.lobby, this.navigator, this.waitingPresenter, this.waits)
    this.lobby = new LobbyScreenController(
      options.lobby,
      this.lobbyPresenter,
      this.navigator,
      this.waiting,
      ids,
      (gameId) => this.bind(gameId),
      (session, color) => this.online(session, color),
      (session) => this.offline(session),
    )
    this.gameOver = new GameOverScreenController(
      this.gameOverPresenter,
      this.navigator,
      () => this.lobby.rematchOnline(),
      () => this.lobby.startOfflineDemo(),
      () => (options.wasOffline ? options.wasOffline() : this.board.snapshot().offlineDemo),
    )
    this.errors = new ErrorReconnectScreenController(
      options.connection,
      this.errorPresenter,
      this.navigator,
      new ConnectionFailureClassifier(),
    )
  }

  /**
   * Replace the view host after a new game.
   * A desktop/immersive toggle uses the existing host and does not call this.
   * @param host - Adapter whose session is the object the navigator will hold.
   */
  bindViewHost(host: IInGameViewHost): void {
    this.viewHost = host
    this.navigator.bindViewHost(host)
  }

  private bind(gameId: string): IReadOnlyGameSession {
    if (this.options.bindSession) return this.options.bindSession(gameId)
    return new GameSessionBinder(this.viewHost).bind(gameId)
  }

  private online(session: IReadOnlyGameSession, color: 'white' | 'black'): void {
    if (this.options.onOnline) {
      this.options.onOnline(session, color)
      return
    }
    if (this.options.fixture) this.board.mountOnline(session, this.options.fixture, color)
  }

  private offline(session: IReadOnlyGameSession): void {
    if (this.options.onOffline) {
      this.options.onOffline(session)
      return
    }
    this.board.mountOffline(session)
  }
}

export { ViewModeHostAdapter }
