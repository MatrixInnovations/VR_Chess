/** Closed set of shell screens. Anything else is rejected by {@link ScreenId.parse}. */
export type ScreenName = 'sign-in' | 'lobby' | 'waiting' | 'board' | 'game-over' | 'error'

/**
 * Raised when a caller names a screen outside {@link ScreenName}.
 */
export class InvalidScreenError extends Error {
  /** The rejected raw value. */
  readonly value: string

  /**
   * @param value - The rejected raw value.
   */
  constructor(value: string) {
    super(`Illegal screen: ${value}`)
    this.name = 'InvalidScreenError'
    this.value = value
  }
}

/**
 * A validated shell screen.
 *
 * Instances are the closed set of {@link ScreenName}. The navigator stores
 * these instead of bare strings so a typo cannot open a seventh screen.
 */
export class ScreenId {
  private static readonly cache = new Map<ScreenName, ScreenId>()

  private constructor(private readonly screenName: ScreenName) {}

  /** Lichess PKCE sign-in. */
  static signIn(): ScreenId {
    return ScreenId.of('sign-in')
  }

  /** Find a game, challenge, or start the offline demo. */
  static lobby(): ScreenId {
    return ScreenId.of('lobby')
  }

  /** Seek or challenge still pending. */
  static waiting(): ScreenId {
    return ScreenId.of('waiting')
  }

  /** Board shell. Moves are not submitted from this lane. */
  static board(): ScreenId {
    return ScreenId.of('board')
  }

  /** Terminal result. Rematch and lobby only. */
  static gameOver(): ScreenId {
    return ScreenId.of('game-over')
  }

  /** Stream drop or auth failure. */
  static error(): ScreenId {
    return ScreenId.of('error')
  }

  /**
   * Parse an untrusted screen name.
   * @param value - Candidate name.
   * @returns The canonical screen.
   * @throws {InvalidScreenError} When `value` is not a {@link ScreenName}.
   */
  static parse(value: string): ScreenId {
    if (!ScreenId.isName(value)) throw new InvalidScreenError(value)
    return ScreenId.of(value)
  }

  /** Canonical screen name. */
  get name(): ScreenName {
    return this.screenName
  }

  /**
   * Value equality by screen name.
   * @param other - Screen to compare.
   * @returns `true` when both name the same screen.
   */
  equals(other: ScreenId): boolean {
    return this.screenName === other.screenName
  }

  private static isName(value: string): value is ScreenName {
    return (
      value === 'sign-in' ||
      value === 'lobby' ||
      value === 'waiting' ||
      value === 'board' ||
      value === 'game-over' ||
      value === 'error'
    )
  }

  private static of(name: ScreenName): ScreenId {
    let found = ScreenId.cache.get(name)
    if (!found) {
      found = new ScreenId(name)
      ScreenId.cache.set(name, found)
    }
    return found
  }
}
