import type { GameHandle, ILichessLobby } from '../ports/ultronPorts'
import type { IReadOnlyGameSession } from '../ports/IReadOnlyGameSession'
import { ScreenNavigator } from '../ScreenNavigator'
import { SequentialIdFactory } from '../SequentialIdFactory'
import { SessionIdentityError } from '../ViewModeHostAdapter'
import { WaitingScreenController, type WaitKind } from '../waiting/WaitingScreenController'
import { LobbyPresenter } from './LobbyPresenter'

/**
 * Lobby actions: seek, challenge, accept, and the offline demo.
 *
 * Online actions go through {@link ILichessLobby} only. The offline demo mints
 * a local session and does not call the port. Rematch of an online game seeks
 * again with the same params. There is no engine and no move submission.
 */
export class LobbyScreenController {
  private lastOnlineParams: ReturnType<LobbyPresenter['toSeekParams']> | null = null

  /**
   * @param lobby - Ultron lobby port.
   * @param presenter - Lobby form.
   * @param navigator - Screen stack.
   * @param waiting - Waiting view updated before the port call.
   * @param ids - Ids for the offline demo only.
   * @param bindSession - Turns a game id into the session object the board will hold.
   * @param onOnline - Mounts the board shell for a paired game. Navigation follows.
   * @param onOffline - Mounts the board shell for the demo. Navigation follows.
   */
  constructor(
    private readonly lobby: ILichessLobby,
    private readonly presenter: LobbyPresenter,
    private readonly navigator: ScreenNavigator,
    private readonly waiting: WaitingScreenController,
    private readonly ids: SequentialIdFactory,
    private readonly bindSession: (gameId: string) => IReadOnlyGameSession,
    private readonly onOnline: (session: IReadOnlyGameSession, color: 'white' | 'black') => void,
    private readonly onOffline: (session: IReadOnlyGameSession) => void,
  ) {}

  /** Params captured for the last online request, or `null` before the first one. */
  get previousOnlineParams(): ReturnType<LobbyPresenter['toSeekParams']> | null {
    return this.lastOnlineParams
  }

  /** Seek with the current form. Opens waiting until the port resolves. */
  async seek(): Promise<void> {
    const params = this.presenter.toSeekParams()
    this.lastOnlineParams = params
    await this.openOnline('seek', params.timeControl, () => this.lobby.seek(params))
  }

  /**
   * Challenge the username on the form.
   * An empty name is a soft failure and does not call the port.
   */
  async challenge(): Promise<void> {
    const user = this.presenter.snapshot().opponent.trim()
    if (!user) {
      this.presenter.setMessage('Enter a username to challenge')
      return
    }
    const params = this.presenter.toSeekParams()
    this.lastOnlineParams = params
    await this.openOnline('challenge', user, () => this.lobby.challenge(user, params))
  }

  /**
   * Accept the inbound challenge id on the form.
   * An empty id is a soft failure and does not call the port.
   */
  async acceptIncoming(): Promise<void> {
    const challengeId = this.presenter.snapshot().incomingChallengeId.trim()
    if (!challengeId) {
      this.presenter.setMessage('Enter a challenge id')
      return
    }
    const params = this.presenter.toSeekParams()
    this.lastOnlineParams = params
    await this.openOnline('accept', challengeId, () => this.lobby.acceptChallenge(challengeId))
  }

  /**
   * Seek again with the params from the game that just finished.
   * With no previous online game, returns to the lobby and does not call the port.
   */
  async rematchOnline(): Promise<void> {
    if (!this.lastOnlineParams) {
      this.presenter.setMessage('No previous game to rematch')
      this.navigator.showLobby()
      return
    }
    this.presenter.applyParams(this.lastOnlineParams)
    await this.seek()
  }

  /**
   * Enter the offline demo board.
   * Does not call seek, challenge, accept, or cancel.
   */
  startOfflineDemo(): void {
    const session: IReadOnlyGameSession = { id: this.ids.next('offline-demo') }
    this.onOffline(session)
    this.navigator.showBoard(session)
  }

  private async openOnline(
    kind: WaitKind,
    detail: string,
    run: () => Promise<GameHandle>,
  ): Promise<void> {
    this.presenter.setMessage(null)
    this.waiting.track(kind, detail)
    this.navigator.beginWait()
    try {
      const handle = await run()
      if (this.navigator.isWaitCancelled()) return
      const session = this.bindSession(handle.gameId)
      this.onOnline(session, handle.color)
      this.navigator.showBoard(session)
    } catch (error) {
      if (this.navigator.isWaitCancelled()) return
      // A host bound to a different game is a wiring bug, not a failed seek.
      if (error instanceof SessionIdentityError) throw error
      this.presenter.setMessage(this.failureMessage(kind))
      this.navigator.showLobby()
    }
  }

  private failureMessage(kind: WaitKind): string {
    if (kind === 'seek') return 'Could not start a seek'
    if (kind === 'challenge') return 'Could not send the challenge'
    return 'Could not accept the challenge'
  }
}
