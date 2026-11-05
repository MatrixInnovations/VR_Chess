import { BoardStreamFixtureLoader } from '../fixtures/BoardStreamFixtureLoader'
import type { BoardStreamFixture } from '../fixtures/BoardStreamFixtureLoader'
import { LobbyWaitLog } from '../lobby/LobbyWaitLog'
import type { IInGameViewHost } from '../ports/IInGameViewHost'
import { SequentialIdFactory } from '../SequentialIdFactory'
import { VisionShell } from '../shell/VisionShell'
import { MockConnectionPort } from './MockConnectionPort'
import { MockLichessAuth } from './MockLichessAuth'
import { MockLichessLobby } from './MockLichessLobby'

/** Options for a mocked shell. */
export interface IMockVisionPortsOptions {
  /** Resolve seeks on a microtask. The smoke test leaves this off so it can see waiting. */
  readonly autoPair?: boolean
  /** Optional PR #1 view host. */
  readonly viewHost?: IInGameViewHost
}

/**
 * Factory for a shell bound to mocked Ultron ports and a Board API fixture.
 * Used by the demo route and the smoke test. It does not call Lichess.
 */
export class MockVisionPorts {
  /** Seek-id log shared with the lobby mock. */
  readonly waits = new LobbyWaitLog()
  /** Offline-demo ids. */
  readonly ids = new SequentialIdFactory()
  /** Auth stand-in. */
  readonly auth = new MockLichessAuth()
  /** Lobby stand-in. */
  readonly lobby: MockLichessLobby
  /** Connection stand-in. */
  readonly connection = new MockConnectionPort()
  /** Fixture loaded from disk or the embedded sample. */
  readonly fixture: BoardStreamFixture
  /** Wired shell. */
  readonly shell: VisionShell

  /**
   * @param options - Auto-pair and optional view host.
   */
  constructor(options: IMockVisionPortsOptions = {}) {
    this.lobby = new MockLichessLobby(this.waits)
    this.lobby.autoPair = options.autoPair ?? false
    this.fixture = new BoardStreamFixtureLoader().load()
    const gameId = this.fixture.gameId()
    if (gameId) this.lobby.pairedGameId = gameId
    this.shell = new VisionShell({
      auth: this.auth,
      lobby: this.lobby,
      connection: this.connection,
      seekIds: this.waits,
      ids: this.ids,
      fixture: this.fixture,
      viewHost: options.viewHost,
    })
  }
}
