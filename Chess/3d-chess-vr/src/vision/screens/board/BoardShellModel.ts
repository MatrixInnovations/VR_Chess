import type { IReadOnlyGameSession } from '../ports/IReadOnlyGameSession'
import type { BoardStreamFixture } from '../fixtures/BoardStreamFixtureLoader'

/**
 * Read-only board shell snapshot.
 * Fixture fields are display data from a Board API stream recording.
 * There is no legal-move list and no evaluation.
 */
export interface IBoardSnapshot {
  readonly mounted: boolean
  readonly sessionId: string | null
  readonly offlineDemo: boolean
  readonly color: 'white' | 'black' | null
  readonly fixtureLabel: string | null
  readonly streamGameId: string | null
  readonly moves: string | null
  readonly status: string | null
}

/**
 * Mounts the board shell for an online game or the offline demo.
 *
 * The session object is stored as given. This model does not submit moves,
 * and it does not open a Lichess stream: online display data comes from a
 * fixture the caller already loaded.
 */
export class BoardShellModel {
  private mountedSession: IReadOnlyGameSession | null = null
  private offlineDemo = false
  private playerColor: 'white' | 'black' | null = null
  private fixtureLabel: string | null = null
  private streamGameId: string | null = null
  private moves: string | null = null
  private status: string | null = null

  /**
   * Show a paired game plus fixture display data.
   * @param session - Same object the navigator will hold.
   * @param fixture - Parsed Board API recording. Not a live stream.
   * @param color - Seat from `GameHandle`.
   */
  mountOnline(
    session: IReadOnlyGameSession,
    fixture: BoardStreamFixture,
    color: 'white' | 'black',
  ): void {
    this.mountedSession = session
    this.offlineDemo = false
    this.playerColor = color
    this.fixtureLabel = fixture.label
    this.streamGameId = fixture.gameId()
    this.moves = fixture.latestMoves()
    this.status = fixture.latestStatus()
  }

  /**
   * Show the offline demo. No fixture and no Lichess id.
   * @param session - Local session from {@link SequentialIdFactory}.
   */
  mountOffline(session: IReadOnlyGameSession): void {
    this.mountedSession = session
    this.offlineDemo = true
    this.playerColor = 'white'
    this.fixtureLabel = null
    this.streamGameId = null
    this.moves = null
    this.status = null
  }

  /** Drop the mounted game. */
  unmount(): void {
    this.mountedSession = null
    this.offlineDemo = false
    this.playerColor = null
    this.fixtureLabel = null
    this.streamGameId = null
    this.moves = null
    this.status = null
  }

  /** Whether a session is mounted. */
  get isMounted(): boolean {
    return this.mountedSession !== null
  }

  /** Mounted session object, or `null`. */
  get session(): IReadOnlyGameSession | null {
    return this.mountedSession
  }

  /** Immutable board shell view. */
  snapshot(): IBoardSnapshot {
    return {
      mounted: this.isMounted,
      sessionId: this.mountedSession ? this.mountedSession.id : null,
      offlineDemo: this.offlineDemo,
      color: this.playerColor,
      fixtureLabel: this.fixtureLabel,
      streamGameId: this.streamGameId,
      moves: this.moves,
      status: this.status,
    }
  }
}
