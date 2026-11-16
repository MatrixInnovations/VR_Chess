import { GameResult, type GameOutcome } from './GameResult'

/**
 * Game-over view model.
 * Fields are the result only. Rematch and lobby are actions, not advice.
 */
export interface IGameOverSnapshot {
  readonly visible: boolean
  readonly outcome: GameOutcome | null
  readonly winner: 'white' | 'black' | null
  readonly summary: string | null
}

/**
 * Shows a {@link GameResult} and nothing else.
 */
export class GameOverPresenter {
  private result: GameResult | null = null

  /**
   * @param result - Terminal result supplied by the shell. Not computed here.
   */
  show(result: GameResult): void {
    this.result = result
  }

  /** Result fields, or an empty snapshot before the first game ends. */
  snapshot(): IGameOverSnapshot {
    if (!this.result) {
      return { visible: false, outcome: null, winner: null, summary: null }
    }
    return {
      visible: true,
      outcome: this.result.outcome,
      winner: this.result.winner,
      summary: this.result.summary,
    }
  }
}
