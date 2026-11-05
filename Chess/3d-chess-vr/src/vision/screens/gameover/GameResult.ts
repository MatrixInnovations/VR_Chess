/** Terminal results the game-over screen can show. There is no "engine" outcome. */
export type GameOutcome = 'checkmate' | 'resign' | 'timeout' | 'draw' | 'stalemate' | 'abort'

/**
 * A finished human game.
 *
 * Summaries name the result and the winner only. They never suggest a move,
 * an evaluation, or an engine line. Lichess ToS forbids engine assistance.
 */
export class GameResult {
  private constructor(
    readonly outcome: GameOutcome,
    readonly winner: 'white' | 'black' | null,
    readonly summary: string,
  ) {}

  /**
   * @param winner - Side that delivered mate.
   * @returns Checkmate result.
   */
  static checkmate(winner: 'white' | 'black'): GameResult {
    return new GameResult('checkmate', winner, `Checkmate. ${GameResult.side(winner)} wins.`)
  }

  /**
   * @param winner - Side that did not resign.
   * @returns Resignation result.
   */
  static resign(winner: 'white' | 'black'): GameResult {
    return new GameResult('resign', winner, `${GameResult.side(winner)} wins by resignation.`)
  }

  /**
   * @param winner - Side that did not flag.
   * @returns Timeout result. The screen does not decide the flag; the caller does.
   */
  static timeout(winner: 'white' | 'black'): GameResult {
    return new GameResult('timeout', winner, `${GameResult.side(winner)} wins on time.`)
  }

  /** Agreed or adjudicated draw. */
  static draw(): GameResult {
    return new GameResult('draw', null, 'Draw.')
  }

  /** Stalemate. */
  static stalemate(): GameResult {
    return new GameResult('stalemate', null, 'Stalemate.')
  }

  /** Aborted game. */
  static abort(): GameResult {
    return new GameResult('abort', null, 'Game aborted.')
  }

  private static side(winner: 'white' | 'black'): string {
    return winner === 'white' ? 'White' : 'Black'
  }
}
