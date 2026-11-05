import type { CancelReason, MoveSource } from './types';
import type { SessionIntent } from './SessionIntent';
import type { SubmitResult } from './SessionEvent';

/**
 * Device-neutral grab controller.
 *
 * Pointer, XR, and hand input implement this. Voice is a {@link MoveSource}
 * on the intent, not a second submit path. Every implementation submits only
 * through {@link IGameSession}.
 */
export interface IInputController {
  /** Which device family produced the intent. */
  readonly kind: MoveSource;

  /** Start listening. Events received before this are ignored. */
  attach(): void;

  /** Stop listening and cancel a grab that is still in the hand. */
  detach(): void;

  /** True after a piece is held and before it is released or cancelled. */
  isGrabbing(): boolean;

  /**
   * Abort the current grab.
   * Tracking loss and pointer cancellation must call this and must not submit.
   * @param reason - Why the grab stopped.
   */
  cancel(reason: CancelReason): void;
}

/**
 * Async command sink used by voice and tests.
 * Board grabs use {@link IGameSession.submitMoveIntent}, which returns a boolean immediately.
 */
export interface IGameCommandSink {
  /**
   * @param intent - A finished user commitment.
   * @returns The session decision.
   */
  submit(intent: SessionIntent): Promise<SubmitResult>;
}
