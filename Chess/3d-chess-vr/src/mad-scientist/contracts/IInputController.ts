import type { CancelReason, MoveSource } from './types'

/**
 * Device-neutral grab controller.
 *
 * Ultron owns the shared foundation interface. This is the local stub the
 * pointer, Touch Pro, and hand controllers implement until that PR merges.
 * Every implementation submits moves only through {@link IGameSession}.
 */
export interface IInputController {
  /** Which device family produced the intent. */
  readonly kind: MoveSource

  /** Start listening. Events received before this are ignored. */
  attach(): void

  /** Stop listening and cancel a grab that is still in the hand. */
  detach(): void

  /** True after a piece is held and before it is released or cancelled. */
  isGrabbing(): boolean

  /**
   * Abort the current grab.
   * Tracking loss and pointer cancellation must call this and must not submit.
   */
  cancel(reason: CancelReason): void
}
