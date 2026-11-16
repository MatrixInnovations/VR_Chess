/**
 * Headset session.
 *
 * The chess game does not live inside this object. Entering and leaving
 * must not construct a new {@link GameSession} or a new clock.
 */
export interface XrSessionPort {
  /** Empty when the last attempt succeeded. */
  readonly lastError: string
  /** Start immersive VR. False means the presentation should stay on the desktop. */
  enterVR(): Promise<boolean>
  /** Start passthrough. False means the virtual room stays visible. */
  enterAR(): Promise<boolean>
  /** End the current session. */
  exit(): Promise<void>
  /**
   * Hear the browser or the headset close the session.
   * @param listener - Returns the hall to the desktop presentation.
   */
  onSessionEnd(listener: () => void): void
}
