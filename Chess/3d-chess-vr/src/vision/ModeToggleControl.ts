import { ViewMode } from './ViewMode'
import type { ViewModeManager } from './ViewModeManager'

/**
 * One request from the mode toggle, produced at most once per {@link ModeToggleControl.press}.
 */
export interface IModeSwitchRequest {
  /** Mode the control is asking the shell to show. */
  readonly target: ViewMode
}

/**
 * Observer notified when the player presses an enabled mode toggle.
 */
export interface IModeToggleListener {
  /**
   * @param request - The single switch request for this press.
   */
  onModeSwitchRequested(request: IModeSwitchRequest): void
}

/**
 * Whether this device can start an immersive XR session.
 */
export interface IXrAvailability {
  /** `true` when immersive XR can be entered. */
  isXrAvailable(): boolean
}

/**
 * Button model for switching desktop 3D and immersive view.
 *
 * The control is disabled for the whole press when XR is unavailable, including
 * while already immersive. Leaving an XR session that the device can no longer
 * host is the session's job via {@link ViewModeManager.switchTo}; this control
 * will not emit a request in that state.
 *
 * Human players only: the control never asks an engine for a move.
 */
export class ModeToggleControl {
  private listeners: IModeToggleListener[] = []

  /**
   * @param manager - Mode owner the press updates.
   * @param xr - Live XR availability. Read on each press and label query.
   */
  constructor(
    private readonly manager: ViewModeManager,
    private readonly xr: IXrAvailability,
  ) {}

  /**
   * Subscribe to switch requests.
   *
   * @param listener - Notified at most once per successful press.
   * @returns Unsubscribe function for this listener only.
   */
  subscribe(listener: IModeToggleListener): () => void {
    this.listeners.push(listener)
    return () => {
      this.listeners = this.listeners.filter((item) => item !== listener)
    }
  }

  /**
   * Whether the control must ignore presses.
   * `true` when immersive XR is not available.
   */
  get disabled(): boolean {
    return !this.xr.isXrAvailable()
  }

  /**
   * Accessible name for the control.
   * Always non-empty so a button wrapper can set `aria-label`.
   */
  get accessibilityLabel(): string {
    if (this.disabled) {
      return 'View mode toggle unavailable. Immersive XR is not available on this device.'
    }
    if (this.manager.mode.isImmersive()) {
      return 'Switch to desktop 3D view'
    }
    return 'Switch to immersive view'
  }

  /**
   * Attributes a thin button wrapper should set on the DOM node.
   *
   * @returns Role, label, and disabled state for assistive tech.
   */
  toAriaAttributes(): {
    role: 'button'
    'aria-label': string
    'aria-disabled': boolean
  } {
    return {
      role: 'button',
      'aria-label': this.accessibilityLabel,
      'aria-disabled': this.disabled,
    }
  }

  /**
   * Request one mode switch.
   *
   * When enabled, applies the opposite mode and then notifies each current
   * subscriber once with the same request. When disabled, notifies nobody
   * and leaves the manager mode unchanged.
   */
  press(): void {
    if (this.disabled) return

    const target = this.manager.mode.opposite()
    this.manager.switchTo(target)
    const request: IModeSwitchRequest = { target }
    // Snapshot so an unsubscribe inside a listener cannot skip or repeat
    // the remaining notifications for this same press.
    const snapshot = this.listeners.slice()
    for (const listener of snapshot) {
      listener.onModeSwitchRequested(request)
    }
  }
}
