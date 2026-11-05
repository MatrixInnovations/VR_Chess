import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'

/**
 * One NDJSON object from a Lichess Board API stream recording.
 *
 * Field names match the events Fridae's clock synchronizer already parses
 * (`gameFull`, `gameState`, nested `state`). This loader does not interpret
 * the clock. It never fetches a URL.
 */
export interface IBoardStreamEvent {
  readonly type: string
  readonly id?: string
  readonly moves?: string
  readonly status?: string
  readonly state?: {
    readonly moves?: string
    readonly status?: string
  }
}

/** Where the events were read from. */
export type FixtureSource = 'directory' | 'embedded'

/**
 * Raised when a fixture file exists but is not NDJSON stream events.
 * The loader does not fall back to the network.
 */
export class FixtureParseError extends Error {
  /** File or directory that failed. */
  readonly filePath: string

  /**
   * @param filePath - File or directory that failed.
   * @param detail - Parse reason.
   */
  constructor(filePath: string, detail: string) {
    super(`Board fixture ${filePath} could not be parsed: ${detail}`)
    this.name = 'FixtureParseError'
    this.filePath = filePath
  }
}

/**
 * A loaded Board API recording.
 */
export class BoardStreamFixture {
  /**
   * @param source - Directory pack or the embedded sample.
   * @param label - Directory path, or `embedded-board-stream`.
   * @param events - Parsed lines in file order.
   */
  constructor(
    readonly source: FixtureSource,
    readonly label: string,
    readonly events: readonly IBoardStreamEvent[],
  ) {}

  /** `gameFull.id`, or `null` when the recording has no full game. */
  gameId(): string | null {
    for (const event of this.events) {
      if (event.type === 'gameFull' && typeof event.id === 'string') return event.id
    }
    return null
  }

  /**
   * Latest move list.
   * A top-level `moves` wins over a nested `state.moves` on the same event.
   * Earlier events are used when the latest line has neither.
   */
  latestMoves(): string | null {
    for (let index = this.events.length - 1; index >= 0; index -= 1) {
      const event = this.events[index]
      if (typeof event.moves === 'string') return event.moves
      if (event.state && typeof event.state.moves === 'string') return event.state.moves
    }
    return null
  }

  /**
   * Latest status string from a top-level `status` or nested `state.status`.
   */
  latestStatus(): string | null {
    for (let index = this.events.length - 1; index >= 0; index -= 1) {
      const event = this.events[index]
      if (typeof event.status === 'string') return event.status
      if (event.state && typeof event.state.status === 'string') return event.state.status
    }
    return null
  }

  /**
   * Sample used when `test-fixtures/lichess` has no NDJSON yet.
   * Same `gameFull` / `gameState` shape as the committed sample file.
   */
  static embedded(): BoardStreamFixture {
    return new BoardStreamFixture('embedded', 'embedded-board-stream', EMBEDDED_EVENTS)
  }
}

const EMBEDDED_EVENTS: readonly IBoardStreamEvent[] = [
  {
    type: 'gameFull',
    id: 'fixtureGame1',
    state: { moves: '', status: 'started' },
  },
  {
    type: 'gameState',
    moves: 'e2e4',
    status: 'started',
  },
]

/**
 * Reads NDJSON files. Tests substitute a memory file system so no socket is required.
 */
export interface IFixtureFileSystem {
  /**
   * @param directory - Directory that may not exist.
   * @returns Sorted `.ndjson` paths. Empty when the directory is missing or has none.
   */
  listNdjson(directory: string): readonly string[]

  /**
   * @param filePath - File returned by {@link IFixtureFileSystem.listNdjson}.
   * @returns File text.
   */
  read(filePath: string): string
}

/**
 * Node file system adapter for {@link BoardStreamFixtureLoader}.
 * `listNdjson` returns an empty list for a missing directory instead of throwing,
 * so the loader can try the next candidate and then the embedded sample.
 */
export class NodeFixtureFileSystem implements IFixtureFileSystem {
  /** @inheritdoc */
  listNdjson(directory: string): readonly string[] {
    if (!existsSync(directory)) return []
    return readdirSync(directory)
      .filter((name) => name.endsWith('.ndjson'))
      .sort()
      .map((name) => join(directory, name))
  }

  /** @inheritdoc */
  read(filePath: string): string {
    return readFileSync(filePath, 'utf8')
  }
}

/** Options for {@link BoardStreamFixtureLoader}. */
export interface IBoardStreamFixtureLoaderOptions {
  /** Directories to search, in order. Defaults to the usual `test-fixtures/lichess` paths. */
  readonly directories?: readonly string[]
  /** File system. Defaults to {@link NodeFixtureFileSystem}. */
  readonly fileSystem?: IFixtureFileSystem
}

/**
 * Loads Fridae's Board API fixtures from `test-fixtures/lichess` when that
 * directory has NDJSON, preferring a filename that contains `fridae` so a
 * local sample does not hide the pack. When nothing is on disk, the embedded
 * sample is used. This class never calls `fetch` and never opens a socket.
 */
export class BoardStreamFixtureLoader {
  private readonly directories: readonly string[]
  private readonly fileSystem: IFixtureFileSystem

  /**
   * @param options - Directory list and file system. Both optional.
   */
  constructor(options: IBoardStreamFixtureLoaderOptions = {}) {
    this.directories = options.directories ?? BoardStreamFixtureLoader.defaultDirectories()
    this.fileSystem = options.fileSystem ?? new NodeFixtureFileSystem()
  }

  /**
   * Candidate directories. The first one that exists with NDJSON is used,
   * unless a later one contains a `fridae` filename.
   */
  static defaultDirectories(): readonly string[] {
    const cwd = process.cwd()
    return [
      join(cwd, 'test-fixtures', 'lichess'),
      join(cwd, 'Chess', '3d-chess-vr', 'test-fixtures', 'lichess'),
      join(cwd, '..', 'test-fixtures', 'lichess'),
      join(cwd, '..', '..', 'test-fixtures', 'lichess'),
    ]
  }

  /**
   * Load the preferred pack.
   * @returns Directory fixture, or the embedded sample when no NDJSON exists.
   * @throws {FixtureParseError} When a file is present but not a stream recording.
   */
  load(): BoardStreamFixture {
    const picked = this.pick()
    if (!picked) return BoardStreamFixture.embedded()
    const events: IBoardStreamEvent[] = []
    for (const filePath of picked.files) {
      events.push(...this.parseFile(filePath))
    }
    if (events.length === 0) {
      throw new FixtureParseError(picked.directory, 'no stream events')
    }
    return new BoardStreamFixture('directory', picked.directory, events)
  }

  private pick(): { directory: string; files: readonly string[] } | null {
    const found: { directory: string; files: readonly string[] }[] = []
    for (const directory of this.directories) {
      const files = this.fileSystem.listNdjson(directory)
      if (files.length > 0) found.push({ directory, files })
    }
    const fridae = found.find((entry) => entry.files.some((filePath) => /fridae/i.test(filePath)))
    return fridae ?? found[0] ?? null
  }

  private parseFile(filePath: string): IBoardStreamEvent[] {
    const lines = this.fileSystem.read(filePath).split(/\r?\n/)
    const events: IBoardStreamEvent[] = []
    for (const line of lines) {
      const trimmed = line.trim()
      if (!trimmed) continue
      let parsed: unknown
      try {
        parsed = JSON.parse(trimmed)
      } catch (error) {
        const detail = error instanceof Error ? error.message : 'invalid json'
        throw new FixtureParseError(filePath, detail)
      }
      if (!this.isEvent(parsed)) {
        throw new FixtureParseError(filePath, 'line is not a stream event')
      }
      events.push(parsed)
    }
    return events
  }

  private isEvent(value: unknown): value is IBoardStreamEvent {
    if (typeof value !== 'object' || value === null || !('type' in value)) return false
    return typeof (value as { type: unknown }).type === 'string'
  }
}
