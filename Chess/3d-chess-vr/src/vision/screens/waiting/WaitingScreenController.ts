import type { ILichessLobby } from '../ports/ultronPorts'
import type { ISeekIdSource } from '../ports/ISeekIdSource'
import { ScreenNavigator } from '../ScreenNavigator'

/** What the player is waiting on. Accept uses the same screen as an outgoing challenge. */
export type WaitKind = 'seek' | 'challenge' | 'accept'

/** Waiting copy. Cancel is the only action. */
export interface IWaitingSnapshot {
  readonly kind: WaitKind
  readonly title: string
  readonly detail: string
}

/**
 * Copy for the waiting screen.
 */
export class WaitingPresenter {
  private kind: WaitKind = 'seek'
  private detail = ''

  /**
   * @param kind - Seek, outgoing challenge, or accept.
   * @param detail - Time control, username, or challenge id.
   */
  show(kind: WaitKind, detail: string): void {
    this.kind = kind
    this.detail = detail
  }

  /** Immutable waiting copy. */
  snapshot(): IWaitingSnapshot {
    return {
      kind: this.kind,
      title: this.titleFor(this.kind),
      detail: this.detail,
    }
  }

  private titleFor(kind: WaitKind): string {
    if (kind === 'seek') return 'Seeking a game'
    if (kind === 'challenge') return 'Challenge sent'
    return 'Joining a challenge'
  }
}

/**
 * Pending seek or challenge.
 *
 * Cancel of a seek calls {@link ILichessLobby.cancelSeek} when a seek id is
 * known, then returns to the lobby. The Ultron draft has no `cancelChallenge`,
 * so a challenge cancel only abandons the wait locally. A handle that arrives
 * later is ignored because the navigator's cancel flag is set first.
 */
export class WaitingScreenController {
  private kind: WaitKind = 'seek'

  /**
   * @param lobby - Ultron lobby port. Only `cancelSeek` is used.
   * @param navigator - Screen stack.
   * @param presenter - Waiting copy.
   * @param seekIds - Where the adapter published the seek id.
   */
  constructor(
    private readonly lobby: ILichessLobby,
    private readonly navigator: ScreenNavigator,
    private readonly presenter: WaitingPresenter,
    private readonly seekIds: ISeekIdSource,
  ) {}

  /**
   * Show this wait on the waiting screen's presenter.
   * The navigator is moved by the lobby controller, which owns `beginWait`.
   * @param kind - Seek, challenge, or accept.
   * @param detail - Short label for the view.
   */
  track(kind: WaitKind, detail: string): void {
    this.kind = kind
    this.presenter.show(kind, detail)
  }

  /**
   * Abandon the wait.
   * Seek id is read before the port call so a pairing race cannot clear it first
   * inside this method. The cancel flag is set before `cancelSeek` so the
   * lobby controller ignores the rejection and any late handle.
   */
  async cancel(): Promise<void> {
    const seekId = this.kind === 'seek' ? this.seekIds.currentSeekId() : null
    this.navigator.cancelWait()
    if (seekId) await this.lobby.cancelSeek(seekId)
    this.navigator.showLobby()
  }
}
