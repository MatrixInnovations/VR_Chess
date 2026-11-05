import { ViewMode } from './ViewMode'

/**
 * In-game heads-up display.
 *
 * Open and closed are the player's intent (`isOpen`). The HUD is drawn
 * (`isPresented`) only when that intent is open and the suppression rule is off.
 *
 * Suppression is on only when the view is immersive AND hand tracking is active.
 * Tracked hands are the primary input in that mode; a floating HUD would sit in
 * the hand volume and cover the board. Immersive play with controllers (hands
 * inactive) still shows the HUD. Desktop 3D never suppresses for hands, because
 * hand tracking is not the desktop input path.
 *
 * Closing always hides the HUD. Opening it while suppressed keeps the intent
 * open, so the HUD returns when hands release or the player leaves immersive
 * mode without a second click.
 */
export class HudOverlay {
  private openIntent = false
  private mode: ViewMode
  private handsActive = false

  /**
   * @param mode - Current view mode. Defaults to desktop 3D.
   */
  constructor(mode: ViewMode = ViewMode.desktop3d()) {
    this.mode = mode
  }

  /** Mark the HUD as requested open. */
  open(): void {
    this.openIntent = true
  }

  /** Mark the HUD as closed. */
  close(): void {
    this.openIntent = false
  }

  /** Whether the player wants the HUD open, ignoring suppression. */
  get isOpen(): boolean {
    return this.openIntent
  }

  /**
   * Whether the HUD should be drawn.
   * False when closed, or when immersive with hands active.
   */
  get isPresented(): boolean {
    if (!this.openIntent) return false
    // Hands in immersive mode occupy the volume this overlay would cover.
    if (this.mode.isImmersive() && this.handsActive) return false
    return true
  }

  /**
   * Update the view mode used by the suppression rule.
   * Does not change open intent.
   *
   * @param mode - A {@link ViewMode} or a raw mode name.
   * @throws {InvalidViewModeError} When a string is not a legal mode.
   */
  setViewMode(mode: ViewMode | string): void {
    this.mode = typeof mode === 'string' ? ViewMode.parse(mode) : mode
  }

  /**
   * Update hand-tracking activity.
   *
   * @param active - `true` when an XR hand input source is tracking.
   */
  setHandsActive(active: boolean): void {
    this.handsActive = active
  }

  /** View mode currently feeding the suppression rule. */
  get viewMode(): ViewMode {
    return this.mode
  }

  /** Whether hand tracking is active. */
  get handsAreActive(): boolean {
    return this.handsActive
  }
}
