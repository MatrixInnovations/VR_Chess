/**
 * Names a player can request. Anything else is rejected by {@link ViewMode.parse}.
 *
 * - `desktop3d` — on-screen 3D board with pointer input.
 * - `immersive` — an XR session showing the same game.
 */
export type ViewModeName = 'desktop3d' | 'immersive'

/**
 * A validated presentation mode.
 *
 * Instances are the closed set `"desktop3d" | "immersive"`. Callers cannot
 * construct a third mode; {@link ViewMode.parse} throws instead.
 */
export class ViewMode {
  private static readonly desktopInstance = new ViewMode('desktop3d')
  private static readonly immersiveInstance = new ViewMode('immersive')

  private constructor(private readonly modeName: ViewModeName) {}

  /** Desktop 3D presentation. */
  static desktop3d(): ViewMode {
    return ViewMode.desktopInstance
  }

  /** Immersive XR presentation. */
  static immersive(): ViewMode {
    return ViewMode.immersiveInstance
  }

  /**
   * Parse an untrusted mode name.
   *
   * @param value - Candidate mode name.
   * @returns The canonical mode for `value`.
   * @throws {InvalidViewModeError} When `value` is not a {@link ViewModeName}.
   */
  static parse(value: string): ViewMode {
    if (value === 'desktop3d') return ViewMode.desktop3d()
    if (value === 'immersive') return ViewMode.immersive()
    throw new InvalidViewModeError(value)
  }

  /** Canonical mode name. */
  get name(): ViewModeName {
    return this.modeName
  }

  /** Whether this is the immersive XR mode. */
  isImmersive(): boolean {
    return this.modeName === 'immersive'
  }

  /** Whether this is the desktop 3D mode. */
  isDesktop3d(): boolean {
    return this.modeName === 'desktop3d'
  }

  /**
   * Value equality by mode name.
   *
   * @param other - Mode to compare.
   * @returns `true` when both modes name the same presentation.
   */
  equals(other: ViewMode): boolean {
    return this.modeName === other.modeName
  }

  /**
   * The other presentation mode.
   *
   * @returns Immersive when this is desktop 3D, otherwise desktop 3D.
   */
  opposite(): ViewMode {
    return this.isImmersive() ? ViewMode.desktop3d() : ViewMode.immersive()
  }
}

/**
 * Raised when a caller requests a view mode outside {@link ViewModeName}.
 */
export class InvalidViewModeError extends Error {
  /** The rejected raw value, stringified when the caller did not pass a string. */
  readonly value: string

  /**
   * @param value - The rejected raw value.
   */
  constructor(value: string) {
    super(`Illegal view mode: ${value}`)
    this.name = 'InvalidViewModeError'
    this.value = value
  }
}
