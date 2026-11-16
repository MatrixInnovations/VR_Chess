import type { SeekParams } from '../ports/ultronPorts'
import { TimeControlCatalog, type ITimeControlChoice } from './TimeControlCatalog'

/** Seat the player asks for. Passed through on `SeekParams.color`. */
export type LobbyColor = 'white' | 'black' | 'random'

/** Lobby form. No engine settings. */
export interface ILobbySnapshot {
  readonly rated: boolean
  readonly timeControl: string
  readonly color: LobbyColor
  readonly opponent: string
  readonly incomingChallengeId: string
  readonly message: string | null
  readonly choices: readonly ITimeControlChoice[]
}

/**
 * Lobby form state: rated, time control, color, opponent, and inbound challenge id.
 */
export class LobbyPresenter {
  private rated = true
  private timeControl = TimeControlCatalog.defaultId()
  private color: LobbyColor = 'random'
  private opponent = ''
  private incomingChallengeId = ''
  private message: string | null = null

  /** Immutable form snapshot, including the catalog so the view does not import it. */
  snapshot(): ILobbySnapshot {
    return {
      rated: this.rated,
      timeControl: this.timeControl,
      color: this.color,
      opponent: this.opponent,
      incomingChallengeId: this.incomingChallengeId,
      message: this.message,
      choices: TimeControlCatalog.choices,
    }
  }

  /**
   * Params for `seek` and `challenge`. Color is always set so the port call is explicit.
   */
  toSeekParams(): SeekParams {
    return {
      rated: this.rated,
      timeControl: this.timeControl,
      color: this.color,
    }
  }

  /**
   * Restore the params used for the game that just ended.
   * A missing color becomes `random`.
   * @param params - Params captured when that game was requested.
   */
  applyParams(params: SeekParams): void {
    this.rated = params.rated
    this.timeControl = params.timeControl
    this.color = params.color ?? 'random'
  }

  /** Flip rated and casual. */
  toggleRated(): void {
    this.rated = !this.rated
  }

  /**
   * Select a time-control label. Any string is kept; Ultron validates the real control.
   * @param timeControl - Label such as `5+0`.
   */
  setTimeControl(timeControl: string): void {
    this.timeControl = timeControl
  }

  /** Cycle random, then white, then black. */
  cycleColor(): void {
    if (this.color === 'random') this.color = 'white'
    else if (this.color === 'white') this.color = 'black'
    else this.color = 'random'
  }

  /**
   * @param opponent - Lichess username. Not trimmed here; the controller trims on submit.
   */
  setOpponent(opponent: string): void {
    this.opponent = opponent
  }

  /**
   * @param challengeId - Inbound challenge id typed by the player.
   */
  setIncomingChallengeId(challengeId: string): void {
    this.incomingChallengeId = challengeId
  }

  /**
   * @param message - Soft status, or `null` to clear it.
   */
  setMessage(message: string | null): void {
    this.message = message
  }
}
